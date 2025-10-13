package expo.modules.posedetection.poselandmarksframeprocessor

import android.util.Log
import expo.modules.posedetection.PoseLandmarkerHolder
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.framework.image.MPImage
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.VisionCameraProxy

class PoseLandmarksFrameProcessorPlugin(proxy: VisionCameraProxy, options: Map<String, Any>?): FrameProcessorPlugin() {
  override fun callback(frame: Frame, arguments: Map<String, Any>?): Any? {
    if (PoseLandmarkerHolder.poseLandmarker == null) {
      return "PoseLandmarker is not initialized" // Return early if initialization failed
    }

    try {
      val mpImage: MPImage = BitmapImageBuilder(frame.imageProxy.toBitmap()).build()

      val timestamp = frame.timestamp ?: System.currentTimeMillis()

      PoseLandmarkerHolder.poseLandmarker?.detectAsync(mpImage, timestamp)

      return "Frame processed successfully"
    } catch (e: Exception) {
      e.printStackTrace()
      Log.e("PoseLandmarksFrameProcessor", "Error processing frame: ${e.message}")
      return "Error processing frame: ${e.message}"
    }
  }
}
