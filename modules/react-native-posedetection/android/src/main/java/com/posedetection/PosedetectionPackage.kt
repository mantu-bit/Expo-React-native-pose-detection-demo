package com.posedetection

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import java.util.HashMap
import android.util.Log
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry

class PosedetectionPackage : BaseReactPackage() {
  
  companion object {
    private const val TAG = "POSE_TURBO"
    
    init {
      // Register frame processor plugin when package class is loaded
      Log.d(TAG, "🔌 Registering frame processor plugin: poseLandmarks")
      try {
        FrameProcessorPluginRegistry.addFrameProcessorPlugin("poseLandmarks") { proxy, options ->
          Log.d(TAG, "🎬 Creating PoseLandmarksFrameProcessorPlugin instance")
          PoseLandmarksFrameProcessorPlugin(proxy, options)
        }
        Log.d(TAG, "✅ Frame processor plugin registered successfully")
      } catch (e: Exception) {
        Log.e(TAG, "❌ Failed to register frame processor plugin: ${e.message}", e)
        e.printStackTrace()
      }
    }
  }

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    return if (name == PosedetectionModule.NAME) {
      PosedetectionModule(reactContext)
    } else {
      null
    }
  }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
    return ReactModuleInfoProvider {
      val moduleInfos: MutableMap<String, ReactModuleInfo> = HashMap()
      moduleInfos[PosedetectionModule.NAME] = ReactModuleInfo(
        PosedetectionModule.NAME,
        PosedetectionModule.NAME,
        false,  // canOverrideExistingModule
        false,  // needsEagerInit
        false,  // isCxxModule
        true // isTurboModule
      )
      moduleInfos
    }
  }
}
