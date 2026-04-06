declare module "three/webgpu" {
  export class WebGPURenderer {
    constructor(parameters?: Record<string, unknown>);
    readonly domElement: HTMLCanvasElement;
    init(): Promise<void>;
    dispose(): void;
    render(scene: unknown, camera: unknown): void;
    setClearColor(color: unknown, alpha?: number): void;
    setPixelRatio(value: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
  }
}

declare module "three/examples/jsm/controls/OrbitControls.js" {
  export class OrbitControls {
    constructor(object: unknown, domElement?: HTMLElement);
    target: { set(x: number, y: number, z: number): void };
    enableDamping: boolean;
    dampingFactor: number;
    minDistance: number;
    maxDistance: number;
    update(): void;
    dispose(): void;
  }
}