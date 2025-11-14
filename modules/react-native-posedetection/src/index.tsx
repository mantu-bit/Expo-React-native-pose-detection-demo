// import Posedetection from './NativePosedetection';

// export function multiply(a: number, b: number): number {
//   return Posedetection.multiply(a, b);
// }

import { NativeEventEmitter, NativeModules } from "react-native";
import type { EventSubscription } from "react-native";
import Posedetection from "./NativePosedetection";

// Create event emitter for pose detection events
const poseDetectionEmitter = new NativeEventEmitter(
  NativeModules.Posedetection
);

export function multiply(a: number, b: number): number {
  return Posedetection.multiply(a, b);
}

export function initModel(): void {
  return Posedetection.initModel();
}

// Type definitions
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

// Event listener helpers with modern EventSubscription
export function addPoseLandmarksListener(
  callback: (result: PoseLandmarksResult) => void
): EventSubscription {
  return poseDetectionEmitter.addListener(
    "onPoseLandmarksDetected",
    (data: unknown) => callback(data as PoseLandmarksResult)
  );
}

export function addPoseStatusListener(
  callback: (status: PoseStatusEvent) => void
): EventSubscription {
  return poseDetectionEmitter.addListener(
    "onPoseLandmarksStatus",
    (data: unknown) => callback(data as PoseStatusEvent)
  );
}

export function addPoseErrorListener(
  callback: (error: PoseErrorEvent) => void
): EventSubscription {
  return poseDetectionEmitter.addListener(
    "onPoseLandmarksError",
    (data: unknown) => callback(data as PoseErrorEvent)
  );
}
