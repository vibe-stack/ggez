import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo, useMemo } from "react";
import type { LogicGraphHook } from "./types";
import { getCategoryColor } from "./logic-theme";

export type LogicNodeData = {
  label: string;
  kind: string;
  hooks: LogicGraphHook[];
};

const HEADER_HEIGHT = 38;
const HOOK_HEADER_HEIGHT = 26;
const PORT_ROW_HEIGHT = 24;
const NODE_BOTTOM_PAD = 8;

type PortRow = {
  inputId?: string;
  inputEvent?: string;
  outputId?: string;
  outputEvent?: string;
  category: string;
};

type HookSection = {
  hook: LogicGraphHook;
  portRows: PortRow[];
};

function buildSections(hooks: LogicGraphHook[]): HookSection[] {
  return hooks.map((hook) => {
    const inputs: Array<{ id: string; event: string }> = [];
    const outputs: Array<{ id: string; event: string }> = [];

    const seenIn = new Set<string>();
    const seenOut = new Set<string>();

    for (const event of hook.listens) {
      const id = `${hook.hookId}:listen:${event}`;
      if (!seenIn.has(id)) { seenIn.add(id); inputs.push({ id, event }); }
    }
    for (const dl of hook.dynamicListens) {
      const id = `${hook.hookId}:listen:${dl.event}`;
      if (!seenIn.has(id)) { seenIn.add(id); inputs.push({ id, event: dl.event }); }
    }

    for (const event of hook.emits) {
      const id = `${hook.hookId}:emit:${event}`;
      if (!seenOut.has(id)) { seenOut.add(id); outputs.push({ id, event }); }
    }
    for (const de of hook.dynamicEmits) {
      const id = `${hook.hookId}:emit:${de.event}`;
      if (!seenOut.has(id)) { seenOut.add(id); outputs.push({ id, event: de.event }); }
    }

    const rowCount = Math.max(inputs.length, outputs.length, 1);
    const portRows: PortRow[] = [];

    for (let i = 0; i < rowCount; i++) {
      portRows.push({
        inputId: inputs[i]?.id,
        inputEvent: inputs[i]?.event,
        outputId: outputs[i]?.id,
        outputEvent: outputs[i]?.event,
        category: hook.category
      });
    }

    return { hook, portRows };
  });
}

export function computeNodeHeight(hooks: LogicGraphHook[]): number {
  const sections = buildSections(hooks);
  let h = HEADER_HEIGHT;
  for (const section of sections) {
    h += HOOK_HEADER_HEIGHT + section.portRows.length * PORT_ROW_HEIGHT;
  }
  return h + NODE_BOTTOM_PAD;
}

