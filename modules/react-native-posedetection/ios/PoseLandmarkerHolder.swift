// PoseLandmarkerHolder.swift
import Foundation
import MediaPipeTasksVision

@objc public class PoseLandmarkerHolder: NSObject {
    @objc public static let shared = PoseLandmarkerHolder()
    
    private(set) var poseLandmarker: PoseLandmarker?
    
    private override init() {
        super.init()
    }
    
    @objc public func initializePoseLandmarker(with options: PoseLandmarkerOptions) throws {
        self.poseLandmarker = try PoseLandmarker(options: options)
    }
    
    @objc public func clearPoseLandmarker() {
        self.poseLandmarker = nil
    }
    
    @objc public func getPoseLandmarker() -> PoseLandmarker? {
        return self.poseLandmarker
    }
}
