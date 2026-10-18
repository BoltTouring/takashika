import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreCheckpoints } from '../js/review-checkpoint.js';
const fresh = (id, available_at = '2026-01-01') => ({assignment: {id, data: {subject_id: id, srs_stage: 2, available_at}}, answeredMeaning: false, answeredReading: false, incorrectMeaningAnswers: 0, incorrectReadingAnswers: 0});
test('partial answers and mistake counts resume before untouched reviews', () => {
    const saved = {...fresh(2), answeredReading: true, incorrectMeaningAnswers: 3};
    const queue = restoreCheckpoints([fresh(1), fresh(2)], [saved]);
    assert.equal(queue[0].assignment.id, 2);
    assert.equal(queue[0].answeredReading, true);
    assert.equal(queue[0].incorrectMeaningAnswers, 3);
});
test('new SRS cycles never inherit an old answer', () => {
    const current = fresh(1, '2026-10-19');
    assert.deepEqual(restoreCheckpoints([current], [{...fresh(1), answeredMeaning: true}]), [current]);
});
test('invalid mistake counts cannot be submitted', () => {
    const saved = {...fresh(1), incorrectMeaningAnswers: -1, incorrectReadingAnswers: '2'};
    assert.equal(restoreCheckpoints([fresh(1)], [saved])[0].incorrectMeaningAnswers, 0);
    assert.equal(restoreCheckpoints([fresh(1)], [saved])[0].incorrectReadingAnswers, 0);
});
