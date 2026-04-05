import type { AnimationClipAsset, BoneMask, PoseBuffer, RigDefinition, RootMotionDelta } from "@ggez/anim-core";
import type { CompiledAnimatorGraph, CompiledTransition } from "@ggez/anim-schema";
import type { AnimatorParameterStore } from "../parameters";

export interface LayerRuntimeState {
  time: number;
}

export interface MachineTransitionState {
  readonly fromStateIndex: number;
  readonly toStateIndex: number;
  readonly duration: number;
  readonly blendCurve: CompiledTransition["blendCurve"];
  readonly interruptionSource: "none" | "current" | "next" | "both";
  elapsed: number;
  nextStateTime: number;
}

export interface StateMachineRuntimeState {
  initialized: boolean;
  currentStateIndex: number;
  lastAdvancedUpdateId: number;
  previousNextStateTime: number;
  previousStateTime: number;
  stateTime: number;
  transition: MachineTransitionState | null;
}

export interface SyncGroupRuntimeState {
  normalizedPreviousTime: number;
  normalizedTime: number;
}

export interface SecondaryDynamicsChainRuntimeState {
  initialized: boolean;
  readonly currentPositions: Float32Array;
  readonly previousPositions: Float32Array;
  readonly previousRootPosition: Float32Array;
  readonly previousRootRotation: Float32Array;
}

export interface EvaluationContext {
  readonly graph: CompiledAnimatorGraph;
  readonly rig: RigDefinition;
  readonly clips: AnimationClipAsset[];
  readonly masks: BoneMask[];
  readonly parameters: AnimatorParameterStore;
  readonly layerStates: LayerRuntimeState[];
  readonly machineStates: StateMachineRuntimeState[];
  readonly durationCache: Map<string, number>;
  readonly strideWarpScales: Map<string, number>;
  readonly syncGroups: Map<string, SyncGroupRuntimeState>;
  readonly activeSyncGroups: Map<string, number>;
  readonly secondaryDynamicsStates: SecondaryDynamicsChainRuntimeState[][];
  updateId: number;
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