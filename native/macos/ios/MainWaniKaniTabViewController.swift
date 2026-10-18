// Copyright 2025 David Sansome
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

private func setTableViewCellCount(_ item: BasicModelItem, count: Int,
                                   disabledMessage: String? = nil) -> Bool {
  item.subtitle = count < 0 ? "-" : "\(count)"
  item.isEnabled = count > 0 && (disabledMessage == nil)

  if let message = disabledMessage {
    item.title = "\(item.title!) (\(message))"
  }

  return item.isEnabled
}

class MainWaniKaniTabViewController: UITableViewController {
  protocol Delegate: AnyObject {
    func didPullToRefresh()
  }

  var services: TKMServices!
  var model: TableModel!
  weak var delegate: Delegate?

  var selectedSubjectCatalogLevel = -1
  var selectedSrsStageCategory = SRSStageCategory.apprentice

  var hasLessons = false
  var hasReviews = false
  static let quickReviewCount = 10
  private var quickReviewLimit: Int?
  private var showingProgress = false
  private var showingMore = false

  func setup(services: TKMServices, delegate: Delegate?) {
    self.services = services
    self.delegate = delegate
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    tableView.backgroundColor = .systemGroupedBackground
    tableView.separatorStyle = .none
    // Add a refresh control for when the user pulls down.
    let refreshControl = UIRefreshControl()
    refreshControl.tintColor = TKMStyle.Color.label
    refreshControl.backgroundColor = nil
    refreshControl.attributedTitle = NSMutableAttributedString(string: "Pull to refresh...")
    refreshControl.addAction(for: .valueChanged) { [unowned self, unowned refreshControl] in
      refreshControl.endRefreshing()
      self.delegate?.didPullToRefresh()
    }
    tableView.refreshControl = refreshControl

    recreateTableModel()
  }

  func update() {
    recreateTableModel()
  }

