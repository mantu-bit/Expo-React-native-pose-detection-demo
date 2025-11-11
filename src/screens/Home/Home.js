// Home.js - WITH STABLE ORIENTATION DETECTION
import { Alert, Platform, Text, View } from "react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Button } from "@/components";
import { fonts } from "@/theme";
import { ms } from "@/utils";
import { useDispatch, useSelector } from "react-redux";
import { logout } from "@/redux/actions/authAction";
import { Skia } from "@shopify/react-native-skia";
import {
  addPoseLandmarksListener,
  addPoseStatusListener,
  addPoseErrorListener,
} from "../../../modules/expo-pose-detection";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useSkiaFrameProcessor,
  VisionCameraProxy,
} from "react-native-vision-camera";
import { useSharedValue } from "react-native-worklets-core";
import HumanOutline from "./HumanOutline";
import { isPointInPolygon, mapViewBoxPtsToPixels } from "./geometry";
import { VIEWBOX_POLY, VIEWBOX_W, VIEWBOX_H } from "./humanOutlinePoly";
import * as MediaLibrary from "expo-media-library";

/* ---------- One-Euro temporal smoothing (adaptive low-pass) ---------- */
class LowPass {
  y = null;
  filter(x, a) {
    this.y = this.y == null ? x : this.y + a * (x - this.y);
    return this.y;
  }
}
class OneEuro {
  constructor({ freq = 60, minCutoff = 1.0, beta = 0.02, dCutoff = 1.0 } = {}) {
    this.freq = freq;
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xHat = new LowPass();
    this.dxHat = new LowPass();
    this.lastTime = 0;
  }
  alpha(cutoff, dt) {
    const te = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + te / dt);
  }
  filter(x, tNowMs) {
    const dt = this.lastTime ? (tNowMs - this.lastTime) / 1000 : 1 / this.freq;
    this.lastTime = tNowMs;
    const prev = this.xHat.y == null ? x : this.xHat.y;
    const dx = (x - prev) / (dt || 1 / this.freq);
    const aD = this.alpha(this.dCutoff, dt || 1 / this.freq);
    const dxHat = this.dxHat.filter(dx, aD);
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat ?? 0);
    const aX = this.alpha(cutoff, dt || 1 / this.freq);
    return this.xHat.filter(x, aX);
  }
}

/* ---------- Math helpers ---------- */
const dot = (a, b) => a.x * b.x + a.y * b.y + (a.z ?? 0) * (b.z ?? 0);
const mag = (v) => Math.sqrt(Math.max(0, dot(v, v)));
const subtract = (a, b) => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: (a.z ?? 0) - (b.z ?? 0),
});

/* ---------- Calculate angle between 3 points ---------- */
const calculateAngle = (point1, point2, point3) => {
  const vector1 = {
    x: point1.x - point2.x,
    y: point1.y - point2.y,
  };
  const vector2 = {
    x: point3.x - point2.x,
    y: point3.y - point2.y,
  };
  const angle1 = Math.atan2(vector1.y, vector1.x);
  const angle2 = Math.atan2(vector2.y, vector2.x);
  let angleDegrees = Math.abs((angle1 - angle2) * (180 / Math.PI));
  if (angleDegrees > 180) {
    angleDegrees = 360 - angleDegrees;
  }
  return angleDegrees;
};

const getVisibility = (p) => {
  if (!p) return 0;
  if (typeof p.visibility === "number") return p.visibility;
  if (typeof p.score === "number") return p.score;
  if (typeof p.x === "number" && typeof p.y === "number") return 0.9;
  return 0;
};

const normalizeBodyArray = (body) => {
  if (!body) return null;
  if (Array.isArray(body)) {
    if (body.length >= 33) return body;
    const arr = new Array(33).fill(null);
    for (let i = 0; i < body.length; i++) arr[i] = body[i];
    return arr;
  }
  const arr = new Array(33).fill(null);
  Object.keys(body).forEach((k) => {
    const idx = parseInt(k, 10);
    if (!Number.isNaN(idx) && idx >= 0 && idx < 33) arr[idx] = body[k];
  });
  return arr;
};

