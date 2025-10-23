# Human Pose Detection Demo with Expo Modules

A modern React Native app demonstrating real-time human pose detection using custom Expo modules, MediaPipe, and React Native Vision Camera. This project showcases how to build cross-platform mobile applications with advanced computer vision capabilities for Android, iOS, and Web.

## Features

- **Real-time Pose Detection**: Live human pose estimation with 33 keypoints using MediaPipe Pose Landmarker
- **Custom Expo Module**: Native pose detection module with TypeScript support
- **Camera Integration**: React Native Vision Camera with frame processing capabilities
- **Visual Overlay**: Real-time skeleton rendering with customizable line and circle drawing
- **Cross-platform**: Works on Android, iOS, and Web platforms
- **Authentication Flow**: Login, logout, and user state management with Redux Toolkit
- **Navigation**: Bottom tab navigation with Home and Profile screens using React Navigation
- **Custom Theming**: Light and dark themes powered by Unistyles
- **Localization**: Built-in support for English and Spanish (i18n-js, expo-localization)
- **Reusable Components**: Button, TextField, FullScreenLoader, Toast notifications, and more
- **API Integration**: Axios-based API client with RTK Query for authentication and user endpoints
- **Persistent State**: Redux state persistence using redux-persist and MMKV storage
- **Custom Fonts**: Open Sans font family included and pre-configured
- **Responsive Design**: Breakpoints and scaling utilities for adaptive layouts
- **Expo EAS Ready**: Pre-configured for EAS build and deployment

## Pose Detection Capabilities

- **33 Keypoints**: Full body pose detection including face, arms, legs, and torso
- **Real-time Processing**: Frame-by-frame pose estimation with minimal latency
- **Visual Feedback**: Toggle-able skeleton overlay with customizable colors and styles
- **Camera Controls**: Front/back camera switching and permission handling
- **Performance Optimized**: Efficient frame processing using worklets and shared values

## Reference Implementation