  private func recreateTableModel() {
    guard let user = services.localCachingClient.getUserInfo() else { return }

    // make sure that the selected subject level is reset each time table is loaded in case things
    // change
    selectedSubjectCatalogLevel = -1
    selectedSrsStageCategory = SRSStageCategory.apprentice

    let lessons = services.localCachingClient.availableLessonCount
    let reviews = services.localCachingClient.availableReviewCount
    let recentMistakes = services.localCachingClient.getRecentMistakesCount()
    let recentLessonCount = services.localCachingClient.recentLessonCount
    let leechCount = services.localCachingClient.leechCount
    let upcomingReviews = services.localCachingClient.upcomingReviews
    let currentLevelAssignments = services.localCachingClient.getAssignmentsAtUsersCurrentLevel()

    let model = MutableTableModel(tableView: tableView)

    hasReviews = reviews > 0 && !user.hasVacationStartedAt
    hasLessons = lessons > 0 && !user.hasVacationStartedAt &&
      services.localCachingClient.apprenticeCount < Settings.apprenticeLessonsLimit
    let daily = DailyStudyStore(username: user.username)
    let count = daily.count()
    let heading = user.hasVacationStartedAt ? "Enjoy your break." :
      (!hasReviews ? "You're all caught up." :
        (count > 0 ? "A little goes a long way." :
          (daily.isReturning() ? "Welcome back." : "A small step today.")))
    let message = user.hasVacationStartedAt ? "Your reviews are paused in vacation mode." :
      (hasReviews ? "A few reviews. One small step. That's enough for today." :
        "Come back when you're ready. Your next reviews will be here.")
    let header = StudyPanel(title: showingProgress ? "Your progress" : heading,
                            message: showingProgress ? "Explore your learning at your own pace." : message,
                            detail: showingProgress ? nil : "\(count) completed here today",
                            primaryTitle: !showingProgress && hasReviews ? "Do \(min(Self.quickReviewCount, reviews)) reviews" : nil,
                            primaryAction: { [weak self] in self?.startQuickReviews() },
                            secondaryTitle: showingProgress ? nil : (showingMore ? "Keep it simple" : "Study more"),
                            secondaryAction: { [weak self] in
                              guard let self else { return }
                              self.showingMore.toggle()
                              self.recreateTableModel()
                            }, showsTurtle: !showingProgress)
    let mode = UISegmentedControl(items: ["Today", "Progress"])
    mode.selectedSegmentIndex = showingProgress ? 1 : 0
    mode.addAction(UIAction { [weak self, weak mode] _ in
      guard let self, let mode else { return }
      self.showingProgress = mode.selectedSegmentIndex == 1
      self.recreateTableModel()
      self.tableView.setContentOffset(CGPoint(x: 0, y: -self.tableView.adjustedContentInset.top), animated: false)
    }, for: .valueChanged)
    header.stack.insertArrangedSubview(mode, at: 0)
    header.stack.setCustomSpacing(32, after: mode)
    // Changing the header triggers synchronous section queries. Install it only
    // after the replacement model is populated and reloadData clears old sections.

    if !showingProgress {
      if showingMore && !user.hasVacationStartedAt {
        model.add(section: "Choose your pace")
        if hasReviews {
          model.add(BasicModelItem(style: .subtitle, title: "More reviews",
                                  subtitle: "Open your full queue", accessoryType: .disclosureIndicator) { [weak self] in self?.startReviews() })
        }
        if hasLessons {
          model.add(BasicModelItem(style: .subtitle, title: "Learn something new",
                                  subtitle: "Lessons are here when you feel ready", accessoryType: .disclosureIndicator) { [weak self] in self?.startLessons() })
          model.add(BasicModelItem(style: .default, title: "Choose lessons", accessoryType: .disclosureIndicator) { [weak self] in self?.showLessonPicker() })
        }
        model.add(BasicModelItem(style: .subtitle, title: "Explore progress",
                                subtitle: "Levels, forecasts and extra practice", accessoryType: .disclosureIndicator) { [weak self] in
          self?.showingProgress = true
          self?.recreateTableModel()
        })
      }
      self.model = model
      tableView.reloadData()
      tableView.tableHeaderView = header
      sizeStudyHeader()
      return
    }

    if !user.hasVacationStartedAt {
      model.add(section: "Currently available")
      let lessonsItem = BasicModelItem(style: .value1,
                                       title: "Lessons",
                                       subtitle: "",
                                       accessoryType: .disclosureIndicator) { [unowned self] in self
        .startLessons()
      }
      let apprenticeCount = services.localCachingClient.apprenticeCount
      let limit = Settings.apprenticeLessonsLimit
      let disabledMessage = apprenticeCount >= limit ? "apprentice limit reached" : nil
      hasLessons = setTableViewCellCount(lessonsItem, count: lessons,
                                         disabledMessage: disabledMessage)
      model.add(lessonsItem)

      if lessons > 0 && apprenticeCount < limit {
        model.add(BasicModelItem(style: .value1,
                                 title: "Lesson Picker",
                                 subtitle: "",
                                 accessoryType: .disclosureIndicator) { [unowned self] in
            self.showLessonPicker()
          })
      }

      let reviewsItem = BasicModelItem(style: .value1,
                                       title: "Reviews",
                                       subtitle: "",
                                       accessoryType: .disclosureIndicator) { [unowned self] in self
        .startReviews()
      }
      hasReviews = setTableViewCellCount(reviewsItem, count: reviews)
      model.add(reviewsItem)

      model.add(section: "Upcoming reviews")
      model.add(UpcomingReviewsChartItem(upcomingReviews: upcomingReviews,
                                         currentReviewCount: reviews,
                                         date: Date()) { [unowned self] in self.showTableForecast()
        })
      model
        .add(createCurrentLevelReviewTimeItem(services: services,
                                              currentLevelAssignments: currentLevelAssignments))

      if recentLessonCount > 0 {
        let recentLessonsItem = BasicModelItem(style: .value1,
                                               title: "Review recent lessons",
                                               subtitle: "",
                                               accessoryType: .disclosureIndicator) { [
          unowned self
        ] in
          self.startRecentLessonReviews()
        }
        _ = setTableViewCellCount(recentLessonsItem, count: recentLessonCount)
        model.add(recentLessonsItem)
      }

      if recentMistakes > 0 {
        let recentMistakesItem = BasicModelItem(style: .value1,
                                                title: "Review recent mistakes",
                                                subtitle: "",
                                                accessoryType: .disclosureIndicator) { [
          unowned self
        ] in
          self.startRecentMistakeReviews()
        }
        _ = setTableViewCellCount(recentMistakesItem, count: recentMistakes)
        model.add(recentMistakesItem)
      }

      let alreadyPassedButApprenticeCount = apprenticeCount - recentLessonCount
      if alreadyPassedButApprenticeCount > 0 {
        let alreadyPassedApprenticeItem = BasicModelItem(style: .value1,
                                                         title: "Review apprentice leeches",
                                                         subtitle: "",
                                                         accessoryType: .disclosureIndicator) { [
          unowned self
        ] in
          self.startAlreadyPassedApprenticeReviews()
        }
        _ = setTableViewCellCount(alreadyPassedApprenticeItem,
                                  count: alreadyPassedButApprenticeCount)
        model.add(alreadyPassedApprenticeItem)
      }

      if leechCount > 0 {
        let allLeechItem = BasicModelItem(style: .value1,
                                          title: "Review all leeches",
                                          subtitle: "",
                                          accessoryType: .disclosureIndicator) { [
          unowned self
        ] in
          self.startAllLeechReviews()
        }
        _ = setTableViewCellCount(allLeechItem,
                                  count: leechCount)
        model.add(allLeechItem)
      }
    }

    if Settings.showPreviousLevelGraph, user.currentLevel > 1,
       !services.localCachingClient.hasCompletedPreviousLevel() {
      let previousLevel = Int(user.currentLevel) - 1
      model
        .add(section: "Previous level (\(user.currentLevel - 1))")
      let currentGraphLevelAssignments = services.localCachingClient
        .getAssignments(level: previousLevel)
      model.add(CurrentLevelChartItem(currentLevelAssignments: currentGraphLevelAssignments))
      addShowRemainingAllItems(model: model, level: previousLevel)
      // add header for next section; graph and other items will be added after this if/else block
      model.add(section: "Current level (\(user.currentLevel))")
    } else {
      model.add(section: "Current level")
    }

    model.add(CurrentLevelChartItem(currentLevelAssignments: currentLevelAssignments))

    if !user.hasVacationStartedAt {
      model
        .add(createLevelTimeRemainingItem(services: services,
                                          currentLevelAssignments: currentLevelAssignments))
    }
    addShowRemainingAllItems(model: model, level: Int(user.currentLevel))

    model.add(section: "All levels")
    for category in SRSStageCategory.apprentice ... SRSStageCategory.burned {
      let count = services.localCachingClient.srsCategoryCounts[category.rawValue]
      let item = SRSStageCategoryItem(stageCategory: category, count: Int(count),
                                      accessoryType: count > 0 ? .disclosureIndicator : .none)
      if count > 0 {
        item.tapHandler = { [weak self] in
          if let self = self {
            self.selectedSrsStageCategory = category
            self.perform(segue: StoryboardSegue.Main.viewItemsInSrsCategory, sender: self)
          }
        }
      }
      model.add(item)
      if category == SRSStageCategory.burned, count > 0 {
        model.add(BasicModelItem(style: .value1,
                                 title: "Review burned items",
                                 subtitle: "",
                                 accessoryType: .disclosureIndicator) { [unowned self] in
            self.startBurnedItemReviews()
          })
      }
    }

    let excludedCount = services.localCachingClient.excludedCount()
    if excludedCount > 0 {
      let excludedItems = BasicModelItem(style: .value1,
                                         title: "Excluded items",
                                         accessoryType: .disclosureIndicator) { [
        unowned self
      ] in
        self
          .perform(segue: StoryboardSegue.Main.showExcluded,
                   sender: self)
      }

      _ = setTableViewCellCount(excludedItems, count: excludedCount)
      model.add(excludedItems)
    }

    self.model = model
    tableView.reloadData()
    tableView.tableHeaderView = header
    sizeStudyHeader()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    sizeStudyHeader()
  }

