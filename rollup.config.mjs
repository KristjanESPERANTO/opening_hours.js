import common from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import yaml from '@rollup/plugin-yaml';

function recursivelyDeleteNominatimUrl(data) {
    if (typeof data === 'object') {
        Object.values(data).forEach(recursivelyDeleteNominatimUrl);
    }
    delete data._nominatim_url;
    return data;
}

const yamlPlugin = yaml({
    transform(data) {
        return recursivelyDeleteNominatimUrl(data);
    }
});

const terserConfig = {
    format: {
        comments: /@preserve|@license|@cc_on|SPDX-FileCopyrightText|©|\(c\)/i,
    },
};

const globals = {
    'i18next': 'i18next',
    'suncalc': 'SunCalc'
};

// Build configuration without bundled dependencies
const configWithoutDeps = {
    input: './src/index.js',
    plugins: [yamlPlugin],
    external: ['i18next', 'suncalc'],
    output: [
        // ESM build
        {
            file: 'build/opening_hours.esm.mjs',
            format: 'esm',
            sourcemap: true,
        },
        // UMD build
        {
            name: 'opening_hours',
            file: 'build/opening_hours.js',
            format: 'umd',
            globals,
        },
        // UMD build (minified)
        {
            name: 'opening_hours',
            file: 'build/opening_hours.min.js',
            format: 'umd',
            globals,
            plugins: [terser(terserConfig)],
            sourcemap: true,
        }
    ]
};

// Build configuration with bundled dependencies (UMD only)
const configWithDeps = {
    input: './src/index.js',
    plugins: [
        nodeResolve(),
        common(),
        yamlPlugin,
    ],
    output: [
        // UMD build (with dependencies)
        {
            name: 'opening_hours',
            file: 'build/opening_hours+deps.js',
            format: 'umd',
        },
        // UMD build (with dependencies, minified)
        {
            name: 'opening_hours',
            file: 'build/opening_hours+deps.min.js',
            format: 'umd',
            plugins: [terser(terserConfig)],
            sourcemap: true,
        }
    ]
};

export default [configWithoutDeps, configWithDeps];