function LogicNodeComponent({ data, selected }: NodeProps & { data: LogicNodeData }) {
  const { label, kind, hooks } = data;

  const sections = useMemo(() => buildSections(hooks), [hooks]);

  const allHandles: Array<{
    id: string;
    type: "source" | "target";
    y: number;
    category: string;
  }> = [];

  let y = HEADER_HEIGHT;
  for (const section of sections) {
    y += HOOK_HEADER_HEIGHT;
    for (const row of section.portRows) {
      const rowCenter = y + PORT_ROW_HEIGHT / 2;
      if (row.inputId) {
        allHandles.push({ id: row.inputId, type: "target", y: rowCenter, category: row.category });
      }
      if (row.outputId) {
        allHandles.push({ id: row.outputId, type: "source", y: rowCenter, category: row.category });
      }
      y += PORT_ROW_HEIGHT;
    }
  }

  const nodeHeight = computeNodeHeight(hooks);

  return (
    <div
      className="rounded-2xl border bg-[#0a1410]/80 shadow-[0_12px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl transition-[border-color,box-shadow] duration-150 cursor-pointer"
      style={{
        width: 300,
        minHeight: nodeHeight,
        borderColor: selected ? "rgba(16,185,129,0.5)" : "rgba(255,255,255,0.06)",
        boxShadow: selected
          ? "0 0 0 1px rgba(16,185,129,0.25), 0 12px 48px rgba(0,0,0,0.55), 0 0 24px rgba(16,185,129,0.08)"
          : "0 12px 48px rgba(0,0,0,0.55)"
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between gap-2 rounded-t-2xl px-3.5"
        style={{
          height: HEADER_HEIGHT,
          background: "linear-gradient(135deg, rgba(16,185,129,0.10) 0%, rgba(16,185,129,0.03) 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.05)"
        }}
      >
        <span className="truncate text-[11px] font-semibold tracking-wide text-foreground/90">{label}</span>
        <span className="shrink-0 rounded-[5px] bg-white/[0.07] px-1.5 py-[2px] text-[8px] font-bold tracking-widest text-foreground/40 uppercase">
          {kind}
        </span>
      </div>

      {/* Hook sections */}
      {sections.map((section) => {
        const color = getCategoryColor(section.hook.category);
        return (
          <div key={section.hook.hookId} style={{ opacity: section.hook.enabled ? 1 : 0.35 }}>
            {/* Hook section header */}
            <div
              className="flex items-center gap-2 px-3.5"
              style={{
                height: HOOK_HEADER_HEIGHT,
                borderBottom: "1px solid rgba(255,255,255,0.03)"
              }}
            >
              <div className="size-[6px] shrink-0 rounded-full" style={{ backgroundColor: color.text, boxShadow: `0 0 6px ${color.edge}` }} />
              <span className="text-[10px] font-semibold text-foreground/60">{section.hook.label}</span>
              <span className="ml-auto text-[8px] font-bold tracking-wider uppercase" style={{ color: color.text, opacity: 0.6 }}>
                {section.hook.category}
              </span>
            </div>

            {/* Port rows */}
            {section.portRows.map((row, rowIndex) => (
              <div
                key={row.inputId ?? row.outputId ?? `${section.hook.hookId}-${rowIndex}`}
                className="flex items-center justify-between px-3.5"
                style={{ height: PORT_ROW_HEIGHT }}
              >
                {/* Input (left) */}
                <div className="flex items-center gap-1.5 min-w-0">
                  {row.inputEvent ? (
                    <>
                      <div
                        className="size-[5px] shrink-0 rounded-full"
                        style={{
                          backgroundColor: getCategoryColor(row.category).edge,
                          boxShadow: `0 0 4px ${getCategoryColor(row.category).edge}40, 0 0 0 1px ${getCategoryColor(row.category).border}`
                        }}
                      />
                      <span className="truncate text-[9px] font-mono text-foreground/45">{row.inputEvent}</span>
                    </>
                  ) : <span />}
                </div>

                {/* Output (right) */}
                <div className="flex items-center gap-1.5 min-w-0 justify-end">
                  {row.outputEvent ? (
                    <>
                      <span className="truncate text-[9px] font-mono text-foreground/45">{row.outputEvent}</span>
                      <div
                        className="size-[5px] shrink-0 rounded-full"
                        style={{
                          backgroundColor: getCategoryColor(row.category).edge,
                          boxShadow: `0 0 4px ${getCategoryColor(row.category).edge}40, 0 0 0 1px ${getCategoryColor(row.category).border}`
                        }}
                      />
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {/* Handles — positioned absolutely */}
      {allHandles.map((handle) => (
        <Handle
          key={handle.id}
          id={handle.id}
          type={handle.type}
          position={handle.type === "target" ? Position.Left : Position.Right}
          style={{
            top: handle.y,
            width: 10,
            height: 10,
            background: getCategoryColor(handle.category).edge,
            border: "2px solid rgba(0,0,0,0.5)",
            boxShadow: `0 0 6px ${getCategoryColor(handle.category).edge}60`,
            borderRadius: "50%"
          }}
          isConnectable
        />
      ))}
    </div>
  );
}

export const LogicNode = memo(LogicNodeComponent);