  private func sizeStudyHeader() {
    guard let header = tableView.tableHeaderView else { return }
    let width = tableView.bounds.width
    let size = header.systemLayoutSizeFitting(CGSize(width: width, height: 0),
      withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel)
    if abs(header.frame.height - size.height) > 1 || header.frame.width != width {
      header.frame = CGRect(x: 0, y: 0, width: width, height: size.height)
      tableView.tableHeaderView = header
    }
  }

  private func addShowRemainingAllItems(model: MutableTableModel, level: Int) {
    model.add(BasicModelItem(style: .default,
                             title: "Show remaining",
                             subtitle: nil,
                             accessoryType: .disclosureIndicator) { [weak self] in
        if let self = self {
          self.selectedSubjectCatalogLevel = level
          self.perform(segue: StoryboardSegue.Main.showRemaining, sender: self)
        }
      })
    model.add(BasicModelItem(style: .default,
                             title: "Show all",
                             subtitle: "",
                             accessoryType: .disclosureIndicator) { [weak self] in
        if let self = self {
          self.selectedSubjectCatalogLevel = level
          self.perform(segue: StoryboardSegue.Main.showAll, sender: self)
        }
      })
  }

  // MARK: - UIViewController

  override func prepare(for segue: UIStoryboardSegue, sender _: Any?) {
    switch StoryboardSegue.Main(segue) {
    case .startReviews:
      let assignments = services.localCachingClient.getNonExcludedAssignments()
      var items = ReviewItem.readyForReview(assignments: assignments,
                                            localCachingClient: services.localCachingClient)
      items = sortReviewItems(items: items, services: services)

      if let user = services.localCachingClient.getUserInfo() {
        items = ReviewCheckpointStore(username: user.username).prioritize(items)
      }
      let limit = quickReviewLimit ?? (Settings.reviewItemsLimitEnabled
        ? max(1, Int(Settings.reviewItemsLimit)) : items.count)
      items = Array(items.prefix(limit))
      quickReviewLimit = nil

      let vc = segue.destination as! ReviewContainerViewController
      vc.setup(services: services, items: items)

    case .startRecentMistakeReviews:
      let assignments = services.localCachingClient.getAllRecentMistakeAssignments()
      let items = ReviewItem.readyForRecentMistakesReview(assignments: assignments,
                                                          localCachingClient: services
                                                            .localCachingClient).shuffled()
      if items.count == 0 {
        return
      }

      let vc = segue.destination as! ReviewContainerViewController
      vc.setup(services: services, items: items, isPracticeSession: true)

    case .startRecentLessonReviews:
      let assignments = services.localCachingClient.getAllRecentLessonAssignments()
      let items = ReviewItem.readyForRecentLessonReview(assignments: assignments,
                                                        localCachingClient: services
                                                          .localCachingClient).shuffled()
      if items.count == 0 {
        return
      }

      let vc = segue.destination as! ReviewContainerViewController
      vc.setup(services: services, items: items, isPracticeSession: true)

    case .startAlreadyPassedApprenticeReviews:
      // load apprentice items, then keep the ones that have been passed.
      let apprenticeItems = services.localCachingClient
        .getAssignmentsInCategory(category: SRSStageCategory.apprentice)
      let items = ReviewItem.readyForAlreadyPassedApprenticeReview(assignments: apprenticeItems,
                                                                   localCachingClient: services
                                                                     .localCachingClient).shuffled()
      if items.count == 0 {
        return
      }

      let vc = segue.destination as! ReviewContainerViewController
      vc.setup(services: services, items: items, isPracticeSession: true)

    case .startAllLeechReviews:
      let leechItems = services.localCachingClient.getAllLeeches()
      let items = ReviewItem.readyForLeechReview(assignments: leechItems,
                                                 localCachingClient: services
                                                   .localCachingClient).shuffled()
      if items.count == 0 {
        return
      }

      let vc = segue.destination as! ReviewContainerViewController
      vc.setup(services: services, items: items, isPracticeSession: true)

    case .startBurnedItemReviews:
      let assignments = services.localCachingClient.getAllBurnedAssignments()
      let items = ReviewItem.readyForBurnedReview(assignments: assignments,
                                                  localCachingClient: services
                                                    .localCachingClient).shuffled()
      if items.count == 0 {
        return
      }

      let vc = segue.destination as! ReviewContainerViewController
      vc.setup(services: services, items: items, isPracticeSession: true)

    case .startLessons:
      let assignments = services.localCachingClient.getNonExcludedAssignments()
      var items = ReviewItem.readyForLessons(assignments: assignments,
                                             localCachingClient: services.localCachingClient)
        .shuffled()
      if items.count == 0 {
        return
      }

      items = items.sorted(by: { a, b in a.compareForLessons(other: b) })
      if items.count > Settings.lessonBatchSize {
        items = Array(items[0 ..< Int(Settings.lessonBatchSize)])
      }

      let vc = segue.destination as! LessonsViewController
      vc.setup(services: services, items: items)

    case .showLessonPicker:
      let vc = segue.destination as! LessonPickerViewController
      vc.setup(services: services)

    case .showAll:
      let vc = segue.destination as! SubjectCatalogueViewController
      vc.setup(services: services, level: selectedSubjectCatalogLevel)

    case .showRemaining:
      let vc = segue.destination as! SubjectsRemainingViewController
      vc.setup(services: services, level: selectedSubjectCatalogLevel)

    case .showExcluded:
      let vc = segue.destination as! SubjectsExcludedViewController
      vc.setup(services: services, category: selectedSrsStageCategory,
               showAnswers: Settings.subjectCatalogueViewShowAnswers)

    case .tableForecast:
      let vc = segue.destination as! UpcomingReviewsViewController
      vc.setup(services: services)

    case .viewItemsInSrsCategory:
      let vc = segue.destination as! SubjectsByCategoryViewController
      vc.setup(services: services, category: selectedSrsStageCategory,
               showAnswers: Settings.subjectCatalogueViewShowAnswers)

    default:
      break
    }
  }

