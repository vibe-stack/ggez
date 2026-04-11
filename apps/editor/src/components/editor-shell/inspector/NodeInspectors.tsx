import { useRef } from "react";
import { parseVfxRuntimeBundleZip } from "@ggez/vfx-exporter";
import {
  type EditableMesh,
  type Entity,
  type GeometryNode,
  type LightNodeData,
  type PropBodyType,
  type PropColliderShape,
  type PrimitiveNodeData
} from "@ggez/shared";
import { Button } from "@/components/ui/button";
import { DragInput } from "@/components/ui/drag-input";
import { readFileAsDataUrl } from "@/lib/model-assets";
import {
  BooleanField,
  ColorField,
  EnumGrid,
  NumberField,
  SectionTitle,
  TextField,
  ToolSection,
  startCase
} from "./InspectorFields";

export function PrimitiveInspector({
  node,
  onUpdateNodeData
}: {
  node: Extract<GeometryNode, { kind: "primitive" }>;
  onUpdateNodeData: (nodeId: string, data: PrimitiveNodeData | LightNodeData) => void;
}) {
  const updateData = (next: PrimitiveNodeData) => onUpdateNodeData(node.id, next);

  return (
    <ToolSection title={node.data.role === "prop" ? "Prop" : "Primitive"}>
      <div className="grid grid-cols-3 gap-1.5">
        <DragInput
          className="min-w-0"
          compact
          label="W"
          onChange={(value) => updateData({ ...node.data, size: { ...node.data.size, x: value } })}
          onValueCommit={() => undefined}
          precision={2}
          step={0.05}
          value={node.data.size.x}
        />
        <DragInput
          className="min-w-0"
          compact
          label="H"
          onChange={(value) => updateData({ ...node.data, size: { ...node.data.size, y: value } })}
          onValueCommit={() => undefined}
          precision={2}
          step={0.05}
          value={node.data.size.y}
        />
        <DragInput
          className="min-w-0"
          compact
          label="D"
          onChange={(value) => updateData({ ...node.data, size: { ...node.data.size, z: value } })}
          onValueCommit={() => undefined}
          precision={2}
          step={0.05}
          value={node.data.size.z}
        />
      </div>
      {node.data.role === "prop" && node.data.physics ? (
        <PropPhysicsFields
          onChange={(physics) => updateData({ ...node.data, physics })}
          physics={node.data.physics}
        />
      ) : null}
    </ToolSection>
  );
}

export function MeshPhysicsInspector({
  node,
  onUpdateMeshData
}: {
  node: Extract<GeometryNode, { kind: "mesh" }>;
  onUpdateMeshData: (nodeId: string, mesh: EditableMesh, beforeMesh?: EditableMesh) => void;
}) {
  const physics = node.data.physics;

  return (
    <ToolSection title="Mesh Physics">
      <BooleanField
        checked={Boolean(physics)}
        label="Enabled"
        onCheckedChange={(checked) => {
          if (checked) {
            onUpdateMeshData(node.id, { ...node.data, physics: physics ?? createDefaultMeshPhysics() }, node.data);
            return;
          }
          onUpdateMeshData(node.id, { ...node.data, physics: undefined }, node.data);
        }}
      />
      {physics ? (
        <PropPhysicsFields
          onChange={(nextPhysics) =>
            onUpdateMeshData(node.id, { ...node.data, physics: nextPhysics }, node.data)
          }
          physics={physics}
        />
      ) : (
        <div className="rounded-xl bg-white/4 px-3 py-2 text-[11px] text-foreground/52">
          Enable physics to simulate this mesh at runtime.
        </div>
      )}
    </ToolSection>
  );
}

export function InstancingInspector({
  node
}: {
  node: Extract<GeometryNode, { kind: "instancing" }>;
}) {
  return (
    <ToolSection title="Instancing">
      <div className="rounded-xl bg-white/4 px-3 py-2 text-[11px] text-foreground/56">
        This node instances{" "}
        <span className="font-mono text-foreground/72">{node.data.sourceNodeId}</span>. Only
        transform values are editable here.
      </div>
    </ToolSection>
  );
}

