import { restoreCheckpoints, hasProgress } from './review-checkpoint.js';
import { AnswerChecker } from './answer-checker.js';
import { AudioManager } from './audio-manager.js';
import { buildReviewQueue } from './review-queue.js';
import { WaniKaniClient } from './wanikani-client.js';

const EXCLUDE_MARKER = '#tsurukameExclude';

export class WaniKaniReviewer {
    constructor() {
        this.apiToken = null;
        this.client = null;
        this.user = null;
        this.assignments = [];
        this.subjects = [];
        this.subjectById = new Map();
        this.studyMaterials = [];
        this.studyMaterialBySubjectId = new Map();
        this.excludedSubjectIds = new Set();
        this.currentReview = null;
        this.reviewQueue = [];
        this.sessionStats = { total: 0, correct: 0, incorrect: 0 };
        this.currentTaskType = null;
        this.currentResultIsCorrect = null;
        this.isComposing = false;
        this.menuTopPx = 80;
        this.audioManager = new AudioManager();
        this.completedReviewItems = 0;
        this.isSaving = false;
        this.isLoading = false;
        this.pendingReviews = [];
        this.onHome = false;
    }

    async init() {
        this.updateMenuTop();
        this.bindInputHandlers();

        let savedToken;
        try { savedToken = localStorage.getItem('wanikani_api_token'); } catch (_) {}
        if (!savedToken) return;

        this.apiToken = savedToken;
        this.client = new WaniKaniClient(savedToken);
        await this.startReview();
    }

    updateMenuTop() {
        const header = document.querySelector('.header');
        if (!header) return;
        this.menuTopPx = header.offsetHeight + 8;
        const menu = document.getElementById('menu');
        if (menu) menu.style.top = `${this.menuTopPx}px`;
    }

    bindInputHandlers() {
        const answerInput = document.getElementById('answer-input');
        if (!answerInput) return;

        answerInput.addEventListener('compositionstart', () => { this.isComposing = true; });
        answerInput.addEventListener('compositionend', () => { this.isComposing = false; });
    }

    async login() {
        const tokenInput = document.getElementById('api-token');
        if (this.isLoading) return;
        this.apiToken = tokenInput.value.trim();
        if (!this.apiToken) {
            document.getElementById('login-error').textContent = 'Please enter your API token.';
            return;
        }

        this.client = new WaniKaniClient(this.apiToken);
        await this.startReview();
    }

    async startReview() {
        if (this.isLoading || this.isSaving) return;
        this.isLoading = true;
        document.getElementById('login-error').textContent = '';
        if (!this.client) this.client = new WaniKaniClient(this.apiToken);

        this.showScreen('loading');
        this.updateLoadingText('Loading your data...');

        try {
            this.updateLoadingText('Loading user info...');
            this.user = await this.client.fetchUser();
            try { localStorage.setItem('wanikani_api_token', this.apiToken); } catch (_) {}

            this.updateLoadingText('Loading assignments...');
            this.assignments = await this.client.fetchAssignments();

            this.updateLoadingText('Loading study materials...');
            this.studyMaterials = await this.client.fetchStudyMaterials();
            this.updateLoadingText('Loading subjects...');
            const subjectIds = [...new Set([
                ...this.assignments.map(item => item.data.subject_id),
                ...this.studyMaterials.filter(item => item.data.meaning_note?.includes(EXCLUDE_MARKER))
                    .map(item => item.data.subject_id)
            ])];
            this.subjects = await this.client.fetchSubjectsByIds(subjectIds);
            this.subjectById.clear();
            for (const subject of this.subjects) this.subjectById.set(subject.id, subject);

            this.studyMaterialBySubjectId.clear();
            for (const material of this.studyMaterials) {
                this.studyMaterialBySubjectId.set(material.data.subject_id, material);
            }

            this.processExcludedItems();
            this.reviewQueue = buildReviewQueue(
                this.assignments,
                this.excludedSubjectIds,
                subjectId => this.getSubject(subjectId)
            );
            try {
                const saved = JSON.parse(localStorage.getItem(this.checkpointKey()) || '[]');
                if (Array.isArray(saved)) this.reviewQueue = restoreCheckpoints(this.reviewQueue, saved);
            } catch (_) {}
            this.pendingReviews = this.reviewQueue;
            this.reviewQueue = [];
            this.currentReview = null;
            this.showHome();
            return;
        } catch (error) {
            console.error('Error starting review:', error);
            document.getElementById('login-error').textContent = error.message || 'Unable to load data. Check your connection and try again.';
            this.showScreen('login');
        } finally {
            this.isLoading = false;
        }
    }

