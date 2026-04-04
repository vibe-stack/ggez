import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(resolveDracoDecoderPath());

function resolveDracoDecoderPath(): string {
  const baseUrl = import.meta.env?.BASE_URL ?? "/";
  return `${baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`}draco/`;
}

export function createConfiguredGLTFLoader(): GLTFLoader {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.setDRACOLoader(dracoLoader);
  return loader;
}