/**
 * InputManager
 *
 * Single source of truth for keyboard and mouse input. Mount it once against
 * the renderer's canvas and pass it down to anything that needs input — player
 * controllers, UI, debug tools. This removes raw `window.addEventListener`
 * calls from gameplay code and centralises pointer-lock negotiation.
 */

type PointerLockState = "locked" | "pending" | "unlocked";

export class InputManager {
  private readonly keyState = new Set<string>();
  private accumulatedMouseX = 0;
  private accumulatedMouseY = 0;
  private pointerLockState: PointerLockState = "unlocked";
  private mountedElement: HTMLElement | null = null;

  // ------------------------------------------------------------------ mount

  mount(element: HTMLElement): void {
    if (this.mountedElement) {
      this.dispose();
    }

    this.mountedElement = element;
    element.addEventListener("click", this.handleClick);
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);
    window.addEventListener("blur", this.handleBlur);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("mousemove", this.handleMouseMove);
  }

  dispose(): void {
    if (this.mountedElement) {
      this.mountedElement.removeEventListener("click", this.handleClick);
      this.mountedElement = null;
    }

    document.removeEventListener("pointerlockchange", this.handlePointerLockChange);
    window.removeEventListener("blur", this.handleBlur);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("mousemove", this.handleMouseMove);

    this.keyState.clear();
    this.accumulatedMouseX = 0;
    this.accumulatedMouseY = 0;

    if (this.pointerLockState === "locked" && document.pointerLockElement) {
      document.exitPointerLock();
    }

    this.pointerLockState = "unlocked";
  }

  // ---------------------------------------------------------------- keyboard

  /** Returns true while the given KeyboardEvent.code is held down. */
  isKeyDown(code: string): boolean {
    return this.keyState.has(code);
  }

  /**
   * Returns a signed axis value in [-1, 1] suitable for movement.
   * `positive` and `negative` are KeyboardEvent.code strings.
   */
  axis(positive: string, negative: string): number {
    return (this.keyState.has(positive) ? 1 : 0) - (this.keyState.has(negative) ? 1 : 0);
  }

  // ------------------------------------------------------------------ mouse

  /** Whether the pointer is currently captured. */
  isPointerLocked(): boolean {
    return this.pointerLockState === "locked";
  }

  /**
   * Consumes accumulated mouse movement since the last call and returns it.
   * Call once per update that needs look input so deltas are not double-applied.
   */
  consumeMouseDelta(): { x: number; y: number } {
    const delta = { x: this.accumulatedMouseX, y: this.accumulatedMouseY };
    this.accumulatedMouseX = 0;
    this.accumulatedMouseY = 0;
    return delta;
  }

  requestPointerLock(): void {
    if (!this.mountedElement || this.pointerLockState !== "unlocked") {
      return;
    }

    this.pointerLockState = "pending";
    void this.mountedElement.requestPointerLock();
  }

  releasePointerLock(): void {
    if (this.pointerLockState === "locked" && document.pointerLockElement) {
      document.exitPointerLock();
    }

    this.pointerLockState = "unlocked";
  }

  // -------------------------------------------------------- private handlers

  private readonly handleClick = () => {
    if (this.pointerLockState === "unlocked") {
      this.requestPointerLock();
    }
  };

  private readonly handlePointerLockChange = () => {
    const isLocked = document.pointerLockElement === this.mountedElement;
    this.pointerLockState = isLocked ? "locked" : "unlocked";
  };

  private readonly handleBlur = () => {
    this.keyState.clear();
    this.releasePointerLock();
  };

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (isTextInputTarget(event.target)) {
      return;
    }

    this.keyState.add(event.code);

    if (event.code === "Space") {
      event.preventDefault();
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent) => {
    this.keyState.delete(event.code);
  };

  private readonly handleMouseMove = (event: MouseEvent) => {
    if (this.pointerLockState !== "locked") {
      return;
    }

    this.accumulatedMouseX += event.movementX;
    this.accumulatedMouseY += event.movementY;
  };
}

function isTextInputTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA")
  );
}
