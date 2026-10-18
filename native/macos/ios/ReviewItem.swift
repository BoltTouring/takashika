// Copyright 2026 David Sansome
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import Foundation
import WaniKaniAPI

enum TaskType {
  case reading
  case meaning

  static func random() -> TaskType {
    arc4random_uniform(2) == 0 ? .reading : .meaning
  }
}

class ReviewItem: NSObject {
  private class func filterReadyItems(assignments: [TKMAssignment],
                                      localCachingClient: LocalCachingClient,
                                      _ isIncluded: (TKMAssignment) -> Bool) -> [ReviewItem] {
    var ret = [ReviewItem]()
    guard localCachingClient.getUserInfo() != nil else {
      return ret
    }

    let showKanaOnlyVocab = Settings.showKanaOnlyVocab
    for assignment in assignments {
      if !localCachingClient.isValid(subjectId: assignment.subjectID) {
        continue
      }
      if !showKanaOnlyVocab, assignment.isKanaOnlyVocab {
        continue
      }
      if let studyMaterials = localCachingClient.getStudyMaterial(subjectId: assignment.subjectID),
         localCachingClient.isExcluded(studyMaterials: studyMaterials) {
        continue
      }
      if !isIncluded(assignment) {
        continue
      }
      ret.append(ReviewItem(assignment: assignment))
    }
    return ret
  }

  class func readyForReview(assignments: [TKMAssignment],
                            localCachingClient: LocalCachingClient) -> [ReviewItem] {
    filterReadyItems(assignments: assignments,
                     localCachingClient: localCachingClient) { assignment -> Bool in
      assignment.isReviewStage && assignment.availableAtDate.timeIntervalSinceNow < 0
    }
  }

  class func readyForRecentMistakesReview(assignments: [TKMAssignment],
                                          localCachingClient: LocalCachingClient) -> [ReviewItem] {
    filterReadyItems(assignments: assignments,
                     localCachingClient: localCachingClient) { assignment -> Bool in
      assignment.isReviewStage
    }
  }

  class func readyForRecentLessonReview(assignments: [TKMAssignment],
                                        localCachingClient: LocalCachingClient) -> [ReviewItem] {
    filterReadyItems(assignments: assignments,
                     localCachingClient: localCachingClient) { assignment -> Bool in
      assignment.isReviewStage
    }
  }

  class func readyForAlreadyPassedApprenticeReview(assignments: [TKMAssignment],
                                                   localCachingClient: LocalCachingClient)
    -> [ReviewItem] {
    filterReadyItems(assignments: assignments,
                     localCachingClient: localCachingClient) { assignment -> Bool in
      assignment.hasPassedAt && assignment.srsStage < .guru1
    }
  }

  class func readyForLeechReview(assignments: [TKMAssignment],
                                 localCachingClient: LocalCachingClient)
    -> [ReviewItem] {
    filterReadyItems(assignments: assignments,
                     localCachingClient: localCachingClient) { assignment -> Bool in
      assignment.hasPassedAt && !assignment.hasBurnedAt
    }
  }

  class func readyForBurnedReview(assignments: [TKMAssignment],
                                  localCachingClient: LocalCachingClient) -> [ReviewItem] {
    filterReadyItems(assignments: assignments,
                     localCachingClient: localCachingClient) { assignment -> Bool in
      assignment.isBurned
    }
  }

  class func readyForLessons(assignments: [TKMAssignment],
                             localCachingClient: LocalCachingClient) -> [ReviewItem] {
    filterReadyItems(assignments: assignments,
                     localCachingClient: localCachingClient) { assignment -> Bool in
      assignment.isLessonStage
    }
  }

  let assignment: TKMAssignment
  let subject: TKMSubject?

  var answeredReading = false
  var answeredMeaning = false
  var answer = TKMProgress()

  init(assignment: TKMAssignment, subject: TKMSubject? = nil) {
    self.assignment = assignment
    self.subject = subject
    answer.assignment = assignment
    answer.isLesson = assignment.isLessonStage
  }

  private func getSubjectTypeIndex(_ subjectType: TKMSubject.TypeEnum) -> Int {
    for (idx, typeValue) in Settings.lessonOrder.enumerated() {
      if typeValue == subjectType {
        return idx
      }
    }
    return 0
  }

  func compareForLessons(other: ReviewItem) -> Bool {
    if assignment.level < other.assignment.level {
      return Settings.prioritizeCurrentLevel ? false : true
    } else if assignment.level > other.assignment.level {
      return Settings.prioritizeCurrentLevel ? true : false
    }

    let myIndex = getSubjectTypeIndex(assignment.subjectType)
    let otherIndex = getSubjectTypeIndex(other.assignment.subjectType)
    if myIndex < otherIndex {
      return true
    } else if myIndex > otherIndex {
      return false
    }
    return assignment.subjectID < other.assignment.subjectID
  }

  func reset() {
    answer.clearMeaningWrong()
    answer.clearReadingWrong()
    answer.clearMeaningWrongCount()
    answer.clearReadingWrongCount()
    answeredMeaning = false
    answeredReading = false
  }
}

