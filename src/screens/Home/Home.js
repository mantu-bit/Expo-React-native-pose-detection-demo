// Home.js
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

// Helper functions for 3D vector math and pose detection
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const mag = (v) => Math.sqrt(dot(v, v));
const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

const angleDeg = (u, v) => {
  const cosTheta = dot(u, v) / (mag(u) * mag(v));
  return Math.acos(Math.max(-1, Math.min(1, cosTheta))) * (180 / Math.PI);
};

// SAFER: return 0 if visibility/score missing
const getVisibility = (p) => p?.visibility ?? p?.score ?? 0;

// NOTE: detectPoseState now uses targeted visibility checks, correct height span sign,
// and compares torso vector to vertical-up {0,-1,0} so upright gives small angle.
const detectPoseState = (body, setMetrics) => {
  if (!body || Object.keys(body).length < 33) {
    setMetrics({
      heightSpan: 0,
      lKneeAngle: 0,
      rKneeAngle: 0,
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
      standing: false,
      facing: "unknown",
      facingConfidence: 0,
      reason: "",
    });
    return { standing: false, facing: "unknown" };
  }
  const pts = {
    nose: body[0],
    leftEar: body[7],
    rightEar: body[8],
    leftEyeInner: body[1],
    leftEye: body[2],
    rightEye: body[4],
    rightEyeOuter: body[5],
    lShoulder: body[11],
    rShoulder: body[12],
    lHip: body[23],
    rHip: body[24],
    lKnee: body[25],
    rKnee: body[26],
    lAnkle: body[27],
    rAnkle: body[28],
  };

  // REQUIRE only essential anchors (nose, shoulders, hips, ankles) to be visible
  const requiredIdx = [0, 11, 12, 23, 24, 27, 28];
  const requiredVisible = requiredIdx.every((i) => {
    const p = body[i];
    return p && getVisibility(p) >= 0.25; // slightly relaxed
  });
  if (!requiredVisible) {
    setMetrics({
      heightSpan: 0,
      lKneeAngle: 0,
      rKneeAngle: 0,
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
      standing: false,
      facing: "unknown",
      facingConfidence: 0,
      reason: "",
    });
    return { standing: false, facing: "unknown" };
  }

  // FIXED: compute heightSpan as ankles - nose (positive when person occupies vertical span)
  const avgAnkleY = (pts.lAnkle.y + pts.rAnkle.y) / 2;
  const heightSpan = avgAnkleY - pts.nose.y; // CORRECT: ankles are lower => larger y, nose smaller y

  const lKneeVec1 = subtract(pts.lHip, pts.lKnee);
  const lKneeVec2 = subtract(pts.lAnkle, pts.lKnee);
  const lKneeAngle = angleDeg(lKneeVec1, lKneeVec2);

  const rKneeVec1 = subtract(pts.rHip, pts.rKnee);
  const rKneeVec2 = subtract(pts.rAnkle, pts.rKnee);
  const rKneeAngle = angleDeg(rKneeVec1, rKneeVec2);

  const hipMid = {
    x: (pts.lHip.x + pts.rHip.x) / 2,
    y: (pts.lHip.y + pts.rHip.y) / 2,
    z: (pts.lHip.z + pts.rHip.z) / 2,
  };
  const shoulderMid = {
    x: (pts.lShoulder.x + pts.rShoulder.x) / 2,
    y: (pts.lShoulder.y + pts.rShoulder.y) / 2,
    z: (pts.lShoulder.z + pts.rShoulder.z) / 2,
  };
  const torsoVec = subtract(shoulderMid, hipMid);
  // USE vertical up (negative Y in image coordinates) — so an upright torso aligns to this vector
  const verticalVec = { x: 0, y: -1, z: 0 };
  const torsoAngle = angleDeg(torsoVec, verticalVec);

  // FIXED: Relaxed thresholds for standing detection with corrected heightSpan
  const isStanding =
    heightSpan > 0.15 && // lowered from 0.22
    lKneeAngle > 120 && // lowered from 140
    rKneeAngle > 120 &&
    torsoAngle < 60; // increased from 45

  // Facing detection (relaxed thresholds)
  const noseVis = getVisibility(pts.nose);
  const lEarVis = getVisibility(pts.leftEar);
  const rEarVis = getVisibility(pts.rightEar);
  const earVisAvg = (lEarVis + rEarVis) / 2;
  const eyeVisAvg =
    (getVisibility(pts.leftEyeInner) +
      getVisibility(pts.leftEye) +
      getVisibility(pts.rightEye) +
      getVisibility(pts.rightEyeOuter)) /
    4;
  const shoulderZDiff = Math.abs(
    (pts.lShoulder.z ?? 0) - (pts.rShoulder.z ?? 0)
  );
  const hipZDiff = Math.abs((pts.lHip.z ?? 0) - (pts.rHip.z ?? 0));
  const lShoulderZ = pts.lShoulder.z ?? 0;
  const rShoulderZ = pts.rShoulder.z ?? 0;
  const hipVisAvg = (getVisibility(pts.lHip) + getVisibility(pts.rHip)) / 2;

  let facing = "unknown";
  let confidence = 0;
  let reason = "";

  // Front: Symmetric high vis + low z-diff
  if (
    earVisAvg > 0.5 &&
    shoulderZDiff < 0.03 &&
    hipZDiff < 0.03 &&
    noseVis > 0.7
  ) {
    facing = "front";
    confidence = 0.9;
    reason = "Symmetric vis + low z-diff";
  }
  // Left-facing: Left low vis, right high; right shoulder closer (z smaller)
  else if (
    lEarVis < 0.5 &&
    rEarVis > 0.7 &&
    rShoulderZ < lShoulderZ &&
    shoulderZDiff > 0.03
  ) {
    facing = "left";
    confidence = 0.8;
    reason = "Left occluded + right closer";
  }
  // Right-facing: Right low vis, left high; left shoulder closer
  else if (
    rEarVis < 0.5 &&
    lEarVis > 0.7 &&
    lShoulderZ < rShoulderZ &&
    shoulderZDiff > 0.03
  ) {
    facing = "right";
    confidence = 0.8;
    reason = "Right occluded + left closer";
  }
  // Back: Low face vis + high torso deviation + high hip vis
  else if (
    (noseVis < 0.4 || earVisAvg < 0.4 || eyeVisAvg < 0.4) &&
    torsoAngle > 30 &&
    hipVisAvg > 0.6
  ) {
    facing = "back";
    confidence = 0.7;
    reason = "Low face vis + bent torso + visible hips";
  } else if (earVisAvg < 0.4 && shoulderZDiff > 0.05) {
    // Fallback for ambiguous side/back
    facing =
      shoulderZDiff > 0.06
        ? lShoulderZ < rShoulderZ
          ? "right"
          : "left"
        : "back";
    confidence = 0.5;
    reason = "Fallback: low vis + z asymmetry";
  }

  // Set metrics (added nose, hip, confidence, reason)
  setMetrics({
    heightSpan: heightSpan.toFixed(2),
    lKneeAngle: lKneeAngle.toFixed(1),
    rKneeAngle: rKneeAngle.toFixed(1),
    torsoAngle: torsoAngle.toFixed(1),
    earVisAvg: earVisAvg.toFixed(2),
    eyeVisAvg: eyeVisAvg.toFixed(2),
    noseVis: noseVis.toFixed(2),
    hipVisAvg: hipVisAvg.toFixed(2),
    shoulderZDiff: shoulderZDiff.toFixed(3),
    hipZDiff: hipZDiff.toFixed(3),
    lEarVis: lEarVis.toFixed(2),
    rEarVis: rEarVis.toFixed(2),
    lShoulderZ: lShoulderZ.toFixed(3),
    rShoulderZ: rShoulderZ.toFixed(3),
    standing: isStanding,
    facing: facing,
    facingConfidence: confidence.toFixed(1),
    reason: reason, // For console if needed
  });

  console.log(
    `Standing: ${isStanding} | Facing: ${facing} | HeightSpan: ${heightSpan.toFixed(
      2
    )} | Knees: ${lKneeAngle.toFixed(0)}°/${rKneeAngle.toFixed(
      0
    )}° | Torso: ${torsoAngle.toFixed(1)}°`
  );

  return { standing: isStanding, facing: facing };
};

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
const COVERAGE_REQ = 0.8;
const HOLD_FRAMES = 8;
const CAPTURE_COOLDOWN = 3000; // 3 seconds cooldown between captures

