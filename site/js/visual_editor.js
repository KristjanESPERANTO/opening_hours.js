/*
 * SPDX-FileCopyrightText: © 2026 opening_hours.js contributors
 *
 * SPDX-License-Identifier: LGPL-3.0-only
 */

const DAYS = [ 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So' ];
const HOURS_PER_DAY = 24;
const HOUR_HEIGHT = 32;

const initialIntervals = [
    { day: 0, start: 10, end: 20 },
    { day: 1, start: 10, end: 20 },
    { day: 2, start: 10, end: 20 },
    { day: 3, start: 10, end: 20 },
    { day: 4, start: 10, end: 20 },
    { day: 5, start: 9, end: 13 },
];

function formatHour(hour) {
    return `${String(hour).padStart(2, '0')}:00`;
}

function createCalendarMarkup() {
    const labels = DAYS.map((day) => `<div class="visual-editor-day-label">${day}</div>`).join('');
    const rows = Array.from({ length: HOURS_PER_DAY }, (_, hour) => `
        <div class="visual-editor-time-label">${formatHour(hour)}</div>
        ${DAYS.map((_, day) => `<button type="button" class="visual-editor-slot" data-day="${day}" data-hour="${hour}" aria-label="${DAYS[day]} ${formatHour(hour)}"></button>`).join('')}
    `).join('');

    return `
        <p class="visual-editor-description">Ziehe über einen freien Zeitraum, um ein Intervall anzulegen. Klicke auf ein Intervall, um es zu löschen.</p>
        <div class="visual-editor-calendar" role="grid" aria-label="Wochenansicht der Öffnungszeiten">
            <div class="visual-editor-corner"></div>${labels}${rows}
        </div>
    `;
}

/**
 * Initialize the visual editor proof of concept.
 * @returns {void}
 */
export function initializeVisualEditor() {
    const container = document.getElementById('visual-editor');
    if (!container) return;

    const state = {
        intervals: initialIntervals.map((interval) => ({ ...interval })),
        dragStart: null,
        preview: null,
    };

    container.innerHTML = createCalendarMarkup();
    const calendar = container.querySelector('.visual-editor-calendar');

    function renderIntervals() {
        calendar.querySelectorAll('.visual-editor-interval').forEach((interval) => interval.remove());

        state.intervals.forEach((interval, index) => {
            const anchor = calendar.querySelector(`[data-day="${interval.day}"][data-hour="0"]`);
            const element = document.createElement('button');
            element.type = 'button';
            element.className = 'visual-editor-interval';
            element.style.top = `${HOUR_HEIGHT + interval.start * HOUR_HEIGHT}px`;
            element.style.height = `${Math.max(interval.end - interval.start, 1) * HOUR_HEIGHT - 4}px`;
            element.style.setProperty('--day-index', interval.day);
            element.textContent = `${formatHour(interval.start)}-${formatHour(interval.end)}`;
            element.title = 'Intervall löschen';
            element.setAttribute('aria-label', `${DAYS[interval.day]} ${formatHour(interval.start)}-${formatHour(interval.end)}. Intervall löschen.`);
            element.dataset.index = String(index);
            anchor.parentElement.appendChild(element);
        });

        if (state.preview) {
            const anchor = calendar.querySelector(`[data-day="${state.preview.day}"][data-hour="0"]`);
            const preview = document.createElement('div');
            preview.className = 'visual-editor-interval visual-editor-interval-preview';
            preview.style.top = `${HOUR_HEIGHT + state.preview.start * HOUR_HEIGHT}px`;
            preview.style.height = `${Math.max(state.preview.end - state.preview.start, 1) * HOUR_HEIGHT - 4}px`;
            preview.style.setProperty('--day-index', state.preview.day);
            preview.textContent = `${formatHour(state.preview.start)}-${formatHour(state.preview.end)}`;
            anchor.parentElement.appendChild(preview);
        }
    }

    function getSlot(event) {
        const slot = event.target.closest('.visual-editor-slot');
        if (!slot || !calendar.contains(slot)) return null;
        return {
            day: Number(slot.dataset.day),
            hour: Number(slot.dataset.hour),
        };
    }

    function getSlotAtPoint(event) {
        const element = document.elementFromPoint(event.clientX, event.clientY);
        const slot = element && element.closest('.visual-editor-slot');
        if (!slot || !calendar.contains(slot)) return null;
        return {
            day: Number(slot.dataset.day),
            hour: Number(slot.dataset.hour),
        };
    }

    calendar.addEventListener('pointerdown', (event) => {
        const slot = getSlot(event);
        if (!slot) return;
        state.dragStart = slot;
        event.preventDefault();
    });

    calendar.addEventListener('pointerover', (event) => {
        if (!state.dragStart) return;
        const slot = getSlot(event);
        if (!slot || slot.day !== state.dragStart.day) return;
        updatePreview(slot);
    });

    calendar.addEventListener('pointermove', (event) => {
        if (!state.dragStart) return;
        const slot = getSlotAtPoint(event);
        if (!slot || slot.day !== state.dragStart.day) return;
        updatePreview(slot);
    });

    function updatePreview(slot) {
        state.preview = {
            day: slot.day,
            start: Math.min(state.dragStart.hour, slot.hour),
            end: Math.min(Math.max(state.dragStart.hour, slot.hour) + 1, HOURS_PER_DAY),
        };
        renderIntervals();
    }

    calendar.addEventListener('pointerup', (event) => {
        if (!state.dragStart) return;
        const slot = getSlot(event) || state.preview;
        if (slot) {
            const start = Math.min(state.dragStart.hour, slot.hour ?? slot.start);
            const end = Math.min(Math.max(state.dragStart.hour, slot.hour ?? slot.end - 1) + 1, HOURS_PER_DAY);
            state.intervals.push({ day: state.dragStart.day, start, end });
        }
        state.dragStart = null;
        state.preview = null;
        renderIntervals();
    });

    calendar.addEventListener('click', (event) => {
        const interval = event.target.closest('.visual-editor-interval');
        if (interval && !interval.classList.contains('visual-editor-interval-preview')) {
            state.intervals.splice(Number(interval.dataset.index), 1);
            renderIntervals();
            return;
        }

        const slot = getSlot(event);
        if (!slot) return;
        state.intervals.push({
            day: slot.day,
            start: slot.hour,
            end: Math.min(slot.hour + 1, HOURS_PER_DAY),
        });
        renderIntervals();
    });

    renderIntervals();
}
