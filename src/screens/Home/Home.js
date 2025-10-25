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
  const [cameraPosition, setCameraPosition] = useState("back");
  const [showLines, setShowLines] = useState(false);
  const [showCircles, setShowCircles] = useState(false);
  const cameraRef = useRef(null);
  const device = useCameraDevice(cameraPosition);
  const pixelFormat = Platform.OS === "ios" ? "rgb" : "yuv";

  // Inside your Home component, add permission state
  const [mediaPermission, requestMediaPermission] =
    MediaLibrary.usePermissions();

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
  // JS-side inclusion test (runs ~each animation frame)
  useEffect(() => {
    let raf;
    const tick = () => {
      const body = landmarks?.value;
      if (!pixelPoly.length || !body || Object.keys(body).length < 33) {
        insideCountRef.current = 0;
        setInsideOk(false);
        raf = requestAnimationFrame(tick);
        return;
      }

      // Camera preview fills the parent; landmarks are normalized 0..1 → pixels
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
          kp.score < MIN_SCORE
        )
          continue;
        const p = { x: kp.x * frameW + svgBox.x, y: kp.y * frameH + svgBox.y };
        tested++;
        if (isPointInPolygon(p, pixelPoly)) inside++;
      }

      const ok = tested > 0 && inside / tested >= COVERAGE_REQ;
      if (ok) {
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
  }, [pixelPoly, svgBox, landmarks, insideOk]);

  if (!hasPermission || !device) {
    return <Text>No permission</Text>;
  }

  return (
    <>
      <View style={styles.drawControl}>
        {/* <Button
          text={showLines ? "Hide lines" : "Show lines"}
          onPress={() => setShowLines(!showLines)}
        />
        <Button
          text={showCircles ? "Hide dots" : "Show dots"}
          onPress={() => setShowCircles(!showCircles)}
        /> */}
        <Button
          title="Flip"
          onPress={() =>
            setCameraPosition((prev) => (prev === "front" ? "back" : "front"))
          }
        />
      </View>

      <Camera
        ref={cameraRef}
        style={{ flex: 1 }}
        device={device}
        isActive
        photo={true} // ✅ Enable photo capture
        pixelFormat={pixelFormat}
        frameProcessor={frameProcessor}
      />

      {/* Overlay SVG centered */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View
          style={{
            position: "absolute",
            alignSelf: "center",
            width: 360,
            height: 360,
            top: 140,
          }}
          onLayout={(e) => {
            const { x, y, width, height } = e.nativeEvent.layout;
            setSvgBox({ x, y, w: width, h: height });
          }}
        >
          <HumanOutline
            width={360}
            stroke={insideOk ? "#22c55e" : "#FFFFFF"}
            strokeWidth={insideOk ? 3 : 2}
            fill="rgba(255,255,255,0.03)"
          />
        </View>
      </View>
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
}));
