import type { WebGPURenderer } from "three/webgpu";
import * as THREE from "three";
import { makePreviewSpriteCanvas } from "./textures";
import { SMOKE_ATLAS_GRID, type EmitterPreviewConfig, type SmokeRenderResources } from "./types";

type PreviewGpuSmokeRenderer = {
  createEmitterResources(config: EmitterPreviewConfig, particleBuffer: any): SmokeRenderResources;
  destroyEmitterResources(resources: SmokeRenderResources): void;
  render(
    camera: THREE.PerspectiveCamera,
    targetView: any,
    entries: Array<{ config: EmitterPreviewConfig; smokeRender: SmokeRenderResources }>
  ): void;
  dispose(): void;
};

const CAMERA_UNIFORM_FLOATS = 24;
const EMITTER_UNIFORM_FLOATS = 8;
const COMPOSITE_UNIFORM_FLOATS = 4;

const SMOKE_RENDER_SHADER = /* wgsl */ `
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
  params : vec4f,
}

struct VertexOutput {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
  @location(1) color : vec3f,
  @location(2) alpha : f32,
  @location(3) life : f32,
  @location(4) frame : f32,
  @location(5) seed : f32,
}

struct SmokeFragmentOutput {
  @location(0) accum : vec4f,
  @location(1) reveal : vec4f,
}

@group(0) @binding(0) var<storage, read> particles : array<Particle>;
@group(0) @binding(1) var<uniform> camera : CameraUniforms;
@group(0) @binding(2) var<uniform> emitter : EmitterUniforms;
@group(0) @binding(3) var smokeSampler : sampler;
@group(0) @binding(4) var smokeAtlas : texture_2d<f32>;

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

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex : u32, @builtin(instance_index) instanceIndex : u32) -> VertexOutput {
  let particle = particles[instanceIndex];
  var output : VertexOutput;

  if (particle.extra.z < 0.5) {
    output.position = vec4f(-2.0, -2.0, -2.0, 1.0);
    output.uv = vec2f(0.0, 0.0);
    output.color = vec3f(0.0, 0.0, 0.0);
    output.alpha = 0.0;
    output.life = 0.0;
    output.frame = 0.0;
    output.seed = 0.0;
    return output;
  }

  let life = clamp(particle.timing.x / max(particle.timing.y, 0.0001), 0.0, 1.0);
  let size = mix(particle.timing.z, particle.timing.w, pow(life, 0.42));
  let fadeIn = clamp(life / 0.08, 0.0, 1.0);
  let body = mix(1.05, 0.82, life);
  let fadeOut = pow(1.0 - life, 0.82);
  let groundFade = clamp((particle.position.y + size * 0.55) / max(size * 0.95, 0.001), 0.0, 1.0);
  let alpha = clamp(fadeIn * body * fadeOut * groundFade, 0.0, 1.0);
  let brightness = mix(1.08, 0.62, life);

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
  output.color = emitter.tint.rgb * brightness;
  output.alpha = alpha;
  output.life = life;
  output.frame = particle.extra.w;
  output.seed = particle.misc.x;
  return output;
}

@fragment
fn fragmentMain(input : VertexOutput) -> SmokeFragmentOutput {
  let atlasGrid = max(emitter.params.x, 1.0);
  let frameCount = atlasGrid * atlasGrid;
  let animatedFrame = floor((input.frame + input.life * 5.0 + fract(input.seed * 0.013) * frameCount)) % frameCount;
  let cellX = animatedFrame % atlasGrid;
  let cellY = floor(animatedFrame / atlasGrid);

  let centeredUv = input.uv * 2.0 - vec2f(1.0, 1.0);
  let radial = clamp(1.0 - length(centeredUv), 0.0, 1.0);
  let swirl = input.seed * 0.017 + input.life * 6.28318530718;
  let warp = vec2f(
    sin(swirl + centeredUv.y * 4.5),
    cos(swirl * 1.13 + centeredUv.x * 5.0)
  ) * (0.055 * (1.0 - input.life * 0.75));

  let atlasUvA = (input.uv + vec2f(cellX, cellY)) / atlasGrid;
  let atlasUvB = ((input.uv * 0.86 + vec2f(0.07, 0.05)) + vec2f(cellX, cellY)) / atlasGrid;
  let sampleA = textureSample(smokeAtlas, smokeSampler, atlasUvA + warp / atlasGrid).r;
  let sampleB = textureSample(smokeAtlas, smokeSampler, atlasUvB - warp * 0.55 / atlasGrid).r;
  let density = max(sampleA, sampleB * 0.82) * radial * radial;
  let alpha = clamp(density * input.alpha * emitter.tint.a, 0.0, 1.0);
  let color = input.color * mix(1.08, 0.84, input.life);
  let weight = clamp(alpha * 8.0 + 0.01, 0.01, 8.0);
  var output : SmokeFragmentOutput;
  output.accum = vec4f(color * alpha * weight, alpha * weight);
  output.reveal = vec4f(alpha, alpha, alpha, alpha);
  return output;
}
`;

