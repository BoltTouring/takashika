function hasAcceptedMeanings(subject) {
    return (subject.data.meanings || []).some(item => item.accepted_answer !== false);
}

function hasAcceptedReadings(subject) {
    return (subject.data.readings || []).some(item => item.accepted_answer !== false);
}

export function shuffleArray(items, random = Math.random) {
    for (let index = items.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    }
    return items;
}

export function buildReviewQueue(assignments, excludedSubjectIds, getSubject, options = {}) {
    const now = options.now || new Date();
    const random = options.random || Math.random;
    const queue = [];

    for (const assignment of assignments) {
        const subjectId = assignment.data.subject_id;
        if (excludedSubjectIds.has(subjectId)) continue;

        const availableAt = assignment.data.available_at ? new Date(assignment.data.available_at) : null;
        const isAvailable = availableAt ? availableAt <= now : false;
        const srsStage = assignment.data.srs_stage ?? 0;
        if (!(srsStage > 0 && isAvailable)) continue;

        const subject = getSubject(subjectId);
        if (!subject) continue;

        const hasMeaning = hasAcceptedMeanings(subject);
        const hasReading = subject.object !== 'radical' && hasAcceptedReadings(subject);
        if (!hasMeaning && !hasReading) continue;

        queue.push({
            assignment,
            answeredMeaning: false,
            answeredReading: false,
            incorrectMeaningAnswers: 0,
            incorrectReadingAnswers: 0
        });
    }

    return shuffleArray(queue, random);
}
