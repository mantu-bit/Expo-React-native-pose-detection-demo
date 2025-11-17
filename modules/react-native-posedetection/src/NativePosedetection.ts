import { TurboModuleRegistry } from "react-native";
import type { TurboModule } from "react-native";
import type { EventEmitter } from "react-native/Libraries/Types/CodegenTypes";

export type PoseLandmark = {
  keypoint: number;
  x: number;
  y: number;
  z: number;
  visibility: number;
  presence: number;
};

export type PoseLandmarksPayload = {
  landmarks: PoseLandmark[][];
};

export type StatusPayload = {
  status: string;
};

export type ErrorPayload = {
  error: string;
};

export interface Spec extends TurboModule {
  multiply(a: number, b: number): number;
  initModel(): Promise<string>;
  testEmit(): void;
  triggerMockDetection(): void;
  // REQUIRED: Add these for event support (no-op in native, but spec hooks)
  addListener(eventName: string): void;
  removeListeners(count: number): void;

  // Event emitters
  readonly onPoseLandmarksDetected: EventEmitter<PoseLandmarksPayload>;
  readonly onPoseLandmarksStatus: EventEmitter<StatusPayload>;
  readonly onPoseLandmarksError: EventEmitter<ErrorPayload>;
}

export default TurboModuleRegistry.getEnforcing<Spec>("Posedetection");