const Home = () => {
  const { theme } = useUnistyles();
  const { user } = useSelector((state) => state.user);
  const dispatch = useDispatch();

  const landmarks = useSharedValue({});
  const { hasPermission, requestPermission } = useCameraPermission();
  const [cameraPosition, setCameraPosition] = useState("front"); // Default to front for selfie alignment
  const [showLines, setShowLines] = useState(true);
  const [showCircles, setShowCircles] = useState(true);
  const [showDebug, setShowDebug] = useState(true); // Toggle for debug panel
  const cameraRef = useRef(null);
  const device = useCameraDevice(cameraPosition);
  const pixelFormat = Platform.OS === "ios" ? "rgb" : "yuv";

  const [mediaPermission, requestMediaPermission] =
    MediaLibrary.usePermissions();

  // States for pose detection
  const [isStanding, setIsStanding] = useState(false);
  const [facing, setFacing] = useState("unknown");
  // Metrics state for on-screen display
  const [metrics, setMetrics] = useState({
    heightSpan: 0,
    lKneeAngle: 0,
    rKneeAngle: 0,
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
    standing: false,
    facing: "unknown",
    facingConfidence: 0,
    reason: "",
  });
  // In-frame coverage state
  const [inFrameCoverage, setInFrameCoverage] = useState(0);

  const onPressLogout = () => {
    dispatch(logout());
  };

  // Overlay SVG layout box
  const [svgBox, setSvgBox] = useState({ x: 0, y: 0, w: 0, h: 0 });

  // Inside state
  const [insideOk, setInsideOk] = useState(false);
  const insideCountRef = useRef(0);
  const lastCaptureTimeRef = useRef(0); // Track last capture time
  const isCapturingRef = useRef(false); // Prevent concurrent captures

  // Polygon mapped to pixels
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
      // console.log("landmarks ===>", event.landmarks[0]);
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
        requestMediaPermission().catch((error) => console.log(error));
      })
      .catch((error) => console.log(error));
  }, [requestPermission]);

  // Frame processor draws and updates landmarks
  const frameProcessor = useSkiaFrameProcessor(
    (frame) => {
      "worklet";
      try {
        frame.render();
        poseLandmarks(frame);

        const body = landmarks?.value;
        if (!body || Object.keys(body).length < 33) return;

        const fw = frame.width;
        const fh = frame.height;

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

  // Function to capture photo
  const capturePhoto = async () => {
    if (!cameraRef.current || isCapturingRef.current) return;

    const now = Date.now();
    if (now - lastCaptureTimeRef.current < CAPTURE_COOLDOWN) {
      console.log("Cooldown active, skipping capture");
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

      console.log("Photo captured:", photo.path);
      console.log("Success!", `Photo saved to: ${photo.path}`);
      console.log(mediaPermission, "mediaPermission");
      // Check media library permission
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

      // Save to gallery
      const asset = await MediaLibrary.createAssetAsync(photo.path);
      console.log("Photo saved to gallery:", asset.uri);

      Alert.alert("Success!", "Photo saved to gallery");
    } catch (error) {
      console.error("Photo capture/save error:", error);
      Alert.alert("Error", `Failed to save photo: ${error.message}`);
    } finally {
      isCapturingRef.current = false;
    }
  };

  // JS-side inclusion and pose test (runs ~each animation frame)
  useEffect(() => {
    let raf;
    const tick = () => {
      const body = landmarks?.value;
      if (!pixelPoly.length || !body || Object.keys(body).length < 33) {
        insideCountRef.current = 0;
        setInsideOk(false);
        setIsStanding(false);
        setFacing("unknown");
        setInFrameCoverage(0);
        raf = requestAnimationFrame(tick);
        return;
      }

      // In-frame check
      const frameW = svgBox.w;
      const frameH = svgBox.h;

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

        // Handle mirrored front-camera: flip normalized x for mapping if front camera is used
        const normX = cameraPosition === "front" ? 1 - kp.x : kp.x;
        const p = { x: normX * frameW + svgBox.x, y: kp.y * frameH + svgBox.y };

        tested++;
        if (isPointInPolygon(p, pixelPoly)) inside++;
      }

      const inFrameOk = tested > 0 && inside / tested >= COVERAGE_REQ;
      const coverage = tested > 0 ? ((inside / tested) * 100).toFixed(1) : 0;
      setInFrameCoverage(parseFloat(coverage));

      // Compute pose state
      const poseState = detectPoseState(body, setMetrics);
      setIsStanding(poseState.standing);
      setFacing(poseState.facing);

      // Combined for capture (in-frame + standing + facing known)
      const allOk =
        inFrameOk && poseState.standing && poseState.facing !== "unknown";
      if (allOk) {
        insideCountRef.current++;
        if (!insideOk && insideCountRef.current >= HOLD_FRAMES) {
          setInsideOk(true);
          capturePhoto(); // Trigger photo capture
        }
      } else {
        insideCountRef.current = 0;
        if (insideOk) setInsideOk(false);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pixelPoly, svgBox, landmarks, insideOk, cameraPosition]);

  if (!hasPermission || !device) {
    return <Text>No permission</Text>;
  }

  // UPDATED: SVG color based on standing + any valid facing
  const outlineColor =
    isStanding && facing !== "unknown" ? "#22c55e" : "#FFFFFF";

  // Overall alignment status
  const allAligned =
    inFrameCoverage >= COVERAGE_REQ * 100 && isStanding && facing !== "unknown";

  // UPDATED: Facing emoji for debug
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
            setCameraPosition((prev) => (prev === "front" ? "back" : "front"))
          }
        />
        {/* Debug toggle button */}
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

      {/* Overlay SVG centered */}
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
            console.log("SVG Box:", { x, y, width, height });
          }}
        >
          <HumanOutline
            stroke={outlineColor}
            strokeWidth={2}
            fill="rgba(255,255,255,0.04)"
          />
        </View>
      </View>

      {/* On-screen debug panel */}
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
            Height Span: {metrics.heightSpan} {`(>0.22)`}
          </Text>
          <Text style={styles.debugText}>
            L Knee: {metrics.lKneeAngle}° {`(>140)`} | R Knee:{" "}
            {metrics.rKneeAngle}°
          </Text>
          <Text style={styles.debugText}>
            Torso: {metrics.torsoAngle}° {`(<45)`}
          </Text>
          <Text style={styles.debugText}>
            Nose Vis: {metrics.noseVis} | Ear Avg: {metrics.earVisAvg} | Eye
            Avg: {metrics.eyeVisAvg}
          </Text>
          <Text style={styles.debugText}>
            L Ear: {metrics.lEarVis} | R Ear: {metrics.rEarVis}
          </Text>
          <Text style={styles.debugText}>
            Hip Vis Avg: {metrics.hipVisAvg} {`(>0.6 for back)`}
          </Text>
          <Text style={styles.debugText}>
            Shldr Z Diff: {metrics.shoulderZDiff} {`(<0.03 front, >0.03 side)`}{" "}
            | L Z: {metrics.lShoulderZ} | R Z: {metrics.rShoulderZ}
          </Text>
          <Text style={styles.debugText}>Hip Z Diff: {metrics.hipZDiff}</Text>
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
  // Debug panel styles
  debugPanel: {
    position: "absolute",
    top: 80, // Below control bar
    left: 10,
    zIndex: 10,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    padding: 12,
    borderRadius: 8,
    maxWidth: "50%",
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
