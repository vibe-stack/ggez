import { createThreeWebGpuPreviewRuntime } from "./runtime";
import type { CreateThreeWebGpuPreviewControllerInput, ThreeWebGpuPreviewController, ThreeWebGpuPreviewState } from "./types";

export async function createThreeWebGpuPreviewController(
  input: CreateThreeWebGpuPreviewControllerInput
): Promise<ThreeWebGpuPreviewController> {
  (input.renderer as any).autoClear = false;

  const runtime = await createThreeWebGpuPreviewRuntime(input);
  let disposed = false;
  let rafId = 0;
  let lastTime = performance.now();
  let currentState: ThreeWebGpuPreviewState | null = null;

  function tick(now: number) {
    if (disposed) {
      return;
    }

    rafId = window.requestAnimationFrame(tick);
    const rawDeltaTime = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    const playbackRate = Math.max(0.001, currentState?.document.preview.playbackRate ?? 1);
    const deltaTime = rawDeltaTime * playbackRate;

    runtime.step(deltaTime, now / 1000);
    input.onBeforeRender?.();
    (input.renderer as any).clear?.();
    input.renderer.render(input.scene, input.camera);
    runtime.renderToCurrentTexture(now / 1000);
  }

  rafId = window.requestAnimationFrame(tick);

  return {
    update(next) {
      currentState = next;
      runtime.update(next);
    },
    dispose() {
      disposed = true;
      window.cancelAnimationFrame(rafId);
      runtime.dispose();
    }
  };
}
