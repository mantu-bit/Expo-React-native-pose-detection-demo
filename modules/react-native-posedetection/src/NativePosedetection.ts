// import { TurboModuleRegistry, type TurboModule } from 'react-native';

// export interface Spec extends TurboModule {
//   multiply(a: number, b: number): number;
// }

// export default TurboModuleRegistry.getEnforcing<Spec>('Posedetection');

import { TurboModuleRegistry, type TurboModule } from "react-native";

export interface Spec extends TurboModule {
  multiply(a: number, b: number): number;
  initModel(): void;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>("Posedetection");
