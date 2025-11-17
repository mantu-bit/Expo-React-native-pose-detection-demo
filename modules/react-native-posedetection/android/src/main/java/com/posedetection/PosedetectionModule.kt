package com.posedetection

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.module.annotations.ReactModule
import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.WritableArray
import android.util.Log
import android.graphics.Bitmap
import java.util.Optional

// MediaPipe imports
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.OutputHandler
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarkerResult
import com.google.mediapipe.tasks.components.containers.NormalizedLandmark

@ReactModule(name = PosedetectionModule.NAME)
class PosedetectionModule(reactContext: ReactApplicationContext) :
    NativePosedetectionSpec(reactContext) {
  
  companion object {
    const val NAME = "Posedetection"
    private const val TAG = "POSE_TURBO"
  }

  private var resultListener: OutputHandler.ResultListener<PoseLandmarkerResult, MPImage>? = null

  override fun getName(): String = NAME

  override fun initialize() {
    super.initialize()
    Log.d(TAG, "🚀 Module initialized")
  }

  @ReactMethod
  override fun initModel(promise: Promise) {
    Log.d(TAG, "🔵 initModel() called from JS")
    if (PoseLandmarkerHolder.poseLandmarker != null) {
      Log.d(TAG, "⚠️ Model already initialized")
      promise.resolve("Model already initialized")
      return
    }
    Log.d(TAG, "🟡 Starting model initialization...")
    
    try {
      Log.d(TAG, "📝 Step 1: Creating result listener...")
      
      // Create resultListener - EMIT DIRECTLY like Expo module (no Handler.post)
      resultListener = OutputHandler.ResultListener<PoseLandmarkerResult, MPImage> { result, inputImage ->
        Log.d(TAG, "🎯 Listener triggered – Detected ${result.landmarks().size} poses")
        
        try {
          // Build landmarks array
          val landmarksArray = Arguments.createArray()
          
          for (poseLandmarks in result.landmarks()) {
            val poseArray = Arguments.createArray()
            for ((index, landmark) in poseLandmarks.withIndex()) {
              val landmarkMap: WritableMap = Arguments.createMap().apply {
                putInt("keypoint", index)
                putDouble("x", landmark.x().toDouble())
                putDouble("y", landmark.y().toDouble())
                putDouble("z", landmark.z().toDouble())
                putDouble("visibility", landmark.visibility().orElse(0f).toDouble())
                putDouble("presence", landmark.presence().orElse(0f).toDouble())
              }
              poseArray.pushMap(landmarkMap)
            }
            landmarksArray.pushArray(poseArray)
          }
          
          // Build event params
          val params: WritableMap = Arguments.createMap().apply {
            putArray("landmarks", landmarksArray)
          }
          
          // EMIT DIRECTLY (like Expo module) - NO Handler.post
          Log.d(TAG, "📤 Emitting event directly from MediaPipe thread")
          emitOnPoseLandmarksDetected(params)
          Log.d(TAG, "✅ Event emitted – ${landmarksArray.size()} poses")
          
        } catch (e: Exception) {
          Log.e(TAG, "❌ Error processing landmarks: ${e.message}", e)
          e.printStackTrace()
        }
      }
      
      Log.d(TAG, "✅ Step 1 complete: Result listener created")
      
      Log.d(TAG, "📝 Step 2: Getting context...")
      val context: Context = reactApplicationContext
      Log.d(TAG, "✅ Step 2 complete: Context obtained")
      
      Log.d(TAG, "📝 Step 3: Building BaseOptions...")
      val baseOptions = BaseOptions.builder()
        .setModelAssetPath("pose_landmarker_lite.task")
        .build()
      Log.d(TAG, "✅ Step 3 complete: BaseOptions built")
      
      Log.d(TAG, "📝 Step 4: Building PoseLandmarkerOptions...")
      val poseLandmarkerOptions = PoseLandmarker.PoseLandmarkerOptions.builder()
        .setBaseOptions(baseOptions)
        .setNumPoses(1)
        .setRunningMode(RunningMode.LIVE_STREAM)
        .setMinTrackingConfidence(0.8f)
        .setMinPoseDetectionConfidence(0.8f)
        .setMinPosePresenceConfidence(0.8f)
        .setResultListener(resultListener!!)
        .build()
      Log.d(TAG, "✅ Step 4 complete: PoseLandmarkerOptions built")
      
      Log.d(TAG, "📝 Step 5: Creating PoseLandmarker...")
      PoseLandmarkerHolder.poseLandmarker = PoseLandmarker.createFromOptions(context, poseLandmarkerOptions)
      Log.d(TAG, "✅ Step 5 complete: PoseLandmarker created")
      
      Log.d(TAG, "✅ Model initialized successfully – Listener attached!")
      promise.resolve("Model initialized successfully")
      
    } catch (e: Exception) {
      Log.e(TAG, "❌ FATAL Error during initialization: ${e.message}", e)
      Log.e(TAG, "❌ Exception type: ${e.javaClass.simpleName}")
      Log.e(TAG, "❌ Stack trace:")
      e.printStackTrace()
      promise.reject("INIT_ERROR", e.message ?: "Unknown error", e)
    }
  }

  @ReactMethod
  override fun triggerMockDetection() {
    Log.d(TAG, "🧪 triggerMockDetection called")
    
    val mockLandmarksArray = Arguments.createArray()
    val mockPoseArray = Arguments.createArray()
    
    // Create 33 mock keypoints (full body)
    for (i in 0..32) {
      val mockLandmark = Arguments.createMap().apply {
        putInt("keypoint", i)
        putDouble("x", 0.5 + (i * 0.01))
        putDouble("y", 0.5 + (i * 0.01))
        putDouble("z", 0.0)
        putDouble("visibility", 0.9)
        putDouble("presence", 0.9)
      }
      mockPoseArray.pushMap(mockLandmark)
    }
    mockLandmarksArray.pushArray(mockPoseArray)
    
    val mockParams = Arguments.createMap().apply {
      putArray("landmarks", mockLandmarksArray)
    }
    
    Log.d(TAG, "📤 Emitting mock detection event")
    emitOnPoseLandmarksDetected(mockParams)
    Log.d(TAG, "✅ Mock detection event emitted")
  }

  @ReactMethod
  override fun testEmit() {
    Log.d(TAG, "🧪 testEmit called from JS")
    val testParams: WritableMap = Arguments.createMap().apply {
      putString("test", "Hello from native TurboModule!")
      putInt("count", 42)
    }
    emitOnPoseLandmarksStatus(testParams)
    Log.d(TAG, "✅ testEmit done")
  }

  @ReactMethod
  override fun addListener(eventName: String) {
    Log.d(TAG, "📝 addListener: $eventName")
  }

  @ReactMethod
  override fun removeListeners(count: Double) {
    Log.d(TAG, "🗑️ removeListeners: $count")
  }

  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }
}
