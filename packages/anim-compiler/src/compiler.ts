import { createBoneMaskFromBranch, createRigDefinition, findBoneIndexByName } from "@ggez/anim-core";
import type { RigDefinition } from "@ggez/anim-core";
import {
  ANIMATION_GRAPH_VERSION,
  animationEditorDocumentSchema,
  type AnimationEditorDocument,
  type CompiledAnimatorGraph,
  type CompiledCondition,
  type CompiledGraphNode,
  type CompiledMotionGraph,
  type CompiledSecondaryDynamicsProfile
} from "@ggez/anim-schema";

export interface CompileDiagnostic {
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly path?: string;
}

export interface CompileResult {
  readonly ok: boolean;
  readonly diagnostics: CompileDiagnostic[];
  readonly graph?: CompiledAnimatorGraph;
}

function error(message: string, path?: string): CompileDiagnostic {
  return { severity: "error", message, path };
}

function warning(message: string, path?: string): CompileDiagnostic {
  return { severity: "warning", message, path };
}

function parameterDrivesMotionSelection(document: AnimationEditorDocument, parameterId: string, excludeNodeId?: string): boolean {
  return document.graphs.some((graph) =>
    graph.nodes.some((node) => {
      if (node.id === excludeNodeId) {
        return false;
      }

      if (node.kind === "blend1d" || node.kind === "selector") {
        return node.parameterId === parameterId;
      }

      if (node.kind === "blend2d") {
        return node.xParameterId === parameterId || node.yParameterId === parameterId;
      }

      return false;
    })
  );
}

function toRig(document: AnimationEditorDocument): RigDefinition | undefined {
  if (!document.rig) {
    return undefined;
  }

  return createRigDefinition({
    boneNames: document.rig.boneNames,
    parentIndices: document.rig.parentIndices,
    rootBoneIndex: document.rig.rootBoneIndex,
    bindTranslations: document.rig.bindTranslations,
    bindRotations: document.rig.bindRotations,
    bindScales: document.rig.bindScales
  });
}

function compileMasks(document: AnimationEditorDocument, rig: RigDefinition | undefined, diagnostics: CompileDiagnostic[]) {
  if (!rig) {
    if (document.masks.length > 0) {
      diagnostics.push(warning("Masks were authored without rig data; compiled masks will be empty.", "masks"));
    }

    return document.masks.map((mask) => ({
      name: mask.name,
      weights: []
    }));
  }

  return document.masks.map((mask, maskIndex) => {
    const compiledMask = new Float32Array(rig.boneNames.length);

    if (mask.rootBoneName) {
      const rootBoneIndex = findBoneIndexByName(rig, mask.rootBoneName);
      if (rootBoneIndex < 0) {
        diagnostics.push(error(`Mask "${mask.name}" references unknown root bone "${mask.rootBoneName}".`, `masks.${maskIndex}.rootBoneName`));
      } else if (mask.includeChildren) {
        compiledMask.set(createBoneMaskFromBranch(rig, rootBoneIndex, 1, 0).weights);
      } else {
        compiledMask[rootBoneIndex] = 1;
      }
    }

    mask.weights.forEach((weight, weightIndex) => {
      const boneIndex = findBoneIndexByName(rig, weight.boneName);
      if (boneIndex < 0) {
        diagnostics.push(error(`Mask "${mask.name}" references unknown bone "${weight.boneName}".`, `masks.${maskIndex}.weights.${weightIndex}`));
        return;
      }

      compiledMask[boneIndex] = weight.weight;
    });

    return {
      name: mask.name,
      weights: Array.from(compiledMask)
    };
  });
}

function compileConditions(
  document: AnimationEditorDocument,
  conditions: AnimationEditorDocument["graphs"][number]["nodes"][number] extends never ? never : any[],
  parameterIndexById: Map<string, number>,
  diagnostics: CompileDiagnostic[],
  pathPrefix: string
): CompiledCondition[] {
  return conditions.flatMap((condition, index) => {
    const parameterIndex = parameterIndexById.get(condition.parameterId);
    if (parameterIndex === undefined) {
      diagnostics.push(error(`Unknown parameter "${condition.parameterId}" in transition condition.`, `${pathPrefix}.${index}.parameterId`));
      return [];
    }

    return [
      {
        parameterIndex,
        operator: condition.operator,
        value: condition.value
      }
    ];
  });
}

