package expo.modules.posedetection

import android.content.Context
import android.util.Log
import androidx.core.os.bundleOf
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.OutputHandler
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarkerResult
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry
import expo.modules.posedetection.poselandmarksframeprocessor.PoseLandmarksFrameProcessorPlugin

class ExpoPoseDetectionModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React Context not available")

  companion object {
    init {
      FrameProcessorPluginRegistry.addFrameProcessorPlugin("poseLandmarks") { proxy, options ->
        PoseLandmarksFrameProcessorPlugin(proxy, options)
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ExpoPoseDetection")

    // Events
    Events(
      "onPoseLandmarksDetected",
      "onPoseLandmarksStatus",
      "onPoseLandmarksError"
    )

    // ADD THIS: Lifecycle callbacks for event observation
    OnStartObserving("onPoseLandmarksDetected") {
      Log.d("ExpoPoseDetection", "Started observing pose landmarks")
      // Ensure model is initialized when JavaScript starts listening
      if (PoseLandmarkerHolder.poseLandmarker == null) {
        initModel()
      }
    }

    OnStopObserving("onPoseLandmarksDetected") {
      Log.d("ExpoPoseDetection", "Stopped observing pose landmarks")
    }

    // CHANGE THIS: Make initModel synchronous and call it on module creation
    OnCreate {
      Log.d("ExpoPoseDetection", "Module created, initializing model")
      initModel()
    }

    Function("hello") {
      "Hello react native! 👋"
    }
  }

  private fun initModel() {
    // REMOVE THIS CHECK - allow re-initialization
    // This was preventing the model from reinitializing on camera switch
    if (PoseLandmarkerHolder.poseLandmarker != null) {
      Log.d("ExpoPoseDetection", "Model already initialized")
      sendEvent("onPoseLandmarksStatus", bundleOf("status" to "Model already initialized"))
      return
    }

    val resultListener = OutputHandler.ResultListener { result: PoseLandmarkerResult, inputImage: MPImage ->
      Log.d("PoseLandmarksFrameProcessor", "Detected ${result.landmarks().size} poses")

      val landmarksArray = result.landmarks().map { poseLandmarks ->
        poseLandmarks.mapIndexed { index, landmark ->
          mapOf(
            "keypoint" to index,
            "x" to landmark.x().toDouble(),
            "y" to landmark.y().toDouble(),
            "z" to landmark.z().toDouble(),
            "visibility" to landmark.visibility().orElse(0f).toDouble(),
            "presence" to landmark.presence().orElse(0f).toDouble()
          )
        }
      }

      sendEvent("onPoseLandmarksDetected", bundleOf("landmarks" to landmarksArray))
    }

    try {
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

      PoseLandmarkerHolder.poseLandmarker =
        PoseLandmarker.createFromOptions(context, poseLandmarkerOptions)

      Log.d("ExpoPoseDetection", "Model initialized successfully")
      sendEvent("onPoseLandmarksStatus", bundleOf("status" to "Model initialized successfully"))
    } catch (e: Exception) {
      Log.e("PoseLandmarksFrameProcessor", "Error initializing PoseLandmarker", e)
      sendEvent("onPoseLandmarksError", bundleOf("error" to (e.message ?: "Unknown error")))
    }
  }
}