/* ---------- CORE DETECTION LOGIC ---------- */
const MIN_VIS = 0.5;
const LEG_ANGLE_MIN = 160;
const SHOULDER_DIST_FRONT = 0.08;
const SHOULDER_DIST_SIDE = 0.06;
const DEPTH_THRESHOLD = 0.02;

/* Standing detection - WORKING VERSION */
const isStanding = (landmarks) => {
  if (!landmarks || landmarks.length < 33)
    return { standing: false, details: {} };

  const leftHip = landmarks[23];
  const leftKnee = landmarks[25];
  const leftAnkle = landmarks[27];
  const rightHip = landmarks[24];
  const rightKnee = landmarks[26];
  const rightAnkle = landmarks[28];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const nose = landmarks[0];

  const keyPointsVisible = [
    leftHip,
    leftKnee,
    leftAnkle,
    rightHip,
    rightKnee,
    rightAnkle,
    leftShoulder,
    rightShoulder,
  ].every((p) => p && getVisibility(p) > MIN_VIS);

  if (!keyPointsVisible) {
    return { standing: false, details: { reason: "Low visibility" } };
  }

  const leftLegAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
  const rightLegAngle = calculateAngle(rightHip, rightKnee, rightAnkle);

  const legsStrait =
    leftLegAngle >= LEG_ANGLE_MIN && rightLegAngle >= LEG_ANGLE_MIN;

  if (!legsStrait) {
    return {
      standing: false,
      details: {
        reason: "Legs not straight",
        leftLegAngle: leftLegAngle.toFixed(1),
        rightLegAngle: rightLegAngle.toFixed(1),
        legsStrait: false,
      },
    };
  }

  const headCandidates = [nose?.y, leftShoulder.y, rightShoulder.y].filter(
    (y) => y != null
  );
  const headY =
    headCandidates.length > 0
      ? Math.min(...headCandidates)
      : Math.min(leftShoulder.y, rightShoulder.y);
  const feetY = Math.max(leftAnkle.y, rightAnkle.y);
  const heightSpan = Math.abs(feetY - headY);

  const veryStraitLegs = leftLegAngle >= 170 && rightLegAngle >= 170;
  const relaxedHeightCheck = veryStraitLegs
    ? heightSpan > 0.15
    : heightSpan > 0.25;

  if (veryStraitLegs && relaxedHeightCheck) {
    return {
      standing: true,
      details: {
        leftLegAngle: leftLegAngle.toFixed(1),
        rightLegAngle: rightLegAngle.toFixed(1),
        legsStrait: true,
        veryStraitLegs: true,
        heightSpan: heightSpan.toFixed(2),
        tallEnough: true,
        bypassedVerticalCheck: true,
        reason: "Very straight legs - STANDING",
      },
    };
  }

  const MARGIN = 0.08;
  const leftKneeInMiddle =
    leftKnee.y > leftHip.y - MARGIN && leftKnee.y < leftAnkle.y + MARGIN;
  const rightKneeInMiddle =
    rightKnee.y > rightHip.y - MARGIN && rightKnee.y < rightAnkle.y + MARGIN;
  const generalVerticalOk = leftKneeInMiddle || rightKneeInMiddle;

  const standing = legsStrait && relaxedHeightCheck && generalVerticalOk;

  return {
    standing,
    details: {
      leftLegAngle: leftLegAngle.toFixed(1),
      rightLegAngle: rightLegAngle.toFixed(1),
      legsStrait,
      veryStraitLegs,
      leftKneeInMiddle,
      rightKneeInMiddle,
      generalVerticalOk,
      heightSpan: heightSpan.toFixed(2),
      tallEnough: relaxedHeightCheck,
      bypassedVerticalCheck: false,
      reason: standing
        ? "All checks passed"
        : `Failed: height=${relaxedHeightCheck}, vertical=${generalVerticalOk}`,
    },
  };
};

