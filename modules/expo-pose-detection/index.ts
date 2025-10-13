import { EventSubscription } from "expo-modules-core";
import { ExpoPoseDetectionModule } from "./src/ExpoPoseDetectionModule";
import type {
  PoseLandmark,
  PoseLandmarksDetectedEvent,
  PoseStatusEvent,
  PoseErrorEvent,
} from "./src/ExpoPoseDetectionHandler.types";

// Re-export types
export type {
  PoseLandmark,
  PoseLandmarksDetectedEvent,
  PoseStatusEvent,
  PoseErrorEvent,
};

// Export simple function
export function hello(): string {
  return ExpoPoseDetectionModule.hello();
}

// Export async function
export async function initModel(): Promise<void> {
  return await ExpoPoseDetectionModule.initModel();
}

// Event listener helpers
export function addPoseLandmarksListener(
  listener: (event: PoseLandmarksDetectedEvent) => void
): EventSubscription {
  return ExpoPoseDetectionModule.addListener(
    "onPoseLandmarksDetected",
    listener
  );
}

export function addPoseStatusListener(
  listener: (event: PoseStatusEvent) => void
): EventSubscription {
  return ExpoPoseDetectionModule.addListener("onPoseLandmarksStatus", listener);
}

export function addPoseErrorListener(
  listener: (event: PoseErrorEvent) => void
): EventSubscription {
  return ExpoPoseDetectionModule.addListener("onPoseLandmarksError", listener);
}

// Remove all listeners for a specific event
export function removePoseLandmarksListeners(): void {
  ExpoPoseDetectionModule.removeAllListeners("onPoseLandmarksDetected");
}

export function removePoseStatusListeners(): void {
  ExpoPoseDetectionModule.removeAllListeners("onPoseLandmarksStatus");
}

export function removePoseErrorListeners(): void {
  ExpoPoseDetectionModule.removeAllListeners("onPoseLandmarksError");
}

// Export the raw module for advanced usage
export { ExpoPoseDetectionModule };
