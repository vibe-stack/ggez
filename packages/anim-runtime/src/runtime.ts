import { addPoseAdditive, blendPoses, blendPosesMasked, copyPose, createPoseBufferFromRig, createRootMotionDelta, estimateClipDuration, sampleClipPose, sampleClipPoseOnBase, sampleClipRootMotionDelta } from "@ggez/anim-core";
import type { AnimationClipAsset, BoneMask, PoseBuffer, RigDefinition, RootMotionDelta } from "@ggez/anim-core";
import type {
  CompiledAnimatorGraph,
  CompiledCondition,
  CompiledGraphNode,
  CompiledMotionGraph,
  CompiledTransition
} from "@ggez/anim-schema";
import { clamp } from "@ggez/anim-utils";
import { createAnimatorParameterStore, type AnimatorParameterStore } from "./parameters";

interface LayerRuntimeState {
  time: number;
}

interface MachineTransitionState {
  readonly fromStateIndex: number;
  readonly toStateIndex: number;
  readonly duration: number;
  readonly blendCurve: CompiledTransition["blendCurve"];
  readonly interruptionSource: "none" | "current" | "next" | "both";
  elapsed: number;
  nextStateTime: number;
}

interface StateMachineRuntimeState {
  initialized: boolean;
  currentStateIndex: number;
  stateTime: number;
  transition: MachineTransitionState | null;
}

interface EvaluationContext {
  readonly graph: CompiledAnimatorGraph;
  readonly rig: RigDefinition;
  readonly clips: AnimationClipAsset[];
  readonly masks: BoneMask[];
  readonly parameters: AnimatorParameterStore;
  readonly layerStates: LayerRuntimeState[];
  readonly machineStates: StateMachineRuntimeState[];
  readonly durationCache: Map<string, number>;
  poseScratchIndex: number;
  motionScratchIndex: number;
  readonly poseScratch: PoseBuffer[];
  readonly motionScratch: RootMotionDelta[];
}

export interface AnimatorUpdateResult {
  readonly pose: PoseBuffer;
  readonly rootMotion: RootMotionDelta;
}

export interface AnimatorInstance {
  readonly rig: RigDefinition;
  readonly graph: CompiledAnimatorGraph;
  readonly clips: AnimationClipAsset[];
  readonly parameters: AnimatorParameterStore;
  readonly outputPose: PoseBuffer;
  readonly rootMotionDelta: RootMotionDelta;
  setFloat(name: string, value: number): void;
  setInt(name: string, value: number): void;
  setBool(name: string, value: boolean): void;
  trigger(name: string): void;
  update(deltaTime: number): AnimatorUpdateResult;
}

function createMasks(graph: CompiledAnimatorGraph): BoneMask[] {
  return graph.masks.map((mask) => ({ weights: Float32Array.from(mask.weights) }));
}

function createClipsBySlot(graph: CompiledAnimatorGraph, clips: AnimationClipAsset[]): AnimationClipAsset[] {
  const clipMap = new Map(clips.map((clip) => [clip.id, clip]));

  return graph.clipSlots.map((slot) => {
    const clip = clipMap.get(slot.id);
    if (!clip) {
      throw new Error(`Missing clip asset for slot "${slot.id}".`);
    }
    return clip;
  });
}

function ensureScratchPose(context: EvaluationContext): PoseBuffer {
  const pose = context.poseScratch[context.poseScratchIndex];
  if (!pose) {
    throw new Error("Animation runtime pose scratch exhausted.");
  }

  context.poseScratchIndex += 1;
  return pose;
}

function releaseScratchPose(context: EvaluationContext): void {
  context.poseScratchIndex -= 1;
}

function ensureScratchMotion(context: EvaluationContext): RootMotionDelta {
  const delta = context.motionScratch[context.motionScratchIndex];
  if (!delta) {
    throw new Error("Animation runtime root motion scratch exhausted.");
  }

  context.motionScratchIndex += 1;
  return delta;
}

