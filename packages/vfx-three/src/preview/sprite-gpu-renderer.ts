import type { WebGPURenderer } from "three/webgpu";
import * as THREE from "three";
import { makePreviewSpriteCanvas } from "./textures";
import type { EmitterPreviewConfig, SpriteGpuRenderResources } from "./types";

type PreviewGpuSpriteRenderer = {
  createEmitterResources(config: EmitterPreviewConfig, particleBuffer: any): SpriteGpuRenderResources;
  destroyEmitterResources(resources: SpriteGpuRenderResources): void;
  render(
    camera: THREE.PerspectiveCamera,
    targetView: any,
    entries: Array<{ config: EmitterPreviewConfig; spriteGpuRender: SpriteGpuRenderResources; instanceCount: number }>
  ): void;
  dispose(): void;
};

const CAMERA_UNIFORM_FLOATS = 24;
const EMITTER_UNIFORM_FLOATS = 16;

const SPRITE_RENDER_SHADER = /* wgsl */ `
struct Particle {
  position : vec4f,
  velocity : vec4f,
  timing : vec4f,
  extra : vec4f,
  misc : vec4f,
}

struct CameraUniforms {
  viewProj : mat4x4f,
  cameraRight : vec4f,
  cameraUp : vec4f,
}

struct EmitterUniforms {
  tint : vec4f,
  settings0 : vec4f,
  settings1 : vec4f,
  settings2 : vec4f,
}

struct VertexOutput {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
  @location(1) color : vec3f,
  @location(2) alpha : f32,
}

@group(0) @binding(0) var<storage, read> particles : array<Particle>;
@group(0) @binding(1) var<uniform> camera : CameraUniforms;
@group(0) @binding(2) var<uniform> emitter : EmitterUniforms;
@group(0) @binding(3) var spriteSampler : sampler;
@group(0) @binding(4) var spriteAtlas : texture_2d<f32>;

fn quadCorner(vertexIndex: u32) -> vec2f {
  switch (vertexIndex) {
    case 0u: { return vec2f(-1.0, -1.0); }
    case 1u: { return vec2f(1.0, -1.0); }
    case 2u: { return vec2f(-1.0, 1.0); }
    case 3u: { return vec2f(-1.0, 1.0); }
    case 4u: { return vec2f(1.0, -1.0); }
    default: { return vec2f(1.0, 1.0); }
  }
}

fn quadUv(vertexIndex: u32) -> vec2f {
  switch (vertexIndex) {
    case 0u: { return vec2f(0.0, 0.0); }
    case 1u: { return vec2f(1.0, 0.0); }
    case 2u: { return vec2f(0.0, 1.0); }
    case 3u: { return vec2f(0.0, 1.0); }
    case 4u: { return vec2f(1.0, 0.0); }
    default: { return vec2f(1.0, 1.0); }
  }
}

fn evalSize(curve: f32, life: f32, startSize: f32, endSize: f32) -> f32 {
  if (curve < 0.5) {
    return mix(startSize, endSize, 1.0 - pow(1.0 - life, 3.0));
  }
  if (curve < 1.5) {
    return mix(startSize, endSize, pow(clamp(life, 0.0, 1.0), 0.42));
  }
  if (curve < 2.5) {
    return mix(startSize, endSize, 1.0 - pow(1.0 - clamp(life, 0.0, 1.0), 1.35));
  }
  return mix(startSize, endSize, clamp(life, 0.0, 1.0));
}

fn evalAlpha(curve: f32, life: f32, isSmoke: f32) -> f32 {
  if (curve < 0.5) {
    return pow(1.0 - life, 2.2);
  }
  if (curve < 1.5 || isSmoke > 0.5) {
    let fadeIn = clamp(life / 0.08, 0.0, 1.0);
    let body = mix(1.05, 0.82, clamp(life, 0.0, 1.0));
    let fadeOut = pow(1.0 - life, 0.82);
    return clamp(fadeIn * body * fadeOut, 0.0, 1.0);
  }
  if (curve < 2.5) {
    let fadeIn = clamp(life / 0.08, 0.0, 1.0);
    let body = 1.0 - clamp((life - 0.18) / 0.72, 0.0, 1.0) * 0.18;
    let fadeOut = pow(1.0 - life, 0.72);
    return clamp(fadeIn * body * fadeOut, 0.0, 1.0);
  }
  return 1.0 - life;
}

fn evalColor(curve: f32, life: f32, tint: vec3f, isSmoke: f32) -> vec3f {
  if (curve < 0.5) {
    let hot = vec3f(1.0, 1.0, 1.0);
    if (life < 0.22) {
      return mix(hot, tint, life / 0.22);
    }
    return tint * mix(1.0, 0.45, clamp((life - 0.22) / 0.78, 0.0, 1.0));
  }
  if (curve < 1.5 || isSmoke > 0.5) {
    return tint * mix(1.08, 0.62, clamp(life, 0.0, 1.0));
  }
  if (curve < 2.5) {
    return mix(tint, vec3f(0.48, 0.12, 0.02), clamp(life * 0.55, 0.0, 1.0)) * mix(1.12, 0.52, clamp(life, 0.0, 1.0));
  }
  return tint;
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex : u32, @builtin(instance_index) instanceIndex : u32) -> VertexOutput {
  let particle = particles[instanceIndex];
  var output : VertexOutput;

  if (particle.extra.z < 0.5) {
    output.position = vec4f(-2.0, -2.0, -2.0, 1.0);
    output.uv = vec2f(0.0, 0.0);
    output.color = vec3f(0.0, 0.0, 0.0);
    output.alpha = 0.0;
    return output;
  }

  let life = clamp(particle.timing.x / max(particle.timing.y, 0.0001), 0.0, 1.0);
  let size = evalSize(emitter.settings0.y, life, particle.timing.z, particle.timing.w);
  let alpha = evalAlpha(emitter.settings0.z, life, emitter.settings2.x);
  let color = evalColor(emitter.settings0.w, life, emitter.tint.rgb, emitter.settings2.x);

  let corner = quadCorner(vertexIndex);
  let uv = quadUv(vertexIndex);
  let rotation = particle.extra.x;
  let cosR = cos(rotation);
  let sinR = sin(rotation);
  let rotatedCorner = vec2f(
    corner.x * cosR - corner.y * sinR,
    corner.x * sinR + corner.y * cosR
  );
  let worldPosition = particle.position.xyz
    + camera.cameraRight.xyz * rotatedCorner.x * size
    + camera.cameraUp.xyz * rotatedCorner.y * size;

  output.position = camera.viewProj * vec4f(worldPosition, 1.0);
  output.uv = uv;
  output.color = color;
  output.alpha = alpha;
  return output;
}

@fragment
fn fragmentMain(input : VertexOutput) -> @location(0) vec4f {
  let atlasGrid = max(emitter.settings0.x, 1.0);
  let frame = emitter.settings1.x;
  let cellX = frame % atlasGrid;
  let cellY = floor(frame / atlasGrid);
  let atlasUv = (input.uv + vec2f(cellX, cellY)) / atlasGrid;
  let sampleAlpha = textureSample(spriteAtlas, spriteSampler, atlasUv).r;
  let alpha = clamp(sampleAlpha * input.alpha * emitter.tint.a, 0.0, 1.0);
  return vec4f(input.color * alpha, alpha);
}
`;

