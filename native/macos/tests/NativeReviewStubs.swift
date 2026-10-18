// Minimal API boundary doubles. Production ReviewItem and ReviewSession are compiled unchanged
// except for their WaniKaniAPI import, so this suite does not require UIKit or CocoaPods.
import Foundation

enum SRSStage: Int, Comparable {
  case apprentice1 = 1, apprentice2, apprentice3, apprentice4, guru1, guru2, master, enlightened, burned
  static func < (a: Self, b: Self) -> Bool { a.rawValue < b.rawValue }
  var next: Self { Self(rawValue: min(9, rawValue + 1))! }
  var previous: Self { Self(rawValue: max(1, rawValue - 1))! }
}
struct TKMSubject {
  enum TypeEnum: Int { case unknown, radical, kanji, vocabulary }
  var id: Int64 = 1
  var meanings = ["One"]
  var readings = ["いち"]
  var hasKanji = false
}
struct TKMAssignment {
  var id: Int64 = 1
  var subjectID: Int64 = 1
  var availableAt: Int32 = 10
  var srsStageNumber: Int32 = 1
  var level: Int32 = 1
  var subjectType = TKMSubject.TypeEnum.vocabulary
  var isLessonStage = false
  var isReviewStage = true
  var isKanaOnlyVocab = false
  var hasPassedAt = true
  var hasBurnedAt = false
  var isBurned = false
  var availableAtDate: Date { Date(timeIntervalSince1970: Double(availableAt)) }
  var srsStage: SRSStage { SRSStage(rawValue: Int(srsStageNumber))! }
}
struct TKMProgress {
  var assignment = TKMAssignment()
  var isLesson = false
  var createdAt: Int32 = 0
  private var meaning: Bool?
  private var reading: Bool?
  var meaningWrong: Bool { get { meaning ?? false } set { meaning = newValue } }
  var readingWrong: Bool { get { reading ?? false } set { reading = newValue } }
  var hasMeaningWrong: Bool { meaning != nil }
  var hasReadingWrong: Bool { reading != nil }
  var meaningWrongCount: Int32 = 0
  var readingWrongCount: Int32 = 0
  mutating func clearMeaningWrong() { meaning = nil }
  mutating func clearReadingWrong() { reading = nil }
  mutating func clearMeaningWrongCount() { meaningWrongCount = 0 }
  mutating func clearReadingWrongCount() { readingWrongCount = 0 }
}
struct TKMStudyMaterials { var subjectID: Int64 = 1; var meaningSynonyms = [String]() }
struct User { var username = "native-review-test-" + UUID().uuidString }
class LocalCachingClient {
  var user = User()
  var subject = TKMSubject()
  var sent = [TKMProgress]()
  func getUserInfo() -> User? { user }
  func isValid(subjectId: Int64) -> Bool { true }
  func getStudyMaterial(subjectId: Int64) -> TKMStudyMaterials? { nil }
  func isExcluded(studyMaterials: TKMStudyMaterials) -> Bool { false }
  func getSubject(id: Int64) -> TKMSubject? { subject }
  func sendProgress(_ progress: [TKMProgress]) -> Bool { sent += progress; return true }
  func updateStudyMaterial(_ material: TKMStudyMaterials) -> Bool { true }
  func setExcluded(studyMaterials: inout TKMStudyMaterials, shouldExclude: Bool) -> Bool { true }
}
class TKMServices { var localCachingClient: LocalCachingClient! = LocalCachingClient() }
enum Settings {
  static var showKanaOnlyVocab = true
  static var lessonOrder: [TKMSubject.TypeEnum] = [.radical, .kanji, .vocabulary]
  static var prioritizeCurrentLevel = false
  static var groupMeaningReading = true
  static var ankiMode = false
  static var ankiModeCombineReadingMeaning = false
  static var reviewBatchSize = 5
  static var meaningFirst = true
  static var skipKanjiReadings = false
  static var minimizeReviewPenalty = false
}
enum AnswerResult {
  case Correct, Incorrect, OverrideAnswerCorrect, Exclude, AskAgainLater
  var correct: Bool { self == .Correct || self == .OverrideAnswerCorrect }
}
