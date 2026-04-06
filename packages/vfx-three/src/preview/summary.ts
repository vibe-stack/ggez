import { buildEmitterPreviewConfigs, resolveActiveEmitterIds } from "./extraction";
import type { ThreeWebGpuPreviewState, ThreeWebGpuPreviewSummary } from "./types";

export function summarizeThreeWebGpuPreview(next: ThreeWebGpuPreviewState): ThreeWebGpuPreviewSummary {
  const hasOutput = next.document.graph.nodes.some((node) => node.kind === "output");
  const activeEmitterIds = resolveActiveEmitterIds(next.document);
  const effectiveActiveIds = next.soloSelected && next.selectedEmitterId ? new Set([next.selectedEmitterId]) : activeEmitterIds;
  const configs = buildEmitterPreviewConfigs(next.document, next.compileResult, effectiveActiveIds);
  const totalCount = next.document.emitters.length;

  return {
    hasOutput,
    activeCount: effectiveActiveIds?.size ?? totalCount,
    renderableCount: configs.length,
    totalCount,
    allShown: !effectiveActiveIds || effectiveActiveIds.size === totalCount
  };
}
