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

/* ---------- One-Euro filter ---------- */
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
const angleDeg = (u, v) => {
  const mu = mag(u);
  const mv = mag(v);
  if (mu === 0 || mv === 0) return 90;
  let cosTheta = dot(u, v) / (mu * mv);
  cosTheta = Math.max(-1, Math.min(1, cosTheta));
  return Math.acos(cosTheta) * (180 / Math.PI);
};

// Angle between three points (vertex in the center)
const angleAt = (p1, p2, p3) => {
  const v1 = subtract(p1, p2);
  const v2 = subtract(p3, p2);
  return angleDeg(v1, v2);
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

/* ---------- ADJUSTED Standing/facing thresholds ---------- */
const KNEE_MIN = 120; //155; // Relaxed from 165 - natural standing may be 155-170°
const BACK_ANGLE_MIN = 140; //155; // Relaxed from 170 - shoulder-hip-ankle alignment
const TORSO_VERTICAL_MAX = 25; // Relaxed from 20 - allow slight lean
const SPAN_MIN = 0.15; // Relaxed from 0.2 - adjust for camera distance
const MIN_VIS = 0.25; // Relaxed from 0.3 - handle occlusion better
const STATE_HOLD = 8; // Reduced from 10 for faster response
const STATE_DROP = 5; // Reduced from 6
const DEPTH_SIDE_DELTA = 0.05;

/* ---------- Pose state with DEBUGGED standing detection ---------- */
const detectPoseState = (rawBody, setMetrics) => {
  const body = normalizeBodyArray(rawBody);
  if (!body) {
    setMetrics((m) => ({
      ...m,
      heightSpan: 0,
      lKneeAngle: 0,
      rKneeAngle: 0,
      lBackAngle: 0,
      rBackAngle: 0,
      torsoAngle: 0,
      earVisAvg: 0,
      eyeVisAvg: 0,
      noseVis: 0,
      hipVisAvg: 0,
      shoulderZDiff: 0,
      hipZDiff: 0,
      lEarVis: 0,
      rEarVis: 0,
      lShoulderZ: 0,
      rShoulderZ: 0,
      lShoulderVis: 0,
      rShoulderVis: 0,
      lHipVis: 0,
      rHipVis: 0,
      lKneeVis: 0,
      rKneeVis: 0,
      lAnkleVis: 0,
      rAnkleVis: 0,
      standing: false,
      facing: "unknown",
      facingConfidence: 0,
      reason: "",
    }));
    return { standing: false, standingRaw: false, facing: "unknown" };
  }

  const idx = {
    nose: 0,
    leftEyeInner: 1,
    leftEye: 2,
    rightEye: 4,
    rightEyeOuter: 5,
    leftEar: 7,
    rightEar: 8,
    lShoulder: 11,
    rShoulder: 12,
    lHip: 23,
    rHip: 24,
    lKnee: 25,
    rKnee: 26,
    lAnkle: 27,
    rAnkle: 28,
  };

  const p = (i) => body[i] ?? { x: 0, y: 0, z: 0, visibility: 0 };
  const nose = p(idx.nose);
  const lEar = p(idx.leftEar);
  const rEar = p(idx.rightEar);
  const lShoulder = p(idx.lShoulder);
  const rShoulder = p(idx.rShoulder);
  const lHip = p(idx.lHip);
  const rHip = p(idx.rHip);
  const lKnee = p(idx.lKnee);
  const rKnee = p(idx.rKnee);
  const lAnkle = p(idx.lAnkle);
  const rAnkle = p(idx.rAnkle);
  const leftEyeInner = p(idx.leftEyeInner);
  const leftEye = p(idx.leftEye);
  const rightEye = p(idx.rightEye);
  const rightEyeOuter = p(idx.rightEyeOuter);

  const avgAnkleY = (lAnkle.y + rAnkle.y) / 2;
  const heightSpan = avgAnkleY - nose.y;

  // Angles
  const lKneeAngle = angleDeg(subtract(lHip, lKnee), subtract(lAnkle, lKnee));
  const rKneeAngle = angleDeg(subtract(rHip, rKnee), subtract(rAnkle, rKnee));
  const lBackAngle = angleAt(lShoulder, lHip, lAnkle);
  const rBackAngle = angleAt(rShoulder, rHip, rAnkle);

  // Torso angle
  const hipMid = {
    x: (lHip.x + rHip.x) / 2,
    y: (lHip.y + rHip.y) / 2,
    z: ((lHip.z ?? 0) + (rHip.z ?? 0)) / 2,
  };
  const shoulderMid = {
    x: (lShoulder.x + rShoulder.x) / 2,
    y: (lShoulder.y + rShoulder.y) / 2,
    z: ((lShoulder.z ?? 0) + (rShoulder.z ?? 0)) / 2,
  };
  const torsoVec = subtract(shoulderMid, hipMid);
  const verticalVec = { x: 0, y: -1, z: 0 };
  const torsoAngle = angleDeg(torsoVec, verticalVec);

  // Visibility
  const noseVis = getVisibility(nose);
  const lEarVis = getVisibility(lEar);
  const rEarVis = getVisibility(rEar);
  const earVisAvg = (lEarVis + rEarVis) / 2;
  const eyeVisAvg =
    (getVisibility(leftEyeInner) +
      getVisibility(leftEye) +
      getVisibility(rightEye) +
      getVisibility(rightEyeOuter)) /
    4;
  const shoulderZDiff = (lShoulder.z ?? 0) - (rShoulder.z ?? 0);
  const hipZDiff = Math.abs((lHip.z ?? 0) - (rHip.z ?? 0));
  const hipVisAvg = (getVisibility(lHip) + getVisibility(rHip)) / 2;
  const lShoulderZ = lShoulder.z ?? 0;
  const rShoulderZ = rShoulder.z ?? 0;
  const lShoulderVis = getVisibility(lShoulder);
  const rShoulderVis = getVisibility(rShoulder);
  const lHipVis = getVisibility(lHip);
  const rHipVis = getVisibility(rHip);
  const lKneeVis = getVisibility(lKnee);
  const rKneeVis = getVisibility(rKnee);
  const lAnkleVis = getVisibility(lAnkle);
  const rAnkleVis = getVisibility(rAnkle);

  // Enhanced standing detection with detailed diagnostics
  let isStandingRaw = false;
  let standingReason = "";

  const leftSideVisible =
    lShoulderVis > MIN_VIS &&
    lHipVis > MIN_VIS &&
    lKneeVis > MIN_VIS &&
    lAnkleVis > MIN_VIS;
  const rightSideVisible =
    rShoulderVis > MIN_VIS &&
    rHipVis > MIN_VIS &&
    rKneeVis > MIN_VIS &&
    rAnkleVis > MIN_VIS;

  if (leftSideVisible && rightSideVisible) {
    // Front pose - check all conditions with diagnostics
    const heightOk = true; //heightSpan > SPAN_MIN;
    const lKneeOk = lKneeAngle > KNEE_MIN;
    const rKneeOk = rKneeAngle > KNEE_MIN;
    const lBackOk = lBackAngle > BACK_ANGLE_MIN;
    const rBackOk = rBackAngle > BACK_ANGLE_MIN;
    const torsoOk = true; //torsoAngle < TORSO_VERTICAL_MAX;

    isStandingRaw =
      heightOk && lKneeOk && rKneeOk && lBackOk && rBackOk && torsoOk;

    if (isStandingRaw) {
      standingReason = "✅ FRONT: all checks passed";
    } else {
      const failures = [];
      if (!heightOk)
        failures.push(`height:${heightSpan.toFixed(2)}<${SPAN_MIN}`);
      if (!lKneeOk) failures.push(`Lknee:${lKneeAngle.toFixed(0)}<${KNEE_MIN}`);
      if (!rKneeOk) failures.push(`Rknee:${rKneeAngle.toFixed(0)}<${KNEE_MIN}`);
      if (!lBackOk)
        failures.push(`Lback:${lBackAngle.toFixed(0)}<${BACK_ANGLE_MIN}`);
      if (!rBackOk)
        failures.push(`Rback:${rBackAngle.toFixed(0)}<${BACK_ANGLE_MIN}`);
      if (!torsoOk)
        failures.push(`torso:${torsoAngle.toFixed(0)}>${TORSO_VERTICAL_MAX}`);
      standingReason = `FRONT FAIL: ${failures.join(", ")}`;
    }
  } else if (leftSideVisible) {
    // Left side pose
    const heightOk = heightSpan > SPAN_MIN;
    const lKneeOk = lKneeAngle > KNEE_MIN;
    const lBackOk = lBackAngle > BACK_ANGLE_MIN;
    const torsoOk = torsoAngle < TORSO_VERTICAL_MAX;

    isStandingRaw = heightOk && lKneeOk && lBackOk && torsoOk;

    if (isStandingRaw) {
      standingReason = "✅ LEFT: all checks passed";
    } else {
      const failures = [];
      if (!heightOk)
        failures.push(`height:${heightSpan.toFixed(2)}<${SPAN_MIN}`);
      if (!lKneeOk) failures.push(`Lknee:${lKneeAngle.toFixed(0)}<${KNEE_MIN}`);
      if (!lBackOk)
        failures.push(`Lback:${lBackAngle.toFixed(0)}<${BACK_ANGLE_MIN}`);
      if (!torsoOk)
        failures.push(`torso:${torsoAngle.toFixed(0)}>${TORSO_VERTICAL_MAX}`);
      standingReason = `LEFT FAIL: ${failures.join(", ")}`;
    }
  } else if (rightSideVisible) {
    // Right side pose
    const heightOk = heightSpan > SPAN_MIN;
    const rKneeOk = rKneeAngle > KNEE_MIN;
    const rBackOk = rBackAngle > BACK_ANGLE_MIN;
    const torsoOk = torsoAngle < TORSO_VERTICAL_MAX;

    isStandingRaw = heightOk && rKneeOk && rBackOk && torsoOk;

    if (isStandingRaw) {
      standingReason = "✅ RIGHT: all checks passed";
    } else {
      const failures = [];
      if (!heightOk)
        failures.push(`height:${heightSpan.toFixed(2)}<${SPAN_MIN}`);
      if (!rKneeOk) failures.push(`Rknee:${rKneeAngle.toFixed(0)}<${KNEE_MIN}`);
      if (!rBackOk)
        failures.push(`Rback:${rBackAngle.toFixed(0)}<${BACK_ANGLE_MIN}`);
      if (!torsoOk)
        failures.push(`torso:${torsoAngle.toFixed(0)}>${TORSO_VERTICAL_MAX}`);
      standingReason = `RIGHT FAIL: ${failures.join(", ")}`;
    }
  } else {
    standingReason = `VIS: L(${lShoulderVis.toFixed(2)},${lHipVis.toFixed(
      2
    )},${lKneeVis.toFixed(2)},${lAnkleVis.toFixed(2)}) R(${rShoulderVis.toFixed(
      2
    )},${rHipVis.toFixed(2)},${rKneeVis.toFixed(2)},${rAnkleVis.toFixed(2)})`;
  }

  // Facing detection
  let facing = "unknown";
  let confidence = 0;
  let reason = "";

  const absSh = Math.abs(shoulderZDiff);
  if (
    absSh < DEPTH_SIDE_DELTA &&
    hipZDiff < DEPTH_SIDE_DELTA &&
    (earVisAvg > 0.4 || eyeVisAvg > 0.4)
  ) {
    facing = "front";
    confidence = 0.9;
    reason = "symmetric depth";
  } else if (shoulderZDiff > DEPTH_SIDE_DELTA) {
    facing = "right";
    confidence = 0.8;
    reason = "left shoulder deeper";
  } else if (shoulderZDiff < -DEPTH_SIDE_DELTA) {
    facing = "left";
    confidence = 0.8;
    reason = "right shoulder deeper";
  } else if (
    (earVisAvg < 0.35 || eyeVisAvg < 0.35 || noseVis < 0.35) &&
    torsoAngle > 25 &&
    hipVisAvg > 0.5
  ) {
    facing = "back";
    confidence = 0.7;
    reason = "low face vis + torso tilt";
  }

  setMetrics({
    heightSpan: Number(heightSpan.toFixed(2)),
    lKneeAngle: Number(lKneeAngle.toFixed(1)),
    rKneeAngle: Number(rKneeAngle.toFixed(1)),
    lBackAngle: Number(lBackAngle.toFixed(1)),
    rBackAngle: Number(rBackAngle.toFixed(1)),
    torsoAngle: Number(torsoAngle.toFixed(1)),
    earVisAvg: Number(earVisAvg.toFixed(2)),
    eyeVisAvg: Number(eyeVisAvg.toFixed(2)),
    noseVis: Number(noseVis.toFixed(2)),
    hipVisAvg: Number(hipVisAvg.toFixed(2)),
    shoulderZDiff: Number(Math.abs(shoulderZDiff).toFixed(3)),
    hipZDiff: Number(hipZDiff.toFixed(3)),
    lEarVis: Number(lEarVis.toFixed(2)),
    rEarVis: Number(rEarVis.toFixed(2)),
    lShoulderZ: Number(lShoulderZ.toFixed(3)),
    rShoulderZ: Number(rShoulderZ.toFixed(3)),
    lShoulderVis: Number(lShoulderVis.toFixed(2)),
    rShoulderVis: Number(rShoulderVis.toFixed(2)),
    lHipVis: Number(lHipVis.toFixed(2)),
    rHipVis: Number(rHipVis.toFixed(2)),
    lKneeVis: Number(lKneeVis.toFixed(2)),
    rKneeVis: Number(rKneeVis.toFixed(2)),
    lAnkleVis: Number(lAnkleVis.toFixed(2)),
    rAnkleVis: Number(rAnkleVis.toFixed(2)),
    standing: isStandingRaw,
    facing: facing,
    facingConfidence: Number((confidence * 100).toFixed(0)),
    reason: `${reason} | ${standingReason}`,
  });

  return { standing: isStandingRaw, standingRaw: isStandingRaw, facing };
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

/* ---------- Config ---------- */
const TEST_POINTS = [0, 11, 12, 23, 24, 25, 26, 27, 28, 15, 16];
const MIN_SCORE = 0.4;
const COVERAGE_REQ = 0.8;
const HOLD_FRAMES = 8;
const CAPTURE_COOLDOWN = 3000;

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

  const [isStanding, setIsStanding] = useState(false);
  const [facing, setFacing] = useState("unknown");

  const standOn = useRef(0);
  const standOff = useRef(0);
  const facingCandidate = useRef("unknown");
  const facingCandCount = useRef(0);
  const facingOffCount = useRef(0);

  const [metrics, setMetrics] = useState({
    heightSpan: 0,
    lKneeAngle: 0,
    rKneeAngle: 0,
    lBackAngle: 0,
    rBackAngle: 0,
    torsoAngle: 0,
    earVisAvg: 0,
    eyeVisAvg: 0,
    noseVis: 0,
    hipVisAvg: 0,
    shoulderZDiff: 0,
    hipZDiff: 0,
    lEarVis: 0,
    rEarVis: 0,
    lShoulderZ: 0,
    rShoulderZ: 0,
    lShoulderVis: 0,
    rShoulderVis: 0,
    lHipVis: 0,
    rHipVis: 0,
    lKneeVis: 0,
    rKneeVis: 0,
    lAnkleVis: 0,
    rAnkleVis: 0,
    standing: false,
    facing: "unknown",
    facingConfidence: 0,
    reason: "",
  });

  const [inFrameCoverage, setInFrameCoverage] = useState(0);
  const [svgBox, setSvgBox] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [insideOk, setInsideOk] = useState(false);
  const insideCountRef = useRef(0);
  const lastCaptureTimeRef = useRef(0);
  const isCapturingRef = useRef(false);

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

  const capturePhoto = async () => {
    if (!cameraRef.current || isCapturingRef.current) return;
    const now = Date.now();
    if (now - lastCaptureTimeRef.current < CAPTURE_COOLDOWN) return;
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
      const asset = await MediaLibrary.createAssetAsync(photo.path);
      Alert.alert("Success!", "Photo saved to gallery");
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
        insideCountRef.current = 0;
        setInsideOk(false);
        if (isStanding) {
          standOff.current++;
          if (standOff.current >= STATE_DROP) {
            setIsStanding(false);
            standOff.current = 0;
          }
        }
        facingOffCount.current++;
        if (facing !== "unknown" && facingOffCount.current >= STATE_DROP) {
          setFacing("unknown");
          facingOffCount.current = 0;
        }
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

      const poseState = detectPoseState(body, setMetrics);
      console.log("print JSON response ==>", JSON.stringify(poseState));
      if (poseState.standing) {
        standOn.current++;
        standOff.current = 0;
        if (!isStanding && standOn.current >= STATE_HOLD) {
          setIsStanding(true);
          standOn.current = 0;
        }
      } else {
        standOff.current++;
        standOn.current = 0;
        if (isStanding && standOff.current >= STATE_DROP) {
          setIsStanding(false);
          standOff.current = 0;
        }
      }

      if (poseState.facing === "unknown") {
        facingOffCount.current++;
        facingCandCount.current = 0;
        if (facing !== "unknown" && facingOffCount.current >= STATE_DROP) {
          setFacing("unknown");
          facingOffCount.current = 0;
        }
      } else {
        if (poseState.facing === facingCandidate.current) {
          facingCandCount.current++;
        } else {
          facingCandidate.current = poseState.facing;
          facingCandCount.current = 1;
        }
        facingOffCount.current = 0;
        if (
          facingCandCount.current >= STATE_HOLD &&
          facing !== facingCandidate.current
        ) {
          setFacing(facingCandidate.current);
          facingCandCount.current = 0;
        }
      }

      const allOk = inFrameOk && isStanding && facing !== "unknown";
      if (allOk) {
        insideCountRef.current++;
        if (!insideOk && insideCountRef.current >= HOLD_FRAMES) {
          setInsideOk(true);
          capturePhoto();
        }
      } else {
        insideCountRef.current = 0;
        if (insideOk) setInsideOk(false);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pixelPoly, svgBox, cameraPosition, isStanding, facing]);

  if (!hasPermission || !device) {
    return <Text>No permission</Text>;
  }

  const outlineColor =
    isStanding && facing !== "unknown" ? "#22c55e" : "#FFFFFF";
  const allAligned =
    inFrameCoverage >= COVERAGE_REQ * 100 && isStanding && facing !== "unknown";

  const getFacingEmoji = (dir) => {
    switch (dir) {
      case "front":
        return "👤";
      case "left":
        return "⇦";
      case "right":
        return "⇨";
      case "back":
        return "🔙";
      default:
        return "❓";
    }
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
          title={showDebug ? "Hide Debug" : "Show Debug"}
          onPress={() => setShowDebug(!showDebug)}
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
          <Text style={styles.debugTitle}>Debug Info</Text>
          <Text style={styles.debugText}>
            In-Frame: {inFrameCoverage}% {inFrameCoverage >= 80 ? "✅" : "❌"}
          </Text>
          <Text style={styles.debugText}>
            Standing: {isStanding ? "✅" : "❌"}
          </Text>
          <Text style={styles.debugText}>
            Facing: {getFacingEmoji(facing)} {facing.toUpperCase()}{" "}
            {facing !== "unknown" ? "✅" : "❌"} (Conf:{" "}
            {metrics.facingConfidence})
          </Text>
          <Text style={styles.debugText}>
            All Aligned: {allAligned ? "✅" : "❌"}
          </Text>
          <Text style={styles.debugText}>
            Height: {metrics.heightSpan} (min {SPAN_MIN})
          </Text>
          <Text style={styles.debugText}>
            L Knee: {metrics.lKneeAngle}° | R Knee: {metrics.rKneeAngle}° (min{" "}
            {KNEE_MIN}°)
          </Text>
          <Text style={styles.debugText}>
            L Back: {metrics.lBackAngle}° | R Back: {metrics.rBackAngle}° (min{" "}
            {BACK_ANGLE_MIN}°)
          </Text>
          <Text style={styles.debugText}>
            Torso: {metrics.torsoAngle}° (max {TORSO_VERTICAL_MAX}°)
          </Text>
          <Text style={styles.debugText}>
            L Vis: S:{metrics.lShoulderVis} H:{metrics.lHipVis} K:
            {metrics.lKneeVis} A:{metrics.lAnkleVis}
          </Text>
          <Text style={styles.debugText}>
            R Vis: S:{metrics.rShoulderVis} H:{metrics.rHipVis} K:
            {metrics.rKneeVis} A:{metrics.rAnkleVis}
          </Text>
          <Text style={styles.debugText}>
            Nose: {metrics.noseVis} | Ear: {metrics.earVisAvg} | Eye:{" "}
            {metrics.eyeVisAvg}
          </Text>
          <Text style={styles.debugText}>
            Shldr |ΔZ|: {metrics.shoulderZDiff} | Hip |ΔZ|: {metrics.hipZDiff}
          </Text>
          <Text style={styles.debugText} numberOfLines={3}>
            {metrics.reason}
          </Text>
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
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    padding: 12,
    borderRadius: 8,
    maxWidth: "55%",
    maxHeight: "85%",
  },
  debugTitle: {
    color: "white",
    fontWeight: "bold",
    fontSize: 14,
    marginBottom: 4,
  },
  debugText: {
    color: "white",
    fontSize: 10,
    marginBottom: 2,
    lineHeight: 12,
  },
}));
