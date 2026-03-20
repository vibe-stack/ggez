import { type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { getCategoryColor } from "./logic-theme";

export type LogicClusterData = {
  label: string;
  category: string;
  width: number;
  height: number;
};

function LogicClusterNodeComponent({ data }: NodeProps & { data: LogicClusterData }) {
  const color = getCategoryColor(data.category);

  return (
    <div
      className="rounded-3xl"
      style={{
        width: data.width,
        height: data.height,
        background: `linear-gradient(160deg, ${color.edge}08 0%, ${color.edge}03 100%)`,
        border: `1px dashed ${color.edge}18`,
        pointerEvents: "none"
      }}
    >
      <div
        className="px-4 py-2.5 text-[10px] font-bold tracking-widest uppercase"
        style={{ color: `${color.text}50` }}
      >
        {data.label}
      </div>
    </div>
  );
}

export const LogicClusterNode = memo(LogicClusterNodeComponent);
