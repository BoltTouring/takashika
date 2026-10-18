import { WaniKaniReviewer } from './js/reviewer.js';

function bindClick(id, handler) {
    const element = document.getElementById(id);
    if (element) element.addEventListener('click', handler);
}

document.addEventListener('DOMContentLoaded', async () => {
    const reviewer = new WaniKaniReviewer();

    window.pauseTakashika = () => reviewer.pauseReview();
    bindClick('quick-btn', () => reviewer.startBatch());
    bindClick('all-reviews-btn', () => reviewer.startBatch(Infinity));
    bindClick('another-batch-btn', () => reviewer.startBatch());
    bindClick('done-btn', () => reviewer.showHome());
    bindClick('pause-btn', () => reviewer.pauseReview());
    bindClick('home-refresh-btn', () => reviewer.startReview());
    bindClick('home-logout-btn', () => reviewer.logout());
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

    bindClick('refresh-btn', () => reviewer.startReview());
    document.getElementById('api-token').addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.isComposing) reviewer.login();
    });
    document.addEventListener('click', event => reviewer.closeMenuOnOutsideClick(event));
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            document.getElementById('menu').classList.remove('show');
            document.getElementById('menu-btn').setAttribute('aria-expanded', 'false');
        }
        if (event.key !== 'Enter' || event.isComposing || reviewer.isComposing || event.repeat) return;
        if (event.target.tagName === 'BUTTON') return;
        if (reviewer.onHome) { event.preventDefault(); reviewer.startBatch(); return; }
        if (!document.getElementById('review-screen').classList.contains('active')) return;
        if (!reviewer.currentReview) { event.preventDefault(); reviewer.startBatch(); return; }
        event.preventDefault();
        if (reviewer.currentResultIsCorrect === null) reviewer.submitAnswer();
        else reviewer.continueAfterResult();
    });
    window.addEventListener('beforeunload', event => {
        const unfinished = [reviewer.currentReview, ...reviewer.reviewQueue].filter(Boolean);
        if (reviewer.isSaving || unfinished.some(item => item.answeredMeaning || item.answeredReading
            || item.incorrectMeaningAnswers || item.incorrectReadingAnswers)) {
            event.preventDefault();
            event.returnValue = '';
        }
    });
    await reviewer.init();

    if ('serviceWorker' in navigator && location.hostname !== 'appassets.androidplatform.net') {
        try {
            await navigator.serviceWorker.register('./sw.js');
        } catch (error) {
            console.error('Service worker registration failed:', error);
        }
    }
});
