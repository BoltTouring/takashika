import Foundation

@main struct NativeReviewChecks {
  static func main() {
    var passed = 0
    func check(_ label: String, _ body: () -> Void) {
      body(); passed += 1; print("PASS: " + label)
    }
    let suite = "tsurukame-review-checks-" + UUID().uuidString
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = ReviewCheckpointStore(username: "test", defaults: defaults)

    check("unfinished answers and mistakes round-trip") {
      let item = ReviewItem(assignment: TKMAssignment())
      item.answeredMeaning = true
      item.answer.meaningWrong = false
      item.answer.readingWrong = true
      item.answer.readingWrongCount = 2
      store.save(item)
      let restored = ReviewItem(assignment: TKMAssignment())
      assert(store.restore(restored))
      assert(restored.answeredMeaning && !restored.answeredReading)
      assert(restored.answer.hasMeaningWrong && !restored.answer.meaningWrong)
      assert(restored.answer.readingWrongCount == 2)
    }
    check("checkpoints are isolated by account") {
      assert(!ReviewCheckpointStore(username: "another", defaults: defaults)
        .restore(ReviewItem(assignment: TKMAssignment())))
    }
    check("changed assignment cycles never inherit stale answers") {
      var changed = TKMAssignment(); changed.availableAt += 100
      assert(!store.restore(ReviewItem(assignment: changed)))
      changed = TKMAssignment(); changed.srsStageNumber += 1
      assert(!store.restore(ReviewItem(assignment: changed)))
      changed = TKMAssignment(); changed.id += 1
      assert(!store.restore(ReviewItem(assignment: changed)))
    }
    check("resumed items come first, stale and excluded items are pruned") {
      var fresh = TKMAssignment(); fresh.id = 2; fresh.subjectID = 2
      let items = store.prioritize([ReviewItem(assignment: fresh), ReviewItem(assignment: TKMAssignment())])
      assert(items.first?.assignment.subjectID == 1)
      _ = store.prioritize([ReviewItem(assignment: fresh)])
      assert(!store.restore(ReviewItem(assignment: TKMAssignment())))
    }
    check("lesson quizzes are not checkpointed") {
      var lesson = TKMAssignment(); lesson.isLessonStage = true
      store.save(ReviewItem(assignment: lesson))
      assert(!store.restore(ReviewItem(assignment: lesson)))
    }
    func session() -> (TKMServices, ReviewSession) {
      let services = TKMServices()
      return (services, ReviewSession(services: services, items: [ReviewItem(assignment: TKMAssignment())]))
    }
    check("ask later preserves a completed half and wrong-answer count") {
      let (services, review) = session()
      defer { ReviewCheckpointStore(username: services.localCachingClient.user.username).clear() }
      review.nextTask()
      _ = review.markAnswer(.Correct)
      review.nextTask()
      _ = review.markAnswer(.Incorrect)
      review.moveActiveTaskToEnd()
      review.nextTask()
      assert(review.activeTask.answeredMeaning)
      assert(review.activeTask.answer.readingWrongCount == 1)
      assert(review.activeTaskType == .reading)
    }
    check("restart restores a real review, completion sends once and clears checkpoint") {
      let (services, review) = session()
      let checkpoint = ReviewCheckpointStore(username: services.localCachingClient.user.username)
      defer { checkpoint.clear() }
      review.nextTask(); _ = review.markAnswer(.Correct)
      let resumed = ReviewSession(services: services, items: [ReviewItem(assignment: TKMAssignment())])
      resumed.nextTask()
      assert(resumed.activeTaskType == .reading)
      let result = resumed.markAnswer(.Correct)
      assert(result.subjectFinished && services.localCachingClient.sent.count == 1)
      assert(!checkpoint.restore(ReviewItem(assignment: TKMAssignment())))
    }
    check("overriding a later typo removes only that mistake") {
      let (services, review) = session()
      defer { ReviewCheckpointStore(username: services.localCachingClient.user.username).clear() }
      review.nextTask()
      _ = review.markAnswer(.Incorrect); _ = review.markAnswer(.Incorrect)
      _ = review.markAnswer(.OverrideAnswerCorrect)
      assert(review.activeTask.answer.meaningWrongCount == 1)
      assert(review.activeTask.answer.meaningWrong)
    }
    check("practice cannot submit progress even if caller omits practice flag") {
      let services = TKMServices()
      let review = ReviewSession(services: services, items: [ReviewItem(assignment: TKMAssignment())],
                                 isPracticeSession: true)
      review.nextTask(); _ = review.markAnswer(.Correct)
      review.nextTask(); _ = review.markAnswer(.Correct)
      assert(services.localCachingClient.sent.isEmpty)
      assert(!ReviewCheckpointStore(username: services.localCachingClient.user.username)
        .restore(ReviewItem(assignment: TKMAssignment())))
    }
    check("zero batch size cannot create a false empty session") {
      Settings.groupMeaningReading = false; Settings.reviewBatchSize = 0
      defer { Settings.groupMeaningReading = true; Settings.reviewBatchSize = 5 }
      let (_, review) = session()
      assert(review.activeQueueLength == 1)
    }
    check("skip kanji readings never asks a reading first") {
      let services = TKMServices(); services.localCachingClient.subject.hasKanji = true
      Settings.meaningFirst = false; Settings.skipKanjiReadings = true
      defer { Settings.meaningFirst = true; Settings.skipKanjiReadings = false }
      let review = ReviewSession(services: services, items: [ReviewItem(assignment: TKMAssignment())])
      review.nextTask()
      assert(review.activeTaskType == .meaning)
      assert(review.markAnswer(.Correct).subjectFinished)
    }
    check("lesson comparator is strict for identical items") {
      let item = ReviewItem(assignment: TKMAssignment())
      assert(!item.compareForLessons(other: item))
    }
    check("stale override cannot mark a fresh question correct") {
      let (services, review) = session()
      defer { ReviewCheckpointStore(username: services.localCachingClient.user.username).clear() }
      review.nextTask()
      _ = review.markAnswer(.OverrideAnswerCorrect)
      assert(review.tasksAnsweredCorrectly == 0 && !review.activeTask.answeredMeaning)
    }
    check("duplicate marking cannot resubmit a completed item") {
      let (services, review) = session()
      defer { ReviewCheckpointStore(username: services.localCachingClient.user.username).clear() }
      review.nextTask(); _ = review.markAnswer(.Correct)
      review.nextTask(); _ = review.markAnswer(.Correct)
      _ = review.markAnswer(.Correct)
      assert(services.localCachingClient.sent.count == 1 && review.reviewsCompleted == 1)
    }
    check("correcting the first typo removes its penalty") {
      let (services, review) = session()
      defer { ReviewCheckpointStore(username: services.localCachingClient.user.username).clear() }
      review.nextTask(); _ = review.markAnswer(.Incorrect)
      _ = review.markAnswer(.OverrideAnswerCorrect)
      assert(review.activeTask.answer.meaningWrongCount == 0 && !review.activeTask.answer.meaningWrong)
      assert(review.tasksAnswered == 1 && review.tasksAnsweredCorrectly == 1)
    }
    check("excluding a partially answered item clears its checkpoint") {
      let (services, review) = session()
      let checkpoint = ReviewCheckpointStore(username: services.localCachingClient.user.username)
      defer { checkpoint.clear() }
      review.nextTask(); _ = review.markAnswer(.Correct)
      review.excludeTask()
      assert(!checkpoint.restore(ReviewItem(assignment: TKMAssignment())))
      assert(services.localCachingClient.sent.isEmpty)
    }
    check("saving another item preserves the first unfinished item") {
      let first = ReviewItem(assignment: TKMAssignment())
      var assignment = TKMAssignment(); assignment.id = 2; assignment.subjectID = 2
      let second = ReviewItem(assignment: assignment)
      store.save(first); store.save(second); store.remove(second)
      assert(store.restore(ReviewItem(assignment: TKMAssignment())))
      assert(!store.restore(ReviewItem(assignment: assignment)))
      store.clear()
    }
    check("corrupt checkpoints fall back to fresh reviews") {
      defaults.set(Data("not JSON".utf8), forKey: "unfinishedReviews.v1.test")
      assert(!store.restore(ReviewItem(assignment: TKMAssignment())))
      store.clear()
    }

    check("daily count deduplicates reviews and isolates accounts") {
      let daily = DailyStudyStore(username: "daily-test", defaults: defaults)
      let date = Date(timeIntervalSince1970: 1_800_000_000)
      daily.record(subjectID: 42, availableAt: 100, on: date)
      daily.record(subjectID: 42, availableAt: 100, on: date)
      assert(daily.count(on: date) == 1)
      daily.record(subjectID: 43, availableAt: 100, on: date)
      assert(daily.count(on: date) == 2)
      assert(DailyStudyStore(username: "other", defaults: defaults).count(on: date) == 0)
    }
    check("daily count resets at local midnight without a streak") {
      var calendar = Calendar(identifier: .gregorian)
      calendar.timeZone = TimeZone(secondsFromGMT: 9 * 3600)!
      let date = calendar.date(from: DateComponents(year: 2026, month: 10, day: 16, hour: 23, minute: 59))!
      let nextDay = date.addingTimeInterval(120)
      let daily = DailyStudyStore(username: "midnight", defaults: defaults)
      daily.record(subjectID: 42, availableAt: 100, on: date, calendar: calendar)
      assert(daily.count(on: nextDay, calendar: calendar) == 0)
      daily.record(subjectID: 43, availableAt: 100, on: nextDay, calendar: calendar)
      assert(daily.count(on: nextDay, calendar: calendar) == 1)
      assert(!daily.isReturning(on: nextDay, calendar: calendar))
      assert(daily.isReturning(on: nextDay.addingTimeInterval(8 * 86400), calendar: calendar))
    }
    print("\(passed) native core checks passed.")
  }
}
