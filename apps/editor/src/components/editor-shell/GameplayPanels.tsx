import { useMemo, useState, type ReactNode } from "react";
import { type Entity, type GameplayObject, type GameplayValue, type GeometryNode, type SceneEventDefinition, type SceneHook, type ScenePathDefinition, type SceneSettings } from "@ggez/shared";
import { CircleHelp, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import type { ToolId } from "@ggez/tool-system";
import { Button } from "@/components/ui/button";
import { DragInput } from "@/components/ui/drag-input";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  createEmptyEventCondition,
  createEmptyGrant,
  createEmptySequenceAction,
  createGameplayEventDefinition,
  createSceneHook,
  formatGameplayValue,
  getGameplayValue,
  getHookDefinition,
  getPresetsForHookType,
  HOOK_DEFINITIONS,
  isGameplayObject,
  isHookFieldVisible,
  parseGameplayValue,
  resolveGameplayEvents,
  setGameplayValue,
  STANDARD_GAMEPLAY_EVENTS,
  toEventMap,
  toGameplayObject,
  toObjectArray,
  toStringArray,
  toVec3Tuple,
  type HookFieldDefinition
} from "@/lib/gameplay";

type HooksPanelProps = {
  entities: Entity[];
  nodes: GeometryNode[];
  onUpdateEntityHooks: (entityId: string, hooks: NonNullable<Entity["hooks"]>, beforeHooks?: NonNullable<Entity["hooks"]>) => void;
  onUpdateNodeHooks: (nodeId: string, hooks: NonNullable<GeometryNode["hooks"]>, beforeHooks?: NonNullable<GeometryNode["hooks"]>) => void;
  sceneSettings: SceneSettings;
  selectedEntity?: Entity;
  selectedNode?: GeometryNode;
};

type EventsPanelProps = {
  onUpdateSceneSettings: (settings: SceneSettings, beforeSettings?: SceneSettings) => void;
  sceneSettings: SceneSettings;
};

type PathsPanelProps = {
  activeToolId: ToolId;
  onSelectScenePath: (pathId: string | undefined) => void;
  onSetToolId: (toolId: ToolId) => void;
  onUpdateSceneSettings: (settings: SceneSettings, beforeSettings?: SceneSettings) => void;
  sceneSettings: SceneSettings;
  selectedPathId?: string;
};

type TargetOption = {
  label: string;
  value: string;
};

const EVENT_SCOPE_OPTIONS = [
  { label: "Custom", value: "custom" },
  { label: "Entity Local", value: "entity-local" },
  { label: "Player", value: "player" },
  { label: "World", value: "world" },
  { label: "Global", value: "global" },
  { label: "Mission", value: "mission" }
] as const;

const PANEL_SURFACE_CLASS = "rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))]";
const ROW_SURFACE_CLASS = "rounded-xl border border-white/6 bg-white/[0.03]";