  // MARK: - Keyboard navigation

  override var keyCommands: [UIKeyCommand]? {
    var ret = [UIKeyCommand]()

    // Press return to keep studying, first lessons then reviews
    if hasLessons, !hasReviews {
      ret.append(UIKeyCommand(input: "\r",
                              modifierFlags: [],
                              action: #selector(startLessons),
                              discoverabilityTitle: "Continue lessons"))
    } else if hasReviews {
      ret.append(UIKeyCommand(input: "\r",
                              modifierFlags: [],
                              action: #selector(startQuickReviews),
                              discoverabilityTitle: "Do \(Self.quickReviewCount) reviews"))
    }

    // Command L to start lessons, if any
    if hasLessons {
      ret.append(UIKeyCommand(input: "l",
                              modifierFlags: [.command],
                              action: #selector(startLessons),
                              discoverabilityTitle: "Start lessons"))
    }

    // Command R to start reviews, if any
    if hasReviews {
      ret.append(UIKeyCommand(input: "r",
                              modifierFlags: [.command],
                              action: #selector(startReviews),
                              discoverabilityTitle: "Start reviews"))
    }

    return ret
  }

  @objc func startQuickReviews() {
    quickReviewLimit = Self.quickReviewCount
    perform(segue: StoryboardSegue.Main.startReviews, sender: self)
  }

