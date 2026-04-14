import { useCallback, useEffect, type RefObject } from "react";

type CameraControlsLike = {
  domElement?: HTMLElement | null;
  enabled?: boolean;
  state?: number;
  update?: () => void;
};

type PointerLike = {
  button: number;
  x: number;
  y: number;
};

type TransformControlsLike = {
  axis?: string | null;
  enabled?: boolean;
  object?: unknown;
  visible?: boolean;
  addEventListener?: (type: string, listener: (event: { value?: boolean }) => void) => void;
  getPointer?: (event: PointerEvent) => PointerLike;
  pointerHover?: (pointer: PointerLike) => void;
  removeEventListener?: (type: string, listener: (event: { value?: boolean }) => void) => void;
};

export function useTransformControlsCameraLock({
  cameraControlsRef,
  onDragStateChange,
  transformControlsRefs
}: {
  cameraControlsRef?: RefObject<CameraControlsLike | null>;
  onDragStateChange?: (dragging: boolean) => void;
  transformControlsRefs: ReadonlyArray<RefObject<TransformControlsLike | null>>;
}) {
  const setCameraControlsEnabled = useCallback((enabled: boolean) => {
    const controls = cameraControlsRef?.current;

    if (!controls || !("enabled" in controls)) {
      return;
    }

    controls.enabled = enabled;

    if (!enabled && typeof controls.state === "number") {
      controls.state = -1;
    }

    controls.update?.();
  }, [cameraControlsRef]);

  const beginDrag = useCallback(() => {
    setCameraControlsEnabled(false);
    onDragStateChange?.(true);
  }, [onDragStateChange, setCameraControlsEnabled]);

  const endDrag = useCallback(() => {
    setCameraControlsEnabled(true);
    onDragStateChange?.(false);
  }, [onDragStateChange, setCameraControlsEnabled]);

  useEffect(() => {
    const controlsInstances = transformControlsRefs.map((ref) => ref.current).filter(Boolean);

    if (controlsInstances.length === 0) {
      return;
    }

    const cleanups = controlsInstances.map((controls) => {
      const handleDraggingChanged = (event: { value?: boolean }) => {
        if (event.value) {
          beginDrag();
          return;
        }

        endDrag();
      };

      controls.addEventListener?.("dragging-changed", handleDraggingChanged);

      return () => {
        controls.removeEventListener?.("dragging-changed", handleDraggingChanged);
      };
    });

    return () => {
      cleanups.forEach((cleanup) => cleanup());
      endDrag();
    };
  }, [beginDrag, endDrag, transformControlsRefs]);

  useEffect(() => {
    const domElement = cameraControlsRef?.current?.domElement;

    if (!domElement) {
      return;
    }

    const handlePointerDownCapture = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      for (const ref of transformControlsRefs) {
        const controls = ref.current;

        if (!controls?.enabled || !controls.object || controls.visible === false) {
          continue;
        }

        if (controls.getPointer && controls.pointerHover) {
          controls.pointerHover(controls.getPointer(event));
        }

        if (controls.axis) {
          beginDrag();
          return;
        }
      }
    };

    domElement.addEventListener("pointerdown", handlePointerDownCapture, true);

    return () => {
      domElement.removeEventListener("pointerdown", handlePointerDownCapture, true);
    };
  }, [beginDrag, cameraControlsRef, transformControlsRefs]);

  return {
    endDrag
  };
}
