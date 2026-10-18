import test from 'node:test';
import assert from 'node:assert/strict';
import { WaniKaniClient } from '../js/wanikani-client.js';

test('follows pagination and sends required authentication headers', async t => {
    const urls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        urls.push(url);
        assert.equal(options.headers.Authorization, 'Bearer test-token');
        return { ok: true, json: async () => ({
            data: [urls.length],
            pages: { next_url: urls.length === 1 ? 'https://api.wanikani.com/v2/subjects?page=2' : null }
        }) };
    });
    assert.deepEqual(await new WaniKaniClient('test-token').fetchAll('/subjects'), [1, 2]);
});

test('does not leak tokens to unexpected pagination origins', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => ({
        ok: true, json: async () => ({ data: [], pages: { next_url: 'https://example.com/steal' } })
    }));
    await assert.rejects(new WaniKaniClient('test-token').fetchAll('/subjects'), /Unexpected API URL/);
    assert.equal(fetch.mock.callCount(), 1);
});

test('review payload and permission failure are surfaced without automatic POST retry', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(options.method, 'POST');
        assert.deepEqual(JSON.parse(options.body), { review: {
            subject_id: 123, incorrect_meaning_answers: 1, incorrect_reading_answers: 2
        }});
        return { ok: false, status: 403 };
    });
    await assert.rejects(new WaniKaniClient('test-token').createReview({
        subjectId: 123, incorrectMeaningAnswers: 1, incorrectReadingAnswers: 2
    }), /reviews:create/);
    assert.equal(fetch.mock.callCount(), 1);
});

test('network errors, rate limits and pagination loops have actionable errors', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
    const client = new WaniKaniClient('test');
    await assert.rejects(client.fetchUser(), /Connection failed/);
    fetch.mock.mockImplementation(async () => ({ ok: false, status: 429 }));
    await assert.rejects(client.fetchUser(), /Wait a minute/);
    fetch.mock.mockImplementation(async () => ({ ok: true, json: async () => ({
        data: [], pages: { next_url: 'https://api.wanikani.com/v2/subjects' }
    }) }));
    await assert.rejects(client.fetchAll('/subjects'), /Repeated API pagination/);
});