  @objc func startReviews() {
    quickReviewLimit = nil
    perform(segue: StoryboardSegue.Main.startReviews, sender: self)
  }

  @objc func startLessons() {
    perform(segue: StoryboardSegue.Main.startLessons, sender: self)
  }

  @objc func showLessonPicker() {
    perform(segue: StoryboardSegue.Main.showLessonPicker, sender: self)
  }

  @objc func showTableForecast() {
    perform(segue: StoryboardSegue.Main.tableForecast, sender: self)
  }

  @objc func startRecentMistakeReviews() {
    perform(segue: StoryboardSegue.Main.startRecentMistakeReviews, sender: self)
  }

  @objc func startRecentLessonReviews() {
    perform(segue: StoryboardSegue.Main.startRecentLessonReviews, sender: self)
  }

  @objc func startAlreadyPassedApprenticeReviews() {
    perform(segue: StoryboardSegue.Main.startAlreadyPassedApprenticeReviews, sender: self)
  }

  @objc func startAllLeechReviews() {
    perform(segue: StoryboardSegue.Main.startAllLeechReviews, sender: self)
  }

  @objc func startBurnedItemReviews() {
    perform(segue: StoryboardSegue.Main.startBurnedItemReviews, sender: self)
  }
}


/// A restrained, readable panel shared by the home and completion screens.
final class StudyPanel: UIView {
  let stack = UIStackView()
  static let accent = UIColor { traits in
    traits.userInterfaceStyle == .dark
      ? UIColor(red: 0.35, green: 0.83, blue: 0.71, alpha: 1)
      : UIColor(red: 0.06, green: 0.39, blue: 0.32, alpha: 1)
  }
  init(title: String, message: String, detail: String?, primaryTitle: String?,
       primaryAction: @escaping () -> Void, secondaryTitle: String?,
       secondaryAction: @escaping () -> Void, showsTurtle: Bool = true,
       secondaryTextStyle: UIFont.TextStyle = .headline) {
    super.init(frame: .zero)
    stack.axis = .vertical
    stack.spacing = 20
    stack.translatesAutoresizingMaskIntoConstraints = false
    addSubview(stack)
    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(equalTo: topAnchor, constant: 32),
      stack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -40),
      stack.centerXAnchor.constraint(equalTo: centerXAnchor),
      stack.widthAnchor.constraint(lessThanOrEqualToConstant: 560),
      stack.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 24),
      stack.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -24),
    ])
    let width = stack.widthAnchor.constraint(equalTo: widthAnchor, constant: -48)
    width.priority = .defaultHigh
    width.isActive = true
    if showsTurtle {
      let holder = UIView()
      let icon = UIImageView(image: UIImage(named: "StudyTurtle"))
      icon.contentMode = .scaleAspectFit
      icon.clipsToBounds = false
      icon.translatesAutoresizingMaskIntoConstraints = false
      holder.addSubview(icon)
      NSLayoutConstraint.activate([
        holder.heightAnchor.constraint(equalToConstant: 72),
        icon.centerXAnchor.constraint(equalTo: holder.centerXAnchor),
        icon.topAnchor.constraint(equalTo: holder.topAnchor),
        icon.widthAnchor.constraint(equalToConstant: 72),
        icon.heightAnchor.constraint(equalToConstant: 72),
      ])
      stack.addArrangedSubview(holder)
    }
    func label(_ text: String, style: UIFont.TextStyle, color: UIColor) -> UILabel {
      let label = UILabel()
      label.text = text
      label.font = UIFont.preferredFont(forTextStyle: style)
      label.adjustsFontForContentSizeCategory = true
      label.numberOfLines = 0
      label.textAlignment = .center
      label.textColor = color
      return label
    }
    let heading = label(title, style: .largeTitle, color: .label)
    heading.accessibilityTraits.insert(.header)
    stack.addArrangedSubview(heading)
    stack.addArrangedSubview(label(message, style: .body, color: .secondaryLabel))
    if let detail { stack.addArrangedSubview(label(detail, style: .headline, color: Self.accent)) }
    func button(_ title: String, filled: Bool, action: @escaping () -> Void) -> UIButton {
      var config = filled ? UIButton.Configuration.filled() : .plain()
      config.title = title
      config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
        var updated = attributes
        updated.font = UIFont.preferredFont(forTextStyle: filled ? .headline : secondaryTextStyle)
        return updated
      }
      config.baseBackgroundColor = Self.accent
      config.baseForegroundColor = filled ? .systemBackground : Self.accent
      config.cornerStyle = .large
      config.contentInsets = NSDirectionalEdgeInsets(top: 18, leading: 24, bottom: 18, trailing: 24)
      let button = UIButton(configuration: config, primaryAction: UIAction { _ in action() })
      button.titleLabel?.font = UIFont.preferredFont(forTextStyle: .headline)
      return button
    }
    if let primaryTitle { stack.addArrangedSubview(button(primaryTitle, filled: true, action: primaryAction)) }
    if let secondaryTitle { stack.addArrangedSubview(button(secondaryTitle, filled: false, action: secondaryAction)) }
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
}
