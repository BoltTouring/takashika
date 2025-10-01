// WaniKani Review PWA
class WaniKaniReviewer {
    constructor() {
        this.apiToken = null;
        this.user = null;
        this.assignments = [];
        this.subjects = [];
        this.subjectById = new Map();
        this.studyMaterials = [];
        this.excludedSubjectIds = new Set();
        this.currentReview = null; // { assignment, type: 'meaning'|'reading' }
        this.reviewQueue = [];
        this.sessionStats = { total: 0, correct: 0, incorrect: 0 };
        this.currentTaskType = null; // 'meaning' or 'reading'
        this.isComposing = false; // IME composition guard
        this.menuTopPx = 80; // default fallback
        this.init();
    }

    async init() {
        const header = document.querySelector('.header');
        if (header) {
            this.menuTopPx = header.offsetHeight + 8;
            const menu = document.getElementById('menu');
            if (menu) menu.style.top = `${this.menuTopPx}px`;
        }

        const answerInput = document.getElementById('answer-input');
        if (answerInput) {
            answerInput.addEventListener('compositionstart', () => { this.isComposing = true; });
            answerInput.addEventListener('compositionend', () => {
                this.isComposing = false;
                if (this.currentTaskType === 'reading') {
                    answerInput.value = this.convertRomajiToHiragana(answerInput.value);
                }
            });
            answerInput.addEventListener('input', () => {
                if (this.currentTaskType === 'reading' && !this.isComposing) {
                    const before = answerInput.value;
                    const after = this.convertRomajiToHiragana(before);
                    if (after !== before) {
                        answerInput.value = after;
                        try { answerInput.setSelectionRange(after.length, after.length); } catch (_) {}
                    }
                }
            });
        }

        const menuBtn = document.getElementById('menu-btn');
        if (menuBtn) {
            menuBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleMenu();
            });
        }

        const savedToken = localStorage.getItem('wanikani_api_token');
        if (savedToken) {
            this.apiToken = savedToken;
            await this.startReview();
        }

        if ('serviceWorker' in navigator) {
            try { await navigator.serviceWorker.register('sw.js'); } catch (_) {}
        }
    }

    async login() {
        const tokenInput = document.getElementById('api-token');
        this.apiToken = tokenInput.value.trim();
        if (!this.apiToken) { alert('Please enter your API token'); return; }
        localStorage.setItem('wanikani_api_token', this.apiToken);
        await this.startReview();
    }

    async startReview() {
        this.showScreen('loading');
        this.updateLoadingText('Loading your data...');
        try {
            this.updateLoadingText('Loading user info...');
            this.user = await this.fetchUser();

            this.updateLoadingText('Loading assignments...');
            this.assignments = await this.fetchAll(`/assignments?unlocked=true&hidden=false`);

            this.updateLoadingText('Loading subjects...');
            const subjectIds = [...new Set(this.assignments.map(a => a.data.subject_id))];
            this.subjects = await this.fetchSubjectsByIds(subjectIds);
            this.subjectById.clear();
            for (const s of this.subjects) this.subjectById.set(s.id, s);

            this.updateLoadingText('Loading study materials...');
            this.studyMaterials = await this.fetchAll(`/study_materials`);

            this.processExcludedItems();
            this.buildReviewQueue();

            this.showScreen('review');
            this.nextReview();
        } catch (error) {
            console.error('Error starting review:', error);
            alert('Error loading your data. Please check your API token.');
            this.showScreen('login');
        }
    }

    async fetchUser() { const r = await this.apiRequest('/user'); return r.data; }

    async fetchAll(endpoint) {
        let url = `https://api.wanikani.com/v2${endpoint}`;
        const items = [];
        while (url) {
            const res = await this.apiGet(url);
            if (Array.isArray(res.data)) items.push(...res.data);
            url = res.pages && res.pages.next_url ? res.pages.next_url : null;
        }
        return items;
    }

    async fetchSubjectsByIds(ids) {
        if (!ids.length) return [];
        const batchSize = 200;
        const results = [];
        for (let i = 0; i < ids.length; i += batchSize) {
            const chunk = ids.slice(i, i + batchSize);
            const query = `/subjects?ids=${chunk.join(',')}`;
            const pageItems = await this.fetchAll(query);
            results.push(...pageItems);
        }
        return results;
    }

    async apiRequest(endpoint) { return this.apiGet(`https://api.wanikani.com/v2${endpoint}`); }
    async apiGet(url) {
        const resp = await fetch(url, { headers: { 'Authorization': `Token token=${this.apiToken}`, 'Wanikani-Revision': '20170710' } });
        if (!resp.ok) throw new Error(`API request failed: ${resp.status}`);
        return await resp.json();
    }

    processExcludedItems() {
        this.excludedSubjectIds.clear();
        for (const material of this.studyMaterials) {
            if (material.data.meaning_note && material.data.meaning_note.includes('#tsurukameExclude')) {
                this.excludedSubjectIds.add(material.data.subject_id);
            }
        }
    }

    buildReviewQueue() {
        const now = new Date();
        this.reviewQueue = [];
        for (const assignment of this.assignments) {
            const sid = assignment.data.subject_id;
            if (this.excludedSubjectIds.has(sid)) continue;
            const availableAt = assignment.data.available_at ? new Date(assignment.data.available_at) : null;
            const isAvailable = availableAt ? availableAt <= now : false;
            const srsStage = assignment.data.srs_stage ?? 0;
            if (!(srsStage > 0 && isAvailable)) continue;
            const subject = this.getSubject(sid);
            if (!subject) continue;
            const hasReadings = subject.data.readings && subject.data.readings.length > 0;
            const hasMeanings = subject.data.meanings && subject.data.meanings.length > 0;
            // Radicals: meaning only
            if (subject.object === 'radical') {
                if (hasMeanings) this.reviewQueue.push({ assignment, type: 'meaning' });
                continue;
            }
            // Kanji/Vocab: enqueue both reading and meaning tasks
            if (hasReadings) this.reviewQueue.push({ assignment, type: 'reading' });
            if (hasMeanings) this.reviewQueue.push({ assignment, type: 'meaning' });
        }
        this.shuffleArray(this.reviewQueue);
    }

    nextReview() {
        if (this.reviewQueue.length === 0) { this.showNoReviews(); return; }
        this.currentReview = this.reviewQueue.shift();
        const subject = this.getSubject(this.currentReview.assignment.data.subject_id);
        if (!subject) { this.nextReview(); return; }
        this.currentTaskType = this.currentReview.type;
        this.displayQuestion(subject);
        this.updateProgress();
    }

    displayQuestion(subject) {
        const subjectTypeEl = document.getElementById('subject-type');
        const questionTextEl = document.getElementById('question-text');
        const questionHintEl = document.getElementById('question-hint');
        const answerInput = document.getElementById('answer-input');

        subjectTypeEl.textContent = subject.object.toUpperCase();
        questionTextEl.textContent = subject.data.characters || subject.data.slug;

        if (this.currentTaskType === 'meaning') {
            questionHintEl.textContent = 'Enter the meaning';
            answerInput.classList.remove('japanese-input');
            answerInput.setAttribute('lang', 'en');
            answerInput.setAttribute('autocapitalize', 'none');
            answerInput.setAttribute('autocorrect', 'off');
            answerInput.placeholder = 'Type the English meaning…';
        } else {
            questionHintEl.textContent = 'Enter the reading';
            answerInput.classList.add('japanese-input');
            answerInput.setAttribute('lang', 'ja');
            answerInput.setAttribute('autocapitalize', 'none');
            answerInput.setAttribute('autocorrect', 'off');
            answerInput.placeholder = 'Type the reading (hiragana)…';
        }
        answerInput.value = '';
        document.getElementById('result-card').classList.add('hidden');
        answerInput.focus();
    }

    async submitAnswer() {
        const answerInput = document.getElementById('answer-input');
        const userAnswerRaw = answerInput.value.trim();
        const subject = this.getSubject(this.currentReview.assignment.data.subject_id);
        if (!userAnswerRaw) { alert('Please enter an answer'); return; }
        const userAnswer = this.currentTaskType === 'reading' ? this.toHiragana(userAnswerRaw) : userAnswerRaw.toLowerCase();
        const isCorrect = this.checkAnswer(userAnswer, subject);
        this.showResult(isCorrect, subject);
    }

    checkAnswer(userAnswer, subject) {
        if (this.currentTaskType === 'meaning') {
            const meanings = subject.data.meanings || [];
            const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
            return meanings.some(m => norm(m.meaning) === norm(userAnswer));
        } else {
            const readings = subject.data.readings || [];
            const ua = this.toHiragana(userAnswer).replace(/\s/g, '');
            const norm = (s) => this.toHiragana(s).replace(/\s/g, '');
            return readings.some(r => norm(r.reading) === ua);
        }
    }

    showResult(isCorrect, subject) {
        const resultCard = document.getElementById('result-card');
        const resultText = document.getElementById('result-text');
        const correctAnswer = document.getElementById('correct-answer');
        resultCard.classList.remove('hidden', 'correct', 'incorrect');
        resultText.classList.remove('correct', 'incorrect');
        if (isCorrect) {
            resultCard.classList.add('correct');
            resultText.classList.add('correct');
            resultText.textContent = 'Correct!';
            correctAnswer.textContent = '';
        } else {
            resultCard.classList.add('incorrect');
            resultText.classList.add('incorrect');
            resultText.textContent = 'Incorrect';
            if (this.currentTaskType === 'meaning') {
                const meanings = subject.data.meanings || [];
                correctAnswer.textContent = `Correct: ${meanings.map(m => m.meaning).join(', ')}`;
            } else {
                const readings = subject.data.readings || [];
                correctAnswer.textContent = `Correct: ${readings.map(r => r.reading).join(', ')}`;
            }
        }
    }

    async markCorrect() {
        this.sessionStats.correct++; this.sessionStats.total++;
        await this.sendProgress(true);
        this.nextReview();
    }

    async markIncorrect() {
        this.sessionStats.incorrect++; this.sessionStats.total++;
        await this.sendProgress(false);
        this.nextReview();
    }

    async sendProgress(correct) {
        try {
            const reviewData = {
                review: {
                    subject_id: this.currentReview.assignment.data.subject_id,
                    incorrect_meaning_answers: this.currentTaskType === 'meaning' && !correct ? 1 : 0,
                    incorrect_reading_answers: this.currentTaskType === 'reading' && !correct ? 1 : 0
                }
            };
            await fetch('https://api.wanikani.com/v2/reviews', {
                method: 'POST',
                headers: { 'Authorization': `Token token=${this.apiToken}`, 'Content-Type': 'application/json', 'Wanikani-Revision': '20170710' },
                body: JSON.stringify(reviewData)
            });
        } catch (e) { console.error('Error sending progress:', e); }
    }

    getSubject(subjectId) { return this.subjectById.get(subjectId) || this.subjects.find(s => s.id === subjectId); }

    updateProgress() {
        const progressEl = document.getElementById('progress');
        const accuracyEl = document.getElementById('accuracy');
        const remaining = this.reviewQueue.length + 1;
        const total = this.sessionStats.total + remaining;
        progressEl.textContent = `${this.sessionStats.total + 1}/${total}`;
        const accuracy = this.sessionStats.total > 0 ? Math.round((this.sessionStats.correct / this.sessionStats.total) * 100) : 100;
        accuracyEl.textContent = `${accuracy}%`;
    }

    showNoReviews() { alert('No reviews available! Check back later.'); this.showScreen('review'); }
    updateLoadingText(text) { document.getElementById('loading-text').textContent = text; }
    showScreen(screenName) { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); document.getElementById(`${screenName}-screen`).classList.add('active'); }

    toggleMenu() {
        const menu = document.getElementById('menu'); if (!menu) return;
        const header = document.querySelector('.header');
        menu.style.top = header ? `${header.offsetHeight + 8}px` : `${this.menuTopPx}px`;
        menu.classList.toggle('show');
        if (menu.classList.contains('show')) {
            setTimeout(() => { document.addEventListener('click', this.closeMenuOnOutsideClick.bind(this), { once: true }); }, 0);
        }
    }

    closeMenuOnOutsideClick(event) {
        const menu = document.getElementById('menu'); const menuBtn = document.getElementById('menu-btn');
        if (!menu) return; if (!menu.contains(event.target) && (!menuBtn || !menuBtn.contains(event.target))) menu.classList.remove('show');
    }

    showStats() {
        document.getElementById('total-reviews').textContent = this.sessionStats.total;
        document.getElementById('correct-answers').textContent = this.sessionStats.correct;
        const accuracy = this.sessionStats.total > 0 ? Math.round((this.sessionStats.correct / this.sessionStats.total) * 100) : 100;
        document.getElementById('accuracy-rate').textContent = `${accuracy}%`;
        this.showScreen('stats'); document.getElementById('menu').classList.remove('show');
    }

    showExcluded() {
        const excludedList = document.getElementById('excluded-list'); excludedList.innerHTML = '';
        for (const material of this.studyMaterials) {
            if (material.data.meaning_note && material.data.meaning_note.includes('#tsurukameExclude')) {
                const subject = this.getSubject(material.data.subject_id);
                if (subject) {
                    const item = document.createElement('div');
                    item.className = 'excluded-item';
                    item.innerHTML = `<div class="subject-info"><div class="subject-text">${subject.data.characters || subject.data.slug}</div><div class="subject-meaning">${subject.data.meanings?.[0]?.meaning || 'No meaning'}</div></div>`;
                    excludedList.appendChild(item);
                }
            }
        }
        this.showScreen('excluded'); document.getElementById('menu').classList.remove('show');
    }

    backToReview() { this.showScreen('review'); }
    logout() { localStorage.removeItem('wanikani_api_token'); this.apiToken = null; this.showScreen('login'); document.getElementById('api-token').value = ''; document.getElementById('menu').classList.remove('show'); }

    shuffleArray(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } }

    // ---- Kana conversion helpers (closer to Tsurukame/WanaKana behavior) ----
    toHiragana(input) {
        if (!input) return '';
        // Convert katakana to hiragana
        input = input.replace(/[\u30A1-\u30FA]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
        return this.convertRomajiToHiragana(input);
    }

    convertRomajiToHiragana(input) {
        if (!input) return '';
        let s = input.toLowerCase();
        // Handle double consonants (not for n)
        s = s.replace(/(bb|cc|dd|ff|gg|hh|jj|kk|ll|mm|pp|qq|rr|ss|tt|vv|ww|xx|zz)/g, (m) => `っ${m[0]}` + m[1]);
        // Small tsu for tcha/tcha-like already handled by above
        // Normalize common variations to j series
        s = s.replace(/jya/g, 'ja').replace(/jyu/g, 'ju').replace(/jyo/g, 'jo');
        s = s.replace(/zya/g, 'ja').replace(/zyu/g, 'ju').replace(/zyo/g, 'jo');
        // Map digraphs first
        const digraphs = {
            kya:'きゃ',kyu:'きゅ',kyo:'きょ',
            sha:'しゃ',shu:'しゅ',sho:'しょ',
            cha:'ちゃ',chu:'ちゅ',cho:'ちょ',
            nya:'にゃ',nyu:'にゅ',nyo:'にょ',
            hya:'ひゃ',hyu:'ひゅ',hyo:'ひょ',
            mya:'みゃ',myu:'みゅ',myo:'みょ',
            rya:'りゃ',ryu:'りゅ',ryo:'りょ',
            gya:'ぎゃ',gyu:'ぎゅ',gyo:'ぎょ',
            ja:'じゃ',ju:'じゅ',jo:'じょ',
            bya:'びゃ',byu:'びゅ',byo:'びょ',
            pya:'ぴゃ',pyu:'ぴゅ',pyo:'ぴょ'
        };
        for (const [k,v] of Object.entries(digraphs)) s = s.replace(new RegExp(k,'g'), v);
        // Special syllables (shi/chi/tsu/ji/di/du)
        s = s.replace(/shi/g,'し').replace(/chi/g,'ち').replace(/tsu/g,'つ');
        s = s.replace(/ji/g,'じ');
        s = s.replace(/di/g,'ぢ').replace(/du/g,'づ');
        // Basic table
        const map = {
            a:'あ',i:'い',u:'う',e:'え',o:'お',
            ka:'か',ki:'き',ku:'く',ke:'け',ko:'こ',
            sa:'さ',su:'す',se:'せ',so:'そ',
            ta:'た',te:'て',to:'と',
            na:'な',ni:'に',nu:'ぬ',ne:'ね',no:'の',
            ha:'は',hi:'ひ',fu:'ふ',he:'へ',ho:'ほ',
            ma:'ま',mi:'み',mu:'む',me:'め',mo:'も',
            ya:'や',yu:'ゆ',yo:'よ',
            ra:'ら',ri:'り',ru:'る',re:'れ',ro:'ろ',
            wa:'わ',wo:'を',
            ga:'が',gi:'ぎ',gu:'ぐ',ge:'げ',go:'ご',
            za:'ざ',zu:'ず',ze:'ぜ',zo:'ぞ',
            da:'だ',de:'で',do:'ど',
            ba:'ば',bi:'び',bu:'ぶ',be:'べ',bo:'ぼ',
            pa:'ぱ',pi:'ぴ',pu:'ぷ',pe:'ぺ',po:'ぽ'
        };
        const keys = Object.keys(map).sort((a,b)=>b.length-a.length);
        for (const k of keys) s = s.replace(new RegExp(k,'g'), map[k]);
        // Handle standalone 'n' → ん (when not followed by vowel or y)
        s = s.replace(/n(?![aiueoy])/g,'ん');
        // Long vowels are left as-is; WK accepts plain hiragana
        return s;
    }
}

let reviewer;
function login() { reviewer.login(); }
function submitAnswer() { reviewer.submitAnswer(); }
function markCorrect() { reviewer.markCorrect(); }
function markIncorrect() { reviewer.markIncorrect(); }
function toggleMenu() { reviewer.toggleMenu(); }
function showStats() { reviewer.showStats(); }
function showExcluded() { reviewer.showExcluded(); }
function backToReview() { reviewer.backToReview(); }
function logout() { reviewer.logout(); }

document.addEventListener('DOMContentLoaded', () => {
    reviewer = new WaniKaniReviewer();
    const input = document.getElementById('answer-input');
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') submitAnswer(); });
});
