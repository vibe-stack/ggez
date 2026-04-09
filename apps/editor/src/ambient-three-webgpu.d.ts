declare module "three/webgpu" {
  import type * as THREE from "three";
  export class WebGPURenderer {
    constructor(parameters?: Record<string, unknown>);
    readonly domElement: HTMLCanvasElement;
    autoClear: boolean;
    init(): Promise<void>;
    dispose(): void;
    clear(): void;
    render(scene: unknown, camera: unknown): void;
    setClearColor(color: unknown, alpha?: number): void;
    setPixelRatio(value: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
  }
  export class MeshBasicNodeMaterial extends THREE.Material {
    constructor(parameters?: {
      transparent?: boolean;
      depthWrite?: boolean;
      depthTest?: boolean;
      blending?: THREE.Blending;
      side?: THREE.Side;
      map?: THREE.Texture | null;
    });
    colorNode: unknown;
    opacityNode: unknown;
    map: THREE.Texture | null;
  }
}

declare module "three/tsl" {
  export function attribute(name: string, type?: string): any;
  export function uv(index?: number): any;
  export function texture(map: any, uv?: any): any;
  export const materialColor: any;
}