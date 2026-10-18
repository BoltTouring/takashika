import UIKit
import XCTest

// Header tests never create cells; avoid pulling the app styling into the test target.
class ListSeparatorCell: TableModelCell {}

@MainActor
final class TableModelTest: XCTestCase {
  func testEmptyAndStaleSectionQueriesAreSafe() {
    let table = UITableView(frame: .zero, style: .grouped)
    let model = MutableTableModel(tableView: table)
    for section in [-1, 0, 3] {
      XCTAssertEqual(model.tableView(table, heightForHeaderInSection: section), 0)
      XCTAssertNil(model.tableView(table, titleForHeaderInSection: section))
      XCTAssertNil(model.tableView(table, titleForFooterInSection: section))
      XCTAssertEqual(model.tableView(table, numberOfRowsInSection: section), 0)
    }
    XCTAssertEqual(model.numberOfSections(in: table), 0)
  }

  func testHiddenSectionsKeepCorrectHeaderMapping() {
    let table = UITableView(frame: .zero, style: .grouped)
    let model = MutableTableModel(tableView: table)
    model.add(section: "Hidden")
    model.add(section: "Visible", footer: "Footer")
    model.setIndexPath(IndexPath(index: 0), hidden: true)
    XCTAssertEqual(model.numberOfSections(in: table), 1)
    XCTAssertEqual(model.tableView(table, titleForHeaderInSection: 0), "Visible")
    XCTAssertEqual(model.tableView(table, titleForFooterInSection: 0), "Footer")
    XCTAssertEqual(model.tableView(table, heightForHeaderInSection: 0), UITableView.automaticDimension)
    XCTAssertEqual(model.tableView(table, heightForHeaderInSection: 1), 0)
  }

  func testReplacingPopulatedTableWithEmptyModelAndHeader() {
    let table = UITableView(frame: CGRect(x: 0, y: 0, width: 600, height: 800), style: .grouped)
    let old = MutableTableModel(tableView: table)
    old.add(section: "Progress")
    table.reloadData()
    table.layoutIfNeeded()
    let replacement = MutableTableModel(tableView: table)
    // This is the synchronous callback path reported by the 1.38 crash.
    table.tableHeaderView = UIView(frame: CGRect(x: 0, y: 0, width: 600, height: 200))
    table.reloadData()
    table.layoutIfNeeded()
    XCTAssertEqual(table.numberOfSections, 0)
    XCTAssertEqual(replacement.numberOfSections(in: table), 0)
    withExtendedLifetime(old) {}
  }
}
