// Checkpoints are account-specific and apply only to the same scheduled review cycle.
export function restoreCheckpoints(queue, saved = []) {
    const byId = new Map(saved.map(item => [item.assignment?.id, item]));
    return queue.map(item => {
        const prior = byId.get(item.assignment.id);
        if (!prior || prior.assignment.data.subject_id !== item.assignment.data.subject_id
            || prior.assignment.data.srs_stage !== item.assignment.data.srs_stage
            || prior.assignment.data.available_at !== item.assignment.data.available_at) return item;
        return { ...item,
            answeredMeaning: prior.answeredMeaning === true,
            answeredReading: prior.answeredReading === true,
            incorrectMeaningAnswers: Number.isSafeInteger(prior.incorrectMeaningAnswers) && prior.incorrectMeaningAnswers >= 0 ? prior.incorrectMeaningAnswers : 0,
            incorrectReadingAnswers: Number.isSafeInteger(prior.incorrectReadingAnswers) && prior.incorrectReadingAnswers >= 0 ? prior.incorrectReadingAnswers : 0
        };
    }).sort((a, b) => Number(hasProgress(b)) - Number(hasProgress(a)));
}
export function hasProgress(item) {
    return item.answeredMeaning || item.answeredReading || item.incorrectMeaningAnswers || item.incorrectReadingAnswers;
}