/* Orientation detection - STABILIZED VERSION */
const detectOrientation = (landmarks) => {
  if (!landmarks || landmarks.length < 33) {
    return { orientation: "unknown", confidence: 0, details: {} };
  }

  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftEar = landmarks[7];
  const rightEar = landmarks[8];
  const nose = landmarks[0];

  if (
    [leftShoulder, rightShoulder, leftHip, rightHip].some(
      (p) => !p || getVisibility(p) < 0.4
    )
  ) {
    return {
      orientation: "unknown",
      confidence: 0,
      details: { reason: "Low visibility" },
    };
  }

  const shoulderDistance = Math.abs(leftShoulder.x - rightShoulder.x);
  const hipDistance = Math.abs(leftHip.x - rightHip.x);
  const leftVisibility =
    (getVisibility(leftShoulder) + getVisibility(leftHip)) / 2;
  const rightVisibility =
    (getVisibility(rightShoulder) + getVisibility(rightHip)) / 2;
  const leftEarVis = getVisibility(leftEar);
  const rightEarVis = getVisibility(rightEar);
  const noseVis = getVisibility(nose);
  const shoulderZDiff = (leftShoulder.z ?? 0) - (rightShoulder.z ?? 0);
  const hipZDiff = (leftHip.z ?? 0) - (rightHip.z ?? 0);
  const avgZDiff = (shoulderZDiff + hipZDiff) / 2;

  let orientation = "unknown";
  let confidence = 0;
  let reason = "";

  // SLIGHTLY STRICTER thresholds for stability
  const FRONT_SHOULDER_MIN = 0.1; // Increased from 0.08
  const SIDE_SHOULDER_MAX = 0.07; // Increased from 0.06
  const DEPTH_MIN = 0.02; // Increased from 0.015
  const VIS_DIFF_MIN = 0.1; // Increased from 0.08

  const isFrontByDistance =
    shoulderDistance > FRONT_SHOULDER_MIN &&
    hipDistance > FRONT_SHOULDER_MIN * 0.7;
  const isFrontBySymmetry = Math.abs(leftVisibility - rightVisibility) < 0.12;
  const isFrontByDepth = Math.abs(avgZDiff) < DEPTH_MIN;
  const isFrontByFace =
    noseVis > 0.5 && (leftEarVis > 0.3 || rightEarVis > 0.3);

  const frontScore =
    (isFrontByDistance ? 1 : 0) +
    (isFrontBySymmetry ? 1 : 0) +
    (isFrontByDepth ? 1 : 0) +
    (isFrontByFace ? 1 : 0);

  if (frontScore >= 3) {
    orientation = "front";
    confidence = 0.88 + frontScore * 0.03;
    reason = `Front indicators: ${frontScore}/4`;
  } else if (
    shoulderDistance < SIDE_SHOULDER_MAX &&
    (avgZDiff > DEPTH_MIN || rightVisibility > leftVisibility + VIS_DIFF_MIN)
  ) {
    orientation = "left";
    confidence = 0.82 + Math.min(0.12, Math.abs(avgZDiff) * 5);
    reason = "Right side prominent (left facing)";
  } else if (
    shoulderDistance < SIDE_SHOULDER_MAX &&
    (avgZDiff < -DEPTH_MIN || leftVisibility > rightVisibility + VIS_DIFF_MIN)
  ) {
    orientation = "right";
    confidence = 0.82 + Math.min(0.12, Math.abs(avgZDiff) * 5);
    reason = "Left side prominent (right facing)";
  } else if (
    Math.abs(leftVisibility - rightVisibility) < 0.15 &&
    noseVis > 0.4
  ) {
    orientation = "front";
    confidence = 0.7;
    reason = "Symmetric visibility + face visible (fallback)";
  } else if (rightVisibility > leftVisibility + 0.15) {
    orientation = "left";
    confidence = 0.68;
    reason = "Right more visible (fallback)";
  } else if (leftVisibility > rightVisibility + 0.15) {
    orientation = "right";
    confidence = 0.68;
    reason = "Left more visible (fallback)";
  }

  return {
    orientation,
    confidence,
    details: {
      shoulderDistance: shoulderDistance.toFixed(3),
      hipDistance: hipDistance.toFixed(3),
      leftVisibility: leftVisibility.toFixed(2),
      rightVisibility: rightVisibility.toFixed(2),
      shoulderZDiff: shoulderZDiff.toFixed(3),
      hipZDiff: hipZDiff.toFixed(3),
      avgZDiff: avgZDiff.toFixed(3),
      noseVis: noseVis.toFixed(2),
      leftEarVis: leftEarVis.toFixed(2),
      rightEarVis: rightEarVis.toFixed(2),
      frontScore,
      isFrontByDistance,
      isFrontBySymmetry,
      isFrontByDepth,
      isFrontByFace,
      reason,
    },
  };
};

