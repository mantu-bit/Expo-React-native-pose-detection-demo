package com.posedetection

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import android.content.Context
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule
import android.util.Log
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.OutputHandler
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarkerResult

@ReactModule(name = PosedetectionModule.NAME)
class PosedetectionModule(reactContext: ReactApplicationContext) :
  NativePosedetectionSpec(reactContext) {


  companion object {
    const val NAME = "Posedetection"
  }

  override fun getName(): String {
    return NAME
  }

  override fun initialize() {
    super.initialize()
    Log.d("PosedetectionModule", "🚀 Module initialized")
    initModel()
  }

  private fun sendEvent(eventName: String, params: WritableMap?) {
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, params)
  }

  @ReactMethod
  override fun initModel() {
    Log.d("PosedetectionModule", "🔵 initModel() called")
    
    if (PoseLandmarkerHolder.poseLandmarker != null) {
      Log.d("PosedetectionModule", "⚠️ Model already initialized")
      val alreadyInitializedParams = Arguments.createMap()
      alreadyInitializedParams.putString("status", "Model already initialized")
      sendEvent("onPoseLandmarksStatus", alreadyInitializedParams)
      return
    }

    Log.d("PosedetectionModule", "🟡 Starting model initialization...")
    
    val resultListener = OutputHandler.ResultListener { result: PoseLandmarkerResult, inputImage: MPImage ->
      Log.d("PoseLandmarksFrameProcessor", "Detected ${result.landmarks().size} poses")
      
      val landmarksArray = Arguments.createArray()
      
      for (poseLandmarks in result.landmarks()) {
        val poseMap = Arguments.createArray()
        for ((index, landmark) in poseLandmarks.withIndex()) {
          val landmarkMap = Arguments.createMap()
          landmarkMap.putInt("keypoint", index)
          landmarkMap.putDouble("x", landmark.x().toDouble())
          landmarkMap.putDouble("y", landmark.y().toDouble())
          landmarkMap.putDouble("z", landmark.z().toDouble())
          landmarkMap.putDouble("visibility", landmark.visibility().orElse(0f).toDouble())
          landmarkMap.putDouble("presence", landmark.presence().orElse(0f).toDouble())
          poseMap.pushMap(landmarkMap)
        }
        landmarksArray.pushArray(poseMap)
      }
      
      val params = Arguments.createMap()
      params.putArray("landmarks", landmarksArray)
      sendEvent("onPoseLandmarksDetected", params)
    }

    try {
      val context: Context = reactApplicationContext
      val baseOptions = BaseOptions.builder()
        .setModelAssetPath("pose_landmarker_lite.task")
        .build()
      
      val poseLandmarkerOptions = PoseLandmarker.PoseLandmarkerOptions.builder()
        .setBaseOptions(baseOptions)
        .setNumPoses(1)
        .setRunningMode(RunningMode.LIVE_STREAM)
        .setMinTrackingConfidence(0.8f)
        .setMinPoseDetectionConfidence(0.8f)
        .setMinPosePresenceConfidence(0.8f)
        .setResultListener(resultListener)
        .build()
      
      PoseLandmarkerHolder.poseLandmarker = PoseLandmarker.createFromOptions(context, poseLandmarkerOptions)
      
      Log.d("PosedetectionModule", "✅ Model initialized successfully!")
      
      val successParams = Arguments.createMap()
      successParams.putString("status", "Model initialized successfully")
      sendEvent("onPoseLandmarksStatus", successParams)

    } catch (e: Exception) {
      Log.e("PosedetectionModule", "❌ Error: ${e.message}", e)
      
      val errorParams = Arguments.createMap()
      errorParams.putString("error", e.message ?: "Unknown error")
      sendEvent("onPoseLandmarksError", errorParams)
    }
  }

  @ReactMethod
  override fun addListener(eventName: String) {
    // Required for event emitter
  }

  @ReactMethod
  override fun removeListeners(count: Double) {
    // Required for event emitter
  }

  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

}
