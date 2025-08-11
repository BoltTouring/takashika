// WaniKani Review PWA
class WaniKaniReviewer {
    constructor() {
        this.apiToken = null;
        this.user = null;
        this.assignments = [];
        this.subjects = [];
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
        
        this.init();
    }

    async init() {
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
            
            // Load assignments
            this.updateLoadingText('Loading assignments...');
            this.assignments = await this.fetchAssignments();
            
            // Load subjects
            this.updateLoadingText('Loading subjects...');
            this.subjects = await this.fetchSubjects();
            
            // Load study materials to identify excluded items
            this.updateLoadingText('Loading study materials...');
            this.studyMaterials = await this.fetchStudyMaterials();
            
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

    async fetchAssignments() {
        const response = await this.apiRequest('/assignments?unlocked=true&hidden=false');
        return response.data;
    }

    async fetchSubjects() {
        const response = await this.apiRequest('/subjects?types=radical,kanji,vocabulary');
        return response.data;
    }

    async fetchStudyMaterials() {
        const response = await this.apiRequest('/study_materials');
        return response.data;
    }

    async apiRequest(endpoint) {
        const response = await fetch(`https://api.wanikani.com/v2${endpoint}`, {
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
        
        this.studyMaterials.forEach(material => {
            if (material.data.meaning_note && 
                material.data.meaning_note.includes('#tsurukameExclude')) {
                this.excludedSubjectIds.add(material.data.subject_id);
            }
        });
        
        console.log(`Found ${this.excludedSubjectIds.size} excluded items`);
    }

    buildReviewQueue() {
        const now = new Date();
        this.reviewQueue = [];
        
        this.assignments.forEach(assignment => {
            // Skip excluded items
            if (this.excludedSubjectIds.has(assignment.data.subject_id)) {
                return;
            }
            
            // Only include review stage items that are available
            if (assignment.data.srs_stage > 0 && 
                new Date(assignment.data.available_at) <= now) {
                this.reviewQueue.push(assignment);
            }
        });
        
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
            this.nextReview();
            return;
        }

        // Determine task type (meaning or reading)
        this.currentTaskType = this.determineTaskType(subject);
        
        this.displayQuestion(subject);
        this.updateProgress();
    }

    determineTaskType(subject) {
        // Simple logic: alternate between meaning and reading
        // You can make this more sophisticated based on your preferences
        const hasReadings = subject.data.readings && subject.data.readings.length > 0;
        const hasMeanings = subject.data.meanings && subject.data.meanings.length > 0;
        
        if (!hasReadings) return 'meaning';
        if (!hasMeanings) return 'reading';
        
        // For now, prefer meaning for radicals, reading for kanji/vocabulary
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
        } else {
            questionHintEl.textContent = 'Enter the reading';
            answerInput.classList.add('japanese-input');
            answerInput.setAttribute('lang', 'ja');
        }
        
        // Clear previous answer
        answerInput.value = '';
        document.getElementById('result-card').classList.add('hidden');
        
        // Focus on input
        answerInput.focus();
    }

    async submitAnswer() {
        const userAnswer = document.getElementById('answer-input').value.trim().toLowerCase();
        const subject = this.getSubject(this.currentReview.data.subject_id);
        
        if (!userAnswer) {
            alert('Please enter an answer');
            return;
        }

        const isCorrect = this.checkAnswer(userAnswer, subject);
        this.showResult(isCorrect, subject, userAnswer);
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
        return meanings.some(meaning => 
            meaning.meaning.toLowerCase() === userAnswer ||
            meaning.meaning.toLowerCase().replace(/[^a-zA-Z0-9]/g, '') === userAnswer.replace(/[^a-zA-Z0-9]/g, '')
        );
    }

    checkReadingAnswer(userAnswer, subject) {
        const readings = subject.data.readings || [];
        return readings.some(reading => 
            reading.reading.toLowerCase() === userAnswer ||
            reading.reading.toLowerCase().replace(/[^a-zA-Z0-9]/g, '') === userAnswer.replace(/[^a-zA-Z0-9]/g, '')
        );
    }

    showResult(isCorrect, subject, userAnswer) {
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
            
            // Show correct answer
            if (this.currentTaskType === 'meaning') {
                const meanings = subject.data.meanings || [];
                const correctMeanings = meanings.map(m => m.meaning).join(', ');
                correctAnswer.textContent = `Correct: ${correctMeanings}`;
            } else {
                const readings = subject.data.readings || [];
                const correctReadings = readings.map(r => r.reading).join(', ');
                correctAnswer.textContent = `Correct: ${correctReadings}`;
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
        return this.subjects.find(s => s.id === subjectId);
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
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        
        // Show target screen
        document.getElementById(`${screenName}-screen`).classList.add('active');
    }

    toggleMenu() {
        const menu = document.getElementById('menu');
        menu.classList.toggle('show');
        
        // Close menu when clicking outside
        if (menu.classList.contains('show')) {
            setTimeout(() => {
                document.addEventListener('click', this.closeMenuOnOutsideClick.bind(this), { once: true });
            }, 0);
        }
    }

    closeMenuOnOutsideClick(event) {
        const menu = document.getElementById('menu');
        const menuBtn = document.getElementById('menu-btn');
        
        if (!menu.contains(event.target) && !menuBtn.contains(event.target)) {
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
        
        this.studyMaterials.forEach(material => {
            if (material.data.meaning_note && 
                material.data.meaning_note.includes('#tsurukameExclude')) {
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
        });
        
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
}

// Global functions for HTML onclick handlers
let reviewer;

function login() {
    reviewer.login();
}

function submitAnswer() {
    reviewer.submitAnswer();
}

function markCorrect() {
    reviewer.markCorrect();
}

function markIncorrect() {
    reviewer.markIncorrect();
}

function toggleMenu() {
    reviewer.toggleMenu();
}

function showStats() {
    reviewer.showStats();
}

function showExcluded() {
    reviewer.showExcluded();
}

function backToReview() {
    reviewer.backToReview();
}

function logout() {
    reviewer.logout();
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    reviewer = new WaniKaniReviewer();
    
    // Handle Enter key in answer input
    document.getElementById('answer-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            submitAnswer();
        }
    });
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('menu');
        const menuBtn = document.getElementById('menu-btn');
        
        if (menu.classList.contains('show') && 
            !menu.contains(e.target) && 
            !menuBtn.contains(e.target)) {
            menu.classList.remove('show');
        }
    });
});
