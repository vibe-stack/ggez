import { blendPoses, copyPose, createPoseBufferFromRig, estimateClipDuration, sampleClipPose, sampleClipPoseOnBase, sampleClipRootMotionDelta } from "@ggez/anim-core";
import type { PoseBuffer, RootMotionDelta } from "@ggez/anim-core";
import type { CompiledCondition, CompiledGraphNode, CompiledMotionGraph } from "@ggez/anim-schema";
import { applyBlendCurve, blendRootMotion, computeBlend2DChildren, evaluateCondition, findBlend1DChildren, findSelectorChild, forceRootMotionChainToBindPose, getEffectiveRootBoneIndex, getNodeDuration, getStateDuration, getSyncedTransitionTime, resolveSyncGroupTimes } from "./helpers";
import { applyOrientationWarp, applyOrientationWarpToRootMotion } from "./orientation-warp";
import { applySecondaryDynamics } from "./secondary-dynamics";
import { copyRootMotion, ensureScratchMotion, ensureScratchPose, releaseScratchMotion, releaseScratchPose, resetRootMotion } from "./scratch";
import { applyStrideWarp, applyStrideWarpToRootMotion, resolveStrideWarp } from "./stride-warp";
import type { EvaluationContext, StateMachineRuntimeState } from "./types";

function enterSyncGroupScope(context: EvaluationContext, syncGroup: string | undefined): () => void {
  if (!syncGroup) {
    return () => {};
  }

  context.activeSyncGroups.set(syncGroup, (context.activeSyncGroups.get(syncGroup) ?? 0) + 1);
  return () => {
    const nextDepth = (context.activeSyncGroups.get(syncGroup) ?? 1) - 1;
    if (nextDepth <= 0) {
      context.activeSyncGroups.delete(syncGroup);
      return;
    }
    context.activeSyncGroups.set(syncGroup, nextDepth);
  };
}

