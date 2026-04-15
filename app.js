import { WaniKaniReviewer } from './js/reviewer.js';

function bindClick(id, handler) {
    const element = document.getElementById(id);
    if (element) element.addEventListener('click', handler);
}

document.addEventListener('DOMContentLoaded', async () => {
    const reviewer = new WaniKaniReviewer();
    await reviewer.init();

    bindClick('login-btn', () => reviewer.login());
    bindClick('submit-btn', () => reviewer.submitAnswer());
    bindClick('menu-btn', event => {
        event.preventDefault();
        event.stopPropagation();
        reviewer.toggleMenu();
    });
    bindClick('audio-btn', () => reviewer.playAudio());
    bindClick('result-primary-btn', () => reviewer.continueAfterResult());
    bindClick('override-correct-btn', () => reviewer.markCorrect());
    bindClick('ask-later-btn', () => reviewer.askAgainLater());
    bindClick('stats-btn', () => reviewer.showStats());
    bindClick('excluded-btn', () => reviewer.showExcluded());
    bindClick('logout-btn', () => reviewer.logout());
    bindClick('stats-back-btn', () => reviewer.backToReview());
    bindClick('excluded-back-btn', () => reviewer.backToReview());

    const answerInput = document.getElementById('answer-input');
    if (answerInput) {
        answerInput.addEventListener('keypress', event => {
            if (event.key !== 'Enter') return;
            const resultCard = document.getElementById('result-card');
            if (resultCard?.classList.contains('hidden')) reviewer.submitAnswer();
            else reviewer.continueAfterResult();
        });
    }

    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('./sw.js');
        } catch (error) {
            console.error('Service worker registration failed:', error);
        }
    }
});