function curveCode(curve: string | undefined) {
  if (curve === "smoke-soft") return 1;
  if (curve === "flame-rise" || curve === "flame-soft" || curve === "flame-warm") return 2;
  return 0;
}

export async function createPreviewGpuSpriteRenderer(input: {
  device: any;
  renderer: WebGPURenderer;
}): Promise<PreviewGpuSpriteRenderer> {
  const context = input.renderer.domElement.getContext("webgpu") as any;
  if (!context) {
    throw new Error("Failed to access the canvas WebGPU context for the sprite renderer.");
  }

  const format = navigator.gpu.getPreferredCanvasFormat();
  const cameraUniformBuffer = input.device.createBuffer({
    label: "vfx-preview-sprite-camera",
    size: CAMERA_UNIFORM_FLOATS * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  const shaderModule = input.device.createShaderModule({
    code: SPRITE_RENDER_SHADER,
    label: "vfx-preview-sprite-render"
  });

  const additivePipeline = await input.device.createRenderPipelineAsync({
    label: "vfx-preview-sprite-additive-pipeline",
    layout: "auto",
    vertex: { module: shaderModule, entryPoint: "vertexMain" },
    fragment: {
      module: shaderModule,
      entryPoint: "fragmentMain",
      targets: [{
        format,
        blend: {
          color: { srcFactor: "one", dstFactor: "one", operation: "add" },
          alpha: { srcFactor: "one", dstFactor: "one", operation: "add" }
        },
        writeMask: GPUColorWrite.ALL
      }]
    },
    primitive: { topology: "triangle-list", cullMode: "none" }
  });

  const alphaPipeline = await input.device.createRenderPipelineAsync({
    label: "vfx-preview-sprite-alpha-pipeline",
    layout: "auto",
    vertex: { module: shaderModule, entryPoint: "vertexMain" },
    fragment: {
      module: shaderModule,
      entryPoint: "fragmentMain",
      targets: [{
        format,
        blend: {
          color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
          alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" }
        },
        writeMask: GPUColorWrite.ALL
      }]
    },
    primitive: { topology: "triangle-list", cullMode: "none" }
  });

  function createEmitterResources(config: EmitterPreviewConfig, particleBuffer: any): SpriteGpuRenderResources {
    const canvas = makePreviewSpriteCanvas(config.texturePreset);
    const texture = input.device.createTexture({
      label: `vfx-preview-sprite-atlas-${config.emitterId}`,
      size: [canvas.width, canvas.height, 1],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });
    input.device.queue.copyExternalImageToTexture(
      { source: canvas },
      { texture },
      { width: canvas.width, height: canvas.height }
    );

    const textureView = texture.createView();
    const sampler = input.device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge"
    });

    const emitterUniformBuffer = input.device.createBuffer({
      label: `vfx-preview-sprite-emitter-${config.emitterId}`,
      size: EMITTER_UNIFORM_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    const atlasGrid = config.texturePreset === "smoke" ? 2 : 1;
    const uniforms = new Float32Array(EMITTER_UNIFORM_FLOATS);
    uniforms[0] = config.color.r;
    uniforms[1] = config.color.g;
    uniforms[2] = config.color.b;
    uniforms[3] = 1;
    uniforms[4] = atlasGrid;
    uniforms[5] = curveCode(config.sizeCurve);
    uniforms[6] = curveCode(config.alphaCurve);
    uniforms[7] = curveCode(config.colorCurve);
    uniforms[8] = 0;
    uniforms[9] = 0;
    uniforms[10] = 0;
    uniforms[11] = 0;
    uniforms[12] = config.isSmoke ? 1 : 0;
    uniforms[13] = 0;
    uniforms[14] = 0;
    uniforms[15] = 0;
    input.device.queue.writeBuffer(emitterUniformBuffer, 0, uniforms);

    const pipeline = config.additive ? additivePipeline : alphaPipeline;
    const bindGroup = input.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: particleBuffer } },
        { binding: 1, resource: { buffer: cameraUniformBuffer } },
        { binding: 2, resource: { buffer: emitterUniformBuffer } },
        { binding: 3, resource: sampler },
        { binding: 4, resource: textureView }
      ]
    });

    return {
      bindGroup,
      emitterUniformBuffer,
      texture,
      textureView,
      sampler,
      blendMode: config.additive ? "additive" : "alpha"
    };
  }

  function destroyEmitterResources(resources: SpriteGpuRenderResources) {
    resources.texture.destroy();
    resources.emitterUniformBuffer.destroy();
  }

  function render(
    camera: THREE.PerspectiveCamera,
    targetView: any,
    entries: Array<{ config: EmitterPreviewConfig; spriteGpuRender: SpriteGpuRenderResources; instanceCount: number }>
  ) {
    if (entries.length === 0) {
      return;
    }

    const viewProj = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const matrix = camera.matrixWorld.elements;
    const cameraUniforms = new Float32Array(CAMERA_UNIFORM_FLOATS);
    cameraUniforms.set(viewProj.elements, 0);
    cameraUniforms.set([matrix[0] ?? 1, matrix[1] ?? 0, matrix[2] ?? 0, 0], 16);
    cameraUniforms.set([matrix[4] ?? 0, matrix[5] ?? 1, matrix[6] ?? 0, 0], 20);
    input.device.queue.writeBuffer(cameraUniformBuffer, 0, cameraUniforms);

    const encoder = input.device.createCommandEncoder({ label: "vfx-preview-sprite-render-pass" });
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: targetView, loadOp: "load", storeOp: "store" }]
    });

    let currentBlendMode: "additive" | "alpha" | null = null;
    for (const entry of entries) {
      const nextBlendMode = entry.spriteGpuRender.blendMode;
      if (nextBlendMode !== currentBlendMode) {
        pass.setPipeline(nextBlendMode === "additive" ? additivePipeline : alphaPipeline);
        currentBlendMode = nextBlendMode;
      }
      pass.setBindGroup(0, entry.spriteGpuRender.bindGroup);
      pass.draw(6, entry.instanceCount, 0, 0);
    }

    pass.end();
    input.device.queue.submit([encoder.finish()]);
  }

  return {
    createEmitterResources,
    destroyEmitterResources,
    render,
    dispose() {
      cameraUniformBuffer.destroy();
    }
  };
}