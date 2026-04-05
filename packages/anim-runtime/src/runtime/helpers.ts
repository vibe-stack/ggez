import { estimateClipDuration } from "@ggez/anim-core";
import type { AnimationClipAsset, PoseBuffer, RigDefinition, RootMotionDelta } from "@ggez/anim-core";
import type { CompiledCondition, CompiledGraphNode, CompiledTransition } from "@ggez/anim-schema";
import { clamp } from "@ggez/anim-utils";
import type { AnimatorParameterStore } from "../parameters";
import type { EvaluationContext } from "./types";

function getBoneDepth(rig: RigDefinition, boneIndex: number): number {
  let depth = 0;
  let current = boneIndex;

  while (current >= 0) {
    current = rig.parentIndices[current] ?? -1;
    if (current >= 0) {
      depth += 1;
    }
  }

  return depth;
}

function scoreRootMotionBoneName(name: string): number {
  const normalized = name.toLowerCase();

  if (normalized.includes("hips")) {
    return 400;
  }
  if (normalized.includes("pelvis")) {
    return 320;
  }
  if (normalized === "root") {
    return 240;
  }
  if (normalized.includes("root")) {
    return 180;
  }
  if (normalized.includes("armature")) {
    return 60;
  }
  return 0;
}

function estimateTranslationTravel(values: Float32Array | undefined): number {
  if (!values || values.length < 6) {
    return 0;
  }

  let maxDistance = 0;
  const startX = values[0] ?? 0;
  const startY = values[1] ?? 0;
  const startZ = values[2] ?? 0;

  for (let index = 3; index < values.length; index += 3) {
    const dx = (values[index] ?? 0) - startX;
    const dy = (values[index + 1] ?? 0) - startY;
    const dz = (values[index + 2] ?? 0) - startZ;
    maxDistance = Math.max(maxDistance, Math.hypot(dx, dy, dz));
  }

  return maxDistance;
}

function inferMotionRootBoneIndex(clip: AnimationClipAsset, rig: RigDefinition): number {
  const candidates = clip.tracks
    .filter((track) => track.translationTimes && track.translationValues && track.translationValues.length >= 3)
    .map((track) => ({
      boneIndex: track.boneIndex,
      nameScore: scoreRootMotionBoneName(rig.boneNames[track.boneIndex] ?? ""),
      travel: estimateTranslationTravel(track.translationValues),
      depth: getBoneDepth(rig, track.boneIndex)
    }))
    .sort((left, right) => {
      if (left.nameScore !== right.nameScore) {
        return right.nameScore - left.nameScore;
      }
      if (left.travel !== right.travel) {
        return right.travel - left.travel;
      }
      if (left.depth !== right.depth) {
        return left.depth - right.depth;
      }
      return left.boneIndex - right.boneIndex;
    });

  return candidates[0]?.boneIndex ?? rig.rootBoneIndex;
}

export function getEffectiveRootBoneIndex(clip: AnimationClipAsset, rig: RigDefinition): number {
  return clip.rootBoneIndex ?? inferMotionRootBoneIndex(clip, rig);
}

function forceBoneTranslationToBindPose(context: EvaluationContext, boneIndex: number, pose: PoseBuffer): void {
  const translationOffset = boneIndex * 3;
  pose.translations[translationOffset] = context.rig.bindTranslations[translationOffset]!;
  pose.translations[translationOffset + 1] = context.rig.bindTranslations[translationOffset + 1]!;
  pose.translations[translationOffset + 2] = context.rig.bindTranslations[translationOffset + 2]!;
}

export function forceRootMotionChainToBindPose(context: EvaluationContext, rootBoneIndex: number, pose: PoseBuffer): void {
  let current = rootBoneIndex;

  while (current >= 0) {
    forceBoneTranslationToBindPose(context, current, pose);
    current = context.rig.parentIndices[current] ?? -1;
  }
}

export function blendRootMotion(a: RootMotionDelta, b: RootMotionDelta, weight: number, out: RootMotionDelta): RootMotionDelta {
  const t = clamp(weight, 0, 1);
  out.translation[0] = a.translation[0] + (b.translation[0] - a.translation[0]) * t;
  out.translation[1] = a.translation[1] + (b.translation[1] - a.translation[1]) * t;
  out.translation[2] = a.translation[2] + (b.translation[2] - a.translation[2]) * t;
  out.yaw = a.yaw + (b.yaw - a.yaw) * t;
  return out;
}

