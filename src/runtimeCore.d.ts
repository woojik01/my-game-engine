import type { Obj, Scene, Camera, Resolution, SoundAsset } from './runtime';
export type EngineOptions = {
  scenes?: Scene[]; sceneId?: string; gravity?: number; camera?: Camera; resolution?: Resolution;
  sounds?: SoundAsset[]; onSceneChange?: (scene: Scene) => void;
  gamepadSource?: () => ArrayLike<Gamepad | null>;
};
export interface RuntimeEngine {
  active: boolean; objects: Obj[]; scenes: Scene[]; sceneId: string; gravity: number;
  camera: Camera; resolution: Resolution; sounds: SoundAsset[];
  keys: Set<string>; mouse: boolean; pointerX: number; pointerY: number; elapsed: number;
  vars: Record<string, any>; workspaces: Map<string, any[]>; procedures: Map<string, Map<string, any>>;
  start(): Promise<void>; stop(): void; click(obj: Obj): void; update(delta?: number): void;
  eval(block: any, obj: Obj, scope?: any): any; run(block: any, obj: Obj, epoch?: number, depth?: number, scope?: any): Promise<void>;
  setGamepadButtons(buttons: string[]): void; unlockAudio(): void;
}
export function engineFactory(): { new(objects: Obj[], onError?: (message: string) => void, options?: EngineOptions): RuntimeEngine };