/* Main detection function */
const detectStandingPose = (rawBody, setMetrics) => {
  const body = normalizeBodyArray(rawBody);

  if (!body) {
    setMetrics({
      standing: false,
      orientation: "unknown",
      confidence: 0,
      standingDetails: {},
      orientationDetails: {},
    });
    return {
      pose: "NOT_DETECTED",
      orientation: "unknown",
      confidence: 0,
    };
  }

  const standingResult = isStanding(body);

  if (!standingResult.standing) {
    setMetrics({
      standing: false,
      orientation: "unknown",
      confidence: 0,
      standingDetails: standingResult.details,
      orientationDetails: {},
    });
    return {
      pose: "NOT_STANDING",
      orientation: "unknown",
      confidence: 0,
      standingDetails: standingResult.details,
    };
  }

  const orientationResult = detectOrientation(body);
  const overallConfidence = orientationResult.confidence;

  setMetrics({
    standing: true,
    orientation: orientationResult.orientation,
    confidence: (overallConfidence * 100).toFixed(0),
    standingDetails: standingResult.details,
    orientationDetails: orientationResult.details,
  });

  return {
    pose: "STANDING",
    orientation: orientationResult.orientation,
    confidence: overallConfidence,
    standingDetails: standingResult.details,
    orientationDetails: orientationResult.details,
  };
};

/* ---------- Drawing assets ---------- */
const LINES = [
  [0, 1],
  [0, 4],
  [1, 2],
  [2, 3],
  [3, 7],
  [4, 5],
  [5, 6],
  [6, 8],
  [9, 10],
  [11, 12],
  [11, 13],
  [11, 23],
  [12, 14],
  [12, 24],
  [13, 15],
  [15, 17],
  [15, 19],
  [15, 21],
  [17, 19],
  [14, 16],
  [16, 18],
  [16, 20],
  [16, 22],
  [18, 20],
  [23, 24],
  [23, 25],
  [24, 26],
  [25, 27],
  [26, 28],
  [27, 29],
  [27, 31],
  [29, 31],
  [28, 30],
  [28, 32],
  [30, 32],
];
const linePaint = Skia.Paint();
linePaint.setColor(Skia.Color("red"));
linePaint.setStrokeWidth(8);
const circlePaint = Skia.Paint();
circlePaint.setColor(Skia.Color("cyan"));
circlePaint.setStrokeWidth(1);

const poseLandMarkPlugin = VisionCameraProxy.initFrameProcessorPlugin(
  "poseLandmarks",
  {}
);
function poseLandmarks(frame) {
  "worklet";
  if (poseLandMarkPlugin == null)
    throw new Error("Failed to load Frame Processor Plugin!");
  return poseLandMarkPlugin.call(frame);
}