export function addScaledRootMotion(target: RootMotionDelta, source: RootMotionDelta, weight: number): RootMotionDelta {
  target.translation[0] += source.translation[0] * weight;
  target.translation[1] += source.translation[1] * weight;
  target.translation[2] += source.translation[2] * weight;
  target.yaw += source.yaw * weight;
  return target;
}

export function applyBlendCurve(curve: CompiledTransition["blendCurve"], value: number): number {
  const t = clamp(value, 0, 1);

  switch (curve) {
    case "ease-in":
      return t * t;
    case "ease-out":
      return 1 - (1 - t) * (1 - t);
    case "ease-in-out":
      return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) * (-2 * t + 2)) / 2;
    case "linear":
    default:
      return t;
  }
}

export function evaluateCondition(parameters: AnimatorParameterStore, condition: CompiledCondition): boolean {
  const current = parameters.getValue(condition.parameterIndex);

  switch (condition.operator) {
    case ">":
      return Number(current) > Number(condition.value ?? 0);
    case ">=":
      return Number(current) >= Number(condition.value ?? 0);
    case "<":
      return Number(current) < Number(condition.value ?? 0);
    case "<=":
      return Number(current) <= Number(condition.value ?? 0);
    case "==":
      return current === condition.value;
    case "!=":
      return current !== condition.value;
    case "set":
      return Boolean(current);
    default:
      return false;
  }
}

export function getStateDuration(
  context: EvaluationContext,
  graphIndex: number,
  machineNode: Extract<CompiledGraphNode, { type: "stateMachine" }>,
  stateIndex: number
): number {
  const state = machineNode.states[stateIndex]!;
  return getNodeDuration(context, graphIndex, state.motionNodeIndex);
}

export function getSyncedTransitionTime(
  context: EvaluationContext,
  graphIndex: number,
  machineNode: Extract<CompiledGraphNode, { type: "stateMachine" }>,
  transition: (typeof machineNode.transitions)[number] | (typeof machineNode.anyStateTransitions)[number],
  sourceStateIndex: number,
  sourceStateTime: number
): number {
  if (!transition.syncNormalizedTime) {
    return 0;
  }

  const sourceState = machineNode.states[sourceStateIndex]!;
  const targetState = machineNode.states[transition.toStateIndex]!;
  const sourceDuration = getStateDuration(context, graphIndex, machineNode, sourceStateIndex);
  const targetDuration = getStateDuration(context, graphIndex, machineNode, transition.toStateIndex);

  if (sourceDuration <= 0 || targetDuration <= 0) {
    return 0;
  }

  const sourcePlaybackTime = sourceStateTime + sourceState.cycleOffset;
  const targetPlaybackTime = (sourcePlaybackTime / sourceDuration) * targetDuration;
  return targetPlaybackTime - targetState.cycleOffset;
}

export function getNodeDuration(context: EvaluationContext, graphIndex: number, nodeIndex: number, visited = new Set<string>()): number {
  if (nodeIndex < 0) {
    return 0;
  }

  const graph = context.graph.graphs[graphIndex]!;
  const node = graph.nodes[nodeIndex]!;
  const cacheKey = `${graphIndex}:${nodeIndex}`;
  if (node.type !== "selector") {
    const cached = context.durationCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
  }

  if (visited.has(cacheKey)) {
    return 0;
  }
  visited.add(cacheKey);

  let duration = 0;

  switch (node.type) {
    case "clip":
      duration = estimateClipDuration(context.clips[node.clipIndex]!);
      break;
    case "blend1d":
      duration = Math.max(...node.children.map((child) => getNodeDuration(context, graphIndex, child.nodeIndex, visited)));
      break;
    case "blend2d":
      duration = Math.max(...node.children.map((child) => getNodeDuration(context, graphIndex, child.nodeIndex, visited)));
      break;
    case "selector": {
      const child = findSelectorChild(node.children, Number(context.parameters.getValue(node.parameterIndex) ?? 0));
      duration = child ? getNodeDuration(context, graphIndex, child.nodeIndex, visited) : 0;
      break;
    }
    case "orientationWarp":
      duration = getNodeDuration(context, graphIndex, node.sourceNodeIndex, visited);
      break;
    case "strideWarp":
      duration = getNodeDuration(context, graphIndex, node.sourceNodeIndex, visited);
      break;
    case "secondaryDynamics":
      duration = getNodeDuration(context, graphIndex, node.sourceNodeIndex, visited);
      break;
    case "subgraph":
      duration = getNodeDuration(context, node.graphIndex, context.graph.graphs[node.graphIndex]!.rootNodeIndex, visited);
      break;
    case "stateMachine":
      duration = Math.max(...node.states.map((state) => getNodeDuration(context, graphIndex, state.motionNodeIndex, visited)));
      break;
  }

  if (node.type !== "selector") {
    context.durationCache.set(cacheKey, duration);
  }
  return duration;
}

