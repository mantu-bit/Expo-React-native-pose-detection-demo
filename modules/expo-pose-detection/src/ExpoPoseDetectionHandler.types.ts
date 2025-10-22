export type PoseLandmark = {
  keypoint: number;
  x: number;
  y: number;
  z: number;
  visibility: number;
  presence: number;
};

export type PoseLandmarksDetectedEvent = {
  landmarks: PoseLandmark[][];
};

export type PoseStatusEvent = {
  status: string;
};

export type PoseErrorEvent = {
  error: string;
};

export type ExpoPoseDetectionModuleEvents = {
  onPoseLandmarksDetected(event: PoseLandmarksDetectedEvent): void;
  onPoseLandmarksStatus(event: PoseStatusEvent): void;
  onPoseLandmarksError(event: PoseErrorEvent): void;
};

export interface ExpoPoseDetectionHandler {
  hello(): string;
  addListener(
    eventName: keyof ExpoPoseDetectionModuleEvents,
    listener: (event: any) => void
  ): { remove: () => void };
  removeAllListeners(eventName: keyof ExpoPoseDetectionModuleEvents): void;
}