const TEST_POINTS = [0, 11, 12, 23, 24, 25, 26, 27, 28, 15, 16];
const MIN_SCORE = 0.4;
const COVERAGE_REQ = 0.75;
const HOLD_FRAMES = 25; // INCREASED from 15 to 25 for more stability
const CAPTURE_COOLDOWN = 3000;
const ORIENTATION_STABILITY_FRAMES = 8; // NEW: Must hold orientation for 8 frames

const Home = () => {
  const { theme } = useUnistyles();
  const { user } = useSelector((state) => state.user);
  const dispatch = useDispatch();

  const landmarks = useSharedValue({});
  const { hasPermission, requestPermission } = useCameraPermission();
  const [cameraPosition, setCameraPosition] = useState("front");
  const [showLines, setShowLines] = useState(true);
  const [showCircles, setShowCircles] = useState(true);
  const [showDebug, setShowDebug] = useState(true);
  const cameraRef = useRef(null);
  const device = useCameraDevice(cameraPosition);
  const pixelFormat = Platform.OS === "ios" ? "rgb" : "yuv";
  const [mediaPermission, requestMediaPermission] =
    MediaLibrary.usePermissions();

  const [detectionState, setDetectionState] = useState({
    standing: false,
    orientation: "unknown",
    confidence: 0,
  });

  const holdCountRef = useRef({
    front: 0,
    left: 0,
    right: 0,
  });

  const capturedPosesRef = useRef({
    front: false,
    left: false,
    right: false,
  });

  const lastCaptureTimeRef = useRef(0);
  const isCapturingRef = useRef(false);

  // NEW: Orientation stability tracking
  const orientationHistoryRef = useRef([]);
  const stableOrientationRef = useRef("unknown");

  const [metrics, setMetrics] = useState({
    standing: false,
    orientation: "unknown",
    confidence: 0,
    standingDetails: {},
    orientationDetails: {},
  });

  const [inFrameCoverage, setInFrameCoverage] = useState(0);
  const [svgBox, setSvgBox] = useState({ x: 0, y: 0, w: 0, h: 0 });

  const pixelPoly = useMemo(() => {
    if (!svgBox.w || !svgBox.h) return [];
    return mapViewBoxPtsToPixels(
      VIEWBOX_POLY,
      VIEWBOX_W,
      VIEWBOX_H,
      svgBox.x,
      svgBox.y,
      svgBox.w,
      svgBox.h
    );
  }, [svgBox]);

  useEffect(() => {
    const landmarksSubscription = addPoseLandmarksListener((event) => {
      landmarks.value = event.landmarks[0];
    });
    const statusSubscription = addPoseStatusListener(() => {});
    const errorSubscription = addPoseErrorListener((event) => {
      console.error("Pose detection error:", event.error);
    });
    return () => {
      landmarksSubscription.remove();
      statusSubscription.remove();
      errorSubscription.remove();
    };
  }, []);

  useEffect(() => {
    requestPermission()
      .then(() => {
        requestMediaPermission().catch((e) => console.log(e));
      })
      .catch((e) => console.log(e));
  }, [requestPermission]);

  const capturePhoto = async (poseType) => {
    if (!cameraRef.current || isCapturingRef.current) return;
    const now = Date.now();
    if (now - lastCaptureTimeRef.current < CAPTURE_COOLDOWN) return;

    if (capturedPosesRef.current[poseType]) {
      console.log(`${poseType} pose already captured, skipping...`);
      return;
    }

    try {
      isCapturingRef.current = true;
      lastCaptureTimeRef.current = now;
      const photo = await cameraRef.current.takePhoto({
        qualityPrioritization: "balanced",
        flash: "off",
        enableShutterSound: true,
      });
      if (!mediaPermission?.granted) {
        const { status } = await requestMediaPermission();
        if (status !== "granted") {
          Alert.alert(
            "Permission Required",
            "Please grant media library access to save photos"
          );
          return;
        }
      }
      await MediaLibrary.createAssetAsync(photo.path);

      capturedPosesRef.current[poseType] = true;

      Alert.alert(
        "Success!",
        `${poseType.toUpperCase()} pose photo saved to gallery`
      );

      const allCaptured =
        capturedPosesRef.current.front &&
        capturedPosesRef.current.left &&
        capturedPosesRef.current.right;

      if (allCaptured) {
        Alert.alert("Complete!", "All three poses captured successfully!");
      }
    } catch (error) {
      console.error("Photo capture/save error:", error);
      Alert.alert("Error", `Failed to save photo: ${error?.message ?? error}`);
    } finally {
      isCapturingRef.current = false;
    }
  };

  const filtersRef = useRef({});
  const smoothBody = (body) => {
    const t = Date.now();
    return body.map((kp, i) => {
      if (!kp || typeof kp.x !== "number" || typeof kp.y !== "number")
        return kp;
      if (!filtersRef.current[i]) {
        filtersRef.current[i] = {
          x: new OneEuro({ minCutoff: 1.0, beta: 0.02 }),
          y: new OneEuro({ minCutoff: 1.0, beta: 0.02 }),
          z: new OneEuro({ minCutoff: 1.0, beta: 0.02 }),
        };
      }
      const f = filtersRef.current[i];
      return {
        ...kp,
        x: f.x.filter(kp.x, t),
        y: f.y.filter(kp.y, t),
        z: typeof kp.z === "number" ? f.z.filter(kp.z, t) : kp.z,
      };
    });
  };

  useEffect(() => {
    let raf;
    const tick = () => {
      const bodyRaw = landmarks?.value;
      const bodyNorm = normalizeBodyArray(bodyRaw);
      const body = bodyNorm ? smoothBody(bodyNorm) : null;

      if (!pixelPoly.length || !body) {
        holdCountRef.current = { front: 0, left: 0, right: 0 };
        orientationHistoryRef.current = [];
        stableOrientationRef.current = "unknown";
        setInFrameCoverage(0);
        raf = requestAnimationFrame(tick);
        return;
      }

      const frameW = svgBox.w,
        frameH = svgBox.h;
      let tested = 0,
        inside = 0;
      for (const idx of TEST_POINTS) {
        const kp = body[idx];
        if (
          !kp ||
          typeof kp.x !== "number" ||
          typeof kp.y !== "number" ||
          getVisibility(kp) < MIN_SCORE
        )
          continue;
        const normX = cameraPosition === "front" ? 1 - kp.x : kp.x;
        const p = { x: normX * frameW + svgBox.x, y: kp.y * frameH + svgBox.y };
        tested++;
        if (isPointInPolygon(p, pixelPoly)) inside++;
      }
      const inFrameOk = tested > 0 && inside / tested >= COVERAGE_REQ;
      const coverage = tested > 0 ? ((inside / tested) * 100).toFixed(1) : 0;
      setInFrameCoverage(parseFloat(coverage));

      const result = detectStandingPose(body, setMetrics);

      // NEW: Orientation stability logic
      if (result.pose === "STANDING" && result.orientation !== "unknown") {
        // Add to history
        orientationHistoryRef.current.push(result.orientation);

        // Keep only last ORIENTATION_STABILITY_FRAMES entries
        if (
          orientationHistoryRef.current.length > ORIENTATION_STABILITY_FRAMES
        ) {
          orientationHistoryRef.current.shift();
        }

        // Check if all recent frames agree
        if (
          orientationHistoryRef.current.length >= ORIENTATION_STABILITY_FRAMES
        ) {
          const allSame = orientationHistoryRef.current.every(
            (o) => o === orientationHistoryRef.current[0]
          );

          if (allSame) {
            stableOrientationRef.current = orientationHistoryRef.current[0];
          }
        }
      } else {
        // Reset if not standing or orientation unknown
        orientationHistoryRef.current = [];
        stableOrientationRef.current = "unknown";
      }

      // Use stable orientation for state
      const finalOrientation = stableOrientationRef.current;

      setDetectionState({
        standing: result.pose === "STANDING",
        orientation: finalOrientation,
        confidence: result.confidence,
      });

      // Capture logic uses stable orientation
      if (
        result.pose === "STANDING" &&
        finalOrientation !== "unknown" &&
        result.confidence > 0.7 && // Slightly increased threshold
        inFrameOk
      ) {
        const orientation = finalOrientation;

        holdCountRef.current[orientation]++;

        Object.keys(holdCountRef.current).forEach((key) => {
          if (key !== orientation) {
            holdCountRef.current[key] = 0;
          }
        });

        if (holdCountRef.current[orientation] >= HOLD_FRAMES) {
          if (!capturedPosesRef.current[orientation]) {
            console.log(
              `Capturing ${orientation} pose (held for ${holdCountRef.current[orientation]} frames)...`
            );
            capturePhoto(orientation);
          }
          holdCountRef.current[orientation] = 0;
        }
      } else {
        holdCountRef.current = { front: 0, left: 0, right: 0 };
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pixelPoly, svgBox, cameraPosition]);

  const frameProcessor = useSkiaFrameProcessor(
    (frame) => {
      "worklet";
      try {
        frame.render();
        poseLandmarks(frame);
        const body = landmarks?.value;
        if (!body) return;

        const fw = frame.width,
          fh = frame.height;
        if (showLines) {
          for (let [from, to] of LINES) {
            const a = body[from],
              b = body[to];
            if (!a || !b || typeof a.x !== "number" || typeof b.x !== "number")
              continue;
            frame.drawLine(a.x * fw, a.y * fh, b.x * fw, b.y * fh, linePaint);
          }
        }
        if (showCircles) {
          for (let kp of Object.values(body)) {
            if (kp && typeof kp.x === "number" && typeof kp.y === "number") {
              frame.drawCircle(kp.x * fw, kp.y * fh, 4, circlePaint);
            }
          }
        }
      } catch (e) {
        console.error("Frame processor error:", e);
      }
    },
    [showLines, showCircles]
  );

  if (!hasPermission || !device) {
    return <Text>No permission</Text>;
  }

  const outlineColor =
    detectionState.standing && detectionState.orientation !== "unknown"
      ? "#22c55e"
      : "#FFFFFF";

  const getFacingEmoji = (dir) => {
    switch (dir) {
      case "front":
        return "👤";
      case "left":
        return "⬅️";
      case "right":
        return "➡️";
      default:
        return "❓";
    }
  };

  const getCaptureStatus = () => {
    const captured = capturedPosesRef.current;
    return `${captured.front ? "✅" : "⬜"} Front | ${
      captured.left ? "✅" : "⬜"
    } Left | ${captured.right ? "✅" : "⬜"} Right`;
  };

  const getHoldProgress = () => {
    const current = holdCountRef.current;
    const max = Object.values(current).reduce((a, b) => Math.max(a, b), 0);
    if (max === 0) return "";
    const pct = ((max / HOLD_FRAMES) * 100).toFixed(0);
    return `Hold: ${max}/${HOLD_FRAMES} (${pct}%)`;
  };

  return (
    <>
      <View style={styles.drawControl}>
        <Button
          title="Flip"
          onPress={() =>
            setCameraPosition((p) => (p === "front" ? "back" : "front"))
          }
        />
        <Button
          title={showDebug ? "Hide" : "Show"}
          onPress={() => setShowDebug(!showDebug)}
        />
        <Button
          title="Reset"
          onPress={() => {
            capturedPosesRef.current = {
              front: false,
              left: false,
              right: false,
            };
            holdCountRef.current = { front: 0, left: 0, right: 0 };
            orientationHistoryRef.current = [];
            stableOrientationRef.current = "unknown";
            Alert.alert("Reset", "Capture status reset");
          }}
        />
      </View>

      <Camera
        ref={cameraRef}
        style={{ flex: 1 }}
        device={device}
        isActive
        photo={true}
        pixelFormat={pixelFormat}
        frameProcessor={frameProcessor}
      />

      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
        pointerEvents="none"
      >
        <View
          onLayout={(e) => {
            const { x, y, width, height } = e.nativeEvent.layout;
            setSvgBox({ x, y, w: width, h: height });
          }}
        >
          <HumanOutline
            stroke={outlineColor}
            strokeWidth={2}
            fill="rgba(255,255,255,0.04)"
          />
        </View>
      </View>

      {showDebug && (
        <View style={styles.debugPanel}>
          <Text style={styles.debugTitle}>🎯 Status</Text>
          <Text style={styles.debugText}>
            Standing: {detectionState.standing ? "✅" : "❌"}
          </Text>
          <Text style={styles.debugText}>
            Orientation: {getFacingEmoji(detectionState.orientation)}{" "}
            {detectionState.orientation.toUpperCase()}{" "}
            {detectionState.orientation !== "unknown" ? "✅" : "❌"}
          </Text>
          <Text style={styles.debugText}>
            Confidence: {metrics.confidence}%
          </Text>
          <Text style={styles.debugText}>
            In-Frame: {inFrameCoverage}% {inFrameCoverage >= 75 ? "✅" : "❌"}
          </Text>

          {getHoldProgress() && (
            <Text style={[styles.debugText, { color: "#fbbf24" }]}>
              {getHoldProgress()}
            </Text>
          )}

          <Text style={[styles.debugTitle, { marginTop: 8 }]}>📸 Progress</Text>
          <Text style={styles.debugText}>{getCaptureStatus()}</Text>

          {metrics.standingDetails && metrics.standingDetails.leftLegAngle && (
            <>
              <Text style={[styles.debugTitle, { marginTop: 8 }]}>
                🦵 Standing
              </Text>
              <Text style={styles.debugText}>
                L: {metrics.standingDetails.leftLegAngle}° | R:{" "}
                {metrics.standingDetails.rightLegAngle}°
              </Text>
              <Text style={styles.debugText}>
                Height: {metrics.standingDetails.heightSpan} | Tall:{" "}
                {metrics.standingDetails.tallEnough ? "✅" : "❌"}
              </Text>
              {metrics.standingDetails.bypassedVerticalCheck && (
                <Text style={[styles.debugText, { color: "#22c55e" }]}>
                  ✅ Bypassed (very straight)
                </Text>
              )}
            </>
          )}

          {metrics.orientationDetails && metrics.orientationDetails.reason && (
            <>
              <Text style={[styles.debugTitle, { marginTop: 8 }]}>
                🧭 Orientation
              </Text>
              <Text style={styles.debugText}>
                {metrics.orientationDetails.reason}
              </Text>
              {typeof metrics.orientationDetails.frontScore === "number" && (
                <Text style={styles.debugText}>
                  Score: {metrics.orientationDetails.frontScore}/4
                  {metrics.orientationDetails.isFrontByDistance ? " 📏" : ""}
                  {metrics.orientationDetails.isFrontBySymmetry ? " ⚖️" : ""}
                  {metrics.orientationDetails.isFrontByDepth ? " 📐" : ""}
                  {metrics.orientationDetails.isFrontByFace ? " 👤" : ""}
                </Text>
              )}
            </>
          )}
        </View>
      )}
    </>
  );
};

export default Home;

const styles = StyleSheet.create((theme) => ({
  drawControl: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: "#FFF",
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 10,
  },
  debugPanel: {
    position: "absolute",
    top: 80,
    left: 10,
    zIndex: 10,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    padding: 12,
    borderRadius: 8,
    maxWidth: "60%",
    maxHeight: "85%",
  },
  debugTitle: {
    color: "#22c55e",
    fontWeight: "bold",
    fontSize: 13,
    marginBottom: 4,
  },
  debugText: {
    color: "white",
    fontSize: 10,
    marginBottom: 2,
    lineHeight: 14,
  },
}));