export function PropPhysicsFields({
  onChange,
  physics
}: {
  onChange: (physics: NonNullable<PrimitiveNodeData["physics"]>) => void;
  physics: NonNullable<PrimitiveNodeData["physics"]>;
}) {
  return (
    <div className="space-y-2">
      <SectionTitle>Physics</SectionTitle>
      <BooleanField
        checked={physics.enabled}
        label="Physics Enabled"
        onCheckedChange={(checked) => onChange({ ...physics, enabled: checked })}
      />
      <EnumGrid
        activeValue={physics.bodyType}
        entries={[
          { label: "Static", value: "fixed" },
          { label: "Dynamic", value: "dynamic" },
          { label: "Kinematic", value: "kinematicPosition" }
        ]}
        onSelect={(value) => onChange({ ...physics, bodyType: value as PropBodyType })}
      />
      <EnumGrid
        activeValue={physics.colliderShape}
        entries={[
          { label: "Cuboid", value: "cuboid" },
          { label: "Ball", value: "ball" },
          { label: "Cylinder", value: "cylinder" },
          { label: "Cone", value: "cone" },
          { label: "Trimesh", value: "trimesh" }
        ]}
        onSelect={(value) => onChange({ ...physics, colliderShape: value as PropColliderShape })}
      />
      <NumberField
        label="Mass"
        onChange={(value) => onChange({ ...physics, mass: value })}
        value={physics.mass ?? 1}
      />
      <NumberField
        label="Density"
        onChange={(value) => onChange({ ...physics, density: value })}
        value={physics.density ?? 0}
      />
      <NumberField
        label="Friction"
        onChange={(value) => onChange({ ...physics, friction: value })}
        value={physics.friction}
      />
      <NumberField
        label="Restitution"
        onChange={(value) => onChange({ ...physics, restitution: value })}
        value={physics.restitution}
      />
      <NumberField
        label="Gravity Scale"
        onChange={(value) => onChange({ ...physics, gravityScale: value })}
        value={physics.gravityScale}
      />
      <BooleanField
        checked={physics.sensor}
        label="Sensor"
        onCheckedChange={(checked) => onChange({ ...physics, sensor: checked })}
      />
      <BooleanField
        checked={physics.ccd}
        label="CCD"
        onCheckedChange={(checked) => onChange({ ...physics, ccd: checked })}
      />
      <BooleanField
        checked={physics.lockRotations}
        label="Lock Rotations"
        onCheckedChange={(checked) => onChange({ ...physics, lockRotations: checked })}
      />
      <BooleanField
        checked={physics.lockTranslations}
        label="Lock Translations"
        onCheckedChange={(checked) => onChange({ ...physics, lockTranslations: checked })}
      />
    </div>
  );
}

export function createDefaultMeshPhysics(): NonNullable<PrimitiveNodeData["physics"]> {
  return {
    angularDamping: 0.8,
    bodyType: "fixed",
    canSleep: true,
    ccd: false,
    colliderShape: "trimesh",
    contactSkin: 0,
    density: undefined,
    enabled: true,
    friction: 0.8,
    gravityScale: 1,
    linearDamping: 0.7,
    lockRotations: false,
    lockTranslations: false,
    mass: 1,
    restitution: 0.05,
    sensor: false
  };
}

export function LightInspector({
  node,
  onUpdateNodeData
}: {
  node: Extract<GeometryNode, { kind: "light" }>;
  onUpdateNodeData: (nodeId: string, data: PrimitiveNodeData | LightNodeData) => void;
}) {
  const updateData = (next: LightNodeData) => onUpdateNodeData(node.id, next);

  return (
    <ToolSection title="Light">
      <BooleanField
        checked={node.data.enabled}
        label="Enabled"
        onCheckedChange={(checked) => updateData({ ...node.data, enabled: checked })}
      />
      <ColorField
        label="Color"
        onChange={(value) => updateData({ ...node.data, color: value })}
        value={node.data.color}
      />
      <NumberField
        label="Intensity"
        onChange={(value) => updateData({ ...node.data, intensity: value })}
        value={node.data.intensity}
      />
      {node.data.type === "point" || node.data.type === "spot" ? (
        <>
          <NumberField
            label="Distance"
            onChange={(value) => updateData({ ...node.data, distance: value })}
            value={node.data.distance ?? 0}
          />
          <NumberField
            label="Decay"
            onChange={(value) => updateData({ ...node.data, decay: value })}
            value={node.data.decay ?? 1}
          />
        </>
      ) : null}
      {node.data.type === "spot" ? (
        <>
          <NumberField
            label="Angle"
            onChange={(value) => updateData({ ...node.data, angle: value })}
            value={node.data.angle ?? Math.PI / 6}
          />
          <NumberField
            label="Penumbra"
            onChange={(value) => updateData({ ...node.data, penumbra: value })}
            value={node.data.penumbra ?? 0.35}
          />
        </>
      ) : null}
      {node.data.type === "hemisphere" ? (
        <ColorField
          label="Ground Color"
          onChange={(value) => updateData({ ...node.data, groundColor: value })}
          value={node.data.groundColor ?? "#0f1721"}
        />
      ) : null}
      <BooleanField
        checked={node.data.castShadow}
        label="Cast Shadow"
        onCheckedChange={(checked) => updateData({ ...node.data, castShadow: checked })}
      />
    </ToolSection>
  );
}