export function evaluateNode(
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
      const syncedTime = resolveSyncGroupTimes(
        context,
        node.syncGroup,
        estimateClipDuration(context.clips[node.clipIndex]!),
        time,
        previousTime
      );
      const exitSyncGroupScope = enterSyncGroupScope(context, node.syncGroup);
      try {
        const clip = context.clips[node.clipIndex]!;
        if (fallbackPose) {
          sampleClipPoseOnBase(clip, syncedTime.time * node.speed, fallbackPose, outPose, node.loop);
        } else {
          sampleClipPose(clip, context.rig, syncedTime.time * node.speed, outPose, node.loop);
        }
        const rootBoneIndex = getEffectiveRootBoneIndex(clip, context.rig);
        if (node.inPlace) {
          forceRootMotionChainToBindPose(context, rootBoneIndex, outPose);
        }
        copyRootMotion(
          sampleClipRootMotionDelta(clip, context.rig, syncedTime.previousTime * node.speed, syncedTime.time * node.speed, "full"),
          outRootMotion
        );
        if (node.inPlace) {
          resetRootMotion(outRootMotion);
        }
      } finally {
        exitSyncGroupScope();
      }
      break;
    }
    case "subgraph": {
      const subgraph = context.graph.graphs[node.graphIndex]!;
      const syncedTime = resolveSyncGroupTimes(
        context,
        node.syncGroup,
        getNodeDuration(context, node.graphIndex, subgraph.rootNodeIndex),
        time,
        previousTime
      );
      const exitSyncGroupScope = enterSyncGroupScope(context, node.syncGroup);
      try {
        evaluateNode(context, subgraph, node.graphIndex, subgraph.rootNodeIndex, syncedTime.time, syncedTime.previousTime, syncedTime.deltaTime, outPose, outRootMotion, fallbackPose);
      } finally {
        exitSyncGroupScope();
      }
      break;
    }
    case "blend1d": {
      const syncedTime = resolveSyncGroupTimes(
        context,
        node.syncGroup,
        getNodeDuration(context, graphIndex, nodeIndex),
        time,
        previousTime
      );
      const value = Number(context.parameters.getValue(node.parameterIndex) ?? 0);
      const pair = findBlend1DChildren(node.children, value);
      const exitSyncGroupScope = enterSyncGroupScope(context, node.syncGroup);
      try {
        evaluateNode(context, compiledGraph, graphIndex, pair.a.nodeIndex, syncedTime.time, syncedTime.previousTime, syncedTime.deltaTime, outPose, outRootMotion, fallbackPose);
        if (pair.a.nodeIndex !== pair.b.nodeIndex) {
          const tempPose = ensureScratchPose(context);
          const tempMotion = ensureScratchMotion(context);
          evaluateNode(context, compiledGraph, graphIndex, pair.b.nodeIndex, syncedTime.time, syncedTime.previousTime, syncedTime.deltaTime, tempPose, tempMotion, fallbackPose);
          blendPoses(outPose, tempPose, pair.t, outPose);
          blendRootMotion(outRootMotion, tempMotion, pair.t, outRootMotion);
          releaseScratchMotion(context);
          releaseScratchPose(context);
        }
      } finally {
        exitSyncGroupScope();
      }
      break;
    }
    case "blend2d": {
      const syncedTime = resolveSyncGroupTimes(
        context,
        node.syncGroup,
        getNodeDuration(context, graphIndex, nodeIndex),
        time,
        previousTime
      );
      const x = Number(context.parameters.getValue(node.xParameterIndex) ?? 0);
      const y = Number(context.parameters.getValue(node.yParameterIndex) ?? 0);
      const weights = computeBlend2DChildren(node.children, x, y);

      const exitSyncGroupScope = enterSyncGroupScope(context, node.syncGroup);
      try {
        if (weights.length === 0) {
          if (fallbackPose) {
            copyPose(fallbackPose, outPose);
          } else {
            copyPose(createPoseBufferFromRig(context.rig), outPose);
          }
          resetRootMotion(outRootMotion);
          break;
        }

        if (weights.length === 1) {
          const exact = weights[0]!;
          const childTime = syncedTime;
          evaluateNode(context, compiledGraph, graphIndex, exact.child.nodeIndex, childTime.time, childTime.previousTime, childTime.deltaTime, outPose, outRootMotion, fallbackPose);
          break;
        }

        const weightSum = weights.reduce((sum, entry) => sum + entry.weight, 0) || 1;
        resetRootMotion(outRootMotion);
        let accumulatedWeight = 0;

        weights.forEach((entry, index) => {
          const normalizedWeight = entry.weight / weightSum;
          if (index === 0) {
            evaluateNode(context, compiledGraph, graphIndex, entry.child.nodeIndex, syncedTime.time, syncedTime.previousTime, syncedTime.deltaTime, outPose, outRootMotion, fallbackPose);
            accumulatedWeight = normalizedWeight;
            return;
          }

          const tempPose = ensureScratchPose(context);
          const tempMotion = ensureScratchMotion(context);
          evaluateNode(context, compiledGraph, graphIndex, entry.child.nodeIndex, syncedTime.time, syncedTime.previousTime, syncedTime.deltaTime, tempPose, tempMotion, fallbackPose);
          const blendWeight = normalizedWeight / (accumulatedWeight + normalizedWeight);
          blendPoses(outPose, tempPose, blendWeight, outPose);
          blendRootMotion(outRootMotion, tempMotion, blendWeight, outRootMotion);
          accumulatedWeight += normalizedWeight;
          releaseScratchMotion(context);
          releaseScratchPose(context);
        });
      } finally {
        exitSyncGroupScope();
      }
      break;
    }
    case "selector": {
      const syncedTime = resolveSyncGroupTimes(
        context,
        node.syncGroup,
        getNodeDuration(context, graphIndex, nodeIndex),
        time,
        previousTime
      );
      const child = findSelectorChild(node.children, Number(context.parameters.getValue(node.parameterIndex) ?? 0));
      const exitSyncGroupScope = enterSyncGroupScope(context, node.syncGroup);
      try {
        if (!child) {
          if (fallbackPose) {
            copyPose(fallbackPose, outPose);
          } else {
            copyPose(createPoseBufferFromRig(context.rig), outPose);
          }
          resetRootMotion(outRootMotion);
          break;
        }

        evaluateNode(context, compiledGraph, graphIndex, child.nodeIndex, syncedTime.time, syncedTime.previousTime, syncedTime.deltaTime, outPose, outRootMotion, fallbackPose);
      } finally {
        exitSyncGroupScope();
      }
      break;
    }
    case "orientationWarp": {
      const sourcePose = ensureScratchPose(context);
      const sourceMotion = ensureScratchMotion(context);
      evaluateNode(
        context,
        compiledGraph,
        graphIndex,
        node.sourceNodeIndex,
        time,
        previousTime,
        deltaTime,
        sourcePose,
        sourceMotion,
        fallbackPose
      );
      copyPose(sourcePose, outPose);
      copyRootMotion(sourceMotion, outRootMotion);
      applyOrientationWarp(context, node, sourcePose, outPose);
      applyOrientationWarpToRootMotion(context, node, outRootMotion);
      releaseScratchMotion(context);
      releaseScratchPose(context);
      break;
    }
    case "strideWarp": {
      const sourcePose = ensureScratchPose(context);
      const sourceMotion = ensureScratchMotion(context);
      evaluateNode(
        context,
        compiledGraph,
        graphIndex,
        node.sourceNodeIndex,
        time,
        previousTime,
        deltaTime,
        sourcePose,
        sourceMotion,
        fallbackPose
      );
      copyPose(sourcePose, outPose);
      copyRootMotion(sourceMotion, outRootMotion);
      const resolvedWarp = resolveStrideWarp(context, graphIndex, nodeIndex, node, sourceMotion, deltaTime);
      applyStrideWarp(context, node, sourcePose, outPose, resolvedWarp);
      applyStrideWarpToRootMotion(outRootMotion, resolvedWarp);
      releaseScratchMotion(context);
      releaseScratchPose(context);
      break;
    }
    case "secondaryDynamics": {
      const sourcePose = ensureScratchPose(context);
      const sourceMotion = ensureScratchMotion(context);
      evaluateNode(
        context,
        compiledGraph,
        graphIndex,
        node.sourceNodeIndex,
        time,
        previousTime,
        deltaTime,
        sourcePose,
        sourceMotion,
        fallbackPose
      );
      copyRootMotion(sourceMotion, outRootMotion);
      applySecondaryDynamics(context, node, sourcePose, outPose, deltaTime);
      releaseScratchMotion(context);
      releaseScratchPose(context);
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

  const currentNormalizedTime = (() => {
    const currentDuration = getStateDuration(context, graphIndex, machineNode, machineState.currentStateIndex);
    return currentDuration > 0 ? machineState.stateTime / currentDuration : 0;
  })();
  const nextNormalizedTime = (() => {
    const nextDuration = getStateDuration(context, graphIndex, machineNode, activeTransition.toStateIndex);
    return nextDuration > 0 ? activeTransition.nextStateTime / nextDuration : 0;
  })();

  const transitionCanStart = (
    transition: (typeof machineNode.transitions)[number] | (typeof machineNode.anyStateTransitions)[number],
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

    if (!transitionCanStart(transition, normalizedTime)) {
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

      if (!transitionCanStart(transition, currentNormalizedTime)) {
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

      if (!transitionCanStart(transition, nextNormalizedTime)) {
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
    machineState.previousNextStateTime = 0;
    machineState.previousStateTime = 0;
    machineState.stateTime = 0;
    machineState.transition = null;
  }

  if (machineState.lastAdvancedUpdateId !== context.updateId) {
    const currentState = machineNode.states[machineState.currentStateIndex]!;
    machineState.lastAdvancedUpdateId = context.updateId;
    machineState.previousStateTime = machineState.stateTime;
    machineState.stateTime += deltaTime * currentState.speed;

    if (machineState.transition) {
      tryInterruptTransition(context, graphIndex, machineNode, machineState);
    } else {
      tryStartTransition(context, graphIndex, machineNode, machineState);
    }

    machineState.previousNextStateTime = machineState.transition?.nextStateTime ?? 0;
    if (machineState.transition) {
      const nextState = machineNode.states[machineState.transition.toStateIndex]!;
      machineState.transition.elapsed += deltaTime;
      machineState.transition.nextStateTime += deltaTime * nextState.speed;
    }
  }

  const currentState = machineNode.states[machineState.currentStateIndex]!;
  const previousStateTime = machineState.previousStateTime;

  if (!machineState.transition) {
    if (currentState.motionNodeIndex < 0) {
      if (fallbackPose) {
        copyPose(fallbackPose, outPose);
      } else {
        copyPose(createPoseBufferFromRig(context.rig), outPose);
      }
      resetRootMotion(outRootMotion);
    } else {
      const syncedTime = resolveSyncGroupTimes(
        context,
        currentState.syncGroup,
        getStateDuration(context, graphIndex, machineNode, machineState.currentStateIndex),
        machineState.stateTime + currentState.cycleOffset,
        previousStateTime + currentState.cycleOffset
      );
      const exitSyncGroupScope = enterSyncGroupScope(context, currentState.syncGroup);
      try {
        evaluateNode(
          context,
          compiledGraph,
          graphIndex,
          currentState.motionNodeIndex,
          syncedTime.time,
          syncedTime.previousTime,
          syncedTime.deltaTime,
          outPose,
          outRootMotion,
          fallbackPose
        );
      } finally {
        exitSyncGroupScope();
      }
    }
    return;
  }

  const transition = machineState.transition;
  const nextState = machineNode.states[transition.toStateIndex]!;
  const previousNextStateTime = machineState.previousNextStateTime;

  if (currentState.motionNodeIndex < 0) {
    if (fallbackPose) {
      copyPose(fallbackPose, outPose);
    } else {
      copyPose(createPoseBufferFromRig(context.rig), outPose);
    }
    resetRootMotion(outRootMotion);
  } else {
    const syncedTime = resolveSyncGroupTimes(
      context,
      currentState.syncGroup,
      getStateDuration(context, graphIndex, machineNode, machineState.currentStateIndex),
      machineState.stateTime + currentState.cycleOffset,
      previousStateTime + currentState.cycleOffset
    );
    const exitSyncGroupScope = enterSyncGroupScope(context, currentState.syncGroup);
    try {
      evaluateNode(
        context,
        compiledGraph,
        graphIndex,
        currentState.motionNodeIndex,
        syncedTime.time,
        syncedTime.previousTime,
        syncedTime.deltaTime,
        outPose,
        outRootMotion,
        fallbackPose
      );
    } finally {
      exitSyncGroupScope();
    }
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
    const syncedTime = resolveSyncGroupTimes(
      context,
      nextState.syncGroup,
      getStateDuration(context, graphIndex, machineNode, transition.toStateIndex),
      transition.nextStateTime + nextState.cycleOffset,
      previousNextStateTime + nextState.cycleOffset
    );
    const exitSyncGroupScope = enterSyncGroupScope(context, nextState.syncGroup);
    try {
      evaluateNode(
        context,
        compiledGraph,
        graphIndex,
        nextState.motionNodeIndex,
        syncedTime.time,
        syncedTime.previousTime,
        syncedTime.deltaTime,
        nextPose,
        nextMotion,
        fallbackPose
      );
    } finally {
      exitSyncGroupScope();
    }
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