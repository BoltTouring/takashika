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
        this.currentReview = null; // { assignment, type: 'meaning'|'reading' }
        this.reviewQueue = [];
        this.sessionStats = { total: 0, correct: 0, incorrect: 0 };
        this.currentTaskType = null;
        this.currentResultIsCorrect = null;
        this.isComposing = false;
        this.menuTopPx = 80;
        this.audioManager = new AudioManager();
    }

    async init() {
        this.updateMenuTop();
        this.bindInputHandlers();

        const savedToken = localStorage.getItem('wanikani_api_token');
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
        answerInput.addEventListener('compositionend', () => {
            this.isComposing = false;
            if (this.currentTaskType === 'reading') {
                answerInput.value = AnswerChecker.toHiragana(answerInput.value);
            }
        });
        answerInput.addEventListener('input', () => {
            if (this.currentTaskType !== 'reading' || this.isComposing) return;
            const before = answerInput.value;
            const after = AnswerChecker.toHiragana(before);
            if (after === before) return;
            answerInput.value = after;
            try { answerInput.setSelectionRange(after.length, after.length); } catch (_) {}
        });
    }

    async login() {
        const tokenInput = document.getElementById('api-token');
        this.apiToken = tokenInput.value.trim();
        if (!this.apiToken) {
            alert('Please enter your API token');
            return;
        }

        localStorage.setItem('wanikani_api_token', this.apiToken);
        this.client = new WaniKaniClient(this.apiToken);
        await this.startReview();
    }

    async startReview() {
        if (!this.client) this.client = new WaniKaniClient(this.apiToken);

        this.showScreen('loading');
        this.updateLoadingText('Loading your data...');

        try {
            this.updateLoadingText('Loading user info...');
            this.user = await this.client.fetchUser();

            this.updateLoadingText('Loading assignments...');
            this.assignments = await this.client.fetchAssignments();

            this.updateLoadingText('Loading subjects...');
            const subjectIds = [...new Set(this.assignments.map(item => item.data.subject_id))];
            this.subjects = await this.client.fetchSubjectsByIds(subjectIds);
            this.subjectById.clear();
            for (const subject of this.subjects) this.subjectById.set(subject.id, subject);

            this.updateLoadingText('Loading study materials...');
            this.studyMaterials = await this.client.fetchStudyMaterials();
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

            this.showScreen('review');
            this.nextReview();
        } catch (error) {
            console.error('Error starting review:', error);
            alert('Error loading your data. Please check your API token.');
            this.showScreen('login');
        }
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

        this.currentTaskType = this.currentReview.type;
        this.currentResultIsCorrect = null;
        this.audioManager.primeForSubject(subject);
        this.audioManager.primeNext(this.reviewQueue, subjectId => this.getSubject(subjectId));
        this.displayQuestion(subject);
        this.updateProgress();
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

        questionCard.classList.remove('meaning-mode', 'reading-mode');
        answerInput.classList.remove('meaning-field', 'reading-field');
        submitBtn.classList.remove('meaning-action', 'reading-action');
        subjectTypeEl.textContent = subject.object.toUpperCase();
        questionTextEl.textContent = subject.data.characters || subject.data.slug;

        if (this.currentTaskType === 'meaning') {
            questionCard.classList.add('meaning-mode');
            taskModeLabelEl.textContent = subject.object === 'radical' ? 'Name' : 'Meaning';
            taskModeCopyEl.textContent = 'English';
            questionHintEl.textContent = 'Answer in English';
            answerInput.classList.add('meaning-field');
            submitBtn.classList.add('meaning-action');
            answerInput.classList.remove('japanese-input');
            answerInput.setAttribute('lang', 'en');
            answerInput.setAttribute('autocapitalize', 'none');
            answerInput.setAttribute('autocorrect', 'off');
            answerInput.placeholder = 'Type the English meaning...';
        } else {
            questionCard.classList.add('reading-mode');
            taskModeLabelEl.textContent = 'Reading';
            taskModeCopyEl.textContent = 'Hiragana';
            questionHintEl.textContent = 'Type in hiragana';
            answerInput.classList.add('reading-field');
            submitBtn.classList.add('reading-action');
            answerInput.classList.add('japanese-input');
            answerInput.setAttribute('lang', 'ja');
            answerInput.setAttribute('autocapitalize', 'none');
            answerInput.setAttribute('autocorrect', 'off');
            answerInput.placeholder = 'Type the reading (hiragana)...';
        }

        audioBtn.classList.toggle('hidden', !this.audioManager.hasAudio(subject));
        answerInput.value = '';
        answerInput.disabled = false;
        document.getElementById('result-card').classList.add('hidden');
        answerInput.focus();
    }

    submitAnswer() {
        const answerInput = document.getElementById('answer-input');
        const userAnswerRaw = answerInput.value.trim();
        const subject = this.getSubject(this.currentReview.assignment.data.subject_id);
        if (!userAnswerRaw) {
            alert('Please enter an answer');
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
        resultCard.classList.remove('hidden', 'correct', 'incorrect');
        resultText.classList.remove('correct', 'incorrect');
        answerInput.blur();
        answerInput.disabled = true;

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
            correctAnswer.textContent = `Correct: ${AnswerChecker.getAcceptedMeanings(subject).join(', ')}`;
        } else {
            correctAnswer.textContent = `Correct: ${AnswerChecker.getAcceptedReadings(subject).join(', ')}`;
        }
        primaryBtn.textContent = 'Count it wrong';
        correctAnswer.classList.remove('hidden');
        overrideBtn.classList.remove('hidden');
        askLaterBtn.classList.remove('hidden');
    }

    async markCorrect() {
        const subject = this.getSubject(this.currentReview.assignment.data.subject_id);
        if (this.shouldAutoPlayAudio(subject)) this.audioManager.playForSubject(subject);
        this.sessionStats.correct += 1;
        this.sessionStats.total += 1;
        await this.sendProgress(true);
        this.nextReview();
    }

    async markIncorrect() {
        this.sessionStats.incorrect += 1;
        this.sessionStats.total += 1;
        await this.sendProgress(false);
        this.nextReview();
    }

    continueAfterResult() {
        if (this.currentResultIsCorrect) this.markCorrect();
        else this.markIncorrect();
    }

    askAgainLater() {
        if (!this.currentReview) return;
        this.reviewQueue.push(this.currentReview);
        this.nextReview();
    }

    async sendProgress(correct) {
        try {
            await this.client.createReview({
                subjectId: this.currentReview.assignment.data.subject_id,
                incorrectMeaningAnswers: this.currentTaskType === 'meaning' && !correct ? 1 : 0,
                incorrectReadingAnswers: this.currentTaskType === 'reading' && !correct ? 1 : 0
            });
        } catch (error) {
            console.error('Error sending progress:', error);
        }
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
        const remaining = this.reviewQueue.length + 1;
        const total = this.sessionStats.total + remaining;
        progressEl.textContent = `${this.sessionStats.total + 1}/${total}`;

        const accuracy = this.sessionStats.total > 0
            ? Math.round((this.sessionStats.correct / this.sessionStats.total) * 100)
            : 100;
        accuracyEl.textContent = `${accuracy}%`;
    }

    showNoReviews() {
        alert('No reviews available! Check back later.');
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
        if (menu.classList.contains('show')) {
            setTimeout(() => {
                document.addEventListener('click', this.closeMenuOnOutsideClick.bind(this), { once: true });
            }, 0);
        }
    }

    closeMenuOnOutsideClick(event) {
        const menu = document.getElementById('menu');
        const menuBtn = document.getElementById('menu-btn');
        if (!menu) return;
        if (!menu.contains(event.target) && (!menuBtn || !menuBtn.contains(event.target))) {
            menu.classList.remove('show');
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
    }

    showExcluded() {
        const excludedList = document.getElementById('excluded-list');
        excludedList.innerHTML = '';

        for (const material of this.studyMaterials) {
            const subject = this.getSubject(material.data.subject_id);
            if (!this.isExcludedStudyMaterial(material, subject)) continue;

            const item = document.createElement('div');
            item.className = 'excluded-item';
            item.innerHTML = `<div class="subject-info"><div class="subject-text">${subject.data.characters || subject.data.slug}</div><div class="subject-meaning">${subject.data.meanings?.[0]?.meaning || 'No meaning'}</div></div>`;
            excludedList.appendChild(item);
        }

        this.showScreen('excluded');
        document.getElementById('menu').classList.remove('show');
    }

    backToReview() {
        this.showScreen('review');
    }

    logout() {
        localStorage.removeItem('wanikani_api_token');
        this.apiToken = null;
        this.client = null;
        this.showScreen('login');
        document.getElementById('api-token').value = '';
        document.getElementById('menu').classList.remove('show');
    }
}
