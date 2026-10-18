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

class ReviewSummaryViewController: UITableViewController, SubjectDelegate {
  private var services: TKMServices!
  private var model: TableModel!
  private var canContinue = false

  func setup(services: TKMServices, items: [ReviewItem], isPractice: Bool = false) {
    self.services = services

    let currentLevel = services.localCachingClient.getUserInfo()!.level
    var incorrectItemsByLevel = [Int32: [ReviewItem]]()
    var correct = 0
    for item in items {
      if !item.answer.meaningWrong, !item.answer.readingWrong {
        correct += 1
        continue
      }
      incorrectItemsByLevel[item.assignment.level, default: []].append(item)
    }

    let model = MutableTableModel(tableView: tableView)

    // Summary section.
    var summaryText: String
    if items.isEmpty {
      summaryText = "No completed items yet"
    } else {
      summaryText =
        "\(Int(Double(correct) / Double(items.count) * 100.0))% (\(correct)/\(items.count))"
    }
    tableView.backgroundColor = .systemGroupedBackground
    tableView.separatorStyle = .none
    canContinue = !isPractice && services.localCachingClient.availableReviewCount > 0
    tableView.tableHeaderView = StudyPanel(
      title: items.isEmpty ? "A good place to pause." : "Small steps count.",
      message: isPractice ? "Practice complete. Your review schedule hasn't changed." :
        (items.isEmpty ? "Your unfinished answers are saved on this Mac. Pick them up next time." :
          "You made time for \(items.count) review\(items.count == 1 ? "" : "s"). Progress made."),
      detail: isPractice ? nil : "Progress saved · syncs when online",
      primaryTitle: canContinue
        ? "Do another \(min(MainWaniKaniTabViewController.quickReviewCount, services.localCachingClient.availableReviewCount))"
        : "Done for today",
      primaryAction: { [weak self] in self?.performPrimaryAction() },
      secondaryTitle: canContinue ? "Done for today" : nil,
      secondaryAction: { [weak self] in self?.doneClicked() }, secondaryTextStyle: .subheadline)
    if !items.isEmpty {
      model.add(section: "Summary")
      model.add(BasicModelItem(style: .value1, title: "Correct answers", subtitle: summaryText))
    }

    // Add a section for each level.
    let incorrectItemLevels = incorrectItemsByLevel.keys.sorted { a, b -> Bool in
      b < a
    }
    for level in incorrectItemLevels {
      if level == currentLevel {
        model.add(section: "Current level (\(level))")
      } else {
        model.add(section: "Level \(level)")
      }

      for item in incorrectItemsByLevel[level]! {
        var subject = item.subject
        if subject == nil {
          subject = services.localCachingClient.getSubject(id: item.assignment.subjectID)
        }
        guard let subject = subject else {
          continue
        }

        model.add(SubjectModelItem(subject: subject, delegate: self, assignment: nil,
                                   readingWrong: item.answer.readingWrong,
                                   meaningWrong: item.answer.meaningWrong))
      }
    }
    self.model = model
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    guard let header = tableView.tableHeaderView else { return }
    let width = tableView.bounds.width
    let size = header.systemLayoutSizeFitting(CGSize(width: width, height: 0),
      withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel)
    if abs(header.frame.height - size.height) > 1 || header.frame.width != width {
      header.frame = CGRect(x: 0, y: 0, width: width, height: size.height)
      tableView.tableHeaderView = header
    }
  }

  @objc private func performPrimaryAction() {
    if canContinue {
      anotherSmallBatch()
    } else {
      doneClicked()
    }
  }

  private func anotherSmallBatch() {
    guard let navigation = navigationController,
          let main = navigation.viewControllers.first as? MainViewController,
          let home = main.tabBarViewController?.waniKaniViewController else { return }
    navigation.popToRootViewController(animated: false)
    home.startQuickReviews()
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    navigationController?.isNavigationBarHidden = false
  }

  @IBAction private func doneClicked() {
    navigationController?.popToRootViewController(animated: true)
  }

  override var canBecomeFirstResponder: Bool {
    true
  }

  override var keyCommands: [UIKeyCommand]? {
    [
      UIKeyCommand(input: "\r",
                   modifierFlags: [],
                   action: #selector(performPrimaryAction),
                   discoverabilityTitle: canContinue ? "Do another batch" : "Done for today"),
    ]
  }

  // MARK: - SubjectDelegate

  func didTapSubject(_ subject: TKMSubject) {
    let vc = StoryboardScene.SubjectDetails.initialScene.instantiate()
    vc.setup(services: services, subject: subject, showHints: false, hideBackButton: false,
             index: 0)
    navigationController?.pushViewController(vc, animated: true)
  }
}
