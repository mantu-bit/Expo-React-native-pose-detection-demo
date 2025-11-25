// PosedetectionEventEmitter.swift
import Foundation

@objc protocol PosedetectionEventEmitter: AnyObject {
    func sendPoseLandmarks(params: [String: Any])
    func sendPoseError(error: String)
    func sendPoseStatus(status: String)
}