// Only unfinished real reviews are checkpointed. Completed answers use LocalCachingClient's
// durable pending_progress queue. No API tokens or subject content are stored here.
final class ReviewCheckpointStore {
  private struct Checkpoint: Codable {
    let assignmentID: Int64
    let availableAt: Int32
    let srsStage: Int32
    let answeredMeaning: Bool
    let answeredReading: Bool
    let meaningWrong: Bool?
    let readingWrong: Bool?
    let meaningWrongCount: Int32
    let readingWrongCount: Int32

    init(_ item: ReviewItem) {
      assignmentID = item.assignment.id
      availableAt = item.assignment.availableAt
      srsStage = item.assignment.srsStageNumber
      answeredMeaning = item.answeredMeaning
      answeredReading = item.answeredReading
      meaningWrong = item.answer.hasMeaningWrong ? item.answer.meaningWrong : nil
      readingWrong = item.answer.hasReadingWrong ? item.answer.readingWrong : nil
      meaningWrongCount = item.answer.meaningWrongCount
      readingWrongCount = item.answer.readingWrongCount
    }

    func matches(_ item: ReviewItem) -> Bool {
      assignmentID == item.assignment.id && availableAt == item.assignment.availableAt
        && srsStage == item.assignment.srsStageNumber
    }
  }

  private let defaults: UserDefaults
  private let key: String

  init(username: String, defaults: UserDefaults = .standard) {
    self.defaults = defaults
    key = "unfinishedReviews.v1." + username
  }

  private func load() -> [String: Checkpoint] {
    guard let data = defaults.data(forKey: key),
          let saved = try? JSONDecoder().decode([String: Checkpoint].self, from: data) else {
      return [:]
    }
    return saved
  }

  private func write(_ saved: [String: Checkpoint]) {
    if saved.isEmpty {
      defaults.removeObject(forKey: key)
    } else if let data = try? JSONEncoder().encode(saved) {
      defaults.set(data, forKey: key)
    }
  }

  func restore(_ item: ReviewItem) -> Bool {
    guard !item.assignment.isLessonStage,
          let saved = load()[String(item.assignment.subjectID)], saved.matches(item) else {
      return false
    }
    item.answeredMeaning = saved.answeredMeaning
    item.answeredReading = saved.answeredReading
    if let wrong = saved.meaningWrong { item.answer.meaningWrong = wrong }
    if let wrong = saved.readingWrong { item.answer.readingWrong = wrong }
    item.answer.meaningWrongCount = max(0, saved.meaningWrongCount)
    item.answer.readingWrongCount = max(0, saved.readingWrongCount)
    return true
  }

  func save(_ item: ReviewItem) {
    guard !item.assignment.isLessonStage else { return }
    var saved = load()
    saved[String(item.assignment.subjectID)] = Checkpoint(item)
    write(saved)
  }

  func remove(_ item: ReviewItem) {
    var saved = load()
    saved.removeValue(forKey: String(item.assignment.subjectID))
    write(saved)
  }

  func clear() { defaults.removeObject(forKey: key) }

  // Call with every currently eligible review before imposing a session limit.
  // Discard checkpoints completed elsewhere, excluded, reset, or from an earlier SRS cycle.
  func prioritize(_ items: [ReviewItem]) -> [ReviewItem] {
    let saved = load()
    var valid = [String: Checkpoint]()
    var resumed = [ReviewItem]()
    var fresh = [ReviewItem]()
    for item in items {
      let id = String(item.assignment.subjectID)
      if let checkpoint = saved[id], checkpoint.matches(item) {
        valid[id] = checkpoint
        resumed.append(item)
      } else {
        fresh.append(item)
      }
    }
    write(valid)
    return resumed + fresh
  }
}


/// Local encouragement only: no streaks and no server-side progress changes.
final class DailyStudyStore {
  private let defaults: UserDefaults
  private let key: String
  init(username: String, defaults: UserDefaults = .standard) {
    self.defaults = defaults
    key = "dailyStudy.v1." + username
  }
  func count(on date: Date = Date(), calendar: Calendar = .current) -> Int {
    guard let saved = defaults.object(forKey: key + ".date") as? Date,
          calendar.isDate(saved, inSameDayAs: date) else { return 0 }
    return defaults.stringArray(forKey: key + ".items")?.count ?? 0
  }
  func isReturning(on date: Date = Date(), calendar: Calendar = .current) -> Bool {
    guard let saved = defaults.object(forKey: key + ".date") as? Date else { return true }
    return (calendar.dateComponents([.day], from: calendar.startOfDay(for: saved),
                                    to: calendar.startOfDay(for: date)).day ?? 0) >= 7
  }
  func record(subjectID: Int64, availableAt: Int32, on date: Date = Date(),
              calendar: Calendar = .current) {
    var items = count(on: date, calendar: calendar) > 0
      ? defaults.stringArray(forKey: key + ".items") ?? [] : []
    let identity = "\(subjectID):\(availableAt)"
    if !items.contains(identity) { items.append(identity) }
    defaults.set(items, forKey: key + ".items")
    defaults.set(date, forKey: key + ".date")
  }
}
