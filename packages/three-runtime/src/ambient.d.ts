declare module "three/webgpu" {
  import type * as THREE from "three";

  export class MeshStandardNodeMaterial extends THREE.MeshStandardMaterial {
    constructor(parameters?: Record<string, unknown>);
    colorNode: unknown;
    metalnessNode: unknown;
    roughnessNode: unknown;
  }
}

declare module "three/tsl" {
  export function Fn(callback: (...args: any[]) => any): any;
  export function If(condition: any, onTrue: () => void): any;
  export function Loop(...args: any[]): any;
  export function attribute(name: string, type?: string): any;
  export function clamp(value: any, low: any, high: any): any;
  export function dot(a: any, b: any): any;
  export function float(value?: number): any;
  export function floor(value: any): any;
  export function fract(value: any): any;
  export function int(value?: number): any;
  export const materialColor: any;
  export const materialMetalness: any;
  export const materialRoughness: any;
  export function max(...values: any[]): any;
  export function mix(a: any, b: any, t: any): any;
  export function normalMap(value: any): any;
  export function sin(value: any): any;
  export function smoothstep(low: any, high: any, value: any): any;
  export function sqrt(value: any): any;
  export function step(edge: any, value: any): any;
  export function texture(value: any, uv?: any): any;
  export function uniform(value: any, type?: string): any;
  export function uv(index?: number): any;
  export function vec2(x: any, y?: any): any;
  export function vec3(x: any, y?: any, z?: any): any;
  export function vec4(x: any, y?: any, z?: any, w?: any): any;
}