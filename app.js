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
        this.currentReview = null;
        this.reviewQueue = [];
        this.sessionStats = {
            total: 0,
            correct: 0,
            incorrect: 0
        };
        this.currentTaskType = null; // 'meaning' or 'reading'
        this.isComposing = false; // IME composition guard
        this.menuTopPx = 80; // default fallback
        
        this.init();
    }

    async init() {
        // Compute menu top based on header height when available
        const header = document.querySelector('.header');
        if (header) {
            this.menuTopPx = header.offsetHeight + 8;
            const menu = document.getElementById('menu');
            if (menu) menu.style.top = `${this.menuTopPx}px`;
        }

        // Bind input handlers for kana conversion
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
                    const caret = answerInput.selectionStart;
                    const before = answerInput.value;
                    const after = this.convertRomajiToHiragana(before);
                    if (after !== before) {
                        answerInput.value = after;
                        // best-effort caret restore
                        try { answerInput.setSelectionRange(after.length, after.length); } catch (_) {}
                    }
                }
            });
        }

        // Attach explicit menu button handler to avoid inline issues
        const menuBtn = document.getElementById('menu-btn');
        if (menuBtn) {
            menuBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleMenu();
            });
        }

        // Check for saved API token
        const savedToken = localStorage.getItem('wanikani_api_token');
        if (savedToken) {
            this.apiToken = savedToken;
            await this.startReview();
        }
        
        // Register service worker
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register('sw.js');
                console.log('Service Worker registered');
            } catch (error) {
                console.log('Service Worker registration failed:', error);
            }
        }
    }

    async login() {
        const tokenInput = document.getElementById('api-token');
        this.apiToken = tokenInput.value.trim();
        
        if (!this.apiToken) {
            alert('Please enter your API token');
            return;
        }

        localStorage.setItem('wanikani_api_token', this.apiToken);
        await this.startReview();
    }

    async startReview() {
        this.showScreen('loading');
        this.updateLoadingText('Loading your data...');
        
        try {
            // Load user info
            this.updateLoadingText('Loading user info...');
            this.user = await this.fetchUser();
            
            // Load assignments (all pages)
            this.updateLoadingText('Loading assignments...');
            this.assignments = await this.fetchAll(`/assignments?unlocked=true&hidden=false`);
            
            // Load subjects for all relevant IDs (all pages)
            // If we fetch all subjects, it's heavy; instead gather subject_ids and fetch by ids batched
            this.updateLoadingText('Loading subjects...');
            const subjectIds = [...new Set(this.assignments.map(a => a.data.subject_id))];
            this.subjects = await this.fetchSubjectsByIds(subjectIds);
            this.subjectById.clear();
            for (const s of this.subjects) this.subjectById.set(s.id, s);
            
            // Load study materials to identify excluded items (all pages)
            this.updateLoadingText('Loading study materials...');
            this.studyMaterials = await this.fetchAll(`/study_materials`);
            
            // Process excluded items
            this.processExcludedItems();
            
            // Build review queue
            this.buildReviewQueue();
            
            // Start review session
            this.showScreen('review');
            this.nextReview();
            
        } catch (error) {
            console.error('Error starting review:', error);
            alert('Error loading your data. Please check your API token.');
            this.showScreen('login');
        }
    }

    async fetchUser() {
        const response = await this.apiRequest('/user');
        return response.data;
    }

    async fetchAll(endpoint) {
        // Follows pages.next_url to accumulate all items in data[]
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
        // Batch ids to avoid URL length issues
        const batchSize = 200; // WK allows large pages, keep safe
        const results = [];
        for (let i = 0; i < ids.length; i += batchSize) {
            const chunk = ids.slice(i, i + batchSize);
            const query = `/subjects?ids=${chunk.join(',')}`;
            const pageItems = await this.fetchAll(query);
            results.push(...pageItems);
        }
        return results;
    }

    async apiRequest(endpoint) {
        return this.apiGet(`https://api.wanikani.com/v2${endpoint}`);
    }

    async apiGet(url) {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Token token=${this.apiToken}`,
                'Wanikani-Revision': '20170710'
            }
        });
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }
        return await response.json();
    }

    processExcludedItems() {
        this.excludedSubjectIds.clear();
        for (const material of this.studyMaterials) {
            if (material.data.meaning_note && material.data.meaning_note.includes('#tsurukameExclude')) {
                this.excludedSubjectIds.add(material.data.subject_id);
            }
        }
        console.log(`Found ${this.excludedSubjectIds.size} excluded items`);
    }

    buildReviewQueue() {
        const now = new Date();
        this.reviewQueue = [];
        for (const assignment of this.assignments) {
            const sid = assignment.data.subject_id;
            if (this.excludedSubjectIds.has(sid)) continue; // excluded
            // Only reviewable and available
            const availableAt = assignment.data.available_at ? new Date(assignment.data.available_at) : null;
            const isAvailable = availableAt ? availableAt <= now : false;
            const srsStage = assignment.data.srs_stage ?? 0;
            if (srsStage > 0 && isAvailable) {
                this.reviewQueue.push(assignment);
            }
        }
        // Shuffle the queue
        this.shuffleArray(this.reviewQueue);
        console.log(`Built review queue with ${this.reviewQueue.length} items`);
    }

    nextReview() {
        if (this.reviewQueue.length === 0) {
            this.showNoReviews();
            return;
        }
        this.currentReview = this.reviewQueue.shift();
        const subject = this.getSubject(this.currentReview.data.subject_id);
        if (!subject) {
            // Fallback: skip if subject couldn’t be loaded
            this.nextReview();
            return;
        }
        this.currentTaskType = this.determineTaskType(subject);
        this.displayQuestion(subject);
        this.updateProgress();
    }

    determineTaskType(subject) {
        const hasReadings = subject.data.readings && subject.data.readings.length > 0;
        const hasMeanings = subject.data.meanings && subject.data.meanings.length > 0;
        if (!hasReadings) return 'meaning';
        if (!hasMeanings) return 'reading';
        if (subject.object === 'radical') return 'meaning';
        return 'reading';
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
        } else {
            questionHintEl.textContent = 'Enter the reading';
            answerInput.classList.add('japanese-input');
            answerInput.setAttribute('lang', 'ja');
            answerInput.setAttribute('autocapitalize', 'none');
            answerInput.setAttribute('autocorrect', 'off');
        }
        
        answerInput.value = '';
        document.getElementById('result-card').classList.add('hidden');
        answerInput.focus();
    }

    async submitAnswer() {
        const userAnswer = document.getElementById('answer-input').value.trim().toLowerCase();
        const subject = this.getSubject(this.currentReview.data.subject_id);
        if (!userAnswer) {
            alert('Please enter an answer');
            return;
        }
        const normalized = this.currentTaskType === 'reading' ? this.toHiragana(userAnswer) : userAnswer;
        const isCorrect = this.checkAnswer(normalized, subject);
        this.showResult(isCorrect, subject, normalized);
    }

    checkAnswer(userAnswer, subject) {
        if (this.currentTaskType === 'meaning') {
            return this.checkMeaningAnswer(userAnswer, subject);
        } else {
            return this.checkReadingAnswer(userAnswer, subject);
        }
    }

    checkMeaningAnswer(userAnswer, subject) {
        const meanings = subject.data.meanings || [];
        const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        return meanings.some(m => norm(m.meaning) === norm(userAnswer));
    }

    checkReadingAnswer(userAnswer, subject) {
        const readings = subject.data.readings || [];
        const toKana = this.toHiragana.bind(this);
        const norm = (s) => toKana(s).replace(/\s/g, '');
        const ua = norm(userAnswer);
        return readings.some(r => norm(r.reading) === ua);
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
        this.sessionStats.correct++;
        this.sessionStats.total++;
        await this.sendProgress(true);
        this.nextReview();
    }

    async markIncorrect() {
        this.sessionStats.incorrect++;
        this.sessionStats.total++;
        await this.sendProgress(false);
        this.nextReview();
    }

    async sendProgress(correct) {
        try {
            const reviewData = {
                review: {
                    subject_id: this.currentReview.data.subject_id,
                    incorrect_meaning_answers: this.currentTaskType === 'meaning' && !correct ? 1 : 0,
                    incorrect_reading_answers: this.currentTaskType === 'reading' && !correct ? 1 : 0
                }
            };
            await fetch('https://api.wanikani.com/v2/reviews', {
                method: 'POST',
                headers: {
                    'Authorization': `Token token=${this.apiToken}`,
                    'Content-Type': 'application/json',
                    'Wanikani-Revision': '20170710'
                },
                body: JSON.stringify(reviewData)
            });
        } catch (error) {
            console.error('Error sending progress:', error);
        }
    }

    getSubject(subjectId) {
        return this.subjectById.get(subjectId) || this.subjects.find(s => s.id === subjectId);
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
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(`${screenName}-screen`).classList.add('active');
    }

    toggleMenu() {
        const menu = document.getElementById('menu');
        if (!menu) return;
        // Ensure correct position in case header size changed
        const header = document.querySelector('.header');
        if (header) {
            const top = header.offsetHeight + 8;
            menu.style.top = `${top}px`;
        } else {
            menu.style.top = `${this.menuTopPx}px`;
        }
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
            if (material.data.meaning_note && material.data.meaning_note.includes('#tsurukameExclude')) {
                const subject = this.getSubject(material.data.subject_id);
                if (subject) {
                    const item = document.createElement('div');
                    item.className = 'excluded-item';
                    item.innerHTML = `
                        <div class="subject-info">
                            <div class="subject-text">${subject.data.characters || subject.data.slug}</div>
                            <div class="subject-meaning">${subject.data.meanings?.[0]?.meaning || 'No meaning'}</div>
                        </div>
                    `;
                    excludedList.appendChild(item);
                }
            }
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
        this.showScreen('login');
        document.getElementById('api-token').value = '';
        document.getElementById('menu').classList.remove('show');
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    // ---- Kana conversion helpers ----
    isAscii(str) { return /^[\x00-\x7F]*$/.test(str); }

    toHiragana(input) {
        // If already contains kana, return as-is
        if (/^[\u3040-\u309F\u30A0-\u30FF]+$/.test(input)) return input
            .replace(/[\u30A1-\u30FA]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
        return this.convertRomajiToHiragana(input);
    }

    convertRomajiToHiragana(input) {
        if (!input) return '';
        // Basic romaji to hiragana converter (covers common patterns)
        let s = input.toLowerCase();
        // Handle double consonants -> small tsu (except n)
        s = s.replace(/([bcdfghjklmpqrstvwxyz])\1/g, 'っ$1');
        // Digraphs
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
        for (const [k,v] of Object.entries(digraphs)) {
            s = s.replace(new RegExp(k,'g'), v);
        }
        // 'tsu' before digraph mapping may have been affected, ensure tsu
        s = s.replace(/tsu/g, 'つ');
        // Basic syllables
        const map = {
            a:'あ',i:'い',u:'う',e:'え',o:'お',
            ka:'か',ki:'き',ku:'く',ke:'け',ko:'こ',
            sa:'さ',shi:'し',su:'す',se:'せ',so:'そ',
            ta:'た',chi:'ち',tsu:'つ',te:'て',to:'と',
            na:'な',ni:'に',nu:'ぬ',ne:'ね',no:'の',
            ha:'は',hi:'ひ',fu:'ふ',he:'へ',ho:'ほ',
            ma:'ま',mi:'み',mu:'む',me:'め',mo:'も',
            ya:'や',yu:'ゆ',yo:'よ',
            ra:'ら',ri:'り',ru:'る',re:'れ',ro:'ろ',
            wa:'わ',wo:'を',n:'ん',
            ga:'が',gi:'ぎ',gu:'ぐ',ge:'げ',go:'ご',
            za:'ざ',ji:'じ',zu:'ず',ze:'ぜ',zo:'ぞ',
            da:'だ',de:'で',do:'ど',
            ba:'ば',bi:'び',bu:'ぶ',be:'べ',bo:'ぼ',
            pa:'ぱ',pi:'ぴ',pu:'ぷ',pe:'ぺ',po:'ぽ'
        };
        // Replace longest matches first
        const keys = Object.keys(map).sort((a,b)=>b.length-a.length);
        for (const k of keys) {
            s = s.replace(new RegExp(k,'g'), map[k]);
        }
        // Handle standalone 'n' before vowels/consonants -> ん (heuristic)
        s = s.replace(/n(?![aiueoyn])/g, 'ん');
        // Long vowels (simple): ou -> おう, uu -> うう
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

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    reviewer = new WaniKaniReviewer();
    const input = document.getElementById('answer-input');
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitAnswer();
    });
});
