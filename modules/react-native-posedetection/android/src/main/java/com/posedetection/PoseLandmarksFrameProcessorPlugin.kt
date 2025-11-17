package com.posedetection

import android.util.Log
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.framework.image.MPImage
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.VisionCameraProxy

class PoseLandmarksFrameProcessorPlugin(
    proxy: VisionCameraProxy,
    options: Map<String, Any>?
) : FrameProcessorPlugin() {

  companion object {
    private const val TAG = "POSE_TURBO"
    private var frameCount = 0
  }

  override fun callback(frame: Frame, arguments: Map<String, Any>?): String {
    frameCount++
    
    // Log first frame and every 30th frame
    if (frameCount == 1 || frameCount % 30 == 0) {
      Log.d(TAG, "🎥 Frame processor called - frame #$frameCount")
    }

    return try {
      if (PoseLandmarkerHolder.poseLandmarker == null) {
        if (frameCount % 30 == 0) {
          Log.w(TAG, "⚠️ PoseLandmarker not initialized")
        }
        return "Model not initialized"
      }

      var mpImage: MPImage? = null
      try {
        mpImage = BitmapImageBuilder(frame.imageProxy.toBitmap()).build()
        val timestamp = System.currentTimeMillis()
        
        if (frameCount % 30 == 0) {
          Log.d(TAG, "🔄 Calling detectAsync with timestamp: $timestamp")
        }
        
        PoseLandmarkerHolder.poseLandmarker?.detectAsync(mpImage, timestamp)
        
        "OK"
      } finally {
        mpImage?.close()
      }

    } catch (e: Exception) {
      Log.e(TAG, "❌ Frame processor error: ${e.message}", e)
      e.printStackTrace()
      "ERROR: ${e.message}"
    }
  }
}