export function EntityInspector({
  entity,
  onUpdateEntityProperties
}: {
  entity: Entity;
  onUpdateEntityProperties: (entityId: string, properties: Entity["properties"]) => void;
}) {
  if (entity.type === "vfx-object") {
    return (
      <VfxEntityInspector entity={entity} onUpdateEntityProperties={onUpdateEntityProperties} />
    );
  }

  const updateProperty = (key: string, value: string | number | boolean) => {
    onUpdateEntityProperties(entity.id, { ...entity.properties, [key]: value });
  };

  return (
    <ToolSection title="Properties">
      {Object.entries(entity.properties).map(([key, value]) =>
        typeof value === "boolean" ? (
          <BooleanField
            key={key}
            label={startCase(key)}
            onCheckedChange={(checked) => updateProperty(key, checked)}
            checked={value}
          />
        ) : typeof value === "number" ? (
          <NumberField
            key={key}
            label={startCase(key)}
            onChange={(next) => updateProperty(key, next)}
            value={value}
          />
        ) : (
          <TextField
            key={key}
            label={startCase(key)}
            onChange={(next) => updateProperty(key, next)}
            value={value}
          />
        )
      )}
    </ToolSection>
  );
}

function VfxEntityInspector({
  entity,
  onUpdateEntityProperties
}: {
  entity: Entity;
  onUpdateEntityProperties: (entityId: string, properties: Entity["properties"]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const updateProperty = (key: string, value: string | number | boolean) => {
    onUpdateEntityProperties(entity.id, { ...entity.properties, [key]: value });
  };

  const bundleFileName =
    typeof entity.properties.vfxBundleFileName === "string"
      ? entity.properties.vfxBundleFileName
      : "";
  const bundleDataUrl =
    typeof entity.properties.vfxBundleDataUrl === "string"
      ? entity.properties.vfxBundleDataUrl
      : "";
  const durationSeconds =
    typeof entity.properties.vfxDurationSeconds === "number"
      ? entity.properties.vfxDurationSeconds
      : 4;
  const playbackRate =
    typeof entity.properties.vfxPlaybackRate === "number"
      ? entity.properties.vfxPlaybackRate
      : 1;
  const loopForever =
    typeof entity.properties.vfxLoop === "boolean" ? entity.properties.vfxLoop : true;

  return (
    <ToolSection title="VFX">
      <div className="rounded-lg bg-white/4 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-foreground/86">Runtime Bundle</div>
            <div className="truncate text-[10px] text-foreground/48">
              {bundleFileName || (bundleDataUrl ? "Embedded bundle" : "No bundle uploaded")}
            </div>
          </div>
          <Button
            onClick={() => fileInputRef.current?.click()}
            size="sm"
            type="button"
            variant="outline"
          >
            {bundleDataUrl ? "Replace" : "Upload"}
          </Button>
          <input
            accept=".vfxbundle,.zip,application/zip"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (!file) {
                return;
              }

              void Promise.all([readFileAsDataUrl(file), file.arrayBuffer()]).then(
                ([dataUrl, buffer]) => {
                  const parsed = parseVfxRuntimeBundleZip(new Uint8Array(buffer));

                  onUpdateEntityProperties(entity.id, {
                    ...entity.properties,
                    vfxBundleDataUrl: dataUrl,
                    vfxBundleFileName: file.name,
                    vfxDurationSeconds:
                      parsed.document?.preview.durationSeconds ?? durationSeconds,
                    vfxLoop: parsed.document ? !parsed.document.preview.loop : loopForever,
                    vfxPlaybackRate: parsed.document?.preview.playbackRate ?? playbackRate
                  });
                }
              );

              event.target.value = "";
            }}
            ref={fileInputRef}
            type="file"
          />
        </div>
      </div>
      <BooleanField
        checked={entity.properties.autoplay !== false}
        label="Autoplay"
        onCheckedChange={(checked) => updateProperty("autoplay", checked)}
      />
      <BooleanField
        checked={entity.properties.enabled !== false}
        label="Enabled"
        onCheckedChange={(checked) => updateProperty("enabled", checked)}
      />
      <BooleanField
        checked={loopForever}
        label="Play Infinitely"
        onCheckedChange={(checked) => updateProperty("vfxLoop", checked)}
      />
      <NumberField
        label="Duration"
        onChange={(next) => updateProperty("vfxDurationSeconds", Math.max(0.1, next))}
        value={durationSeconds}
      />
      <NumberField
        label="Playback Rate"
        onChange={(next) => updateProperty("vfxPlaybackRate", Math.max(0.1, next))}
        value={playbackRate}
      />
      {Object.entries(entity.properties)
        .filter(
          ([key]) =>
            key !== "autoplay" &&
            key !== "enabled" &&
            key !== "vfxBundleDataUrl" &&
            key !== "vfxBundleFileName" &&
            key !== "vfxDurationSeconds" &&
            key !== "vfxLoop" &&
            key !== "vfxPlaybackRate"
        )
        .map(([key, value]) =>
          typeof value === "boolean" ? (
            <BooleanField
              key={key}
              label={startCase(key)}
              onCheckedChange={(checked) => updateProperty(key, checked)}
              checked={value}
            />
          ) : typeof value === "number" ? (
            <NumberField
              key={key}
              label={startCase(key)}
              onChange={(next) => updateProperty(key, next)}
              value={value}
            />
          ) : (
            <TextField
              key={key}
              label={startCase(key)}
              onChange={(next) => updateProperty(key, next)}
              value={value}
            />
          )
        )}
    </ToolSection>
  );
}
