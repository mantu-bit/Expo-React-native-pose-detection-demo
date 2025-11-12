//
//  PoseLandmarksFrameProcessor.swift
//  ExpoPoseDetection
//
//  Created by itech on 12/11/25.
//

import VisionCamera
import MediaPipeTasksVision
import ExpoModulesCore

@objc(PoseLandmarksFrameProcessorPlugin)
public class PoseLandmarksFrameProcessorPlugin: FrameProcessorPlugin {
  
  public override init(proxy: VisionCameraProxyHolder, options: [AnyHashable: Any]! = [:]) {
    super.init(proxy: proxy, options: options)
  }
  
  public override func callback(_ frame: Frame, withArguments arguments: [AnyHashable: Any]?) -> Any? {
    let buffer = frame.buffer
    
    // Get poseLandmarker from the holder (matching your Android implementation)
    guard let poseLandmarker = PoseLandmarkerHolder.shared.poseLandmarker else {
      print("PoseLandmarker is not initialized.")
      return nil
    }
    
    do {
      /*
      The MPImage class from MediaPipeTasksVision is used to create an image object
      from the frame buffer
      */
      let image = try MPImage(sampleBuffer: buffer, orientation: frame.orientation)
      
      // Convert timestamp from seconds to milliseconds
      let timestampMs = Int(frame.timestamp * 1000)
      
      try poseLandmarker.detectAsync(image: image, timestampInMilliseconds: timestampMs)
      
      return nil  // Results are sent via delegate callback
    } catch {
      print("Error processing frame: \(error.localizedDescription)")
      return nil
    }
  }
}
