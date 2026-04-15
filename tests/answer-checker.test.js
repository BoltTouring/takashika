import test from 'node:test';
import assert from 'node:assert/strict';

import { AnswerChecker } from '../js/answer-checker.js';

test('normalizes katakana and romaji readings to hiragana', () => {
    assert.equal(AnswerChecker.toHiragana('ビール'), 'びーる');
    assert.equal(AnswerChecker.toHiragana('jyu'), 'じゅ');
    assert.equal(AnswerChecker.toHiragana(' du '), 'づ');
});

test('accepts study-material synonyms and whitelist meanings', () => {
    const subject = {
        data: {
            meanings: [{ meaning: 'Fire', accepted_answer: true }],
            auxiliary_meanings: [{ meaning: 'Flame', type: 'whitelist' }]
        }
    };
    const studyMaterial = { data: { meaning_synonyms: ['Burn'] } };

    assert.equal(AnswerChecker.checkMeaning('fire', subject, studyMaterial), true);
    assert.equal(AnswerChecker.checkMeaning('flame', subject, studyMaterial), true);
    assert.equal(AnswerChecker.checkMeaning('burn', subject, studyMaterial), true);
});

test('rejects blacklisted meanings and non-accepted readings', () => {
    const subject = {
        data: {
            meanings: [{ meaning: 'One', accepted_answer: true }],
            auxiliary_meanings: [{ meaning: 'Single', type: 'blacklist' }],
            readings: [
                { reading: 'いち', accepted_answer: true },
                { reading: 'ひと', accepted_answer: false }
            ]
        }
    };

    assert.equal(AnswerChecker.checkMeaning('single', subject), false);
    assert.equal(AnswerChecker.checkReading('ichi', subject), true);
    assert.equal(AnswerChecker.checkReading('ひと', subject), false);
});
