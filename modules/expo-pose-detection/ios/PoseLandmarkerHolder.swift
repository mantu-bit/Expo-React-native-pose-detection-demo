import MediaPipeTasksVision

public class PoseLandmarkerHolder {
  public static let shared = PoseLandmarkerHolder()
  
  public var poseLandmarker: PoseLandmarker?
  
  private init() {}
  
  public func initializePoseLandmarker(with options: PoseLandmarkerOptions) throws {
    poseLandmarker = try PoseLandmarker(options: options)
  }
  
  public func clear() {
    poseLandmarker = nil
  }
}
