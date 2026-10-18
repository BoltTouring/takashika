import test from 'node:test';
import assert from 'node:assert/strict';
import { WaniKaniReviewer } from '../js/reviewer.js';

function setup() {
    const elements = new Map();
    globalThis.document = {
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, {
                textContent: '', disabled: false,
                classList: { add() {}, remove() {} }
            });
            return elements.get(id);
        }
    };
    const reviewer = new WaniKaniReviewer();
    const subject = { id: 1, object: 'vocabulary', data: {
        meanings: [{ meaning: 'One', accepted_answer: true }],
        readings: [{ reading: 'いち', accepted_answer: true }]
    }};
    reviewer.subjectById.set(1, subject);
    reviewer.currentReview = {
        assignment: { data: { subject_id: 1 } }, answeredReading: true,
        answeredMeaning: false, incorrectMeaningAnswers: 0, incorrectReadingAnswers: 2
    };
    reviewer.currentTaskType = 'meaning';
    reviewer.currentResultIsCorrect = true;
    reviewer.displayQuestion = () => {};
    reviewer.updateProgress = () => {};
    let nextCalls = 0;
    reviewer.nextReview = () => { nextCalls++; reviewer.currentReview = null; };
    return { reviewer, elements, nextCalls: () => nextCalls };
}

test('failed saves retain the item and retry without double counting', async () => {
    const { reviewer, elements, nextCalls } = setup();
    let attempts = 0;
    reviewer.client = { createReview: async payload => {
        assert.equal(payload.incorrectReadingAnswers, 2);
        if (++attempts === 1) throw new Error('offline');
    }};
    await reviewer.continueAfterResult();
    assert.equal(reviewer.completedReviewItems, 0);
    assert.equal(nextCalls(), 0);
    assert.match(elements.get('save-error').textContent, /offline/);
    assert.equal(reviewer.sessionStats.total, 1);
    await reviewer.continueAfterResult();
    assert.equal(reviewer.completedReviewItems, 1);
    assert.equal(nextCalls(), 1);
    assert.equal(reviewer.sessionStats.total, 1);
});

test('repeated clicks during save send exactly one request', async () => {
    const { reviewer, nextCalls } = setup();
    let resolve, calls = 0;
    reviewer.client = { createReview: () => {
        calls++;
        return new Promise(done => { resolve = done; });
    }};
    const pending = reviewer.continueAfterResult();
    await reviewer.markCorrect();
    reviewer.askAgainLater();
    assert.equal(calls, 1);
    assert.equal(reviewer.reviewQueue.length, 0);
    resolve();
    await pending;
    assert.equal(nextCalls(), 1);
    assert.equal(reviewer.sessionStats.total, 1);
});

test('ask later preserves completed halves and previously recorded mistakes', () => {
    const { reviewer } = setup();
    reviewer.currentResultIsCorrect = false;
    const item = reviewer.currentReview;
    reviewer.askAgainLater();
    assert.equal(reviewer.reviewQueue[0], item);
    assert.equal(item.answeredReading, true);
    assert.equal(item.incorrectReadingAnswers, 2);
});

test('wrong answers record a mistake without submitting an incomplete review', async () => {
    const { reviewer } = setup();
    reviewer.currentResultIsCorrect = false;
    reviewer.client = { createReview: () => assert.fail('Incomplete review submitted') };
    await reviewer.continueAfterResult();
    assert.equal(reviewer.currentReview.incorrectMeaningAnswers, 1);
    assert.equal(reviewer.currentReview.answeredMeaning, false);
    assert.equal(reviewer.sessionStats.incorrect, 1);
    assert.equal(reviewer.currentResultIsCorrect, null);
    await reviewer.continueAfterResult();
    assert.equal(reviewer.sessionStats.total, 1);
});

test('no result or current item makes answer actions harmless', async () => {
    const { reviewer } = setup();
    reviewer.currentResultIsCorrect = null;
    await reviewer.markCorrect();
    assert.equal(reviewer.sessionStats.total, 0);
    reviewer.currentReview = null;
    reviewer.submitAnswer();
    await reviewer.continueAfterResult();
    assert.equal(reviewer.sessionStats.total, 0);
});
