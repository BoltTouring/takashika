export class AudioManager {
    constructor() {
        this.audioCache = new Map();
        this.activeAudio = null;
    }

    getPreferredPronunciationAudio(subject) {
        const audios = subject?.data?.pronunciation_audios || [];
        if (!audios.length) return null;
        return audios.find(audio => audio.content_type === 'audio/mpeg') || audios[0];
    }

    hasAudio(subject) {
        return Boolean(this.getPreferredPronunciationAudio(subject));
    }

    getAudioCacheKey(subject, audio) {
        return `${subject.id}:${audio.url}`;
    }

    primeForSubject(subject) {
        const audio = this.getPreferredPronunciationAudio(subject);
        if (!audio) return null;

        const cacheKey = this.getAudioCacheKey(subject, audio);
        let element = this.audioCache.get(cacheKey);
        if (!element) {
            element = new Audio(audio.url);
            element.preload = 'auto';
            this.audioCache.set(cacheKey, element);
        }

        try { element.load(); } catch (_) {}
        return element;
    }

    primeNext(queue, getSubject) {
        const nextReadingReview = queue.find(item => item.type === 'reading');
        if (!nextReadingReview) return;
        const nextSubject = getSubject(nextReadingReview.assignment.data.subject_id);
        if (nextSubject) this.primeForSubject(nextSubject);
    }

    playForSubject(subject) {
        const element = this.primeForSubject(subject);
        if (!element) return;

        if (this.activeAudio && this.activeAudio !== element) {
            try {
                this.activeAudio.pause();
                this.activeAudio.currentTime = 0;
            } catch (_) {}
        }

        this.activeAudio = element;
        try { element.currentTime = 0; } catch (_) {}

        const playback = element.play();
        if (playback && typeof playback.catch === 'function') playback.catch(() => {});
    }
}
