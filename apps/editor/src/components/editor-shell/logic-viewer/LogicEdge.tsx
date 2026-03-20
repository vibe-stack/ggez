import { type EdgeProps, getSmoothStepPath, EdgeLabelRenderer } from "@xyflow/react";
import { memo } from "react";
import { getEdgeColor } from "./logic-theme";

type LogicEdgeData = {
  event: string;
  category: string;
};

function LogicEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd
}: EdgeProps & { data?: LogicEdgeData }) {
  const category = data?.category ?? "Custom";
  const event = data?.event ?? "";
  const color = getEdgeColor(category);

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 16,
    offset: 24
  });

  return (
    <>
      {/* Glow layer */}
      <path
        d={edgePath}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeOpacity={0.12}
        className="react-flow__edge-path"
      />
      {/* Main stroke */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeOpacity={0.55}
        className="react-flow__edge-path"
        markerEnd={markerEnd}
      />
      {/* Event label */}
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-none absolute"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            fontSize: 8,
            fontFamily: "monospace",
            color,
            opacity: 0.5,
            background: "rgba(6,13,11,0.85)",
            padding: "1px 5px",
            borderRadius: 4,
            border: `1px solid ${color}25`,
            whiteSpace: "nowrap"
          }}
        >
          {event}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const LogicEdge = memo(LogicEdgeComponent);