function releaseScratchMotion(context: EvaluationContext): void {
  context.motionScratchIndex -= 1;
}

function resetRootMotion(out: RootMotionDelta): RootMotionDelta {
  out.translation[0] = 0;
  out.translation[1] = 0;
  out.translation[2] = 0;
  out.yaw = 0;
  return out;
}

function copyRootMotion(source: RootMotionDelta, out: RootMotionDelta): RootMotionDelta {
  out.translation[0] = source.translation[0];
  out.translation[1] = source.translation[1];
  out.translation[2] = source.translation[2];
  out.yaw = source.yaw;
  return out;
}

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

function getEffectiveRootBoneIndex(clip: AnimationClipAsset, rig: RigDefinition): number {
  return clip.rootBoneIndex ?? inferMotionRootBoneIndex(clip, rig);
}

function forceBoneTranslationToBindPose(context: EvaluationContext, boneIndex: number, pose: PoseBuffer): void {
  const translationOffset = boneIndex * 3;
  pose.translations[translationOffset] = context.rig.bindTranslations[translationOffset]!;
  pose.translations[translationOffset + 1] = context.rig.bindTranslations[translationOffset + 1]!;
  pose.translations[translationOffset + 2] = context.rig.bindTranslations[translationOffset + 2]!;
}

function forceRootMotionChainToBindPose(context: EvaluationContext, rootBoneIndex: number, pose: PoseBuffer): void {
  let current = rootBoneIndex;

  while (current >= 0) {
    forceBoneTranslationToBindPose(context, current, pose);
    current = context.rig.parentIndices[current] ?? -1;
  }
}

function blendRootMotion(a: RootMotionDelta, b: RootMotionDelta, weight: number, out: RootMotionDelta): RootMotionDelta {
  const t = clamp(weight, 0, 1);
  out.translation[0] = a.translation[0] + (b.translation[0] - a.translation[0]) * t;
  out.translation[1] = a.translation[1] + (b.translation[1] - a.translation[1]) * t;
  out.translation[2] = a.translation[2] + (b.translation[2] - a.translation[2]) * t;
  out.yaw = a.yaw + (b.yaw - a.yaw) * t;
  return out;
}

function addScaledRootMotion(target: RootMotionDelta, source: RootMotionDelta, weight: number): RootMotionDelta {
  target.translation[0] += source.translation[0] * weight;
  target.translation[1] += source.translation[1] * weight;
  target.translation[2] += source.translation[2] * weight;
  target.yaw += source.yaw * weight;
  return target;
}

