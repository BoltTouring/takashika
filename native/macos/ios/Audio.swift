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

import AVFoundation
import Foundation
import WaniKaniAPI

protocol AudioDelegate: NSObject {
  func audioPlaybackStateChanged(state: Audio.PlaybackState)
}

class Audio: NSObject {
  enum PlaybackState {
    case loading
    case playing
    case finished
  }

  private let services: TKMServices
  private var player: AVPlayer?
  private var lastPlayedSubjectID: Int64?
  private var lastPlayedAudioIndex: Int = -1
  private var preloadedSubjectID: Int64?
  private var preloadedAudioIndex: Int?
  private var preloadedAsset: AVURLAsset?
  private var waitingToPlay = false
  private weak var delegate: AudioDelegate?

  private let nd = NotificationDispatcher()

  init(services: TKMServices) {
    self.services = services

    super.init()

    // Set the audio session category.
    let session = AVAudioSession.sharedInstance()
    try? session
      .setCategory(.playback,
                   options: Settings
                     .interruptBackgroundAudio ? [
                       .duckOthers,
                       .interruptSpokenAudioAndMixWithOthers
                     ] :
                     [.mixWithOthers])

    // Listen for when playback of any item finished.
    nd.add(name: .AVPlayerItemDidPlayToEndTime) { [weak self] _ in self?.itemFinishedPlaying() }
  }

  private(set) var currentState = PlaybackState.finished {
    didSet {
      if currentState != oldValue {
        delegate?.audioPlaybackStateChanged(state: currentState)
      }

      let session = AVAudioSession.sharedInstance()
      switch currentState {
      case .playing:
        try? session.setActive(true, options: [])
      case .finished:
        DispatchQueue.global().async {
          try? session.setActive(false, options: [.notifyOthersOnDeactivation])
        }
      default:
        break
      }
    }
  }

  func play(subjectID: Int64, delegate: AudioDelegate?) {
    guard let subject = services.localCachingClient.getSubject(id: subjectID) else {
      return
    }
    if !subject.hasVocabulary || subject.vocabulary.audio.isEmpty {
      return
    }
    guard let selection = nextAudioSelection(for: subject) else {
      if !services.reachability.isReachable() {
        showOfflineDialog()
      }
      return
    }

    lastPlayedSubjectID = subject.id
    lastPlayedAudioIndex = selection.index
    play(url: selection.url, delegate: delegate)
  }

  func preload(subjectID: Int64) {
    guard let subject = services.localCachingClient.getSubject(id: subjectID),
          subject.hasVocabulary, !subject.vocabulary.audio.isEmpty,
          let selection = preferredAudioSelection(for: subject, startIndex: 0)
    else {
      return
    }

    if preloadedSubjectID == subject.id, preloadedAudioIndex == selection.index {
      return
    }

    preloadedSubjectID = subject.id
    preloadedAudioIndex = selection.index
    let asset = AVURLAsset(url: selection.url)
    preloadedAsset = asset
    asset.loadValuesAsynchronously(forKeys: ["playable"], completionHandler: {})
  }

  private func nextAudioSelection(for subject: TKMSubject) -> (index: Int, url: URL)? {
    let startIndex = lastPlayedSubjectID == subject.id ? lastPlayedAudioIndex + 1 : 0
    return preferredAudioSelection(for: subject, startIndex: startIndex)
  }

  private func preferredAudioSelection(for subject: TKMSubject,
                                       startIndex: Int) -> (index: Int, url: URL)? {
    let audioCount = subject.vocabulary.audio.count
    guard audioCount > 0 else {
      return nil
    }

    let offline = services.offlineAudio!
    for offset in 0 ..< audioCount {
      let index = (startIndex + offset) % audioCount
      let audio = subject.vocabulary.audio[index]
      if offline.isCached(subjectId: subject.id, voiceActorId: audio.voiceActorID) {
        return (index, offline.cacheUrl(subjectId: subject.id, voiceActorId: audio.voiceActorID))
      }
    }

    guard services.reachability.isReachable() else {
      return nil
    }

    let index = startIndex % audioCount
    return (index, URL(string: subject.vocabulary.audio[index].url)!)
  }

  private func play(url: URL, delegate: AudioDelegate?) {
    currentState = .finished
    self.delegate = delegate

    if player == nil || player?.status == .failed {
      player = AVPlayer()
      player?.addObserver(self, forKeyPath: "currentItem.status", options: [], context: nil)
    }

    let item: AVPlayerItem
    if let preloadedAsset = preloadedAsset, preloadedAsset.url == url {
      item = AVPlayerItem(asset: preloadedAsset)
    } else {
      item = AVPlayerItem(url: url)
    }

    player?.replaceCurrentItem(with: item)
    preloadedSubjectID = nil
    preloadedAudioIndex = nil
    preloadedAsset = nil
    waitingToPlay = true
  }

  func stopPlayback() {
    player?.pause()
    currentState = .finished
  }

  override func observeValue(forKeyPath keyPath: String?,
                             of _: Any?,
                             change _: [NSKeyValueChangeKey: Any]?,
                             context _: UnsafeMutableRawPointer?) {
    if keyPath == "currentItem.status" {
      guard let player,
            let currentItem = player.currentItem
      else {
        return
      }

      switch currentItem.status {
      case .failed:
        showErrorDialog(currentItem.error!)
        currentState = .finished
      case .unknown:
        currentState = .loading
      case .readyToPlay:
        if waitingToPlay {
          waitingToPlay = false
          currentState = .playing
          player.play()
        }
      default:
        break
      }
    }
  }

  private func showErrorDialog(_ error: Error) {
    guard let currentItem = player?.currentItem,
          let asset = currentItem.asset as? AVURLAsset
    else {
      return
    }

    showDialog(title: "Error playing audio",
               message: "\(error.localizedDescription)\nURL: \(asset.url)")
  }

  private func showOfflineDialog() {
    showDialog(title: "Audio not available offline",
               message: "Download audio in Settings when you're back online")
  }

  private func showDialog(title: String, message: String) {
    let ac = UIAlertController(title: title, message: message, preferredStyle: .alert)
    ac.addAction(UIAlertAction(title: "OK", style: .default, handler: nil))

    let vc = UIApplication.shared.keyWindow!.rootViewController!
    vc.present(ac, animated: true, completion: nil)
  }

  private func itemFinishedPlaying() {
    currentState = .finished
  }
}