    checkpointKey() { return `takashika_reviews_${this.user?.id || this.user?.username || 'local'}`; }

    saveCheckpoint() {
        try {
            const items = [this.currentReview, ...this.reviewQueue, ...this.pendingReviews].filter(Boolean);
            localStorage.setItem(this.checkpointKey(), JSON.stringify(items.filter(hasProgress)));
        } catch (_) {}
    }

    showHome() {
        this.onHome = true;
        this.showScreen('home');
        const count = this.pendingReviews.length;
        document.getElementById('home-title').textContent = count ? 'A small step today.' : "You're all caught up.";
        document.getElementById('home-copy').textContent = count ? `${count} reviews ready. Start with a small batch, or review them all.` : 'Check back when more reviews are due.';
        document.getElementById('quick-btn').textContent = `Do ${Math.min(10, count)} reviews`;
        document.getElementById('quick-btn').disabled = count === 0;
        document.getElementById('all-reviews-btn').disabled = count === 0;
    }

    startBatch(limit = 10) {
        if (this.isSaving || !this.pendingReviews.length) return;
        this.reviewQueue = this.pendingReviews.splice(0, limit);
        this.completedReviewItems = 0;
        this.sessionStats = { total: 0, correct: 0, incorrect: 0 };
        this.onHome = false;
        for (const id of ['review-content', 'question-card', 'answer-section']) document.getElementById(id).classList.remove('hidden');
        document.getElementById('empty-state').classList.add('hidden');
        this.showScreen('review');
        this.nextReview();
    }

    pauseReview() {
        if (this.isSaving || this.isLoading) return;
        this.pendingReviews = [this.currentReview, ...this.reviewQueue, ...this.pendingReviews].filter(Boolean);
        this.currentReview = null;
        this.reviewQueue = [];
        this.currentResultIsCorrect = null;
        this.saveCheckpoint();
        this.showHome();
    }

    processExcludedItems() {
        this.excludedSubjectIds.clear();
        for (const material of this.studyMaterials) {
            const subject = this.getSubject(material.data.subject_id);
            if (!this.isExcludedStudyMaterial(material, subject)) continue;
            this.excludedSubjectIds.add(material.data.subject_id);
        }
    }

    isExcludedStudyMaterial(material, subject = this.getSubject(material.data.subject_id)) {
        if (!subject) return false;
        if (!(subject.object === 'vocabulary' || subject.object === 'kana_vocabulary')) return false;
        return material.data.meaning_note?.includes(EXCLUDE_MARKER) ?? false;
    }

    nextReview() {
        this.currentReview = null;
        this.saveCheckpoint();
        if (this.reviewQueue.length === 0) {
            this.showNoReviews();
            return;
        }

        this.currentReview = this.reviewQueue.shift();
        const subject = this.getSubject(this.currentReview.assignment.data.subject_id);
        if (!subject) {
            this.nextReview();
            return;
        }

        this.currentTaskType = this.getNextTaskType(subject, this.currentReview);
        this.currentResultIsCorrect = null;
        this.audioManager.primeForSubject(subject);
        this.audioManager.primeNext(this.reviewQueue, subjectId => this.getSubject(subjectId));
        this.displayQuestion(subject);
        if (this.isReviewItemFinished(subject, this.currentReview)) {
            this.currentResultIsCorrect = true;
            this.showResult(true, subject);
            document.getElementById('result-primary-btn').textContent = 'Retry save';
        }
        this.updateProgress();
    }

    getNextTaskType(subject, reviewItem) {
        const hasMeanings = AnswerChecker.getAcceptedMeanings(subject).length > 0;
        const hasReadings = subject.object !== 'radical' && AnswerChecker.getAcceptedReadings(subject).length > 0;

        if (reviewItem.answeredMeaning || !hasMeanings) return 'reading';
        if (reviewItem.answeredReading || !hasReadings) return 'meaning';
        return hasReadings ? 'reading' : 'meaning';
    }

    isReviewItemFinished(subject, reviewItem) {
        const hasMeanings = AnswerChecker.getAcceptedMeanings(subject).length > 0;
        const hasReadings = subject.object !== 'radical' && AnswerChecker.getAcceptedReadings(subject).length > 0;
        return (!hasMeanings || reviewItem.answeredMeaning) && (!hasReadings || reviewItem.answeredReading);
    }

