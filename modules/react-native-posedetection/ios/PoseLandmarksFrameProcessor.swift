// PoseLandmarksFrameProcessor.swift
import Foundation

#if canImport(VisionCamera)
import VisionCamera
import MediaPipeTasksVision

@objc(PoseLandmarksFrameProcessorPlugin)
public class PoseLandmarksFrameProcessorPlugin: FrameProcessorPlugin {
    
    @objc
    public override init(proxy: VisionCameraProxyHolder, options: [AnyHashable: Any]!) {
        super.init(proxy: proxy, options: options ?? [:])
        print("✅ PoseLandmarksFrameProcessorPlugin initialized")
    }
    
    public override func callback(_ frame: Frame, withArguments arguments: [AnyHashable: Any]?) -> Any? {
        let buffer = frame.buffer
        
        guard let poseLandmarker = PoseLandmarkerHolder.shared.getPoseLandmarker() else {
            print("⚠️ PoseLandmarker is not initialized.")
            return nil
        }
        
        do {
            let image = try MPImage(sampleBuffer: buffer, orientation: frame.orientation)
            try poseLandmarker.detectAsync(
                image: image, 
                timestampInMilliseconds: Int(frame.timestamp)
            )
            return nil
            
        } catch {
            print("❌ Frame processing error: \(error.localizedDescription)")
            return nil
        }
    }
}
#endif