This project is inspired by the excellent work in the [Movement repository](https://github.com/AilsonFreire/movement) by Ailson Freire, which demonstrates advanced pose detection techniques and visual overlays.

## Project Structure

```
reactnativetemplateapp/
  ├── android/           # Native Android project
  ├── ios/               # Native iOS project
  ├── modules/           # Custom Expo modules
  │   └── expo-pose-detection/  # Pose detection module
  │       ├── android/   # Android native implementation
  │       ├── ios/       # iOS native implementation
  │       ├── src/       # TypeScript module interface
  │       └── expo-module.config.json
  ├── src/
  │   ├── assets/        # Fonts and images
  │   ├── components/    # Reusable UI components
  │   ├── constants/     # App-wide constants
  │   ├── localization/  # i18n setup and translations
  │   ├── navigation/    # Navigation stacks and tabs
  │   ├── redux/         # Redux store, slices, services
  │   ├── screens/       # App screens (Home with pose detection, Login, Profile)
  │   │   └── Home/      # Pose detection implementation
  │   │       ├── Home.js           # Main camera and pose display
  │   │       └── usePosedetection.ts # Pose detection hook
  │   ├── storage/       # Storage utilities
  │   ├── styles/        # Theming and breakpoints
  │   ├── theme/         # Font and text styles
  │   └── utils/         # Helper functions
  ├── App.js             # App entry point
  ├── app.json           # Expo app config
  ├── package.json       # Project dependencies and scripts
  └── ...
```

## Pose Detection Module Architecture

The `expo-pose-detection` module provides a bridge between React Native and native pose detection capabilities:

- **Native Implementation**: Android (Kotlin) and iOS (Swift) modules using MediaPipe
- **TypeScript Interface**: Type-safe API for pose landmark detection
- **Event-driven**: Real-time pose data through event listeners
- **Cross-platform**: Unified API across Android, iOS, and Web platforms

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer recommended)
- [Yarn](https://classic.yarnpkg.com/en/docs/install/) or npm
- [Expo CLI](https://docs.expo.dev/get-started/installation/)

### Installation

1. **Clone the repository:**
   ```sh
   git clone <your-repo-url>
   cd reactnativetemplateapp
   ```
2. **Install dependencies:**
   ```sh
   yarn install
   # or
   npm install
   ```
3. **Start the development server:**
   ```sh
   yarn start
   # or
   npm run start
   ```

### Running on Devices

- **Android:**
  ```sh
  yarn android
  ```
- **iOS:**
  ```sh
  yarn ios
  ```
- **Web:**
  ```sh
  yarn web
  ```

### Build Scripts

- `yarn build:android:staging` / `yarn build:android:development` / `yarn build:android:production`
- `yarn build:ios:staging` / `yarn build:ios:development` / `yarn build:ios:production`

See `package.json` for all available scripts.

## Theming & Customization

- Uses [react-native-unistyles](https://unistyl.es/) for adaptive theming (light/dark).
- Edit `src/styles/themes.ts` to customize colors.
- Responsive breakpoints in `src/styles/breakpoints.ts`.

## Localization

- English and Spanish translations in `src/localization/translations/`.
- Add more languages by extending the translation files and updating `src/localization/i18n.js`.

## API & State Management

- API base URL is set via environment variables (`EXPO_PUBLIC_BASE_URL`).
- Authentication endpoints: `/auth/login`, `/auth/register`, `/auth/logout`.
- Redux Toolkit Query for API calls, with persistent state using MMKV.

## Custom Components

- **Button**: Primary, secondary, and disabled styles, loading state, icons.
- **TextField**: Customizable input with optional icons.
- **FullScreenLoader**: Modal loading indicator.
- **ToastAlert**: Success and error toast notifications.
- **ScreenWrapper**: Handles safe area, scroll, and loading overlay.

## Fonts

- Open Sans font family included in `src/assets/fonts/` and loaded via `src/theme/fonts.js`.

## Pose Detection Usage

### Basic Implementation

```typescript
import {
  addPoseLandmarksListener,
  addPoseStatusListener,
  addPoseErrorListener,
  type PoseLandmark,
} from "../modules/expo-pose-detection";

// Subscribe to pose detection events
const landmarksSubscription = addPoseLandmarksListener((event) => {
  const landmarks = event.landmarks[0]; // 33 keypoints array
  // Process pose data
});

const statusSubscription = addPoseStatusListener((event) => {
  console.log("Pose detection status:", event.status);
});

const errorSubscription = addPoseErrorListener((event) => {
  console.error("Pose detection error:", event.error);
});

// Cleanup listeners
landmarksSubscription.remove();
statusSubscription.remove();
errorSubscription.remove();
```

### Custom Hook Usage

```typescript
import { usePoseDetection } from "./usePosedetection";

function PoseDetectionScreen() {
  const { landmarks, status, error, poseCount } = usePoseDetection();

  return (
    <View>
      <Text>Status: {status}</Text>
      <Text>Pose Count: {poseCount}</Text>
      {error && <Text>Error: {error}</Text>}
    </View>
  );
}
```

## Technologies Used

### Core Technologies

- [Expo](https://expo.dev/) - Development platform and tools
- [React Native](https://reactnative.dev/) - Cross-platform mobile framework
- [Expo Modules](https://docs.expo.dev/modules/overview/) - Custom native modules
- [MediaPipe](https://mediapipe.dev/) - Machine learning framework for pose detection

### Camera & Vision

- [React Native Vision Camera](https://react-native-vision-camera.com/) - Camera library with frame processing
- [Shopify Skia](https://shopify.github.io/react-native-skia/) - 2D graphics library for pose visualization
- [React Native Worklets Core](https://github.com/margelo/react-native-worklets-core) - High-performance frame processing

### State Management & Navigation

- [Redux Toolkit](https://redux-toolkit.js.org/) - State management
- [React Navigation](https://reactnavigation.org/) - Navigation library
- [React Redux](https://react-redux.js.org/) - React bindings for Redux

### UI & Styling

- [Unistyles](https://unistyl.es/) - Adaptive theming system
- [i18n-js](https://github.com/fnando/i18n-js) - Internationalization
- [MMKV Storage](https://github.com/mrousavy/react-native-mmkv) - Fast key-value storage

### API & Networking

- [Axios](https://axios-http.com/) - HTTP client
- [RTK Query](https://redux-toolkit.js.org/rtk-query/overview) - Data fetching and caching

## Environment Variables

- Configure API endpoints in `.env.*` files (see `eas.json` for examples):
  - `EXPO_PUBLIC_BASE_URL`
  - `EXPO_PUBLIC_SOCKET_URL`

## Pose Detection Features

### Keypoint Detection

The app detects 33 keypoints representing different body parts:

- **Face**: 0-10 (nose, eyes, ears, mouth)
- **Upper Body**: 11-16 (shoulders, elbows, wrists)
- **Lower Body**: 23-32 (hips, knees, ankles, feet)

### Visual Controls

- **Toggle Lines**: Show/hide skeleton connections between keypoints
- **Toggle Circles**: Show/hide keypoint markers
- **Camera Switch**: Toggle between front and back cameras
- **Real-time Overlay**: Live pose visualization on camera feed

### Performance Features

- **Frame Processing**: Efficient worklet-based frame processing
- **Shared Values**: Optimized data sharing between JS and native threads
- **Event-driven Architecture**: Real-time pose updates through event listeners

## Development Notes

### Camera Permissions

The app requires camera permissions to function. Make sure to grant camera access when prompted.

### Platform Differences

- **iOS**: Uses RGB pixel format for front camera, YUV for back camera
- **Android**: Uses YUV pixel format by default
- **Performance**: Frame processing optimized for each platform

### Troubleshooting

- Ensure camera permissions are granted
- Check that the pose detection model is properly loaded
- Verify MediaPipe dependencies are correctly installed

## Build & Deployment

### GitHub Actions Workflows

This project includes an automated GitHub Actions workflow for building and releasing APK files:

#### Available Workflow

**`build-android-apk.yml`** - Build & Auto Release Android APK

- **Manual dispatch only** with build type selection (development, staging, production)
- Automatic version tagging and GitHub release creation
- APK artifacts uploaded to GitHub releases
- Build logs and changelog generation
- Environment-specific builds with proper naming

**Features:**

- Supports development, staging, and production builds
- Automatic version increment based on git tags
- GitHub release creation with changelog
- APK artifacts available for 30 days
- Build logs uploaded for troubleshooting

#### Usage

- **Manual**: Go to Actions tab → Select "Build & Auto Release Android APK" → Run workflow
- **Build Types**: Choose from development, staging, or production
- **Download**: APK available in GitHub releases section

See `.github/workflows/README.md` for detailed workflow documentation.

### Local APK Building

For local APK builds, you can use the standard React Native build process:

```bash
# Install dependencies
yarn install

# Setup Expo
npx expo prebuild --platform android

# Build APK
cd android
./gradlew assembleRelease
```

### EAS Build

- Pre-configured for [Expo Application Services (EAS)](https://docs.expo.dev/eas/).
- See `eas.json` for build profiles.
- Custom modules require development builds (not Expo Go)

## License

This project is provided as a template and does not include a license by default. Add your own license as needed.

## Acknowledgments

Special thanks to [Ailson Freire](https://github.com/AilsonFreire) for the inspiring [Movement project](https://github.com/AilsonFreire/movement) that served as a reference for this implementation.