    displayQuestion(subject) {
        const questionCard = document.getElementById('question-card');
        const subjectTypeEl = document.getElementById('subject-type');
        const taskModeLabelEl = document.getElementById('task-mode-label');
        const taskModeCopyEl = document.getElementById('task-mode-copy');
        const questionTextEl = document.getElementById('question-text');
        const questionHintEl = document.getElementById('question-hint');
        const answerInput = document.getElementById('answer-input');
        const audioBtn = document.getElementById('audio-btn');
        const submitBtn = document.getElementById('submit-btn');

        questionCard.classList.remove('meaning-mode', 'reading-mode', 'radical-mode');
        answerInput.classList.remove('meaning-field', 'reading-field', 'radical-field');
        submitBtn.classList.remove('meaning-action', 'reading-action');
        subjectTypeEl.textContent = subject.object.toUpperCase();
        questionTextEl.textContent = subject.data.characters || '';
        if (!subject.data.characters) {
            const image = subject.data.character_images?.find(item => item.content_type === 'image/png')
                || subject.data.character_images?.[0];
            if (image) {
                const img = document.createElement('img');
                img.src = image.url;
                img.alt = 'Radical to identify';
                img.className = 'radical-image';
                questionTextEl.appendChild(img);
            } else {
                questionTextEl.textContent = 'Image unavailable';
            }
        }

        if (this.currentTaskType === 'meaning') {
            questionCard.classList.add('meaning-mode');
            taskModeLabelEl.textContent = subject.object === 'radical' ? 'Radical Name' : 'Meaning';
            taskModeCopyEl.textContent = 'English';
            questionHintEl.textContent = 'Answer in English';
            answerInput.classList.add('meaning-field');
            if (subject.object === 'radical') {
                questionCard.classList.add('radical-mode');
                answerInput.classList.add('radical-field');
            }
            submitBtn.classList.add('meaning-action');
            answerInput.classList.remove('japanese-input');
            answerInput.setAttribute('lang', 'en');
            answerInput.setAttribute('autocapitalize', 'none');
            answerInput.setAttribute('autocorrect', 'off');
            answerInput.placeholder = subject.object === 'radical' ? 'Type the radical name...' : 'Type the English meaning...';
        } else {
            questionCard.classList.add('reading-mode');
            taskModeLabelEl.textContent = 'Reading';
            taskModeCopyEl.textContent = 'Hiragana';
            questionHintEl.textContent = 'Type in kana or romaji';
            answerInput.classList.add('reading-field');
            submitBtn.classList.add('reading-action');
            answerInput.classList.add('japanese-input');
            answerInput.setAttribute('lang', 'ja');
            answerInput.setAttribute('autocapitalize', 'none');
            answerInput.setAttribute('autocorrect', 'off');
            answerInput.placeholder = 'Type the reading (kana or romaji)...';
        }

        audioBtn.classList.add('hidden');
        submitBtn.disabled = false;
        document.getElementById('save-error').textContent = '';
        answerInput.value = '';
        answerInput.disabled = false;
        document.getElementById('result-card').classList.add('hidden');
        answerInput.focus();
    }

    submitAnswer() {
        if (!this.currentReview || this.currentResultIsCorrect !== null || this.isComposing || this.isSaving) return;
        const answerInput = document.getElementById('answer-input');
        const userAnswerRaw = answerInput.value.trim();
        const subject = this.getSubject(this.currentReview.assignment.data.subject_id);
        if (!userAnswerRaw) {
            answerInput.focus();
            return;
        }

        const studyMaterial = this.studyMaterialBySubjectId.get(subject.id);
        const isCorrect = this.currentTaskType === 'meaning'
            ? AnswerChecker.checkMeaning(userAnswerRaw, subject, studyMaterial)
            : AnswerChecker.checkReading(userAnswerRaw, subject);
        this.showResult(isCorrect, subject);
    }

    showResult(isCorrect, subject) {
        const resultCard = document.getElementById('result-card');
        const resultText = document.getElementById('result-text');
        const correctAnswer = document.getElementById('correct-answer');
        const primaryBtn = document.getElementById('result-primary-btn');
        const overrideBtn = document.getElementById('override-correct-btn');
        const askLaterBtn = document.getElementById('ask-later-btn');
        const answerInput = document.getElementById('answer-input');

        this.currentResultIsCorrect = isCorrect;
        document.getElementById('submit-btn').disabled = true;
        document.getElementById('audio-btn').classList.toggle('hidden', !this.audioManager.hasAudio(subject));
        resultCard.classList.remove('hidden', 'correct', 'incorrect');
        resultText.classList.remove('correct', 'incorrect');
        answerInput.blur();
        answerInput.disabled = true;
        primaryBtn.focus();

        if (isCorrect) {
            resultCard.classList.add('correct');
            resultText.classList.add('correct');
            resultText.textContent = 'Correct!';
            primaryBtn.textContent = 'Continue';
            correctAnswer.textContent = '';
            correctAnswer.classList.add('hidden');
            overrideBtn.classList.add('hidden');
            askLaterBtn.classList.add('hidden');
            return;
        }

        resultCard.classList.add('incorrect');
        resultText.classList.add('incorrect');
        resultText.textContent = 'Incorrect';
        if (this.currentTaskType === 'meaning') {
            correctAnswer.textContent = `Correct: ${AnswerChecker.getAcceptedMeanings(subject, this.studyMaterialBySubjectId.get(subject.id)).join(', ')}`;
        } else {
            correctAnswer.textContent = `Correct: ${AnswerChecker.getAcceptedReadings(subject).join(', ')}`;
        }
        primaryBtn.textContent = 'Count it wrong';
        correctAnswer.classList.remove('hidden');
        overrideBtn.classList.remove('hidden');
        askLaterBtn.classList.remove('hidden');
    }

