import ExpoModulesCore
import MediaPipeTasksVision
import VisionCamera

// MARK: - Delegate Handler
class PoseLandmarkerResultProcessor: NSObject, PoseLandmarkerLiveStreamDelegate {
  
  weak var module: ExpoPoseDetectionModule?
  
  init(module: ExpoPoseDetectionModule) {
    self.module = module
    super.init()
  }
  
  func poseLandmarker(
    _ poseLandmarker: PoseLandmarker,
    didFinishDetection result: PoseLandmarkerResult?,
    timestampInMilliseconds: Int,
    error: Error?
  ) {
    
    if let error = error {
      print("Pose detection error: \(error.localizedDescription)")
      module?.sendEvent("onPoseLandmarksError", ["error": error.localizedDescription])
      return
    }
    
    guard let result = result else {
      print("No pose detection result received.")
      return
    }
    
    print("Detected \(result.landmarks.count) poses")
    
    let landmarksArray = result.landmarks.map { poseLandmarks in
      poseLandmarks.enumerated().map { (index, landmark) in
        [
          "keypoint": index,
          "x": Double(landmark.x),
          "y": Double(landmark.y),
          "z": Double(landmark.z),
          "visibility": Double(landmark.visibility?.floatValue ?? 0.0),
          "presence": Double(landmark.presence?.floatValue ?? 0.0)
        ] as [String: Any]
      }
    }
    
    module?.sendEvent("onPoseLandmarksDetected", ["landmarks": landmarksArray])
  }
}

// MARK: - Main Module
public class ExpoPoseDetectionModule: Module {
  
  private var resultProcessor: PoseLandmarkerResultProcessor?
  
  public func definition() -> ModuleDefinition {
    Name("ExpoPoseDetection")
    
    Events(
      "onPoseLandmarksDetected",
      "onPoseLandmarksStatus",
      "onPoseLandmarksError"
    )
    
    OnStartObserving("onPoseLandmarksDetected") {
      print("Started observing pose landmarks")
      if PoseLandmarkerHolder.shared.poseLandmarker == nil {
        self.initModel()
      }
    }
    
    OnStopObserving("onPoseLandmarksDetected") {
      print("Stopped observing pose landmarks")
    }
    
    OnCreate {
      print("Module created, initializing model")
      self.initModel()
        
        // Manually register frame processor
      FrameProcessorPluginRegistry.addFrameProcessorPlugin("poseLandmarks", withInitializer: { proxy, options in
            return PoseLandmarksFrameProcessorPlugin(proxy: proxy, options: options)
          })
    }
    
    OnDestroy {
      PoseLandmarkerHolder.shared.clear()
      self.resultProcessor = nil
      print("PoseLandmarker destroyed")
    }
    
    Function("hello") {
      return "Hello react native! 👋"
    }
  }
  
  private func initModel() {
    if PoseLandmarkerHolder.shared.poseLandmarker != nil {
      print("Model already initialized")
      sendEvent("onPoseLandmarksStatus", ["status": "Model already initialized"])
      return
    }
    
    do {
      resultProcessor = PoseLandmarkerResultProcessor(module: self)
      
      guard let modelPath = Bundle.main.path(forResource: "pose_landmarker_lite", ofType: "task") else {
        sendEvent("onPoseLandmarksError", ["error": "Model file not found"])
        print("Error: Model file not found in bundle")
        return
      }
      
      let options = PoseLandmarkerOptions()
      options.baseOptions.modelAssetPath = modelPath
      options.runningMode = .liveStream
      options.numPoses = 1
      options.minPoseDetectionConfidence = 0.8
      options.minTrackingConfidence = 0.8
      options.minPosePresenceConfidence = 0.8
      options.poseLandmarkerLiveStreamDelegate = resultProcessor
      
      try PoseLandmarkerHolder.shared.initializePoseLandmarker(with: options)
      
      sendEvent("onPoseLandmarksStatus", ["status": "Model initialized successfully"])
      print("Model initialized successfully")
    } catch {
      sendEvent("onPoseLandmarksError", ["error": error.localizedDescription])
      print("Error initializing PoseLandmarker: \(error.localizedDescription)")
    }
  }
}