export function remapBlendChildTime(
  context: EvaluationContext,
  graphIndex: number,
  parentNodeIndex: number,
  childNodeIndex: number,
  time: number,
  previousTime: number
): { time: number; previousTime: number; deltaTime: number } {
  const parentDuration = getNodeDuration(context, graphIndex, parentNodeIndex);
  const childDuration = getNodeDuration(context, graphIndex, childNodeIndex);

  if (parentDuration <= 0 || childDuration <= 0 || Math.abs(parentDuration - childDuration) < 1e-5) {
    return {
      time,
      previousTime,
      deltaTime: time - previousTime
    };
  }

  const remappedTime = (time / parentDuration) * childDuration;
  const remappedPreviousTime = (previousTime / parentDuration) * childDuration;

  return {
    time: remappedTime,
    previousTime: remappedPreviousTime,
    deltaTime: remappedTime - remappedPreviousTime
  };
}

export function resolveSyncGroupTimes(
  context: EvaluationContext,
  syncGroup: string | undefined,
  duration: number,
  time: number,
  previousTime: number
): { time: number; previousTime: number; deltaTime: number } {
  if (!syncGroup || duration <= 1e-5) {
    return {
      time,
      previousTime,
      deltaTime: time - previousTime
    };
  }

  if ((context.activeSyncGroups.get(syncGroup) ?? 0) > 0) {
    return {
      time,
      previousTime,
      deltaTime: time - previousTime
    };
  }

  const existing = context.syncGroups.get(syncGroup);
  if (!existing) {
    context.syncGroups.set(syncGroup, {
      normalizedPreviousTime: previousTime / duration,
      normalizedTime: time / duration
    });
    return {
      time,
      previousTime,
      deltaTime: time - previousTime
    };
  }

  const remappedTime = existing.normalizedTime * duration;
  const remappedPreviousTime = existing.normalizedPreviousTime * duration;
  return {
    time: remappedTime,
    previousTime: remappedPreviousTime,
    deltaTime: remappedTime - remappedPreviousTime
  };
}

export function findBlend1DChildren(
  children: {
    nodeIndex: number;
    threshold: number;
  }[],
  value: number
) {
  if (children.length === 1) {
    return { a: children[0]!, b: children[0]!, t: 0 };
  }

  const sorted = [...children].sort((left, right) => left.threshold - right.threshold);
  if (value <= sorted[0]!.threshold) {
    return { a: sorted[0]!, b: sorted[0]!, t: 0 };
  }
  if (value >= sorted[sorted.length - 1]!.threshold) {
    const last = sorted[sorted.length - 1]!;
    return { a: last, b: last, t: 0 };
  }

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index]!;
    const next = sorted[index + 1]!;
    if (value >= current.threshold && value <= next.threshold) {
      const t = (value - current.threshold) / (next.threshold - current.threshold || 1);
      return { a: current, b: next, t };
    }
  }

  const last = sorted[sorted.length - 1]!;
  return { a: last, b: last, t: 0 };
}

export function findSelectorChild(
  children: {
    nodeIndex: number;
    value: number;
  }[],
  value: number
) {
  const exact = children.find((child) => child.value === value);
  if (exact) {
    return exact;
  }

  return [...children].sort((left, right) => {
    const leftDistance = Math.abs(left.value - value);
    const rightDistance = Math.abs(right.value - value);
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }
    return left.value - right.value;
  })[0];
}

type Blend2DChild = {
  nodeIndex: number;
  x: number;
  y: number;
};

