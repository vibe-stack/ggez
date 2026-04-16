import { useMemo, useRef } from "react";
import { areOverlayHandlesEqual, type ComparableOverlayHandle } from "@/viewport/utils/viewport-canvas-helpers";

export function useStableOverlayHandles<T extends ComparableOverlayHandle>(handles: T[]) {
  const handlesRef = useRef(handles);

  return useMemo(() => {
    const previousHandles = handlesRef.current;

    if (areOverlayHandlesEqual(previousHandles, handles)) {
      return previousHandles;
    }

    handlesRef.current = handles;
    return handles;
  }, [handles]);
}
