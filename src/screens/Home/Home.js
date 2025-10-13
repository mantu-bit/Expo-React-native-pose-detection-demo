import { Platform, Text } from "react-native";
import React, { useEffect, useState } from "react";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Button, ScreenWrapper } from "@/components";
import { fonts } from "@/theme";
import { ms } from "@/utils";
import { useDispatch, useSelector } from "react-redux";
import { logout } from "@/redux/actions/authAction";
import { Skia } from "@shopify/react-native-skia";
import {
  hello,
  initModel,
  addPoseLandmarksListener,
  addPoseStatusListener,
  addPoseErrorListener,
} from "../../../modules/expo-pose-detection";

import {
  Camera,
  CameraPosition,
  Frame,
  useCameraDevice,
  useCameraFormat,
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
  const [cameraPosition, setCameraPosition] = useState("front");
  const [showLines, setShowLines] = useState(true);
  const [showCircles, setShowCircles] = useState(true);
  const device = useCameraDevice(cameraPosition);

  const pixelFormat = Platform.OS === "ios" ? "rgb" : "yuv";

  const onPressLogout = () => {
    dispatch(logout());
  };

  useEffect(() => {
    // Initialize the model
    initModel()
      .then(() => {
        console.log("Model initialized successfully");
      })
      .catch((err) => {
        console.error("Failed to initialize model:", err);
        setError(err.message);
      });

    // Subscribe to landmarks detected events
    const landmarksSubscription = addPoseLandmarksListener((event) => {
      console.log("Landmarks detected:", JSON.stringify(event.landmarks));
      // setLandmarks(event.landmarks);
      // setPoseCount((prev) => prev + 1);
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

      // Process the frame using the 'poseLandmarks' function
      frame.render();
      poseLandmarks(frame);
      if (
        landmarks?.value !== undefined &&
        Object.keys(landmarks?.value).length > 0
      ) {
        let body = landmarks?.value;

        console.log("🚀 ~ Exercise ~ body ===> ", body);

        let frameWidth = frame.width;
        let frameHeight = frame.height;
        // Draw line on landmarks
        if (showLines) {
          for (let [from, to] of LINES) {
            frame.drawLine(
              body[from].x * Number(frameWidth),
              body[from].y * Number(frameHeight),
              body[to].x * Number(frameWidth),
              body[to].y * Number(frameHeight),
              linePaint
            );
          }
        } // Draw circles on landmarks
        if (showCircles) {
          for (let mark of Object.values(body)) {
            frame.drawCircle(
              mark.x * Number(frameWidth),
              mark.y * Number(frameHeight),
              6,
              circlePaint
            );
          }
        }
      }
    },
    [showLines, showCircles]
  );

  if (!hasPermission) {
    return <Text>No permission</Text>;
  }

  return (
    <ScreenWrapper style={styles.container}>
      <Text style={styles.title}>
        Welcome {user?.email} {hello()}
      </Text>

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

      <Button title="Logout" style={styles.btnStyle} onPress={onPressLogout} />
    </ScreenWrapper>
  );
};

export default Home;

const styles = StyleSheet.create((theme) => ({
  container: {
    padding: ms(20),
    justifyContent: "center",
    alignItems: "center",
  },
  title: { fontFamily: fonts.openSan.bold, fontSize: ms(30) },
  btnStyle: { marginTop: ms(40) },
}));