const COMPOSITE_SHADER = /* wgsl */ `
struct FullscreenOutput {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
}

@group(0) @binding(0) var accumTexture : texture_2d<f32>;
@group(0) @binding(1) var revealTexture : texture_2d<f32>;
@group(0) @binding(2) var linearSampler : sampler;

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex : u32) -> FullscreenOutput {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -3.0),
    vec2f(-1.0, 1.0),
    vec2f(3.0, 1.0)
  );
  var uvs = array<vec2f, 3>(
    vec2f(0.0, 2.0),
    vec2f(0.0, 0.0),
    vec2f(2.0, 0.0)
  );

  var output : FullscreenOutput;
  output.position = vec4f(positions[vertexIndex], 0.0, 1.0);
  output.uv = uvs[vertexIndex];
  return output;
}

@fragment
fn fragmentMain(input : FullscreenOutput) -> @location(0) vec4f {
  let accum = textureSample(accumTexture, linearSampler, input.uv);
  let reveal = textureSample(revealTexture, linearSampler, input.uv).r;
  let alpha = clamp(1.0 - reveal, 0.0, 1.0);
  let color = accum.rgb / max(accum.a, 0.0001);
  return vec4f(color * alpha, alpha);
}
`;

export async function createPreviewGpuSmokeRenderer(input: {
  device: any;
  renderer: WebGPURenderer;
}): Promise<PreviewGpuSmokeRenderer> {
  const context = input.renderer.domElement.getContext("webgpu") as any;
  if (!context) {
    throw new Error("Failed to access the canvas WebGPU context for the smoke renderer.");
  }

  const format = navigator.gpu.getPreferredCanvasFormat();
  let targetWidth = 1;
  let targetHeight = 1;
  let accumulationTexture: any = null;
  let revealTexture: any = null;
  let accumulationView: any = null;
  let revealView: any = null;
  let compositeBindGroup: any = null;
  const cameraUniformBuffer = input.device.createBuffer({
    label: "vfx-preview-smoke-camera",
    size: CAMERA_UNIFORM_FLOATS * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  const compositeUniformBuffer = input.device.createBuffer({
    label: "vfx-preview-smoke-composite",
    size: COMPOSITE_UNIFORM_FLOATS * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  const compositeSampler = input.device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge"
  });

  const shaderModule = input.device.createShaderModule({
    code: SMOKE_RENDER_SHADER,
    label: "vfx-preview-smoke-render"
  });

  const pipeline = await input.device.createRenderPipelineAsync({
    label: "vfx-preview-smoke-pipeline",
    layout: "auto",
    vertex: {
      module: shaderModule,
      entryPoint: "vertexMain"
    },
    fragment: {
      module: shaderModule,
      entryPoint: "fragmentMain",
      targets: [
        {
          format: "rgba16float",
          blend: {
            color: {
              srcFactor: "one",
              dstFactor: "one",
              operation: "add"
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one",
              operation: "add"
            }
          },
          writeMask: GPUColorWrite.ALL
        },
        {
          format: "rgba16float",
          blend: {
            color: {
              srcFactor: "zero",
              dstFactor: "one-minus-src-alpha",
              operation: "add"
            },
            alpha: {
              srcFactor: "zero",
              dstFactor: "one-minus-src-alpha",
              operation: "add"
            }
          },
          writeMask: GPUColorWrite.ALL
        }
      ]
    },
    primitive: {
      topology: "triangle-list",
      cullMode: "none"
    }
  });

  const compositeModule = input.device.createShaderModule({
    code: COMPOSITE_SHADER,
    label: "vfx-preview-smoke-composite"
  });

  const compositePipeline = await input.device.createRenderPipelineAsync({
    label: "vfx-preview-smoke-composite-pipeline",
    layout: "auto",
    vertex: {
      module: compositeModule,
      entryPoint: "vertexMain"
    },
    fragment: {
      module: compositeModule,
      entryPoint: "fragmentMain",
      targets: [
        {
          format,
          blend: {
            color: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add"
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add"
            }
          },
          writeMask: GPUColorWrite.ALL
        }
      ]
    },
    primitive: {
      topology: "triangle-list",
      cullMode: "none"
    }
  });

  function ensureTargets() {
    const width = Math.max(1, input.renderer.domElement.width);
    const height = Math.max(1, input.renderer.domElement.height);
    if (width === targetWidth && height === targetHeight && accumulationTexture && revealTexture && compositeBindGroup) {
      return;
    }

    accumulationTexture?.destroy();
    revealTexture?.destroy();

    targetWidth = width;
    targetHeight = height;

    accumulationTexture = input.device.createTexture({
      label: "vfx-preview-smoke-accumulation",
      size: [width, height, 1],
      format: "rgba16float",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
    revealTexture = input.device.createTexture({
      label: "vfx-preview-smoke-reveal",
      size: [width, height, 1],
      format: "rgba16float",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });

    accumulationView = accumulationTexture.createView();
    revealView = revealTexture.createView();
    compositeBindGroup = input.device.createBindGroup({
      layout: compositePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: accumulationView },
        { binding: 1, resource: revealView },
        { binding: 2, resource: compositeSampler }
      ]
    });
  }

  function createEmitterResources(config: EmitterPreviewConfig, particleBuffer: any): SmokeRenderResources {
    const canvas = makePreviewSpriteCanvas("smoke");
    const gpuTexture = input.device.createTexture({
      label: `vfx-preview-smoke-atlas-${config.emitterId}`,
      size: [canvas.width, canvas.height, 1],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });
    input.device.queue.copyExternalImageToTexture(
      { source: canvas },
      { texture: gpuTexture },
      { width: canvas.width, height: canvas.height }
    );

    const textureView = gpuTexture.createView();
    const sampler = input.device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge"
    });

    const emitterUniformBuffer = input.device.createBuffer({
      label: `vfx-preview-smoke-emitter-${config.emitterId}`,
      size: EMITTER_UNIFORM_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    const tint = config.color.clone();
    const emitterUniforms = new Float32Array(EMITTER_UNIFORM_FLOATS);
    emitterUniforms[0] = tint.r;
    emitterUniforms[1] = tint.g;
    emitterUniforms[2] = tint.b;
    emitterUniforms[3] = 1;
    emitterUniforms[4] = SMOKE_ATLAS_GRID;
    emitterUniforms[5] = 0;
    emitterUniforms[6] = 0;
    emitterUniforms[7] = 0;
    input.device.queue.writeBuffer(emitterUniformBuffer, 0, emitterUniforms);

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
      texture: gpuTexture,
      textureView,
      sampler
    };
  }

  function destroyEmitterResources(resources: SmokeRenderResources) {
    resources.texture.destroy();
    resources.emitterUniformBuffer.destroy();
  }

  function render(
    camera: THREE.PerspectiveCamera,
    targetView: any,
    entries: Array<{ config: EmitterPreviewConfig; smokeRender: SmokeRenderResources }>
  ) {
    if (entries.length === 0) {
      return;
    }

    ensureTargets();

    const viewProj = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const matrix = camera.matrixWorld.elements;
    const cameraUniforms = new Float32Array(CAMERA_UNIFORM_FLOATS);
    cameraUniforms.set(viewProj.elements, 0);
    cameraUniforms.set([matrix[0] ?? 1, matrix[1] ?? 0, matrix[2] ?? 0, 0], 16);
    cameraUniforms.set([matrix[4] ?? 0, matrix[5] ?? 1, matrix[6] ?? 0, 0], 20);
    input.device.queue.writeBuffer(cameraUniformBuffer, 0, cameraUniforms);

    const encoder = input.device.createCommandEncoder({ label: "vfx-preview-smoke-render-pass" });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: accumulationView,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store"
        },
        {
          view: revealView,
          clearValue: { r: 1, g: 1, b: 1, a: 1 },
          loadOp: "clear",
          storeOp: "store"
        }
      ]
    });

    pass.setPipeline(pipeline);
    for (const entry of entries) {
      pass.setBindGroup(0, entry.smokeRender.bindGroup);
      pass.draw(6, entry.config.maxParticleCount, 0, 0);
    }
    pass.end();

    const compositePass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: targetView,
          loadOp: "load",
          storeOp: "store"
        }
      ]
    });
    compositePass.setPipeline(compositePipeline);
    compositePass.setBindGroup(0, compositeBindGroup);
    compositePass.draw(3, 1, 0, 0);
    compositePass.end();

    input.device.queue.submit([encoder.finish()]);
  }

  return {
    createEmitterResources,
    destroyEmitterResources,
    render,
    dispose() {
      accumulationTexture?.destroy();
      revealTexture?.destroy();
      compositeUniformBuffer.destroy();
      cameraUniformBuffer.destroy();
    }
  };
}