export function HooksPanel({
  entities,
  nodes,
  onUpdateEntityHooks,
  onUpdateNodeHooks,
  sceneSettings,
  selectedEntity,
  selectedNode
}: HooksPanelProps) {
  const [nextHookType, setNextHookType] = useState(HOOK_DEFINITIONS[0]?.type ?? "tags");
  const availableEvents = useMemo(
    () => resolveGameplayEvents(sceneSettings.events ?? []),
    [sceneSettings.events]
  );
  const scenePaths = sceneSettings.paths ?? [];
  const targetOptions = useMemo<TargetOption[]>(
    () => [
      ...nodes.map((node) => ({
        label: `${node.name} (${startCase(node.kind)})`,
        value: node.id
      })),
      ...entities.map((entity) => ({
        label: `${entity.name} (${startCase(entity.type)})`,
        value: entity.id
      }))
    ],
    [entities, nodes]
  );
  const selectedTarget = selectedNode ?? selectedEntity;
  const hooks = (selectedNode?.hooks ?? selectedEntity?.hooks ?? []) as SceneHook[];

  const commitHooks = (nextHooks: SceneHook[]) => {
    const beforeHooks = structuredClone(hooks);

    if (selectedNode) {
      onUpdateNodeHooks(selectedNode.id, nextHooks, beforeHooks);
      return;
    }

    if (selectedEntity) {
      onUpdateEntityHooks(selectedEntity.id, nextHooks, beforeHooks);
    }
  };

  const updateHook = (hookId: string, updater: (hook: SceneHook) => SceneHook) => {
    commitHooks(
      hooks.map((hook) => (hook.id === hookId ? updater(structuredClone(hook)) : hook))
    );
  };

  if (!selectedTarget) {
    return (
      <EmptyState title="No Selection" />
    );
  }

  return (
    <div className="space-y-3 px-1 pb-1">
      <div className={cn(PANEL_SURFACE_CLASS, "px-3 py-3")}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{selectedTarget.name}</div>
            <div className="text-[11px] text-foreground/44">
              {"kind" in selectedTarget ? startCase(selectedTarget.kind) : startCase(selectedTarget.type)}
            </div>
          </div>
          <InfoPopover
            description="Hooks are declarative config only. Runtime systems own behavior."
            title="Hooks"
          />
        </div>
        <div className="mt-3 flex gap-2">
          <NativeSelect
            className="flex-1"
            onChange={(event) => setNextHookType(event.target.value)}
            value={nextHookType}
          >
            {groupHookDefinitions().map(([category, definitions]) => (
              <NativeSelectOptGroup key={category} label={category}>
                {definitions.map((definition) => (
                  <NativeSelectOption key={definition.type} value={definition.type}>
                    {definition.label}
                  </NativeSelectOption>
                ))}
              </NativeSelectOptGroup>
            ))}
          </NativeSelect>
          <Button
            className="shrink-0"
            onClick={() => {
              const nextHook = createSceneHook(nextHookType, {
                defaultPathId: scenePaths[0]?.id,
                targetId: selectedTarget.id
              });

              if (!nextHook) {
                return;
              }

              commitHooks([...hooks, nextHook]);
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Plus className="size-3.5" />
            Add
          </Button>
        </div>
      </div>

      {hooks.length === 0 ? (
        <EmptyState title="No Hooks" />
      ) : null}

      {hooks.map((hook) => {
        const definition = getHookDefinition(hook.type);

        return (
          <HookCard
            hook={hook}
            key={hook.id}
            onRemove={() => commitHooks(hooks.filter((entry) => entry.id !== hook.id))}
            onUpdate={(nextHook) => updateHook(hook.id, () => nextHook)}
          >
            {definition ? (
              <>
                <div className="space-y-3">
                  {definition.fields
                    .filter((field) => isHookFieldVisible(field, hook.config))
                    .map((field) => (
                      <HookFieldEditor
                        availableEvents={availableEvents}
                        field={field}
                        hook={hook}
                        key={`${hook.id}:${field.path}:${field.kind}`}
                        onChange={(value) =>
                          updateHook(hook.id, (currentHook) => ({
                            ...currentHook,
                            config: setGameplayValue(currentHook.config, field.path, value)
                          }))
                        }
                        scenePaths={scenePaths}
                        targetId={selectedTarget.id}
                        targetOptions={targetOptions}
                      />
                    ))}
                </div>
              </>
            ) : (
              <>
                <ScalarEditor
                  label="Stored Config"
                  onChange={(value) =>
                    updateHook(hook.id, (currentHook) => ({
                      ...currentHook,
                      config: isGameplayObject(value) ? value : currentHook.config
                    }))
                  }
                  value={hook.config}
                />
              </>
            )}
          </HookCard>
        );
      })}
    </div>
  );
}

export function EventsPanel({ onUpdateSceneSettings, sceneSettings }: EventsPanelProps) {
  const [draftEvent, setDraftEvent] = useState<SceneEventDefinition>(
    createGameplayEventDefinition({
      category: "Custom",
      description: "",
      name: ""
    })
  );
  const customEvents = sceneSettings.events ?? [];
  const duplicateName = draftEvent.name.trim().length > 0 &&
    resolveGameplayEvents(customEvents).some((eventDefinition) => eventDefinition.name === draftEvent.name.trim());

  const commitCustomEvents = (nextEvents: SceneEventDefinition[]) => {
    onUpdateSceneSettings(
      {
        ...sceneSettings,
        events: nextEvents
      },
      sceneSettings
    );
  };

  return (
    <div className="space-y-3 px-1 pb-1">
      <div className={cn(PANEL_SURFACE_CLASS, "px-3 py-3")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Input
              className="h-9 rounded-xl border-white/8 bg-black/10 text-xs"
              onChange={(event) => setDraftEvent((current) => ({ ...current, name: event.target.value }))}
              placeholder="event.name"
              value={draftEvent.name}
            />
          </div>
          <Popover>
            <PopoverTrigger render={<Button size="icon-xs" type="button" variant="ghost" />}>
              <SlidersHorizontal className="size-3.5" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 rounded-2xl border border-white/8 bg-[#10161d]/96 p-3">
              <div className="space-y-3">
                <TextInput
                  label="Category"
                  onChange={(value) => setDraftEvent((current) => ({ ...current, category: value }))}
                  placeholder="Custom"
                  value={draftEvent.category ?? ""}
                />
                <SelectInput
                  label="Scope"
                  onChange={(value) =>
                    setDraftEvent((current) => ({
                      ...current,
                      scope: value as SceneEventDefinition["scope"]
                    }))
                  }
                  options={EVENT_SCOPE_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
                  value={draftEvent.scope ?? "custom"}
                />
                <TextInput
                  label="Description"
                  multiline
                  onChange={(value) => setDraftEvent((current) => ({ ...current, description: value }))}
                  placeholder="Optional"
                  value={draftEvent.description ?? ""}
                />
              </div>
            </PopoverContent>
          </Popover>
          <Button
            disabled={draftEvent.name.trim().length === 0 || duplicateName}
            onClick={() => {
              const nextEvent = createGameplayEventDefinition({
                ...draftEvent,
                name: draftEvent.name.trim()
              });

              commitCustomEvents([...customEvents, nextEvent]);
              setDraftEvent(
                createGameplayEventDefinition({
                  category: "Custom",
                  description: "",
                  name: ""
                })
              );
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Plus className="size-3.5" />
            Add
          </Button>
        </div>
        {duplicateName ? <ValidationNote text="That event name already exists." /> : null}
      </div>

      {customEvents.length === 0 ? (
        <EmptyState title="No Custom Events" />
      ) : null}

      <PanelSection title="Custom">
        <div className="space-y-1.5">
          {customEvents.map((eventDefinition) => (
            <div className={cn(ROW_SURFACE_CLASS, "flex items-center gap-2 px-2.5 py-2")} key={eventDefinition.id}>
              <Input
                className="h-8 flex-1 rounded-lg border-white/8 bg-transparent text-xs"
                onChange={(event) =>
                  commitCustomEvents(
                    customEvents.map((entry) =>
                      entry.id === eventDefinition.id ? { ...entry, name: event.target.value } : entry
                    )
                  )
                }
                value={eventDefinition.name}
              />
              <Chip>{eventDefinition.category ?? "Custom"}</Chip>
              <Popover>
                <PopoverTrigger render={<Button size="icon-xs" type="button" variant="ghost" />}>
                  <SlidersHorizontal className="size-3.5" />
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 rounded-2xl border border-white/8 bg-[#10161d]/96 p-3">
                  <div className="space-y-3">
                    <TextInput
                      label="Category"
                      onChange={(value) =>
                        commitCustomEvents(
                          customEvents.map((entry) =>
                            entry.id === eventDefinition.id ? { ...entry, category: value } : entry
                          )
                        )
                      }
                      value={eventDefinition.category ?? ""}
                    />
                    <SelectInput
                      label="Scope"
                      onChange={(value) =>
                        commitCustomEvents(
                          customEvents.map((entry) =>
                            entry.id === eventDefinition.id
                              ? { ...entry, scope: value as SceneEventDefinition["scope"] }
                              : entry
                          )
                        )
                      }
                      options={EVENT_SCOPE_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
                      value={eventDefinition.scope ?? "custom"}
                    />
                    <TextInput
                      label="Description"
                      multiline
                      onChange={(value) =>
                        commitCustomEvents(
                          customEvents.map((entry) =>
                            entry.id === eventDefinition.id ? { ...entry, description: value } : entry
                          )
                        )
                      }
                      value={eventDefinition.description ?? ""}
                    />
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                onClick={() => commitCustomEvents(customEvents.filter((entry) => entry.id !== eventDefinition.id))}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Standard">
        <div className={cn(PANEL_SURFACE_CLASS, "space-y-1.5 p-2")}>
          {STANDARD_GAMEPLAY_EVENTS.map((eventDefinition) => (
            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/4" key={eventDefinition.id}>
              <div className="min-w-0 flex-1 truncate text-xs text-foreground/78">{eventDefinition.name}</div>
              <Chip>{eventDefinition.category}</Chip>
              <InfoPopover description={eventDefinition.description ?? ""} title={eventDefinition.name} />
            </div>
          ))}
        </div>
      </PanelSection>
    </div>
  );
}

export function PathsPanel({
  activeToolId,
  onSelectScenePath,
  onSetToolId,
  onUpdateSceneSettings,
  sceneSettings,
  selectedPathId
}: PathsPanelProps) {
  const paths = sceneSettings.paths ?? [];
  const selectedPath = paths.find((pathDefinition) => pathDefinition.id === selectedPathId) ?? paths[0];

  const commitPaths = (nextPaths: ScenePathDefinition[]) => {
    onUpdateSceneSettings(
      {
        ...sceneSettings,
        paths: nextPaths
      },
      sceneSettings
    );

    if (nextPaths.length === 0) {
      onSelectScenePath(undefined);
      return;
    }

    if (!selectedPathId || !nextPaths.some((pathDefinition) => pathDefinition.id === selectedPathId)) {
      onSelectScenePath(nextPaths[0]?.id);
    }
  };

  return (
    <div className="space-y-3 px-1 pb-1">
      <div className={cn(PANEL_SURFACE_CLASS, "px-3 py-3")}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">Paths</div>
            <div className="text-[11px] text-foreground/44">Scene-level waypoint routes for `path_mover` hooks.</div>
          </div>
          <InfoPopover
            description="Paths are authored once at the scene level, then referenced by path movers using a path id."
            title="Paths"
          />
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button
            className={cn(activeToolId === "path-add" && "bg-emerald-500/18 text-emerald-200")}
            onClick={() => onSetToolId("path-add")}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Plus className="size-3.5" />
            Add In Viewport
          </Button>
          <Button
            className={cn(activeToolId === "path-edit" && "bg-emerald-500/18 text-emerald-200")}
            disabled={!selectedPath}
            onClick={() => onSetToolId("path-edit")}
            size="sm"
            type="button"
            variant="ghost"
          >
            Edit Selected
          </Button>
          <Button
            disabled={!selectedPath}
            onClick={() => {
              if (!selectedPath) {
                return;
              }

              commitPaths(paths.filter((pathDefinition) => pathDefinition.id !== selectedPath.id));
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Trash2 className="size-3.5" />
            Delete Selected
          </Button>
        </div>
      </div>

      {paths.length === 0 ? <EmptyState title="No Paths" /> : null}

      {paths.length > 0 ? (
        <div className={cn(PANEL_SURFACE_CLASS, "space-y-2 p-2")}>
          <div className="px-1 text-[11px] text-foreground/48">
            Select a path here, then use the viewport tools to add or edit waypoints.
          </div>
          <div className="space-y-1.5">
            {paths.map((pathDefinition) => (
              <button
                className={cn(
                  "flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left transition hover:bg-white/4",
                  selectedPath?.id === pathDefinition.id && "bg-emerald-500/12 text-emerald-200"
                )}
                key={pathDefinition.id}
                onClick={() => onSelectScenePath(pathDefinition.id)}
                type="button"
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium">{pathDefinition.name}</div>
                  <div className="truncate text-[10px] text-foreground/42">
                    {pathDefinition.id}
                    {pathDefinition.loop ? " · loop" : ""}
                  </div>
                </div>
                <Chip>{pathDefinition.points.length} pts</Chip>
              </button>
            ))}
          </div>
          <div className={cn(ROW_SURFACE_CLASS, "space-y-1 px-3 py-2 text-[11px] text-foreground/48")}>
            <div>`Add Path`: click in the viewport to start a new route and keep clicking to place waypoints.</div>
            <div>`Edit Path`: drag points, click a segment to insert a point, press Delete to remove the selected point.</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HookCard({
  children,
  hook,
  onRemove,
  onUpdate
}: {
  children: ReactNode;
  hook: SceneHook;
  onRemove: () => void;
  onUpdate: (hook: SceneHook) => void;
}) {
  const definition = getHookDefinition(hook.type);

  return (
    <div className={cn(PANEL_SURFACE_CLASS, "px-3 py-3")}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-sm font-medium text-foreground">{definition?.label ?? hook.type}</div>
          <Chip>{definition?.category ?? "Custom"}</Chip>
          {definition ? (
            <InfoPopover
              description={definition.description}
              details={[
                definition.emits.length > 0 ? `Emits: ${definition.emits.join(", ")}` : "Emits: none",
                definition.listens.length > 0 ? `Listens: ${definition.listens.join(", ")}` : "Listens: none"
              ]}
              title={definition.label}
            />
          ) : (
            <InfoPopover description="This hook is preserved, but the editor does not have a schema for it yet." title={hook.type} />
          )}
        </div>
        <div className="flex items-center gap-1">
          <CompactSwitch
            checked={hook.enabled !== false}
            label={hook.enabled === false ? "Off" : "On"}
            onCheckedChange={(checked) =>
              onUpdate({
                ...hook,
                enabled: checked
              })
            }
          />
          <Button onClick={onRemove} size="icon-xs" type="button" variant="ghost">
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      <PresetSelector hook={hook} onUpdate={onUpdate} />
      <div className="mt-3 grid gap-2">
        {children}
      </div>
    </div>
  );
}

function PresetSelector({ hook, onUpdate }: { hook: SceneHook; onUpdate: (hook: SceneHook) => void }) {
  const presets = getPresetsForHookType(hook.type);

  if (presets.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="text-[11px] text-foreground/50">Preset</span>
      <div className="flex flex-wrap gap-1">
        {presets.map((preset) => (
          <button
            className="rounded-md border border-foreground/10 bg-foreground/[0.04] px-2 py-0.5 text-[11px] text-foreground/70 transition hover:bg-foreground/[0.08] hover:text-foreground"
            key={preset.label}
            onClick={() => {
              onUpdate({
                ...hook,
                config: structuredClone(preset.config)
              });
            }}
            type="button"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function HookFieldEditor({
  availableEvents,
  field,
  hook,
  onChange,
  scenePaths,
  targetId,
  targetOptions
}: {
  availableEvents: SceneEventDefinition[];
  field: HookFieldDefinition;
  hook: SceneHook;
  onChange: (value: GameplayValue) => void;
  scenePaths: ScenePathDefinition[];
  targetId: string;
  targetOptions: TargetOption[];
}) {
  const value = getGameplayValue(hook.config, field.path);

  switch (field.kind) {
    case "boolean":
      return (
        <BooleanInput
          label={field.label}
          onChange={(checked) => onChange(checked)}
          value={value === true}
        />
      );
    case "enum":
      return (
        <SelectInput
          label={field.label}
          onChange={onChange}
          options={field.options}
          value={typeof value === "string" ? value : field.options[0]?.value ?? ""}
        />
      );
    case "event-conditions":
      return (
        <EventConditionListEditor
          events={availableEvents}
          label={field.label}
          onChange={onChange}
          targetId={targetId}
          targetOptions={targetOptions}
          value={toObjectArray(value)}
        />
      );
    case "event-list":
      return (
        <StringListEditor
          label={field.label}
          onChange={onChange}
          options={availableEvents.map((eventDefinition) => ({
            label: eventDefinition.name,
            value: eventDefinition.name
          }))}
          value={toStringArray(value)}
        />
      );
    case "event-map":
      return (
        <EventMapEditor
          events={availableEvents}
          label={field.label}
          onChange={onChange}
          value={toEventMap(value)}
          valueLabel={field.valueLabel}
          valuePlaceholder={field.valuePlaceholder}
        />
      );
    case "grants":
      return <GrantListEditor label={field.label} onChange={onChange} value={toObjectArray(value)} />;
    case "key-value":
      return <KeyValueEditor label={field.label} onChange={onChange} value={toGameplayObject(value)} valueType={field.valueType} />;
    case "number":
      return (
        <NumberInput
          label={field.label}
          min={field.min}
          onChange={(nextValue) => onChange(nextValue)}
          step={field.step}
          value={typeof value === "number" ? value : 0}
        />
      );
    case "scalar":
      return <ScalarEditor label={field.label} onChange={onChange} value={value ?? ""} />;
    case "scene-path":
      return (
        <SelectInput
          label={field.label}
          onChange={onChange}
          options={scenePaths.map((pathDefinition) => ({
            label: `${pathDefinition.name} (${pathDefinition.id})`,
            value: pathDefinition.id
          }))}
          placeholder="Select path"
          value={typeof value === "string" ? value : ""}
        />
      );
    case "sequence-actions":
      return (
        <SequenceActionsEditor
          events={availableEvents}
          label={field.label}
          onChange={onChange}
          targetId={targetId}
          targetOptions={targetOptions}
          value={toObjectArray(value)}
        />
      );
    case "sequence-trigger":
      return (
        <SequenceTriggerEditor
          events={availableEvents}
          label={field.label}
          onChange={onChange}
          targetId={targetId}
          targetOptions={targetOptions}
          value={toGameplayObject(value)}
        />
      );
    case "string-list":
      return <StringListEditor label={field.label} onChange={onChange} value={toStringArray(value)} />;
    case "target-states":
      return <TargetStatesEditor label={field.label} onChange={onChange} value={toGameplayObject(value)} />;
    case "text":
      return (
        <TextInput
          label={field.label}
          multiline={field.multiline}
          onChange={(nextValue) => onChange(nextValue)}
          placeholder={field.placeholder}
          value={typeof value === "string" ? value : ""}
        />
      );
    case "vec3":
      return (
        <Vec3Editor
          label={field.label}
          onChange={onChange}
          step={field.step}
          value={toVec3Tuple(value, [0, 0, 0])}
        />
      );
  }
}

function EventConditionListEditor({
  events,
  label,
  onChange,
  targetId,
  targetOptions,
  value
}: {
  events: SceneEventDefinition[];
  label: string;
  onChange: (value: GameplayValue) => void;
  targetId: string;
  targetOptions: TargetOption[];
  value: GameplayObject[];
}) {
  const updateEntry = (index: number, nextEntry: GameplayObject) => {
    onChange(value.map((entry, entryIndex) => (entryIndex === index ? nextEntry : entry)));
  };

  return (
    <FieldGroup label={label}>
      <div className="space-y-1.5">
        {value.map((entry, index) => (
          <div className={cn(ROW_SURFACE_CLASS, "space-y-2 p-2")} key={`${label}:${index}`}>
            <SelectInput
              label="Source"
              onChange={(nextValue) => updateEntry(index, { ...entry, fromEntity: nextValue })}
              options={targetOptions}
              placeholder="Select source"
              value={typeof entry.fromEntity === "string" ? entry.fromEntity : ""}
            />
            <SelectInput
              label="Event"
              onChange={(nextValue) => updateEntry(index, { ...entry, event: nextValue })}
              options={events.map((eventDefinition) => ({
                label: eventDefinition.name,
                value: eventDefinition.name
              }))}
              value={typeof entry.event === "string" ? entry.event : "trigger.enter"}
            />
            <div className="flex justify-end">
              <Button
                onClick={() => onChange(value.filter((_, entryIndex) => entryIndex !== index))}
                size="xs"
                type="button"
                variant="ghost"
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
        <Button onClick={() => onChange([...value, createEmptyEventCondition(targetId)])} size="xs" type="button" variant="ghost">
          Add Condition
        </Button>
      </div>
    </FieldGroup>
  );
}

function EventMapEditor({
  events,
  label,
  onChange,
  value,
  valueLabel,
  valuePlaceholder
}: {
  events: SceneEventDefinition[];
  label: string;
  onChange: (value: GameplayValue) => void;
  value: Record<string, string>;
  valueLabel: string;
  valuePlaceholder?: string;
}) {
  const entries = Object.entries(value);

  const commitEntries = (nextEntries: Array<[string, string]>) => {
    onChange(
      Object.fromEntries(
        nextEntries.filter(([eventName, mappedValue]) => eventName.length > 0 && mappedValue.length > 0)
      )
    );
  };

  return (
    <FieldGroup label={label}>
      <div className="space-y-1.5">
        {entries.map(([eventName, mappedValue], index) => (
          <div className={cn(ROW_SURFACE_CLASS, "grid gap-2 p-2 md:grid-cols-[1fr_1fr_auto]")} key={`${eventName}:${index}`}>
            <SelectInput
              label="Event"
              onChange={(nextValue) =>
                commitEntries(
                  entries.map((entry, entryIndex) => (entryIndex === index ? [nextValue, entry[1]] : entry))
                )
              }
              options={events.map((eventDefinition) => ({
                label: eventDefinition.name,
                value: eventDefinition.name
              }))}
              value={eventName}
            />
            <TextInput
              label={valueLabel}
              onChange={(nextValue) =>
                commitEntries(
                  entries.map((entry, entryIndex) => (entryIndex === index ? [entry[0], nextValue] : entry))
                )
              }
              placeholder={valuePlaceholder}
              value={mappedValue}
            />
            <div className="flex items-end justify-end">
              <Button
                onClick={() => commitEntries(entries.filter((_, entryIndex) => entryIndex !== index))}
                size="xs"
                type="button"
                variant="ghost"
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
        <Button
          onClick={() => commitEntries([...entries, [events[0]?.name ?? "", ""]])}
          size="xs"
          type="button"
          variant="ghost"
        >
          Add Mapping
        </Button>
      </div>
    </FieldGroup>
  );
}

function GrantListEditor({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: GameplayValue) => void;
  value: GameplayObject[];
}) {
  const updateEntry = (index: number, nextEntry: GameplayObject) => {
    onChange(value.map((entry, entryIndex) => (entryIndex === index ? nextEntry : entry)));
  };

  return (
    <FieldGroup label={label}>
      <div className="space-y-1.5">
        {value.map((entry, index) => {
          const kind = typeof entry.kind === "string" ? entry.kind : "key";

          return (
            <div className={cn(ROW_SURFACE_CLASS, "space-y-2 p-2")} key={`${kind}:${index}`}>
              <SelectInput
                label="Grant Type"
                onChange={(nextValue) => updateEntry(index, normalizeGrant({ kind: nextValue }))}
                options={[
                  { label: "Key", value: "key" },
                  { label: "Item", value: "item" },
                  { label: "Health", value: "health" },
                  { label: "Ammo", value: "ammo" },
                  { label: "Flag", value: "flag" }
                ]}
                value={kind}
              />
              {kind === "key" ? (
                <TextInput
                  label="Key Id"
                  onChange={(nextValue) => updateEntry(index, { ...entry, id: nextValue, kind })}
                  value={typeof entry.id === "string" ? entry.id : ""}
                />
              ) : null}
              {kind === "item" ? (
                <>
                  <TextInput
                    label="Item Id"
                    onChange={(nextValue) => updateEntry(index, { ...entry, id: nextValue, kind })}
                    value={typeof entry.id === "string" ? entry.id : ""}
                  />
                  <NumberInput
                    label="Count"
                    onChange={(nextValue) => updateEntry(index, { ...entry, count: nextValue, kind })}
                    step={1}
                    value={typeof entry.count === "number" ? entry.count : 1}
                  />
                </>
              ) : null}
              {kind === "health" ? (
                <NumberInput
                  label="Amount"
                  onChange={(nextValue) => updateEntry(index, { ...entry, amount: nextValue, kind })}
                  step={1}
                  value={typeof entry.amount === "number" ? entry.amount : 10}
                />
              ) : null}
              {kind === "ammo" ? (
                <>
                  <TextInput
                    label="Ammo Type"
                    onChange={(nextValue) => updateEntry(index, { ...entry, ammoType: nextValue, kind })}
                    value={typeof entry.ammoType === "string" ? entry.ammoType : ""}
                  />
                  <NumberInput
                    label="Amount"
                    onChange={(nextValue) => updateEntry(index, { ...entry, amount: nextValue, kind })}
                    step={1}
                    value={typeof entry.amount === "number" ? entry.amount : 10}
                  />
                </>
              ) : null}
              {kind === "flag" ? (
                <>
                  <TextInput
                    label="Flag"
                    onChange={(nextValue) => updateEntry(index, { ...entry, flag: nextValue, kind })}
                    value={typeof entry.flag === "string" ? entry.flag : ""}
                  />
                  <ScalarEditor
                    label="Value"
                    onChange={(nextValue) => updateEntry(index, { ...entry, kind, value: nextValue })}
                    value={entry.value ?? true}
                  />
                </>
              ) : null}
              <div className="flex justify-end">
                <Button
                  onClick={() => onChange(value.filter((_, entryIndex) => entryIndex !== index))}
                  size="xs"
                  type="button"
                  variant="ghost"
                >
                  Remove
                </Button>
              </div>
            </div>
          );
        })}
        <Button onClick={() => onChange([...value, createEmptyGrant()])} size="xs" type="button" variant="ghost">
          Add Grant
        </Button>
      </div>
    </FieldGroup>
  );
}

function KeyValueEditor({
  label,
  onChange,
  value,
  valueType
}: {
  label: string;
  onChange: (value: GameplayValue) => void;
  value: GameplayObject;
  valueType: "number" | "string";
}) {
  const entries = Object.entries(value);

  const commitEntries = (nextEntries: Array<[string, GameplayValue]>) => {
    onChange(Object.fromEntries(nextEntries.filter(([key]) => key.length > 0)));
  };

  return (
    <FieldGroup label={label}>
      <div className="space-y-1.5">
        {entries.map(([key, entryValue], index) => (
          <div className={cn(ROW_SURFACE_CLASS, "grid gap-2 p-2 md:grid-cols-[1fr_1fr_auto]")} key={`${key}:${index}`}>
            <TextInput
              label="Key"
              onChange={(nextValue) =>
                commitEntries(entries.map((entry, entryIndex) => (entryIndex === index ? [nextValue, entry[1]] : entry)))
              }
              value={key}
            />
            {valueType === "number" ? (
              <NumberInput
                label="Value"
                onChange={(nextValue) =>
                  commitEntries(entries.map((entry, entryIndex) => (entryIndex === index ? [entry[0], nextValue] : entry)))
                }
                step={0.1}
                value={typeof entryValue === "number" ? entryValue : 1}
              />
            ) : (
              <TextInput
                label="Value"
                onChange={(nextValue) =>
                  commitEntries(entries.map((entry, entryIndex) => (entryIndex === index ? [entry[0], nextValue] : entry)))
                }
                value={typeof entryValue === "string" ? entryValue : ""}
              />
            )}
            <div className="flex items-end justify-end">
              <Button
                onClick={() => commitEntries(entries.filter((_, entryIndex) => entryIndex !== index))}
                size="xs"
                type="button"
                variant="ghost"
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
        <Button
          onClick={() => commitEntries([...entries, ["", valueType === "number" ? 1 : ""]])}
          size="xs"
          type="button"
          variant="ghost"
        >
          Add Entry
        </Button>
      </div>
    </FieldGroup>
  );
}

function SequenceActionsEditor({
  events,
  label,
  onChange,
  targetId,
  targetOptions,
  value
}: {
  events: SceneEventDefinition[];
  label: string;
  onChange: (value: GameplayValue) => void;
  targetId: string;
  targetOptions: TargetOption[];
  value: GameplayObject[];
}) {
  const updateEntry = (index: number, nextEntry: GameplayObject) => {
    onChange(value.map((entry, entryIndex) => (entryIndex === index ? nextEntry : entry)));
  };

  return (
    <FieldGroup label={label}>
      <div className="space-y-1.5">
        {value.map((entry, index) => {
          const type = typeof entry.type === "string" ? entry.type : "emit";

          return (
            <div className={cn(ROW_SURFACE_CLASS, "space-y-2 p-2")} key={`${type}:${index}`}>
              <SelectInput
                label="Action Type"
                onChange={(nextValue) => updateEntry(index, normalizeSequenceAction({ type: nextValue }))}
                options={[
                  { label: "Emit", value: "emit" },
                  { label: "Wait", value: "wait" },
                  { label: "Set Flag", value: "set_flag" },
                  { label: "Enable", value: "enable" },
                  { label: "Disable", value: "disable" },
                  { label: "Spawn", value: "spawn" },
                  { label: "Destroy", value: "destroy" }
                ]}
                value={type}
              />
              {type === "emit" ? (
                <>
                  <SelectInput
                    label="Target"
                    onChange={(nextValue) => updateEntry(index, { ...entry, target: nextValue, type })}
                    options={targetOptions}
                    placeholder="Select target"
                    value={typeof entry.target === "string" ? entry.target : ""}
                  />
                  <SelectInput
                    label="Event"
                    onChange={(nextValue) => updateEntry(index, { ...entry, event: nextValue, type })}
                    options={events.map((eventDefinition) => ({
                      label: eventDefinition.name,
                      value: eventDefinition.name
                    }))}
                    value={typeof entry.event === "string" ? entry.event : "open.requested"}
                  />
                  <ScalarEditor
                    label="Payload"
                    onChange={(nextValue) => updateEntry(index, { ...entry, payload: nextValue, type })}
                    value={entry.payload ?? null}
                  />
                </>
              ) : null}
              {type === "wait" ? (
                <NumberInput
                  label="Seconds"
                  onChange={(nextValue) => updateEntry(index, { seconds: nextValue, type })}
                  step={0.1}
                  value={typeof entry.seconds === "number" ? entry.seconds : 0.5}
                />
              ) : null}
              {type === "set_flag" ? (
                <>
                  <TextInput
                    label="Flag"
                    onChange={(nextValue) => updateEntry(index, { ...entry, flag: nextValue, type })}
                    value={typeof entry.flag === "string" ? entry.flag : ""}
                  />
                  <ScalarEditor
                    label="Value"
                    onChange={(nextValue) => updateEntry(index, { ...entry, type, value: nextValue })}
                    value={entry.value ?? true}
                  />
                </>
              ) : null}
              {type === "enable" || type === "disable" || type === "spawn" || type === "destroy" ? (
                <SelectInput
                  label="Target"
                  onChange={(nextValue) => updateEntry(index, { ...entry, target: nextValue, type })}
                  options={targetOptions}
                  placeholder="Select target"
                  value={typeof entry.target === "string" ? entry.target : ""}
                />
              ) : null}
              <div className="flex justify-end">
                <Button
                  onClick={() => onChange(value.filter((_, entryIndex) => entryIndex !== index))}
                  size="xs"
                  type="button"
                  variant="ghost"
                >
                  Remove
                </Button>
              </div>
            </div>
          );
        })}
        <Button
          onClick={() => onChange([...value, createEmptySequenceAction(targetId)])}
          size="xs"
          type="button"
          variant="ghost"
        >
          Add Action
        </Button>
      </div>
    </FieldGroup>
  );
}

function SequenceTriggerEditor({
  events,
  label,
  onChange,
  targetId,
  targetOptions,
  value
}: {
  events: SceneEventDefinition[];
  label: string;
  onChange: (value: GameplayValue) => void;
  targetId: string;
  targetOptions: TargetOption[];
  value: GameplayObject;
}) {
  const resolvedValue: GameplayObject = {
    ...value,
    fromEntity: typeof value.fromEntity === "string" && value.fromEntity.length > 0 ? value.fromEntity : targetId
  };

  return (
    <FieldGroup label={label}>
      <div className={cn(ROW_SURFACE_CLASS, "space-y-2 p-2")}>
        <SelectInput
          label="From Entity"
          onChange={(nextValue) => onChange({ ...resolvedValue, fromEntity: nextValue })}
          options={targetOptions}
          placeholder="Select source"
          value={typeof resolvedValue.fromEntity === "string" ? resolvedValue.fromEntity : ""}
        />
        <SelectInput
          label="Event"
          onChange={(nextValue) => onChange({ ...resolvedValue, event: nextValue })}
          options={events.map((eventDefinition) => ({
            label: eventDefinition.name,
            value: eventDefinition.name
          }))}
          placeholder="Select event"
          value={typeof resolvedValue.event === "string" ? resolvedValue.event : "trigger.enter"}
        />
        <BooleanInput
          label="Once"
          onChange={(checked) => onChange({ ...resolvedValue, once: checked })}
          value={resolvedValue.once === true}
        />
      </div>
    </FieldGroup>
  );
}

function StringListEditor({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange: (value: GameplayValue) => void;
  options?: Array<{ label: string; value: string }>;
  value: string[];
}) {
  const addValue = options?.[0]?.value ?? "";

  return (
    <FieldGroup label={label}>
      <div className="space-y-2">
        {value.map((entry, index) => (
          <div className="flex items-center gap-2" key={`${entry}:${index}`}>
            {options ? (
              <SelectInput
                label="Value"
                onChange={(nextValue) => onChange(value.map((currentValue, valueIndex) => (valueIndex === index ? nextValue : currentValue)))}
                options={options}
                value={entry}
              />
            ) : (
              <TextInput
                label="Value"
                onChange={(nextValue) => onChange(value.map((currentValue, valueIndex) => (valueIndex === index ? nextValue : currentValue)))}
                value={entry}
              />
            )}
            <Button
              className="shrink-0"
              onClick={() => onChange(value.filter((_, valueIndex) => valueIndex !== index))}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <div className="flex justify-start">
          <Button onClick={() => onChange([...value, addValue])} size="xs" type="button" variant="ghost">
            <Plus className="size-3.5" />
            Add Entry
          </Button>
        </div>
      </div>
    </FieldGroup>
  );
}

function TargetStatesEditor({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: GameplayValue) => void;
  value: GameplayObject;
}) {
  const entries = Object.entries(value);

  const commitEntries = (nextEntries: Array<[string, GameplayObject]>) => {
    onChange(Object.fromEntries(nextEntries.filter(([state]) => state.length > 0)));
  };

  return (
    <FieldGroup label={label}>
      <div className="space-y-1.5">
        {entries.map(([stateName, stateValue], index) => {
          const stateObject = toGameplayObject(stateValue);
          const position = toVec3Tuple(stateObject.position, [0, 0, 0]);
          const rotation = toVec3Tuple(stateObject.rotation, [0, 0, 0]);
          const scale = toVec3Tuple(stateObject.scale, [1, 1, 1]);

          return (
            <div className={cn(ROW_SURFACE_CLASS, "space-y-2 p-2")} key={`${stateName}:${index}`}>
              <TextInput
                label="State Name"
                onChange={(nextValue) =>
                  commitEntries(
                    entries.map((entry, entryIndex) =>
                      entryIndex === index ? [nextValue, toGameplayObject(entry[1])] : [entry[0], toGameplayObject(entry[1])]
                    )
                  )
                }
                value={stateName}
              />
              <Vec3Editor
                label="Position"
                onChange={(nextValue) =>
                  commitEntries(
                    entries.map((entry, entryIndex) =>
                      entryIndex === index
                        ? [entry[0], { ...toGameplayObject(entry[1]), position: nextValue }]
                        : [entry[0], toGameplayObject(entry[1])]
                    )
                  )
                }
                value={position}
              />
              <Vec3Editor
                label="Rotation"
                onChange={(nextValue) =>
                  commitEntries(
                    entries.map((entry, entryIndex) =>
                      entryIndex === index
                        ? [entry[0], { ...toGameplayObject(entry[1]), rotation: nextValue }]
                        : [entry[0], toGameplayObject(entry[1])]
                    )
                  )
                }
                value={rotation}
              />
              <Vec3Editor
                label="Scale"
                onChange={(nextValue) =>
                  commitEntries(
                    entries.map((entry, entryIndex) =>
                      entryIndex === index
                        ? [entry[0], { ...toGameplayObject(entry[1]), scale: nextValue }]
                        : [entry[0], toGameplayObject(entry[1])]
                    )
                  )
                }
                value={scale}
              />
              <div className="flex justify-end">
                <Button
                  onClick={() =>
                    commitEntries(
                      entries
                        .filter((_, entryIndex) => entryIndex !== index)
                        .map((entry) => [entry[0], toGameplayObject(entry[1])])
                    )
                  }
                  size="xs"
                  type="button"
                  variant="ghost"
                >
                  Remove
                </Button>
              </div>
            </div>
          );
        })}
        <Button
          onClick={() =>
            commitEntries([
              ...entries.map((entry) => [entry[0], toGameplayObject(entry[1])] as [string, GameplayObject]),
              [
                `state_${entries.length + 1}`,
                {
                  position: [0, 0, 0],
                  rotation: [0, 0, 0],
                  scale: [1, 1, 1]
                }
              ]
            ])
          }
          size="xs"
          type="button"
          variant="ghost"
        >
          Add State
        </Button>
      </div>
    </FieldGroup>
  );
}

function Vec3Editor({
  label,
  onChange,
  step = 0.1,
  value
}: {
  label: string;
  onChange: (value: GameplayValue) => void;
  step?: number;
  value: [number, number, number];
}) {
  return (
    <FieldGroup label={label}>
      <div className="grid grid-cols-3 gap-1.5">
        {(["X", "Y", "Z"] as const).map((axis, index) => (
          <DragInput
            className="min-w-0"
            compact
            key={`${label}:${axis}`}
            label={axis}
            onChange={(nextValue) => {
              const nextTuple = [...value] as [number, number, number];
              nextTuple[index] = nextValue;
              onChange(nextTuple);
            }}
            onValueCommit={() => undefined}
            precision={2}
            step={step}
            value={value[index]}
          />
        ))}
      </div>
    </FieldGroup>
  );
}

function BooleanInput({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: boolean) => void;
  value: boolean;
}) {
  return (
    <div className={cn(ROW_SURFACE_CLASS, "flex items-center justify-between gap-3 px-3 py-2")}>
      <span className="text-xs text-foreground/72">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium tracking-[0.16em] text-foreground/36 uppercase">
          {value ? "On" : "Off"}
        </span>
        <Switch checked={value} onCheckedChange={onChange} />
      </div>
    </div>
  );
}

function NumberInput({
  label,
  min,
  onChange,
  step = 0.1,
  value
}: {
  label: string;
  min?: number;
  onChange: (value: number) => void;
  step?: number;
  value: number;
}) {
  return (
    <DragInput
      className="w-full"
      compact
      label={label}
      min={min}
      onChange={onChange}
      onValueCommit={() => undefined}
      precision={2}
      step={step}
      value={value}
    />
  );
}

function ScalarEditor({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: GameplayValue) => void;
  value: GameplayValue;
}) {
  return (
    <TextInput
      label={label}
      onChange={(nextValue) => onChange(parseGameplayValue(nextValue))}
      value={formatGameplayValue(value)}
    />
  );
}

function SelectInput({
  label,
  onChange,
  options,
  placeholder,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  placeholder?: string;
  value: string;
}) {
  const resolvedOptions = value.length > 0 && !options.some((option) => option.value === value)
    ? [{ label: value, value }, ...options]
    : options;

  return (
    <FieldGroup label={label}>
      <NativeSelect className="w-full [&_select]:rounded-xl [&_select]:border-white/8 [&_select]:bg-black/10 [&_select]:text-xs" onChange={(event) => onChange(event.target.value)} value={value}>
        {placeholder ? <NativeSelectOption value="">{placeholder}</NativeSelectOption> : null}
        {resolvedOptions.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </FieldGroup>
  );
}

function TextInput({
  label,
  multiline = false,
  onChange,
  placeholder,
  value
}: {
  label: string;
  multiline?: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <FieldGroup label={label}>
      {multiline ? (
        <Textarea
          className="min-h-20 rounded-xl border-white/8 bg-black/10 text-xs"
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
      ) : (
        <Input
          className="h-9 rounded-xl border-white/8 bg-black/10 text-xs"
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
      )}
    </FieldGroup>
  );
}

function FieldGroup({
  children,
  label
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="space-y-1">
      <div className="px-1 text-[10px] font-medium text-foreground/44">{label}</div>
      {children}
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-full border border-white/8 bg-white/4 px-2 py-1 text-[10px] font-medium text-foreground/52">
      {children}
    </div>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/3 px-4 py-5">
      <div className="text-sm font-medium text-foreground">{title}</div>
    </div>
  );
}

function PanelSection({
  children,
  title
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="space-y-2">
      <div className="px-1 text-[10px] font-medium tracking-[0.18em] text-foreground/42 uppercase">{title}</div>
      {children}
    </div>
  );
}

function ValidationNote({ text }: { text: string }) {
  return <div className="mt-2 text-xs text-amber-200/80">{text}</div>;
}

function CompactSwitch({
  checked,
  label,
  onCheckedChange
}: {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/8 bg-black/10 px-2 py-1">
      <span className="text-[10px] font-medium text-foreground/44">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function InfoPopover({
  description,
  details,
  title
}: {
  description: string;
  details?: string[];
  title: string;
}) {
  return (
    <Popover>
      <PopoverTrigger render={<Button size="icon-xs" type="button" variant="ghost" />}>
        <CircleHelp className="size-3.5 text-foreground/42" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 rounded-2xl border border-white/8 bg-[#10161d]/96 p-3">
        <PopoverHeader>
          <PopoverTitle className="text-sm text-foreground">{title}</PopoverTitle>
          <PopoverDescription className="text-xs leading-5 text-foreground/62">{description}</PopoverDescription>
        </PopoverHeader>
        {details && details.length > 0 ? (
          <div className="space-y-1">
            {details.map((detail) => (
              <div className="text-xs text-foreground/56" key={detail}>
                {detail}
              </div>
            ))}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function groupHookDefinitions() {
  const grouped = new Map<string, typeof HOOK_DEFINITIONS>();

  HOOK_DEFINITIONS.forEach((definition) => {
    const currentGroup = grouped.get(definition.category) ?? [];
    currentGroup.push(definition);
    grouped.set(definition.category, currentGroup);
  });

  return Array.from(grouped.entries());
}

function normalizeGrant(value: Partial<GameplayObject>): GameplayObject {
  switch (value.kind) {
    case "item":
      return {
        count: 1,
        id: "",
        kind: "item"
      };
    case "health":
      return {
        amount: 10,
        kind: "health"
      };
    case "ammo":
      return {
        ammoType: "",
        amount: 10,
        kind: "ammo"
      };
    case "flag":
      return {
        flag: "",
        kind: "flag",
        value: true
      };
    case "key":
    default:
      return {
        id: "",
        kind: "key"
      };
  }
}

function normalizeSequenceAction(value: Partial<GameplayObject>): GameplayObject {
  switch (value.type) {
    case "wait":
      return {
        seconds: 0.5,
        type: "wait"
      };
    case "set_flag":
      return {
        flag: "",
        type: "set_flag",
        value: true
      };
    case "enable":
    case "disable":
    case "spawn":
    case "destroy":
      return {
        target: "",
        type: value.type
      };
    case "emit":
    default:
      return {
        event: "open.requested",
        payload: null,
        target: "",
        type: "emit"
      };
  }
}

function startCase(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}
