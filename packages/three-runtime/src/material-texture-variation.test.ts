import { describe, expect, test } from "bun:test";
import { DataTexture, MeshStandardMaterial, RGBAFormat, UnsignedByteType } from "three";
import { applyTextureVariationToStandardMaterial } from "./material-texture-variation";

describe("material texture variation", () => {
  test("patches standard materials with the voronoi texture variation shader hook", () => {
    const material = new MeshStandardMaterial();
    material.map = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat, UnsignedByteType);
    const shader = {
      fragmentShader: [
        "#include <common>",
        "#include <map_fragment>",
        "#include <normal_fragment_maps>",
        "#include <roughnessmap_fragment>",
        "#include <metalnessmap_fragment>",
      ].join("\n"),
      uniforms: {},
      vertexShader: [
        "#include <common>",
        "#include <uv_vertex>",
      ].join("\n"),
    };

    applyTextureVariationToStandardMaterial(material, {
      enabled: true,
      scale: 5,
    });
    material.onBeforeCompile(shader as never, undefined as never);

    expect((material.userData as { whTextureVariation?: { enabled: boolean; scale: number } }).whTextureVariation).toEqual({
      enabled: true,
      scale: 5,
    });
    expect(shader.vertexShader).toContain("vWhTextureVariationUv");
    expect(shader.fragmentShader).toContain("whResolveTextureVariation");
    expect((shader.uniforms as { whTextureVariationScale?: { value: number } }).whTextureVariationScale?.value).toBe(5);
  });
});