const API_ROOT = 'https://api.wanikani.com/v2';
const API_HEADERS = revision => ({
    Authorization: `Bearer ${revision.apiToken}`,
    'Wanikani-Revision': revision.apiRevision
});

export class WaniKaniClient {
    constructor(apiToken, apiRevision = '20170710') {
        this.apiToken = apiToken;
        this.apiRevision = apiRevision;
    }

    async fetchUser() {
        const response = await this.apiRequest('/user');
        return response.data;
    }

    async fetchAssignments() {
        return this.fetchAll('/assignments?unlocked=true&hidden=false&srs_stages=1,2,3,4,5,6,7,8&available_before=' + encodeURIComponent(new Date().toISOString()));
    }

    async fetchStudyMaterials() {
        return this.fetchAll('/study_materials');
    }

    async fetchSubjectsByIds(ids) {
        if (!ids.length) return [];
        const batchSize = 200;
        const results = [];
        for (let index = 0; index < ids.length; index += batchSize) {
            const chunk = ids.slice(index, index + batchSize);
            const pageItems = await this.fetchAll(`/subjects?ids=${chunk.join(',')}`);
            results.push(...pageItems);
        }
        return results;
    }

    async apiRequest(endpoint) {
        return this.apiGet(`${API_ROOT}${endpoint}`);
    }

    async request(url, options = {}) {
        const target = new URL(url);
        if (target.origin !== new URL(API_ROOT).origin || !target.pathname.startsWith('/v2/')) {
            throw new Error('Unexpected API URL.');
        }
        let response;
        try {
            response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
        } catch (_) {
            throw new Error('Connection failed or timed out. Check your connection and try again.');
        }
        if (!response.ok) {
            const messages = {
                401: 'Invalid API token. Check your WaniKani settings.',
                403: 'Access denied. Check your subscription and reviews:create token permission.',
                422: 'WaniKani could not accept this review. It may already have been saved in another session.',
                429: 'WaniKani rate limit reached. Wait a minute and try again.'
            };
            throw new Error(messages[response.status] || `WaniKani request failed (${response.status}). Try again later.`);
        }
        return response.json();
    }

    async apiGet(url) {
        return this.request(url, { headers: API_HEADERS(this) });
    }

    async createReview({ subjectId, incorrectMeaningAnswers, incorrectReadingAnswers }) {
        return this.request(`${API_ROOT}/reviews`, {
            method: 'POST',
            headers: {
                ...API_HEADERS(this),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                review: {
                    subject_id: subjectId,
                    incorrect_meaning_answers: incorrectMeaningAnswers,
                    incorrect_reading_answers: incorrectReadingAnswers
                }
            })
        });

    }

    async fetchAll(endpoint) {
        let url = `${API_ROOT}${endpoint}`;
        const items = [];
        const visited = new Set();
        while (url) {
            if (visited.has(url)) throw new Error('Repeated API pagination URL. Please retry.');
            visited.add(url);
            const response = await this.apiGet(url);
            if (Array.isArray(response.data)) items.push(...response.data);
            url = response.pages?.next_url || null;
        }
        return items;
    }
}
