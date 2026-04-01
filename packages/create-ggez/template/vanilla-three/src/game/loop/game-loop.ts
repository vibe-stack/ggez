/**
 * GameLoop
 *
 * Separates the game loop from the app/scene wiring. Handles:
 * - requestAnimationFrame scheduling
 * - Fixed-step accumulation (physics / gameplay at 60 Hz)
 * - Variable-rate update and render calls
 * - Pause / resume without a delta spike on resume
 * - Spiral-of-death protection via a max catch-up cap
 */

export const FIXED_STEP_SECONDS = 1 / 60;

/** Maximum time the fixed-step accumulator is allowed to catch up per frame. */
const MAX_CATCH_UP_SECONDS = FIXED_STEP_SECONDS * 5;

export type GameLoopCallbacks = {
  /** Called at a fixed 60 Hz rate; use for physics and deterministic gameplay. */
  onFixedUpdate: (fixedDeltaSeconds: number) => void;
  /** Called every animation frame with the true elapsed time; use for smooth camera, audio, etc. */
  onUpdate: (deltaSeconds: number) => void;
  /** Called after onUpdate; issue your renderer.render() here. */
  onRender: () => void;
};

export class GameLoop {
  private rafId: number | null = null;
  private lastTimestampMs: number | null = null;
  private accumulatorSeconds = 0;
  private paused = false;
  private readonly callbacks: GameLoopCallbacks;

  constructor(callbacks: GameLoopCallbacks) {
    this.callbacks = callbacks;
  }

  /** Begin ticking. Safe to call multiple times — subsequent calls are no-ops. */
  start(): void {
    if (this.rafId !== null) {
      return;
    }

    this.rafId = requestAnimationFrame(this.tick);
  }

  /** Stop ticking and reset all timing state. */
  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    this.lastTimestampMs = null;
    this.accumulatorSeconds = 0;
  }

  /**
   * Pause onFixedUpdate / onUpdate / onRender without cancelling the RAF.
   * The loop keeps running so resume() causes no timestamp discontinuity.
   */
  pause(): void {
    this.paused = true;
  }

  /** Resume after pause(). */
  resume(): void {
    this.paused = false;
    // Discard the timestamp so the first post-resume frame produces a safe delta.
    this.lastTimestampMs = null;
  }

  dispose(): void {
    this.stop();
  }

  // ----------------------------------------------------------------- private

  private readonly tick = (timestampMs: number): void => {
    this.rafId = requestAnimationFrame(this.tick);

    if (this.paused) {
      this.lastTimestampMs = timestampMs;
      return;
    }

    const rawDelta =
      this.lastTimestampMs === null
        ? FIXED_STEP_SECONDS
        : (timestampMs - this.lastTimestampMs) / 1000;

    this.lastTimestampMs = timestampMs;

    // Clamp to 100 ms (10 fps) to prevent spiral-of-death on tab restore.
    const deltaSeconds = Math.min(rawDelta, 0.1);

    this.accumulatorSeconds = Math.min(
      this.accumulatorSeconds + deltaSeconds,
      MAX_CATCH_UP_SECONDS
    );

    while (this.accumulatorSeconds >= FIXED_STEP_SECONDS) {
      this.callbacks.onFixedUpdate(FIXED_STEP_SECONDS);
      this.accumulatorSeconds -= FIXED_STEP_SECONDS;
    }

    this.callbacks.onUpdate(deltaSeconds);
    this.callbacks.onRender();
  };
}