function detectSubgraphCycles(document: AnimationEditorDocument, diagnostics: CompileDiagnostic[]): void {
  const graphMap = new Map(document.graphs.map((graph) => [graph.id, graph]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(graphId: string): void {
    if (visited.has(graphId)) {
      return;
    }
    if (visiting.has(graphId)) {
      diagnostics.push(error(`Illegal circular subgraph reference detected at graph "${graphId}".`, "graphs"));
      return;
    }

    visiting.add(graphId);
    const graph = graphMap.get(graphId);
    graph?.nodes.forEach((node) => {
      if (node.kind === "subgraph") {
        visit(node.graphId);
      }
    });
    visiting.delete(graphId);
    visited.add(graphId);
  }

  document.graphs.forEach((graph) => visit(graph.id));
}

function collectReachableNodeIds(graph: AnimationEditorDocument["graphs"][number]): Set<string> {
  const reachable = new Set<string>();
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

  function visit(nodeId: string | undefined): void {
    if (!nodeId || reachable.has(nodeId)) {
      return;
    }

    const node = nodeById.get(nodeId);
    if (!node) {
      return;
    }

    reachable.add(nodeId);

    if (node.kind === "blend1d" || node.kind === "blend2d" || node.kind === "selector") {
      node.children.forEach((child) => visit(child.nodeId));
      return;
    }

    if (node.kind === "orientationWarp" || node.kind === "strideWarp" || node.kind === "secondaryDynamics") {
      visit(node.sourceNodeId);
      return;
    }

    if (node.kind === "stateMachine") {
      node.states.forEach((state) => visit(state.motionNodeId));
    }
  }

  const outputNode = graph.nodes.find(
    (node): node is Extract<AnimationEditorDocument["graphs"][number]["nodes"][number], { kind: "output" }> =>
      node.id === graph.outputNodeId && node.kind === "output"
  );
  const outputSourceNodeId =
    outputNode?.sourceNodeId ??
    graph.edges.find((edge) => edge.targetNodeId === graph.outputNodeId)?.sourceNodeId;

  visit(outputSourceNodeId);

  return reachable;
}

function collectBoneChainIndices(rig: RigDefinition, rootBoneName: string, tipBoneName: string): number[] | undefined {
  const rootBoneIndex = findBoneIndexByName(rig, rootBoneName);
  const tipBoneIndex = findBoneIndexByName(rig, tipBoneName);

  if (rootBoneIndex < 0 || tipBoneIndex < 0) {
    return undefined;
  }

  const reverse: number[] = [];
  let current = tipBoneIndex;
  while (current >= 0) {
    reverse.push(current);
    if (current === rootBoneIndex) {
      return reverse.reverse();
    }
    current = rig.parentIndices[current] ?? -1;
  }

  return undefined;
}

function computeBindSegmentLengths(rig: RigDefinition, boneIndices: number[]): number[] {
  return boneIndices.slice(0, -1).map((boneIndex, segmentIndex) => {
    const childBoneIndex = boneIndices[segmentIndex + 1]!;
    const parentOffset = boneIndex * 3;
    const childOffset = childBoneIndex * 3;
    const dx = rig.bindTranslations[childOffset]! - rig.bindTranslations[parentOffset]!;
    const dy = rig.bindTranslations[childOffset + 1]! - rig.bindTranslations[parentOffset + 1]!;
    const dz = rig.bindTranslations[childOffset + 2]! - rig.bindTranslations[parentOffset + 2]!;
    return Math.max(Math.hypot(dx, dy, dz), 1e-4);
  });
}

function compileSecondaryDynamicsProfiles(
  document: AnimationEditorDocument,
  rig: RigDefinition | undefined,
  diagnostics: CompileDiagnostic[]
): CompiledSecondaryDynamicsProfile[] {
  if (!rig) {
    if (document.dynamicsProfiles.length > 0) {
      diagnostics.push(error("Secondary dynamics profiles require rig data.", "dynamicsProfiles"));
    }
    return [];
  }

  return document.dynamicsProfiles.map((profile, profileIndex) => ({
    name: profile.name,
    iterations: profile.iterations,
    chains: profile.chains.flatMap((chain, chainIndex) => {
      const boneIndices = collectBoneChainIndices(rig, chain.rootBoneName, chain.tipBoneName);
      if (!boneIndices) {
        diagnostics.push(
          error(
            `Dynamics chain "${chain.name}" must reference a valid descendant path from "${chain.rootBoneName}" to "${chain.tipBoneName}".`,
            `dynamicsProfiles.${profileIndex}.chains.${chainIndex}`
          )
        );
        return [];
      }

      return [{
        name: chain.name,
        boneIndices,
        restLengths: computeBindSegmentLengths(rig, boneIndices),
        damping: chain.damping,
        stiffness: chain.stiffness,
        gravityScale: chain.gravityScale,
        inertia: chain.inertia,
        limitAngleRadians: chain.limitAngleRadians,
        enabled: chain.enabled
      }];
    }),
    sphereColliders: profile.sphereColliders.flatMap((collider, colliderIndex) => {
      const boneIndex = findBoneIndexByName(rig, collider.boneName);
      if (boneIndex < 0) {
        diagnostics.push(
          error(
            `Dynamics sphere collider "${collider.name}" references unknown bone "${collider.boneName}".`,
            `dynamicsProfiles.${profileIndex}.sphereColliders.${colliderIndex}.boneName`
          )
        );
        return [];
      }

      return [{
        name: collider.name,
        boneIndex,
        offset: collider.offset,
        radius: collider.radius,
        enabled: collider.enabled
      }];
    })
  }));
}

function collectReferencedClipIds(
  document: AnimationEditorDocument,
  reachableNodeIdsByGraphId: Map<string, Set<string>>
): Set<string> {
  const referencedClipIds = new Set<string>();

  document.graphs.forEach((graph) => {
    const reachableNodeIds = reachableNodeIdsByGraphId.get(graph.id) ?? new Set<string>();

    graph.nodes.forEach((node) => {
      if (node.kind === "clip" && reachableNodeIds.has(node.id) && node.clipId) {
        referencedClipIds.add(node.clipId);
      }
    });
  });

  return referencedClipIds;
}

export function compileAnimationEditorDocument(input: unknown): CompileResult {
  const diagnostics: CompileDiagnostic[] = [];
  const parsed = animationEditorDocumentSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      diagnostics: parsed.error.issues.map((issue) =>
        error(issue.message, issue.path.join("."))
      )
    };
  }

  const document = parsed.data;
  const graphIndexById = new Map(document.graphs.map((graph, index) => [graph.id, index]));
  const parameterIndexById = new Map(document.parameters.map((parameter, index) => [parameter.id, index]));
  const reachableNodeIdsByGraphId = new Map(document.graphs.map((graph) => [graph.id, collectReachableNodeIds(graph)]));
  const referencedClipIds = collectReferencedClipIds(document, reachableNodeIdsByGraphId);
  const referencedClips = document.clips.filter((clip) => referencedClipIds.has(clip.id));
  const clipIndexById = new Map(referencedClips.map((clip, index) => [clip.id, index]));
  const rig = toRig(document);
  const masks = compileMasks(document, rig, diagnostics);
  const compiledDynamicsProfiles = compileSecondaryDynamicsProfiles(document, rig, diagnostics);
  detectSubgraphCycles(document, diagnostics);

  let machineIndexCounter = 0;

  const compiledGraphs: CompiledMotionGraph[] = document.graphs.map((graph, graphIndex) => {
    const reachableNodeIds = reachableNodeIdsByGraphId.get(graph.id) ?? new Set<string>();
    const nodeIdToCompiledIndex = new Map<string, number>();
    const motionNodes = graph.nodes.filter((node) => node.kind !== "output" && reachableNodeIds.has(node.id));
    motionNodes.forEach((node, index) => {
      nodeIdToCompiledIndex.set(node.id, index);
    });

    const outputNode = graph.nodes.find(
      (node): node is Extract<AnimationEditorDocument["graphs"][number]["nodes"][number], { kind: "output" }> =>
        node.id === graph.outputNodeId && node.kind === "output"
    );
    if (!outputNode) {
      diagnostics.push(error(`Graph "${graph.name}" is missing its output node.`, `graphs.${graphIndex}.outputNodeId`));
    }

    const outputSourceNodeId =
      outputNode?.sourceNodeId ??
      graph.edges.find((edge) => edge.targetNodeId === graph.outputNodeId)?.sourceNodeId;

    if (!outputSourceNodeId) {
      diagnostics.push(error(`Graph "${graph.name}" output node is not connected.`, `graphs.${graphIndex}.outputNodeId`));
    }

    const compiledNodes: CompiledGraphNode[] = [];

    motionNodes.forEach((node, nodeIndex) => {
      switch (node.kind) {
        case "clip": {
          const clipIndex = clipIndexById.get(node.clipId);
          if (clipIndex === undefined) {
            diagnostics.push(error(`Clip node "${node.name}" references missing clip "${node.clipId}".`, `graphs.${graphIndex}.nodes.${nodeIndex}.clipId`));
            return;
          }

          compiledNodes.push({
            type: "clip",
            clipIndex,
            speed: node.speed,
            loop: node.loop,
            inPlace: node.inPlace,
            syncGroup: node.syncGroup
          });
          return;
        }
        case "blend1d": {
          const parameterIndex = parameterIndexById.get(node.parameterId);
          if (parameterIndex === undefined) {
            diagnostics.push(error(`Blend1D node "${node.name}" references missing parameter "${node.parameterId}".`, `graphs.${graphIndex}.nodes.${nodeIndex}.parameterId`));
            return;
          }

          const parameter = document.parameters[parameterIndex];
          if (parameter?.type === "int") {
            diagnostics.push(
              warning(
                `Blend1D node "${node.name}" is driven by int parameter "${parameter.name}". Use a Selector node for discrete values like weapon types to avoid unintended interpolation.`,
                `graphs.${graphIndex}.nodes.${nodeIndex}.parameterId`
              )
            );
          }

          const children = node.children.flatMap((child, childIndex) => {
            const target = nodeIdToCompiledIndex.get(child.nodeId);
            if (target === undefined) {
              diagnostics.push(error(`Blend1D node "${node.name}" references unknown child node "${child.nodeId}".`, `graphs.${graphIndex}.nodes.${nodeIndex}.children.${childIndex}.nodeId`));
              return [];
            }

            return [
              {
                nodeIndex: target,
                threshold: child.threshold
              }
            ];
          });

          if (children.length === 0) {
            diagnostics.push(error(`Blend1D node "${node.name}" has no valid children.`, `graphs.${graphIndex}.nodes.${nodeIndex}.children`));
          }

          compiledNodes.push({
            type: "blend1d",
            parameterIndex,
            children,
            syncGroup: node.syncGroup
          });
          return;
        }
        case "blend2d": {
          const xParameterIndex = parameterIndexById.get(node.xParameterId);
          const yParameterIndex = parameterIndexById.get(node.yParameterId);
          if (xParameterIndex === undefined || yParameterIndex === undefined) {
            diagnostics.push(error(`Blend2D node "${node.name}" references missing parameters.`, `graphs.${graphIndex}.nodes.${nodeIndex}`));
            return;
          }

          const children = node.children.flatMap((child, childIndex) => {
            const target = nodeIdToCompiledIndex.get(child.nodeId);
            if (target === undefined) {
              diagnostics.push(error(`Blend2D node "${node.name}" references unknown child node "${child.nodeId}".`, `graphs.${graphIndex}.nodes.${nodeIndex}.children.${childIndex}.nodeId`));
              return [];
            }

            return [
              {
                nodeIndex: target,
                x: child.x,
                y: child.y
              }
            ];
          });

          compiledNodes.push({
            type: "blend2d",
            xParameterIndex,
            yParameterIndex,
            children,
            syncGroup: node.syncGroup
          });
          return;
        }
        case "selector": {
          const parameterIndex = parameterIndexById.get(node.parameterId);
          if (parameterIndex === undefined) {
            diagnostics.push(error(`Selector node "${node.name}" references missing parameter "${node.parameterId}".`, `graphs.${graphIndex}.nodes.${nodeIndex}.parameterId`));
            return;
          }

          const children = node.children.flatMap((child, childIndex) => {
            const target = nodeIdToCompiledIndex.get(child.nodeId);
            if (target === undefined) {
              diagnostics.push(error(`Selector node "${node.name}" references unknown child node "${child.nodeId}".`, `graphs.${graphIndex}.nodes.${nodeIndex}.children.${childIndex}.nodeId`));
              return [];
            }

            return [
              {
                nodeIndex: target,
                value: child.value
              }
            ];
          });

          if (children.length === 0) {
            diagnostics.push(error(`Selector node "${node.name}" has no valid children.`, `graphs.${graphIndex}.nodes.${nodeIndex}.children`));
          }

          compiledNodes.push({
            type: "selector",
            parameterIndex,
            children,
            syncGroup: node.syncGroup
          });
          return;
        }
        case "orientationWarp": {
          const sourceNodeIndex = node.sourceNodeId ? nodeIdToCompiledIndex.get(node.sourceNodeId) : undefined;
          if (sourceNodeIndex === undefined) {
            diagnostics.push(error(`Orientation Warp node "${node.name}" requires a connected source motion.`, `graphs.${graphIndex}.nodes.${nodeIndex}.sourceNodeId`));
            return;
          }

          const parameterIndex = parameterIndexById.get(node.angleParameterId);
          if (parameterIndex === undefined) {
            diagnostics.push(error(`Orientation Warp node "${node.name}" references missing parameter "${node.angleParameterId}".`, `graphs.${graphIndex}.nodes.${nodeIndex}.angleParameterId`));
            return;
          }

          if (!rig) {
            diagnostics.push(error(`Orientation Warp node "${node.name}" requires rig data to resolve authored bones.`, `graphs.${graphIndex}.nodes.${nodeIndex}`));
            return;
          }

          const resolveBoneIndex = (boneName: string, path: string): number | undefined => {
            const boneIndex = findBoneIndexByName(rig, boneName);
            if (boneIndex < 0) {
              diagnostics.push(error(`Orientation Warp node "${node.name}" references unknown bone "${boneName}".`, path));
              return undefined;
            }
            return boneIndex;
          };

          const hipBoneIndex = node.hipBoneName
            ? resolveBoneIndex(node.hipBoneName, `graphs.${graphIndex}.nodes.${nodeIndex}.hipBoneName`)
            : undefined;
          const spineBoneIndices = node.spineBoneNames.flatMap((boneName, spineIndex) => {
            const boneIndex = resolveBoneIndex(
              boneName,
              `graphs.${graphIndex}.nodes.${nodeIndex}.spineBoneNames.${spineIndex}`
            );
            return boneIndex === undefined ? [] : [boneIndex];
          });
          const legs = node.legs.flatMap((leg, legIndex) => {
            const upperBoneIndex = resolveBoneIndex(
              leg.upperBoneName,
              `graphs.${graphIndex}.nodes.${nodeIndex}.legs.${legIndex}.upperBoneName`
            );
            const lowerBoneIndex = resolveBoneIndex(
              leg.lowerBoneName,
              `graphs.${graphIndex}.nodes.${nodeIndex}.legs.${legIndex}.lowerBoneName`
            );
            const footBoneIndex = resolveBoneIndex(
              leg.footBoneName,
              `graphs.${graphIndex}.nodes.${nodeIndex}.legs.${legIndex}.footBoneName`
            );

            if (
              upperBoneIndex === undefined ||
              lowerBoneIndex === undefined ||
              footBoneIndex === undefined
            ) {
              return [];
            }

            return [
              {
                upperBoneIndex,
                lowerBoneIndex,
                footBoneIndex,
                weight: leg.weight
              }
            ];
          });

          compiledNodes.push({
            type: "orientationWarp",
            sourceNodeIndex,
            parameterIndex,
            maxAngle: node.maxAngle,
            weight: node.weight,
            hipBoneIndex,
            hipWeight: node.hipWeight,
            spineBoneIndices,
            legs
          });
          return;
        }
        case "strideWarp": {
          const sourceNodeIndex = node.sourceNodeId ? nodeIdToCompiledIndex.get(node.sourceNodeId) : undefined;
          if (sourceNodeIndex === undefined) {
            diagnostics.push(error(`Stride Warp node "${node.name}" requires a connected source motion.`, `graphs.${graphIndex}.nodes.${nodeIndex}.sourceNodeId`));
            return;
          }

          const locomotionSpeedParameterIndex = node.evaluationMode === "graph"
            ? parameterIndexById.get(node.locomotionSpeedParameterId ?? "")
            : undefined;

          if (node.evaluationMode === "graph" && locomotionSpeedParameterIndex === undefined) {
            diagnostics.push(error(`Stride Warp node "${node.name}" requires a locomotion speed parameter in graph mode.`, `graphs.${graphIndex}.nodes.${nodeIndex}.locomotionSpeedParameterId`));
            return;
          }

          if (node.evaluationMode === "graph" && node.locomotionSpeedParameterId) {
            const locomotionSpeedParameter = document.parameters.find((parameter) => parameter.id === node.locomotionSpeedParameterId);
            if (locomotionSpeedParameter?.type !== "float") {
              diagnostics.push(error(`Stride Warp node "${node.name}" requires a float locomotion speed parameter in graph mode.`, `graphs.${graphIndex}.nodes.${nodeIndex}.locomotionSpeedParameterId`));
              return;
            }

            if (parameterDrivesMotionSelection(document, node.locomotionSpeedParameterId, node.id)) {
              diagnostics.push(
                warning(
                  `Stride Warp node "${node.name}" uses parameter "${locomotionSpeedParameter.name}" for graph-driven speed scaling, but that parameter also drives a blend tree or selector. Graph mode expects real runtime movement speed, not a normalized blend/control value, and can severely shrink root motion if the units do not match.`,
                  `graphs.${graphIndex}.nodes.${nodeIndex}.locomotionSpeedParameterId`
                )
              );
            }
          }

          if (!rig) {
            diagnostics.push(error(`Stride Warp node "${node.name}" requires rig data to resolve authored bones.`, `graphs.${graphIndex}.nodes.${nodeIndex}`));
            return;
          }

          const resolveBoneIndex = (boneName: string, path: string): number | undefined => {
            const boneIndex = findBoneIndexByName(rig, boneName);
            if (boneIndex < 0) {
              diagnostics.push(error(`Stride Warp node "${node.name}" references unknown bone "${boneName}".`, path));
              return undefined;
            }
            return boneIndex;
          };

          const pelvisBoneIndex = node.pelvisBoneName
            ? resolveBoneIndex(node.pelvisBoneName, `graphs.${graphIndex}.nodes.${nodeIndex}.pelvisBoneName`)
            : undefined;
          const legs = node.legs.flatMap((leg, legIndex) => {
            const upperBoneIndex = resolveBoneIndex(
              leg.upperBoneName,
              `graphs.${graphIndex}.nodes.${nodeIndex}.legs.${legIndex}.upperBoneName`
            );
            const lowerBoneIndex = resolveBoneIndex(
              leg.lowerBoneName,
              `graphs.${graphIndex}.nodes.${nodeIndex}.legs.${legIndex}.lowerBoneName`
            );
            const footBoneIndex = resolveBoneIndex(
              leg.footBoneName,
              `graphs.${graphIndex}.nodes.${nodeIndex}.legs.${legIndex}.footBoneName`
            );

            if (
              upperBoneIndex === undefined ||
              lowerBoneIndex === undefined ||
              footBoneIndex === undefined
            ) {
              return [];
            }

            return [
              {
                upperBoneIndex,
                lowerBoneIndex,
                footBoneIndex,
                weight: leg.weight
              }
            ];
          });

          compiledNodes.push({
            type: "strideWarp",
            sourceNodeIndex,
            evaluationMode: node.evaluationMode,
            locomotionSpeedParameterIndex,
            strideDirection: node.strideDirection,
            manualStrideScale: node.manualStrideScale,
            minLocomotionSpeedThreshold: node.minLocomotionSpeedThreshold,
            pelvisBoneIndex,
            pelvisWeight: node.pelvisWeight,
            clampResult: node.clampResult,
            minStrideScale: node.minStrideScale,
            maxStrideScale: node.maxStrideScale,
            interpResult: node.interpResult,
            interpSpeedIncreasing: node.interpSpeedIncreasing,
            interpSpeedDecreasing: node.interpSpeedDecreasing,
            legs
          });
          return;
        }
        case "secondaryDynamics": {
          const sourceNodeIndex = node.sourceNodeId ? nodeIdToCompiledIndex.get(node.sourceNodeId) : undefined;
          if (sourceNodeIndex === undefined) {
            diagnostics.push(error(`Secondary Dynamics node "${node.name}" requires a connected source motion.`, `graphs.${graphIndex}.nodes.${nodeIndex}.sourceNodeId`));
            return;
          }

          const profileIndex = document.dynamicsProfiles.findIndex((profile) => profile.id === node.profileId);
          if (profileIndex < 0) {
            diagnostics.push(error(`Secondary Dynamics node "${node.name}" references missing profile "${node.profileId}".`, `graphs.${graphIndex}.nodes.${nodeIndex}.profileId`));
            return;
          }

          compiledNodes.push({
            type: "secondaryDynamics",
            sourceNodeIndex,
            profileIndex,
            weight: node.weight,
            dampingScale: node.dampingScale,
            stiffnessScale: node.stiffnessScale,
            gravityScale: node.gravityScale,
            iterations: node.iterations
          });
          return;
        }
        case "subgraph": {
          const targetGraphIndex = graphIndexById.get(node.graphId);
          if (targetGraphIndex === undefined) {
            diagnostics.push(error(`Subgraph node "${node.name}" references missing graph "${node.graphId}".`, `graphs.${graphIndex}.nodes.${nodeIndex}.graphId`));
            return;
          }

          compiledNodes.push({
            type: "subgraph",
            graphIndex: targetGraphIndex,
            syncGroup: node.syncGroup
          });
          return;
        }
        case "stateMachine": {
          const stateIndexById = new Map(node.states.map((state, index) => [state.id, index]));
          const states = node.states.flatMap((state, stateIndex) => {
            if (!state.motionNodeId) {
              return [
                {
                  name: state.name,
                  motionNodeIndex: -1,
                  speed: state.speed,
                  cycleOffset: state.cycleOffset,
                  syncGroup: state.syncGroup
                }
              ];
            }

            const motionNodeIndex = nodeIdToCompiledIndex.get(state.motionNodeId);
            if (motionNodeIndex === undefined) {
              diagnostics.push(error(`State "${state.name}" references missing motion node "${state.motionNodeId}".`, `graphs.${graphIndex}.nodes.${nodeIndex}.states.${stateIndex}.motionNodeId`));
              return [];
            }

            return [
                {
                  name: state.name,
                  motionNodeIndex,
                  speed: state.speed,
                  cycleOffset: state.cycleOffset,
                  syncGroup: state.syncGroup
                }
              ];
          });
          const entryStateIndex = stateIndexById.get(node.entryStateId);
          if (entryStateIndex === undefined) {
            diagnostics.push(error(`State machine "${node.name}" references missing entry state "${node.entryStateId}".`, `graphs.${graphIndex}.nodes.${nodeIndex}.entryStateId`));
          }

          const compileTransitionList = (
            transitions: typeof node.transitions,
            pathPrefix: string,
            isAnyState = false
          ) =>
            transitions.flatMap((transition, transitionIndex) => {
              const toStateIndex = stateIndexById.get(transition.toStateId);
              const fromStateIndex = transition.fromStateId
                ? stateIndexById.get(transition.fromStateId)
                : isAnyState
                  ? -1
                  : undefined;

              if (toStateIndex === undefined || fromStateIndex === undefined) {
                diagnostics.push(error(`Transition "${transition.id}" in state machine "${node.name}" references missing states.`, `${pathPrefix}.${transitionIndex}`));
                return [];
              }

              return [
                {
                  fromStateIndex,
                  toStateIndex,
                  duration: transition.duration,
                  blendCurve: transition.blendCurve,
                  syncNormalizedTime: transition.syncNormalizedTime,
                  hasExitTime: transition.hasExitTime,
                  exitTime: transition.exitTime,
                  interruptionSource: transition.interruptionSource,
                  conditions: compileConditions(document, transition.conditions, parameterIndexById, diagnostics, `${pathPrefix}.${transitionIndex}.conditions`)
                }
              ];
            });

          const machineIndex = machineIndexCounter;
          machineIndexCounter += 1;

          compiledNodes.push({
            type: "stateMachine",
            machineIndex,
            entryStateIndex: entryStateIndex ?? 0,
            states,
            transitions: compileTransitionList(node.transitions, `graphs.${graphIndex}.nodes.${nodeIndex}.transitions`),
            anyStateTransitions: compileTransitionList(node.anyStateTransitions, `graphs.${graphIndex}.nodes.${nodeIndex}.anyStateTransitions`, true)
          });
          return;
        }
      }
    });

    const rootNodeIndex = outputSourceNodeId ? nodeIdToCompiledIndex.get(outputSourceNodeId) : undefined;
    if (rootNodeIndex === undefined) {
      diagnostics.push(error(`Graph "${graph.name}" output points to an invalid node.`, `graphs.${graphIndex}.outputNodeId`));
    }

    const unreachableMotionNodes = graph.nodes.filter((node) => node.kind !== "output" && !reachableNodeIds.has(node.id));
    if (unreachableMotionNodes.length > 0) {
      diagnostics.push(
        warning(
          `Graph "${graph.name}" has ${unreachableMotionNodes.length} disconnected node${unreachableMotionNodes.length === 1 ? "" : "s"} that will be ignored until connected to the output.`,
          `graphs.${graphIndex}.nodes`
        )
      );
    }

    return {
      name: graph.name,
      rootNodeIndex: rootNodeIndex ?? 0,
      nodes: compiledNodes
    };
  });

  document.layers.forEach((layer, layerIndex) => {
    if (graphIndexById.get(layer.graphId) === undefined) {
      diagnostics.push(error(`Layer "${layer.name}" references missing graph "${layer.graphId}".`, `layers.${layerIndex}.graphId`));
    }

    if (layer.maskId && !document.masks.some((mask) => mask.id === layer.maskId)) {
      diagnostics.push(error(`Layer "${layer.name}" references missing mask "${layer.maskId}".`, `layers.${layerIndex}.maskId`));
    }
  });

  const entryGraphIndex = graphIndexById.get(document.entryGraphId);
  if (entryGraphIndex === undefined) {
    diagnostics.push(error(`Entry graph "${document.entryGraphId}" does not exist.`, "entryGraphId"));
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return {
      ok: false,
      diagnostics
    };
  }

  return {
    ok: true,
    diagnostics,
    graph: {
      version: ANIMATION_GRAPH_VERSION,
      name: document.name,
      rig: document.rig,
      parameters: document.parameters.map((parameter) => ({
        name: parameter.name,
        type: parameter.type,
        defaultValue: parameter.defaultValue,
        smoothingDuration: parameter.smoothingDuration
      })),
      clipSlots: referencedClips.map((clip) => ({
        id: clip.id,
        name: clip.name,
        duration: clip.duration
      })),
      masks,
      dynamicsProfiles: compiledDynamicsProfiles,
      graphs: compiledGraphs,
      layers: document.layers.map((layer) => ({
        name: layer.name,
        graphIndex: graphIndexById.get(layer.graphId)!,
        weight: layer.weight,
        blendMode: layer.blendMode,
        maskIndex: layer.maskId ? document.masks.findIndex((mask) => mask.id === layer.maskId) : undefined,
        rootMotionMode: layer.rootMotionMode,
        enabled: layer.enabled
      })),
      entryGraphIndex: entryGraphIndex!
    }
  };
}

export function compileAnimationEditorDocumentOrThrow(input: unknown): CompiledAnimatorGraph {
  const result = compileAnimationEditorDocument(input);
  if (!result.ok || !result.graph) {
    throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  }

  return result.graph;
}