    markCorrect() {
        return this.commitAnswer(true);
    }

    markIncorrect() {
        return this.commitAnswer(false);
    }

    async commitAnswer(correct) {
        if (!this.currentReview || this.currentResultIsCorrect === null || this.isSaving) return;
        const subject = this.getSubject(this.currentReview.assignment.data.subject_id);
        // A failed save leaves a finished item here; retry without counting the answer twice.
        if (!this.isReviewItemFinished(subject, this.currentReview)) {
            this.sessionStats.total += 1;
            this.sessionStats[correct ? 'correct' : 'incorrect'] += 1;
            if (correct) {
                this.currentReview[this.currentTaskType === 'meaning' ? 'answeredMeaning' : 'answeredReading'] = true;
                if (this.shouldAutoPlayAudio(subject)) this.audioManager.playForSubject(subject);
            } else {
                this.currentReview[this.currentTaskType === 'meaning' ? 'incorrectMeaningAnswers' : 'incorrectReadingAnswers'] += 1;
            }
        }
        this.saveCheckpoint();
        await this.advanceAfterAnswer(subject);
    }

    continueAfterResult() {
        return this.commitAnswer(this.currentResultIsCorrect === true);
    }

    askAgainLater() {
        if (!this.currentReview || this.currentResultIsCorrect === null || this.isSaving
            || this.isReviewItemFinished(this.getSubject(this.currentReview.assignment.data.subject_id), this.currentReview)) return;
        // Deferring this question must preserve previously recorded answers and mistakes.
        this.reviewQueue.push(this.currentReview);
        this.saveCheckpoint();
        this.nextReview();
    }

    async advanceAfterAnswer(subject) {
        if (this.isReviewItemFinished(subject, this.currentReview)) {
            this.isSaving = true;
            this.setSavingControls(true);
            try {
                await this.sendProgress(this.currentReview);
                this.completedReviewItems += 1;
                this.nextReview();
            } catch (error) {
                document.getElementById('save-error').textContent =
                    'Review not confirmed saved. Keep this page open. ' + error.message;
                document.getElementById('result-primary-btn').textContent = 'Retry save';
                document.getElementById('override-correct-btn').classList.add('hidden');
                document.getElementById('ask-later-btn').classList.add('hidden');
            } finally {
                this.isSaving = false;
                this.setSavingControls(false);
            }
            return;
        }
        this.currentTaskType = this.getNextTaskType(subject, this.currentReview);
        this.currentResultIsCorrect = null;
        this.displayQuestion(subject);
        this.updateProgress();
    }

    setSavingControls(disabled) {
        for (const id of ['result-primary-btn', 'override-correct-btn', 'ask-later-btn', 'logout-btn']) {
            document.getElementById(id).disabled = disabled;
        }
    }

    async sendProgress(reviewItem) {
        await this.client.createReview({
            subjectId: reviewItem.assignment.data.subject_id,
            incorrectMeaningAnswers: reviewItem.incorrectMeaningAnswers,
            incorrectReadingAnswers: reviewItem.incorrectReadingAnswers
        });
    }

    getSubject(subjectId) {
        return this.subjectById.get(subjectId) || this.subjects.find(subject => subject.id === subjectId);
    }

    shouldAutoPlayAudio(subject) {
        return this.currentTaskType === 'reading'
            && this.audioManager.hasAudio(subject)
            && Boolean(this.user?.preferences?.reviews_autoplay_audio);
    }

    playAudio() {
        if (!this.currentReview) return;
        const subject = this.getSubject(this.currentReview.assignment.data.subject_id);
        if (subject) this.audioManager.playForSubject(subject);
    }