function applyBlendCurve(curve: CompiledTransition["blendCurve"], value: number): number {
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

function evaluateCondition(parameters: AnimatorParameterStore, condition: CompiledCondition): boolean {
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

function getStateDuration(
  context: EvaluationContext,
  graphIndex: number,
  machineNode: Extract<CompiledGraphNode, { type: "stateMachine" }>,
  stateIndex: number
): number {
  const state = machineNode.states[stateIndex]!;
  return getNodeDuration(context, graphIndex, state.motionNodeIndex);
}

function getSyncedTransitionTime(
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

function getNodeDuration(context: EvaluationContext, graphIndex: number, nodeIndex: number, visited = new Set<string>()): number {
  if (nodeIndex < 0) {
    return 0;
  }

  const cacheKey = `${graphIndex}:${nodeIndex}`;
  const cached = context.durationCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  if (visited.has(cacheKey)) {
    return 0;
  }
  visited.add(cacheKey);

  const graph = context.graph.graphs[graphIndex]!;
  const node = graph.nodes[nodeIndex]!;
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
    case "subgraph":
      duration = getNodeDuration(context, node.graphIndex, context.graph.graphs[node.graphIndex]!.rootNodeIndex, visited);
      break;
    case "stateMachine":
      duration = Math.max(...node.states.map((state) => getNodeDuration(context, graphIndex, state.motionNodeIndex, visited)));
      break;
  }

  context.durationCache.set(cacheKey, duration);
  return duration;
}

function remapBlendChildTime(
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

function findBlend1DChildren(
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

function evaluateNode(
  context: EvaluationContext,
  compiledGraph: CompiledMotionGraph,
  graphIndex: number,
  nodeIndex: number,
  time: number,
  previousTime: number,
  deltaTime: number,
  outPose: PoseBuffer,
  outRootMotion: RootMotionDelta,
  fallbackPose: PoseBuffer | undefined = undefined
): void {
  const node = compiledGraph.nodes[nodeIndex]!;

  switch (node.type) {
    case "clip": {
      const clip = context.clips[node.clipIndex]!;
      if (fallbackPose) {
        sampleClipPoseOnBase(clip, time * node.speed, fallbackPose, outPose, node.loop);
      } else {
        sampleClipPose(clip, context.rig, time * node.speed, outPose, node.loop);
      }
      const rootBoneIndex = getEffectiveRootBoneIndex(clip, context.rig);
      if (node.inPlace) {
        forceRootMotionChainToBindPose(context, rootBoneIndex, outPose);
      }
      const prevPose = ensureScratchPose(context);
      const nextPose = ensureScratchPose(context);
      sampleClipPose(clip, context.rig, previousTime * node.speed, prevPose, node.loop);
      sampleClipPose(clip, context.rig, time * node.speed, nextPose, node.loop);
      if (node.inPlace) {
        forceRootMotionChainToBindPose(context, rootBoneIndex, prevPose);
        forceRootMotionChainToBindPose(context, rootBoneIndex, nextPose);
      }
      copyRootMotion(
        sampleClipRootMotionDelta(clip, context.rig, previousTime * node.speed, time * node.speed, "full"),
        outRootMotion
      );
      if (node.inPlace) {
        resetRootMotion(outRootMotion);
      }
      releaseScratchPose(context);
      releaseScratchPose(context);
      break;
    }
    case "subgraph": {
      const subgraph = context.graph.graphs[node.graphIndex]!;
      evaluateNode(context, subgraph, node.graphIndex, subgraph.rootNodeIndex, time, previousTime, deltaTime, outPose, outRootMotion, fallbackPose);
      break;
    }
    case "blend1d": {
      const value = Number(context.parameters.getValue(node.parameterIndex) ?? 0);
      const pair = findBlend1DChildren(node.children, value);
      // When the selected pair resolves to a single child (exact threshold match or
      // out-of-range clamp), skip parent-duration normalization so that clip plays at
      // its own natural speed.  Normalizing against max(all-child-durations) when only
      // one child is active can make a short clip play at a tiny fraction of its natural
      // speed (e.g. a 1 s walk clip plays at ~17% speed when the blend tree also
      // contains an 8 s idle clip).  Cross-child synchronization is still applied when
      // two distinct children are being blended together.
      const childATime = pair.a.nodeIndex === pair.b.nodeIndex
        ? { time, previousTime, deltaTime: time - previousTime }
        : remapBlendChildTime(context, graphIndex, nodeIndex, pair.a.nodeIndex, time, previousTime);
      evaluateNode(context, compiledGraph, graphIndex, pair.a.nodeIndex, childATime.time, childATime.previousTime, childATime.deltaTime, outPose, outRootMotion, fallbackPose);
      if (pair.a.nodeIndex !== pair.b.nodeIndex) {
        const tempPose = ensureScratchPose(context);
        const tempMotion = ensureScratchMotion(context);
        const childBTime = remapBlendChildTime(context, graphIndex, nodeIndex, pair.b.nodeIndex, time, previousTime);
        evaluateNode(context, compiledGraph, graphIndex, pair.b.nodeIndex, childBTime.time, childBTime.previousTime, childBTime.deltaTime, tempPose, tempMotion, fallbackPose);
        blendPoses(outPose, tempPose, pair.t, outPose);
        blendRootMotion(outRootMotion, tempMotion, pair.t, outRootMotion);
        releaseScratchMotion(context);
        releaseScratchPose(context);
      }
      break;
    }
    case "blend2d": {
      const x = Number(context.parameters.getValue(node.xParameterIndex) ?? 0);
      const y = Number(context.parameters.getValue(node.yParameterIndex) ?? 0);
      const weights = node.children.map((child) => {
        const dx = x - child.x;
        const dy = y - child.y;
        const distance = Math.hypot(dx, dy);
        return { child, weight: distance < 1e-5 ? Number.POSITIVE_INFINITY : 1 / distance };
      });
      const exact = weights.find((entry) => entry.weight === Number.POSITIVE_INFINITY);

      if (exact) {
        const childTime = remapBlendChildTime(context, graphIndex, nodeIndex, exact.child.nodeIndex, time, previousTime);
        evaluateNode(context, compiledGraph, graphIndex, exact.child.nodeIndex, childTime.time, childTime.previousTime, childTime.deltaTime, outPose, outRootMotion, fallbackPose);
        break;
      }

      const weightSum = weights.reduce((sum, entry) => sum + entry.weight, 0) || 1;
      resetRootMotion(outRootMotion);
      let accumulatedWeight = 0;

      weights.forEach((entry, index) => {
        const normalizedWeight = entry.weight / weightSum;
        const childTime = remapBlendChildTime(context, graphIndex, nodeIndex, entry.child.nodeIndex, time, previousTime);
        if (index === 0) {
          evaluateNode(context, compiledGraph, graphIndex, entry.child.nodeIndex, childTime.time, childTime.previousTime, childTime.deltaTime, outPose, outRootMotion, fallbackPose);
          accumulatedWeight = normalizedWeight;
          return;
        }

        const tempPose = ensureScratchPose(context);
        const tempMotion = ensureScratchMotion(context);
        evaluateNode(context, compiledGraph, graphIndex, entry.child.nodeIndex, childTime.time, childTime.previousTime, childTime.deltaTime, tempPose, tempMotion, fallbackPose);
        const blendWeight = normalizedWeight / (accumulatedWeight + normalizedWeight);
        blendPoses(outPose, tempPose, blendWeight, outPose);
        blendRootMotion(outRootMotion, tempMotion, blendWeight, outRootMotion);
        accumulatedWeight += normalizedWeight;
        releaseScratchMotion(context);
        releaseScratchPose(context);
      });
      break;
    }
    case "stateMachine": {
      evaluateStateMachine(context, compiledGraph, graphIndex, node, time, previousTime, deltaTime, outPose, outRootMotion, fallbackPose);
      break;
    }
  }
}

function tryStartTransition(
  context: EvaluationContext,
  graphIndex: number,
  machineNode: Extract<CompiledGraphNode, { type: "stateMachine" }>,
  machineState: StateMachineRuntimeState
): void {
  if (machineState.transition) {
    return;
  }

  const candidates = [...machineNode.anyStateTransitions, ...machineNode.transitions];
  const currentState = machineNode.states[machineState.currentStateIndex]!;
  const currentDuration = getStateDuration(context, graphIndex, machineNode, machineState.currentStateIndex);
  const normalizedTime = currentDuration > 0 ? machineState.stateTime / currentDuration : 0;

  for (const transition of candidates) {
    if (transition.fromStateIndex >= 0 && transition.fromStateIndex !== machineState.currentStateIndex) {
      continue;
    }

    if (transition.hasExitTime && normalizedTime < Number(transition.exitTime ?? 1)) {
      continue;
    }

    if (!transition.conditions.every((condition: CompiledCondition) => evaluateCondition(context.parameters, condition))) {
      continue;
    }

    machineState.transition = {
      fromStateIndex: machineState.currentStateIndex,
      toStateIndex: transition.toStateIndex,
      duration: transition.duration,
      blendCurve: transition.blendCurve,
      interruptionSource: transition.interruptionSource,
      elapsed: 0,
      nextStateTime: getSyncedTransitionTime(context, graphIndex, machineNode, transition, machineState.currentStateIndex, machineState.stateTime)
    };
    return;
  }
}

function tryInterruptTransition(
  context: EvaluationContext,
  graphIndex: number,
  machineNode: Extract<CompiledGraphNode, { type: "stateMachine" }>,
  machineState: StateMachineRuntimeState
): void {
  const activeTransition = machineState.transition;
  if (!activeTransition || activeTransition.interruptionSource === "none") {
    return;
  }

  const allowCurrent = activeTransition.interruptionSource === "current" || activeTransition.interruptionSource === "both";
  const allowNext = activeTransition.interruptionSource === "next" || activeTransition.interruptionSource === "both";

  const currentState = machineNode.states[machineState.currentStateIndex]!;
  const currentDuration = getStateDuration(context, graphIndex, machineNode, machineState.currentStateIndex);
  const currentNormalizedTime = currentDuration > 0 ? machineState.stateTime / currentDuration : 0;

  const nextState = machineNode.states[activeTransition.toStateIndex]!;
  const nextDuration = getStateDuration(context, graphIndex, machineNode, activeTransition.toStateIndex);
  const nextNormalizedTime = nextDuration > 0 ? activeTransition.nextStateTime / nextDuration : 0;

  const transitionCanStart = (
    transition: (typeof machineNode.transitions)[number] | (typeof machineNode.anyStateTransitions)[number],
    sourceStateIndex: number,
    normalizedTime: number
  ) => {
    if (transition.hasExitTime && normalizedTime < Number(transition.exitTime ?? 1)) {
      return false;
    }

    return transition.conditions.every((condition: CompiledCondition) => evaluateCondition(context.parameters, condition));
  };

  const startInterruptedTransition = (
    transition: (typeof machineNode.transitions)[number] | (typeof machineNode.anyStateTransitions)[number],
    sourceStateIndex: number,
    sourceStateTime: number
  ) => {
    machineState.currentStateIndex = sourceStateIndex;
    machineState.stateTime = sourceStateTime;
    machineState.transition = {
      fromStateIndex: sourceStateIndex,
      toStateIndex: transition.toStateIndex,
      duration: transition.duration,
      blendCurve: transition.blendCurve,
      interruptionSource: transition.interruptionSource,
      elapsed: 0,
      nextStateTime: getSyncedTransitionTime(context, graphIndex, machineNode, transition, sourceStateIndex, sourceStateTime)
    };
  };

  for (const transition of machineNode.anyStateTransitions) {
    const sourceStateIndex = allowNext ? activeTransition.toStateIndex : machineState.currentStateIndex;
    const normalizedTime = allowNext ? nextNormalizedTime : currentNormalizedTime;
    const sourceStateTime = allowNext ? activeTransition.nextStateTime : machineState.stateTime;

    if (!transitionCanStart(transition, sourceStateIndex, normalizedTime)) {
      continue;
    }

    startInterruptedTransition(transition, sourceStateIndex, sourceStateTime);
    return;
  }

  if (allowCurrent) {
    for (const transition of machineNode.transitions) {
      if (transition.fromStateIndex !== machineState.currentStateIndex) {
        continue;
      }

      if (!transitionCanStart(transition, machineState.currentStateIndex, currentNormalizedTime)) {
        continue;
      }

      startInterruptedTransition(transition, machineState.currentStateIndex, machineState.stateTime);
      return;
    }
  }

  if (allowNext) {
    for (const transition of machineNode.transitions) {
      if (transition.fromStateIndex !== activeTransition.toStateIndex) {
        continue;
      }

      if (!transitionCanStart(transition, activeTransition.toStateIndex, nextNormalizedTime)) {
        continue;
      }

      startInterruptedTransition(transition, activeTransition.toStateIndex, activeTransition.nextStateTime);
      return;
    }
  }
}

function evaluateStateMachine(
  context: EvaluationContext,
  compiledGraph: CompiledMotionGraph,
  graphIndex: number,
  machineNode: Extract<CompiledGraphNode, { type: "stateMachine" }>,
  _time: number,
  _previousTime: number,
  deltaTime: number,
  outPose: PoseBuffer,
  outRootMotion: RootMotionDelta,
  fallbackPose: PoseBuffer | undefined
): void {
  const machineState = context.machineStates[machineNode.machineIndex]!;

  if (!machineState.initialized) {
    machineState.initialized = true;
    machineState.currentStateIndex = machineNode.entryStateIndex;
    machineState.stateTime = 0;
    machineState.transition = null;
  }

  const currentState = machineNode.states[machineState.currentStateIndex]!;
  const stateSpeed = currentState.speed;
  const previousStateTime = machineState.stateTime;
  machineState.stateTime += deltaTime * stateSpeed;
  if (machineState.transition) {
    tryInterruptTransition(context, graphIndex, machineNode, machineState);
  } else {
    tryStartTransition(context, graphIndex, machineNode, machineState);
  }

  if (!machineState.transition) {
    if (currentState.motionNodeIndex < 0) {
      if (fallbackPose) {
        copyPose(fallbackPose, outPose);
      } else {
        copyPose(createPoseBufferFromRig(context.rig), outPose);
      }
      resetRootMotion(outRootMotion);
    } else {
      evaluateNode(
        context,
        compiledGraph,
        graphIndex,
        currentState.motionNodeIndex,
        machineState.stateTime + currentState.cycleOffset,
        previousStateTime + currentState.cycleOffset,
        deltaTime * stateSpeed,
        outPose,
        outRootMotion,
        fallbackPose
      );
    }
    return;
  }

  const transition = machineState.transition;
  const nextState = machineNode.states[transition.toStateIndex]!;
  const previousNextStateTime = transition.nextStateTime;
  transition.elapsed += deltaTime;
  transition.nextStateTime += deltaTime * nextState.speed;

  if (currentState.motionNodeIndex < 0) {
    if (fallbackPose) {
      copyPose(fallbackPose, outPose);
    } else {
      copyPose(createPoseBufferFromRig(context.rig), outPose);
    }
    resetRootMotion(outRootMotion);
  } else {
    evaluateNode(
      context,
      compiledGraph,
      graphIndex,
      currentState.motionNodeIndex,
      machineState.stateTime + currentState.cycleOffset,
      previousStateTime + currentState.cycleOffset,
      deltaTime * stateSpeed,
      outPose,
      outRootMotion,
      fallbackPose
    );
  }

  const nextPose = ensureScratchPose(context);
  const nextMotion = ensureScratchMotion(context);
  if (nextState.motionNodeIndex < 0) {
    if (fallbackPose) {
      copyPose(fallbackPose, nextPose);
    } else {
      copyPose(createPoseBufferFromRig(context.rig), nextPose);
    }
    resetRootMotion(nextMotion);
  } else {
    evaluateNode(
      context,
      compiledGraph,
      graphIndex,
      nextState.motionNodeIndex,
      transition.nextStateTime + nextState.cycleOffset,
      previousNextStateTime + nextState.cycleOffset,
      deltaTime * nextState.speed,
      nextPose,
      nextMotion,
      fallbackPose
    );
  }

  const progress = applyBlendCurve(transition.blendCurve, transition.elapsed / Math.max(0.0001, transition.duration));
  blendPoses(outPose, nextPose, progress, outPose);
  blendRootMotion(outRootMotion, nextMotion, progress, outRootMotion);

  if (progress >= 1) {
    machineState.currentStateIndex = transition.toStateIndex;
    machineState.stateTime = transition.nextStateTime;
    machineState.transition = null;
  }

  releaseScratchMotion(context);
  releaseScratchPose(context);
}

export function createAnimatorInstance(input: {
  rig: RigDefinition;
  graph: CompiledAnimatorGraph;
  clips: AnimationClipAsset[];
}): AnimatorInstance {
  const parameters = createAnimatorParameterStore(input.graph);
  const clips = createClipsBySlot(input.graph, input.clips);
  const masks = createMasks(input.graph);
  const layerStates: LayerRuntimeState[] = input.graph.layers.map(() => ({ time: 0 }));
  const machineCount = input.graph.graphs.flatMap((graph) => graph.nodes).reduce((count, node) => {
    if (node.type === "stateMachine") {
      return Math.max(count, node.machineIndex + 1);
    }
    return count;
  }, 0);
  const machineStates: StateMachineRuntimeState[] = Array.from({ length: machineCount }, () => ({
    initialized: false,
    currentStateIndex: 0,
    stateTime: 0,
    transition: null
  }));
  const outputPose = createPoseBufferFromRig(input.rig);
  const rootMotionDelta = createRootMotionDelta();

  const context: EvaluationContext = {
    graph: input.graph,
    rig: input.rig,
    clips,
    masks,
    parameters,
    layerStates,
    machineStates,
    durationCache: new Map(),
    poseScratch: Array.from({ length: 32 }, () => createPoseBufferFromRig(input.rig)),
    motionScratch: Array.from({ length: 32 }, () => createRootMotionDelta()),
    poseScratchIndex: 0,
    motionScratchIndex: 0
  };

  function update(deltaTime: number): AnimatorUpdateResult {
    context.poseScratchIndex = 0;
    context.motionScratchIndex = 0;
    resetRootMotion(rootMotionDelta);

    let hasBaseLayer = false;

    input.graph.layers.forEach((layer, layerIndex) => {
      if (!layer.enabled || layer.weight <= 0) {
        return;
      }

      const layerState = context.layerStates[layerIndex]!;
      const previousTime = layerState.time;
      layerState.time += deltaTime;

      const graph = input.graph.graphs[layer.graphIndex]!;
      const layerPose = ensureScratchPose(context);
      const layerMotion = ensureScratchMotion(context);
      const fallbackPose = layer.blendMode === "override" && layer.maskIndex !== undefined ? outputPose : undefined;

      evaluateNode(context, graph, layer.graphIndex, graph.rootNodeIndex, layerState.time, previousTime, deltaTime, layerPose, layerMotion, fallbackPose);

      const mask = layer.maskIndex === undefined ? undefined : context.masks[layer.maskIndex];
      if (!hasBaseLayer) {
        copyPose(layerPose, outputPose);
        hasBaseLayer = true;
      } else if (layer.blendMode === "additive") {
        addPoseAdditive(outputPose, layerPose, input.rig, layer.weight, mask, outputPose);
      } else {
        blendPosesMasked(outputPose, layerPose, layer.weight, mask, outputPose);
      }

      if (layer.rootMotionMode !== "none") {
        addScaledRootMotion(rootMotionDelta, layerMotion, layer.weight);
        if (layer.rootMotionMode === "xz" || layer.rootMotionMode === "xz-yaw") {
          rootMotionDelta.translation[1] = 0;
        }
        if (layer.rootMotionMode === "xz") {
          rootMotionDelta.yaw = 0;
        }
      }

      releaseScratchMotion(context);
      releaseScratchPose(context);
    });

    parameters.resetTriggers();
    return {
      pose: outputPose,
      rootMotion: rootMotionDelta
    };
  }

  return {
    rig: input.rig,
    graph: input.graph,
    clips,
    parameters,
    outputPose,
    rootMotionDelta,
    setFloat(name, value) {
      parameters.setFloat(name, value);
    },
    setInt(name, value) {
      parameters.setInt(name, value);
    },
    setBool(name, value) {
      parameters.setBool(name, value);
    },
    trigger(name) {
      parameters.trigger(name);
    },
    update
  };
}
