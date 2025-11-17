import type { EventSubscription } from "react-native";
import Posedetection from "./NativePosedetection";

export function multiply(a: number, b: number): number {
  return Posedetection.multiply(a, b);
}

export function initModel(): Promise<string> {
  // ← FIXED: Now returns Promise
  return Posedetection.initModel();
}

export function testEmit(): void {
  return Posedetection.testEmit();
}

export function triggerMockDetection(): void {
  return Posedetection.triggerMockDetection();
}

// Type definitions (unchanged)
export interface PoseLandmark {
  keypoint: number;
  x: number;
  y: number;
  z: number;
  visibility: number;
  presence: number;
}

export interface PoseLandmarksResult {
  landmarks: PoseLandmark[][];
}

export interface PoseStatusEvent {
  status: string;
}

export interface PoseErrorEvent {
  error: string;
}

// FIXED: All listeners use direct TurboModule .onEventName(callback) – no NativeEventEmitter!
export function addPoseLandmarksListener(
  callback: (result: PoseLandmarksResult) => void
): EventSubscription {
  return Posedetection.onPoseLandmarksDetected((data) => {
    console.log("🟢 PoseLandmarks event data:", data); // Add log for debugging
    callback(data as PoseLandmarksResult);
  });
}

export function addPoseStatusListener(
  callback: (status: PoseStatusEvent) => void
): EventSubscription {
  return Posedetection.onPoseLandmarksStatus((data) => {
    console.log("🔵 Status event data:", data); // Keep your log
    callback(data as PoseStatusEvent);
  });
}

export function addPoseErrorListener(
  callback: (error: PoseErrorEvent) => void
): EventSubscription {
  return Posedetection.onPoseLandmarksError((data) => {
    console.log("❌ Error event data:", data); // Add log for consistency
    callback(data as PoseErrorEvent);
  });
}
