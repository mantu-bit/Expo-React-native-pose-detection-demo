import { Platform, Text, View } from "react-native";
import React, { useEffect, useState } from "react";
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
linePaint.setStrokeWidth(30);

const circlePaint = Skia.Paint();
circlePaint.setColor(Skia.Color("green"));
linePaint.setStrokeWidth(10);

// Initialize the frame processor plugin 'poseLandmarks'
const poseLandMarkPlugin = VisionCameraProxy.initFrameProcessorPlugin(
  "poseLandmarks",
  {}
);

function poseLandmarks(frame) {
  "worklet";
  if (poseLandMarkPlugin == null) {
    throw new Error("Failed to load Frame Processor Plugin!");
  }
  return poseLandMarkPlugin.call(frame);
}

const Home = () => {
  const { theme } = useUnistyles();
  const { user } = useSelector((state) => state.user);
  const dispatch = useDispatch();

  const landmarks = useSharedValue({});
  const { hasPermission, requestPermission } = useCameraPermission();
  const [cameraPosition, setCameraPosition] = useState("back");
  const [showLines, setShowLines] = useState(true);
  const [showCircles, setShowCircles] = useState(true);
  const device = useCameraDevice(cameraPosition);

  const pixelFormat =
    Platform.OS === "ios"
      ? "rgb" // Force RGB for front camera
      : "yuv"; // Use YUV for back camera

  const onPressLogout = () => {
    dispatch(logout());
  };

  useEffect(() => {
    // Subscribe to landmarks detected events
    const landmarksSubscription = addPoseLandmarksListener((event) => {
      console.log("Landmarks detected:", JSON.stringify(event.landmarks[0]));
      landmarks.value = event.landmarks[0];
    });

    // Subscribe to status events
    const statusSubscription = addPoseStatusListener((event) => {
      console.log("Status update:", event.status);
    });

    // Subscribe to error events
    const errorSubscription = addPoseErrorListener((event) => {
      console.error("Pose detection error:", event.error);
    });

    // Cleanup: Remove all listeners when component unmounts
    return () => {
      landmarksSubscription.remove();
      statusSubscription.remove();
      errorSubscription.remove();
    };
  }, []);

  useEffect(() => {
    requestPermission().catch((error) => console.log(error));
  }, [requestPermission]);

  const frameProcessor = useSkiaFrameProcessor(
    (frame) => {
      "worklet";

      try {
        frame.render();
        poseLandmarks(frame);

        if (
          landmarks?.value !== undefined &&
          landmarks?.value !== null &&
          Object.keys(landmarks?.value).length > 0
        ) {
          let body = landmarks?.value;
          let frameWidth = frame.width;
          let frameHeight = frame.height;

          // Verify we have complete landmark data
          const keypointCount = Object.keys(body).length;
          if (keypointCount < 33) {
            // Not enough keypoints detected yet
            return;
          }

          // Draw lines
          if (showLines) {
            for (let [from, to] of LINES) {
              const fromPoint = body[from];
              const toPoint = body[to];

              // Skip if either point is invalid
              if (
                !fromPoint ||
                !toPoint ||
                typeof fromPoint.x !== "number" ||
                typeof toPoint.x !== "number"
              ) {
                continue;
              }

              frame.drawLine(
                fromPoint.x * frameWidth,
                fromPoint.y * frameHeight,
                toPoint.x * frameWidth,
                toPoint.y * frameHeight,
                linePaint
              );
            }
          }

          // Draw circles
          if (showCircles) {
            for (let mark of Object.values(body)) {
              if (
                mark &&
                typeof mark.x === "number" &&
                typeof mark.y === "number"
              ) {
                frame.drawCircle(
                  mark.x * frameWidth,
                  mark.y * frameHeight,
                  6,
                  circlePaint
                );
              }
            }
          }
        }
      } catch (error) {
        // Log error but don't crash
        console.error("Frame processor error:", error);
      }
    },
    [showLines, showCircles]
  );

  if (!hasPermission) {
    return <Text>No permission</Text>;
  }

  return (
    <>
      <View style={styles.drawControl}>
        <Button
          style={{ width: 120 }}
          title={showLines ? "Hide lines" : "Show lines"}
          onPress={() => setShowLines(!showLines)}
        />
        <Button
          style={{ width: 120 }}
          title={showCircles ? "Hide circles" : "Show circles"}
          onPress={() => setShowCircles(!showCircles)}
        />
        <Button
          style={{ width: 120 }}
          title="Change camera"
          onPress={() =>
            setCameraPosition((prev) => (prev === "front" ? "back" : "front"))
          }
        />
      </View>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        frameProcessor={frameProcessor}
        pixelFormat={pixelFormat}
        videoHdr={false}
        enableBufferCompression={true}
        photo={false}
        // fps={30}
      />
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
  container: {
    padding: ms(20),
    justifyContent: "center",
    alignItems: "center",
  },
  title: { fontFamily: fonts.openSan.bold, fontSize: ms(30) },
  btnStyle: { marginTop: ms(40) },
}));
