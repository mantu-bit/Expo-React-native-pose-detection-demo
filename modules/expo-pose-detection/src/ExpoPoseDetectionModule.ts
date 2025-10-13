import { NativeModule, requireNativeModule } from "expo";
import {
  ExpoPoseDetectionHandler,
  ExpoPoseDetectionModuleEvents,
} from "./ExpoPoseDetectionHandler.types";

// This call loads the native module object from the JSI
export const ExpoPoseDetectionModule = requireNativeModule<
  NativeModule<ExpoPoseDetectionModuleEvents> & ExpoPoseDetectionHandler
>("ExpoPoseDetection");
