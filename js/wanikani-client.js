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
        return this.fetchAll('/assignments?unlocked=true&hidden=false');
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

    async apiGet(url) {
        const response = await fetch(url, { headers: API_HEADERS(this) });
        if (!response.ok) throw new Error(`API request failed: ${response.status}`);
        return response.json();
    }

    async createReview({ subjectId, incorrectMeaningAnswers, incorrectReadingAnswers }) {
        const response = await fetch(`${API_ROOT}/reviews`, {
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

        if (!response.ok) throw new Error(`Review submission failed: ${response.status}`);
        return response.json();
    }

    async fetchAll(endpoint) {
        let url = `${API_ROOT}${endpoint}`;
        const items = [];
        while (url) {
            const response = await this.apiGet(url);
            if (Array.isArray(response.data)) items.push(...response.data);
            url = response.pages?.next_url || null;
        }
        return items;
    }
}
