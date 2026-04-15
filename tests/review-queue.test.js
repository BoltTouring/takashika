import test from 'node:test';
import assert from 'node:assert/strict';

import { buildReviewQueue } from '../js/review-queue.js';

test('builds separate reading and meaning reviews for non-radicals', () => {
    const now = new Date('2026-04-15T00:00:00Z');
    const assignments = [
        { data: { subject_id: 1, available_at: '2026-04-14T00:00:00Z', srs_stage: 1 } },
        { data: { subject_id: 2, available_at: '2026-04-14T00:00:00Z', srs_stage: 1 } }
    ];
    const subjects = new Map([
        [1, { id: 1, object: 'radical', data: { meanings: [{ accepted_answer: true }], readings: [] } }],
        [2, {
            id: 2,
            object: 'kanji',
            data: {
                meanings: [{ accepted_answer: true }],
                readings: [{ accepted_answer: true }]
            }
        }]
    ]);

    const queue = buildReviewQueue(assignments, new Set(), subjectId => subjects.get(subjectId), {
        now,
        random: () => 0
    });

    assert.deepEqual(
        queue.map(item => [item.assignment.data.subject_id, item.type]),
        [[2, 'reading'], [2, 'meaning'], [1, 'meaning']]
    );
});

test('skips excluded or unavailable reviews', () => {
    const now = new Date('2026-04-15T00:00:00Z');
    const assignments = [
        { data: { subject_id: 1, available_at: '2026-04-16T00:00:00Z', srs_stage: 1 } },
        { data: { subject_id: 2, available_at: '2026-04-14T00:00:00Z', srs_stage: 0 } },
        { data: { subject_id: 3, available_at: '2026-04-14T00:00:00Z', srs_stage: 1 } }
    ];
    const subjects = new Map([
        [3, {
            id: 3,
            object: 'vocabulary',
            data: {
                meanings: [{ accepted_answer: true }],
                readings: [{ accepted_answer: true }]
            }
        }]
    ]);

    const queue = buildReviewQueue(assignments, new Set([3]), subjectId => subjects.get(subjectId), {
        now,
        random: () => 0
    });

    assert.equal(queue.length, 0);
});

test('excluded subject ids suppress both reading and meaning prompts', () => {
    const now = new Date('2026-04-15T00:00:00Z');
    const assignments = [
        { data: { subject_id: 9, available_at: '2026-04-14T00:00:00Z', srs_stage: 1 } }
    ];
    const subjects = new Map([
        [9, {
            id: 9,
            object: 'vocabulary',
            data: {
                meanings: [{ accepted_answer: true }],
                readings: [{ accepted_answer: true }]
            }
        }]
    ]);

    const queue = buildReviewQueue(assignments, new Set([9]), subjectId => subjects.get(subjectId), {
        now,
        random: () => 0
    });

    assert.deepEqual(queue, []);
});
