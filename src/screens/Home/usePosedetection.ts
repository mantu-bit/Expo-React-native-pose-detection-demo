import { useEffect, useState, useCallback } from "react";
import {
  initModel,
  addPoseLandmarksListener,
  addPoseStatusListener,
  addPoseErrorListener,
  type PoseLandmark,
} from "../../../modules/expo-pose-detection";

export function usePoseDetection() {
  const [landmarks, setLandmarks] = useState<PoseLandmark[]>([]);
  const [status, setStatus] = useState<string>("Initializing...");
  const [error, setError] = useState<string | null>(null);
  const [poseCount, setPoseCount] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Subscribe to events
    const landmarksSubscription = addPoseLandmarksListener((event) => {
      if (mounted) {
        setLandmarks(event.landmarks[0]);
        // setPoseCount((prev) => prev + 1);
      }
    });

    const statusSubscription = addPoseStatusListener((event) => {
      if (mounted) {
        setStatus(event.status);
      }
    });

    const errorSubscription = addPoseErrorListener((event) => {
      if (mounted) {
        setError(event.error);
      }
    });

    // Cleanup
    return () => {
      mounted = false;
      landmarksSubscription.remove();
      statusSubscription.remove();
      errorSubscription.remove();
    };
  }, []);

  const resetCount = useCallback(() => {
    setPoseCount(0);
  }, []);

  return {
    landmarks,
    status,
    error,
    poseCount,
    isInitialized,
    resetCount,
  };
}
