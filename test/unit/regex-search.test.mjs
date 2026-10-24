// SPDX-FileCopyrightText: © 2026 Kristjan Esperanto
// SPDX-License-Identifier: LGPL-3.0-only

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const scriptPath = path.resolve('scripts/regex_search.mjs');
const stripColors = text => text.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '');

function runSearch(t, filename, entries, responses) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'regex-search-test-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const jsonFile = path.join(directory, filename);
    const historyFile = path.join(directory, 'history');
    const noRepeatFile = path.join(directory, 'no-repeat');
    fs.writeFileSync(jsonFile, JSON.stringify({ data: entries }));

    const child = spawn(process.execPath, [scriptPath, jsonFile], {
        env: {
            ...process.env,
            OPENING_HOURS_REGEX_HISTORY_FILE: historyFile,
            OPENING_HOURS_REGEX_NO_REPEAT_FILE: noRepeatFile
        }
    });
    let stdout = '';
    let stderr = '';
    let promptOffset = 0;
    const prompts = [
        'regex search> ',
        'Try to parse each value (probably takes a second)? ',
        'Print values (yes, passed, failed; add overpass, taginfo, err, josm, no_repeat): ',
        'Continue? '
    ];
    const timeout = setTimeout(() => child.kill(), 10_000);

    child.stdout.setEncoding('utf8').on('data', chunk => {
        stdout += chunk;
        while (true) {
            const remaining = stdout.slice(promptOffset);
            const nextPrompt = prompts
                .map(prompt => ({ prompt, index: remaining.indexOf(prompt) }))
                .filter(match => match.index >= 0)
                .sort((left, right) => left.index - right.index)[0];
            if (!nextPrompt) {
                break;
            }
            promptOffset += nextPrompt.index + nextPrompt.prompt.length;
            const response = responses.shift();
            if (response === undefined) {
                child.stdin.end();
            } else {
                child.stdin.write(`${response}\n`);
            }
        }
    });
    child.stderr.setEncoding('utf8').on('data', chunk => {
        stderr += chunk;
    });
    if (responses.length === 0) {
        child.stdin.end();
    }

    return new Promise(resolve => child.on('close', (status, signal) => {
        clearTimeout(timeout);
        resolve({ directory, noRepeatFile, status, signal, stdout, stderr });
    }));
}

test('parser failures during state and warning evaluation are reported instead of aborting', async t => {
    const result = await runSearch(t, 'export.opening_hours.json', [{ value: 'easter - 200 days', count: 1 }], ['easter - 200 days', 'failed err']);

    assert.equal(result.status, 0, result.stderr);
    const output = stripColors(result.stdout);
    assert.match(output, /Matched 1 \(0 passed\)/);
    assert.match(output, /status: Failed/);
    assert.match(output, /not in the year of the movable day/);
});

test('known tag keys select their parser mode and value mapping', async t => {
    const result = await runSearch(t, 'export.collection_times.json', [{ value: 'Mo-Fr 12:00', count: 1 }], ['.', 'yes']);

    assert.equal(result.status, 0, result.stderr);
    const output = stripColors(result.stdout);
    assert.match(output, /Matched 1 \(1 passed\)/);
    assert.match(output, /status: .*Passed/);
});

test('tag-specific values are mapped before parsing', async t => {
    const result = await runSearch(t, 'export.lit.json', [{ value: 'yes', count: 1 }], ['.', 'yes']);

    assert.equal(result.status, 0, result.stderr);
    assert.match(stripColors(result.stdout), /Matched 1 \(1 passed\)/);
});

test('regular expressions retain backreferences and match values across newlines', async t => {
    const result = await runSearch(t, 'export.opening_hours.json', [
        { value: 'aa', count: 2 },
        { value: 'Tu\nMo 10:00-12:00', count: 1 }
    ], ['(a)\\1', 'yes', 'Mo', 'yes']);

    assert.equal(result.status, 0, result.stderr);
    const output = stripColors(result.stdout);
    assert.match(output, /Matched \(count: 2, status: .*\): aa/);
    assert.match(output, /Matched \(count: 1, status: .*\): Tu\nMo/);
});

test('end of input closes the interactive search cleanly', async t => {
    const result = await runSearch(t, 'export.opening_hours.json', [], []);

    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /unsettled top-level await/);
});

test('no_repeat retries a value when JOSM rejects the previous request', async t => {
    const server = http.createServer();
    let requestCount = 0;
    server.on('request', (_request, response) => {
        requestCount++;
        response.writeHead(requestCount === 1 ? 500 : 200).end();
    });
    server.listen(8111);
    await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    }).catch(error => {
        if (error.code === 'EADDRINUSE') {
            t.skip('JOSM Remote Control port 8111 is already in use');
            return;
        }
        throw error;
    });
    if (!server.listening) {
        return;
    }
    t.after(() => new Promise(resolve => server.close(resolve)));

    const value = 'regex-search-review-invalid-value';
    const result = await runSearch(t, 'export.opening_hours.json', [{ value, count: 1 }], ['.', 'failed josm no_repeat', '.', 'failed josm no_repeat']);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(requestCount, 2);
    assert.equal(fs.readFileSync(result.noRepeatFile, 'utf8').trim(), value);
});
