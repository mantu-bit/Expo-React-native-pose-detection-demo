// PoseLandmarkerResultProcessor.swift
import Foundation
import React // Import React framework
import MediaPipeTasksVision

@objc public class PoseLandmarkerResultProcessor: NSObject, PoseLandmarkerLiveStreamDelegate {
    private weak var eventEmitter: AnyObject?
    
    @objc public init(eventEmitter: AnyObject) {
        self.eventEmitter = eventEmitter
        super.init()
    }
    
    public func poseLandmarker(
        _ poseLandmarker: PoseLandmarker,
        didFinishDetection result: PoseLandmarkerResult?,
        timestampInMilliseconds: Int,
        error: Error?
    ) {
        if let error = error {
            print("PoseLandmarker Error: \(error.localizedDescription)")
            self.sendPoseError(error: error.localizedDescription)
            return
        }
        
        guard let result = result else {
            print("No result received.")
            return
        }
        
        // Prepare the data to be sent back to JavaScript
        let landmarksArray = NSMutableArray()
        
        for poseLandmarks in result.landmarks {
            let poseArray = NSMutableArray()
            
            for (index, poseMark) in poseLandmarks.enumerated() {
                let landmarkMap: [String: Any] = [
                    "keypoint": index,
                    "x": poseMark.x,
                    "y": poseMark.y,
                    "z": poseMark.z,
                    "visibility": poseMark.visibility?.floatValue ?? 0.0,
                    "presence": poseMark.presence?.floatValue ?? 0.0
                ]
                poseArray.add(landmarkMap)
            }
            
            landmarksArray.add(poseArray)
        }
        
        let params: [String: Any] = ["landmarks": landmarksArray]
        self.sendPoseLandmarks(params: params)
    }
    
    private func sendPoseLandmarks(params: [String: Any]) {
        if let emitter = self.eventEmitter {
            let selector = NSSelectorFromString("sendPoseLandmarksWithParams:")
            if emitter.responds(to: selector) {
                _ = emitter.perform(selector, with: params)
            }
        }
    }
    
    private func sendPoseError(error: String) {
        if let emitter = self.eventEmitter {
            let selector = NSSelectorFromString("sendPoseErrorWithError:")
            if emitter.responds(to: selector) {
                _ = emitter.perform(selector, with: error)
            }
        }
    }
}
