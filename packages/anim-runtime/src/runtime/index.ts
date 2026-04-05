import { addPoseAdditive, blendPosesMasked, copyPose, createPoseBufferFromRig, createRootMotionDelta } from "@ggez/anim-core";
import type { AnimationClipAsset, RigDefinition } from "@ggez/anim-core";
import type { CompiledAnimatorGraph } from "@ggez/anim-schema";
import { createAnimatorParameterStore } from "../parameters";
import { addScaledRootMotion } from "./helpers";
import { evaluateNode } from "./evaluation";
import { createClipsBySlot, createMasks, ensureScratchMotion, ensureScratchPose, releaseScratchMotion, releaseScratchPose, resetRootMotion } from "./scratch";
import type { AnimatorInstance, AnimatorUpdateResult, EvaluationContext, LayerRuntimeState, SecondaryDynamicsChainRuntimeState, StateMachineRuntimeState } from "./types";

export type { AnimatorInstance, AnimatorUpdateResult } from "./types";

export function createAnimatorInstance(input: {
  rig: RigDefinition;
  graph: CompiledAnimatorGraph;
  clips: AnimationClipAsset[];
}): AnimatorInstance {
  const dynamicsProfiles = input.graph.dynamicsProfiles ?? [];
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
    lastAdvancedUpdateId: -1,
    previousNextStateTime: 0,
    previousStateTime: 0,
    stateTime: 0,
    transition: null
  }));
  const secondaryDynamicsStates: SecondaryDynamicsChainRuntimeState[][] = dynamicsProfiles.map((profile) =>
    profile.chains.map((chain) => ({
      initialized: false,
      currentPositions: new Float32Array(chain.boneIndices.length * 3),
      previousPositions: new Float32Array(chain.boneIndices.length * 3),
      previousRootPosition: new Float32Array(3),
      previousRootRotation: new Float32Array([0, 0, 0, 1])
    }))
  );
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
    strideWarpScales: new Map(),
    syncGroups: new Map(),
    activeSyncGroups: new Map(),
    secondaryDynamicsStates,
    updateId: 0,
    poseScratch: Array.from({ length: 32 }, () => createPoseBufferFromRig(input.rig)),
    motionScratch: Array.from({ length: 32 }, () => createRootMotionDelta()),
    poseScratchIndex: 0,
    motionScratchIndex: 0
  };

  function update(deltaTime: number): AnimatorUpdateResult {
    context.updateId += 1;
    context.poseScratchIndex = 0;
    context.motionScratchIndex = 0;
    context.syncGroups.clear();
    context.activeSyncGroups.clear();
    parameters.advance(Math.max(0, deltaTime));
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