    updateProgress() {
        const progressEl = document.getElementById('progress');
        const accuracyEl = document.getElementById('accuracy');
        const remaining = this.reviewQueue.length + (this.currentReview ? 1 : 0);
        const total = this.completedReviewItems + remaining;
        progressEl.textContent = total > 0 ? `${this.completedReviewItems}/${total} completed` : '0/0';

        const accuracy = this.sessionStats.total > 0
            ? Math.round((this.sessionStats.correct / this.sessionStats.total) * 100)
            : 100;
        accuracyEl.textContent = `${accuracy}%`;
    }

    showNoReviews() {
        this.currentReview = null;
        this.currentTaskType = null;
        this.currentResultIsCorrect = null;
        for (const id of ['review-content', 'question-card', 'answer-section', 'result-card']) {
            document.getElementById(id).classList.add('hidden');
        }
        document.getElementById('empty-state').classList.remove('hidden');
        const remaining = this.pendingReviews.length;
        document.getElementById('another-batch-btn').textContent = `Do another ${Math.min(10, remaining)}`;
        document.getElementById('another-batch-btn').classList.toggle('hidden', remaining === 0);
        document.getElementById('empty-title').textContent = this.completedReviewItems ? 'Session complete!' : 'All caught up';
        document.getElementById('empty-copy').textContent = this.completedReviewItems
            ? `${this.completedReviewItems} review${this.completedReviewItems === 1 ? '' : 's'} saved to WaniKani.`
            : 'No reviews are due right now. Excluded items are skipped.';
        this.updateProgress();
        this.showScreen('review');
    }

    updateLoadingText(text) {
        document.getElementById('loading-text').textContent = text;
    }

    showScreen(screenName) {
        document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
        document.getElementById(`${screenName}-screen`).classList.add('active');
    }

    toggleMenu() {
        const menu = document.getElementById('menu');
        if (!menu) return;

        this.updateMenuTop();
        menu.style.top = `${this.menuTopPx}px`;
        menu.classList.toggle('show');
        document.getElementById('menu-btn').setAttribute('aria-expanded', String(menu.classList.contains('show')));
    }

    closeMenuOnOutsideClick(event) {
        const menu = document.getElementById('menu');
        const menuBtn = document.getElementById('menu-btn');
        if (!menu) return;
        if (!menu.contains(event.target) && (!menuBtn || !menuBtn.contains(event.target))) {
            menu.classList.remove('show');
            menuBtn?.setAttribute('aria-expanded', 'false');
        }
    }

    showStats() {
        document.getElementById('total-reviews').textContent = this.sessionStats.total;
        document.getElementById('correct-answers').textContent = this.sessionStats.correct;
        const accuracy = this.sessionStats.total > 0
            ? Math.round((this.sessionStats.correct / this.sessionStats.total) * 100)
            : 100;
        document.getElementById('accuracy-rate').textContent = `${accuracy}%`;
        this.showScreen('stats');
        document.getElementById('menu').classList.remove('show');
        document.getElementById('menu-btn').setAttribute('aria-expanded', 'false');
    }

    showExcluded() {
        const excludedList = document.getElementById('excluded-list');
        excludedList.innerHTML = '';

        for (const material of this.studyMaterials) {
            const subject = this.getSubject(material.data.subject_id);
            if (!this.isExcludedStudyMaterial(material, subject)) continue;

            const item = document.createElement('div');
            item.className = 'excluded-item';
            const info = document.createElement('div');
            info.className = 'subject-info';
            for (const [className, text] of [
                ['subject-text', subject.data.characters || subject.data.slug],
                ['subject-meaning', subject.data.meanings?.[0]?.meaning || 'No meaning']
            ]) {
                const line = document.createElement('div');
                line.className = className;
                line.textContent = text;
                info.appendChild(line);
            }
            item.appendChild(info);
            excludedList.appendChild(item);
        }

        if (!excludedList.children.length) excludedList.textContent = 'No excluded items.';
        this.showScreen('excluded');
        document.getElementById('menu').classList.remove('show');
        document.getElementById('menu-btn').setAttribute('aria-expanded', 'false');
    }

    backToReview() {
        this.showScreen('review');
    }

    logout() {
        if (this.isSaving) return;
        this.saveCheckpoint();
        try { localStorage.removeItem('wanikani_api_token'); } catch (_) {}
        this.pendingReviews = [];
        this.currentReview = null;
        this.reviewQueue = [];
        this.sessionStats = { total: 0, correct: 0, incorrect: 0 };
        this.audioManager.clear();
        this.apiToken = null;
        this.client = null;
        this.showScreen('login');
        document.getElementById('api-token').value = '';
        document.getElementById('menu').classList.remove('show');
        document.getElementById('menu-btn').setAttribute('aria-expanded', 'false');
    }
}