type WeightedBlend2DChild = {
  child: Blend2DChild;
  weight: number;
};

function sortWeightedBlend2DChildren(children: WeightedBlend2DChild[]): WeightedBlend2DChild[] {
  return [...children]
    .filter((entry) => entry.weight > 1e-5)
    .sort((left, right) => right.weight - left.weight);
}

function computeTriangleBarycentricWeights(
  a: Blend2DChild,
  b: Blend2DChild,
  c: Blend2DChild,
  x: number,
  y: number
): { a: number; b: number; c: number; minWeight: number } | null {
  const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (Math.abs(denominator) < 1e-5) {
    return null;
  }

  const weightA = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / denominator;
  const weightB = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / denominator;
  const weightC = 1 - weightA - weightB;

  return {
    a: weightA,
    b: weightB,
    c: weightC,
    minWeight: Math.min(weightA, weightB, weightC)
  };
}

function findContainingBlend2DTriangle(children: Blend2DChild[], x: number, y: number): WeightedBlend2DChild[] | null {
  const epsilon = 1e-5;
  let best:
    | {
        entries: WeightedBlend2DChild[];
        minWeight: number;
      }
    | null = null;

  for (let aIndex = 0; aIndex < children.length - 2; aIndex += 1) {
    const a = children[aIndex]!;
    for (let bIndex = aIndex + 1; bIndex < children.length - 1; bIndex += 1) {
      const b = children[bIndex]!;
      for (let cIndex = bIndex + 1; cIndex < children.length; cIndex += 1) {
        const c = children[cIndex]!;
        const weights = computeTriangleBarycentricWeights(a, b, c, x, y);
        if (!weights || weights.minWeight < -epsilon) {
          continue;
        }

        const entries = sortWeightedBlend2DChildren([
          { child: a, weight: weights.a },
          { child: b, weight: weights.b },
          { child: c, weight: weights.c }
        ]);

        if (!best || weights.minWeight > best.minWeight) {
          best = {
            entries,
            minWeight: weights.minWeight
          };
        }
      }
    }
  }

  return best?.entries ?? null;
}

function findBlend2DEdgeWeights(children: Blend2DChild[], x: number, y: number): WeightedBlend2DChild[] | null {
  let best:
    | {
        distanceSquared: number;
        entries: WeightedBlend2DChild[];
      }
    | null = null;

  for (let aIndex = 0; aIndex < children.length - 1; aIndex += 1) {
    const a = children[aIndex]!;
    for (let bIndex = aIndex + 1; bIndex < children.length; bIndex += 1) {
      const b = children[bIndex]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;

      if (lengthSquared < 1e-5) {
        continue;
      }

      const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / lengthSquared, 0, 1);
      const projectedX = a.x + dx * t;
      const projectedY = a.y + dy * t;
      const distanceX = x - projectedX;
      const distanceY = y - projectedY;
      const distanceSquared = distanceX * distanceX + distanceY * distanceY;
      const entries = sortWeightedBlend2DChildren([
        { child: a, weight: 1 - t },
        { child: b, weight: t }
      ]);

      if (!best || distanceSquared < best.distanceSquared) {
        best = {
          distanceSquared,
          entries
        };
      }
    }
  }

  return best?.entries ?? null;
}

export function computeBlend2DChildren(
  children: Blend2DChild[],
  x: number,
  y: number
): WeightedBlend2DChild[] {
  if (children.length === 0) {
    return [];
  }

  if (children.length === 1) {
    return [{ child: children[0]!, weight: 1 }];
  }

  const exact = children.find((child) => Math.hypot(x - child.x, y - child.y) < 1e-5);
  if (exact) {
    return [{ child: exact, weight: 1 }];
  }

  const triangle = findContainingBlend2DTriangle(children, x, y);
  if (triangle && triangle.length > 0) {
    return triangle;
  }

  const edge = findBlend2DEdgeWeights(children, x, y);
  if (edge && edge.length > 0) {
    return edge;
  }

  const nearest = [...children].sort((left, right) => {
    const leftDistance = Math.hypot(x - left.x, y - left.y);
    const rightDistance = Math.hypot(x - right.x, y - right.y);
    return leftDistance - rightDistance;
  })[0];

  return nearest ? [{ child: nearest, weight: 1 }] : [];
}