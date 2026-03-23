import { memo, type PointerEvent as ReactPointerEvent, type RefObject, type WheelEvent as ReactWheelEvent } from "react";

type ValueRange = {
  min: number;
  max: number;
};

type SelectionBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

function ClipCurveEditorInner(props: {
  curveHeight: number;
  curvePaddingX: number;
  curvePaddingY: number;
  pixelsPerSecond: number;
  playheadTransform: string;
  ghostCurvePath: string;
  ghostPoints: Array<{ id: string; time: number; value: number }>;
  points: Array<{ id: string; time: number; value: number; isSelected: boolean }>;
  rulerTimes: number[];
  selectedCurvePath: string;
  selectedValueRange: ValueRange;
  timelineScrollerRef: RefObject<HTMLDivElement | null>;
  rulerContentRef: RefObject<HTMLDivElement | null>;
  playheadLineRef: RefObject<HTMLDivElement | null>;
  curveSvgRef: RefObject<SVGSVGElement | null>;
  timelineWidth: number;
  selectionBox: SelectionBounds | null;
  onCurvePointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointPointerDown: (event: ReactPointerEvent<SVGCircleElement>, index: number) => void;
  onRulerPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCurveWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
}) {
  return (
    <div className="grid min-h-0 select-none grid-rows-[48px_minmax(0,1fr)]">
      <div className="relative border-b border-white/8 bg-[#0a151b]/96 backdrop-blur" onPointerDown={props.onRulerPointerDown}>
        <div className="absolute inset-0 overflow-hidden">
          <div ref={props.rulerContentRef} style={{ width: `${props.timelineWidth}px`, height: "100%" }}>
            {props.rulerTimes.map((time) => {
              const x = props.curvePaddingX + time * props.pixelsPerSecond;
              return (
                <div key={time} className="absolute inset-y-0" style={{ left: `${x}px` }}>
                  <div className="h-3 w-px bg-white/10" />
                  <div className="mt-1 -translate-x-1/2 text-[10px] text-zinc-500">{time.toFixed(time < 1 ? 2 : time < 10 ? 1 : 0)}s</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div
        ref={props.timelineScrollerRef}
        className="min-h-0 overflow-auto select-none"
        onWheel={props.onCurveWheel}
        onScroll={(event) => {
          if (props.rulerContentRef.current) {
            props.rulerContentRef.current.style.transform = `translateX(${-event.currentTarget.scrollLeft}px)`;
          }
        }}
      >
        <div className="relative" style={{ width: `${props.timelineWidth}px`, height: `${props.curveHeight}px` }}>
          <div ref={props.playheadLineRef} className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-emerald-300/90 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]" style={{ transform: props.playheadTransform }} />

          {props.selectionBox ? (
            <div
              className="pointer-events-none absolute z-30 border border-emerald-300/80 bg-emerald-400/12"
              style={{
                left: `${props.selectionBox.left}px`,
                top: `${props.selectionBox.top}px`,
                width: `${Math.max(props.selectionBox.right - props.selectionBox.left, 1)}px`,
                height: `${Math.max(props.selectionBox.bottom - props.selectionBox.top, 1)}px`,
              }}
            />
          ) : null}

          <svg
            ref={props.curveSvgRef}
            width={props.timelineWidth}
            height={props.curveHeight}
            className="block select-none bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px)]"
            style={{ backgroundSize: `${Math.max(props.pixelsPerSecond / 4, 20)}px 100%` }}
            onPointerDown={props.onCurvePointerDown}
          >
            {Array.from({ length: 5 }, (_, index) => {
              const t = index / 4;
              const y = props.curvePaddingY + t * (props.curveHeight - props.curvePaddingY * 2);
              const value = (1 - t) * props.selectedValueRange.max + t * props.selectedValueRange.min;
              return (
                <g key={index}>
                  <line x1={0} y1={y} x2={props.timelineWidth} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                  <text x={8} y={y - 6} fill="rgba(161,161,170,0.9)" fontSize="10">
                    {value.toFixed(2)}
                  </text>
                </g>
              );
            })}

            {props.ghostCurvePath ? (
              <path d={props.ghostCurvePath} fill="none" stroke="rgba(161,161,170,0.4)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            ) : null}

            {props.ghostPoints.map((point) => (
              <circle
                key={point.id}
                cx={props.curvePaddingX + point.time * props.pixelsPerSecond}
                cy={point.value}
                r={4}
                fill="rgba(161,161,170,0.16)"
                stroke="rgba(228,228,231,0.4)"
                strokeWidth={1.5}
                pointerEvents="none"
              />
            ))}

            {props.selectedCurvePath ? (
              <path d={props.selectedCurvePath} fill="none" stroke="rgba(52,211,153,0.95)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            ) : null}

            {props.points.map((point, index) => (
              <circle
                key={point.id}
                cx={props.curvePaddingX + point.time * props.pixelsPerSecond}
                cy={point.value}
                r={point.isSelected ? 7 : 5}
                fill={point.isSelected ? "#ffffff" : "rgba(52,211,153,0.98)"}
                stroke={point.isSelected ? "rgba(52,211,153,0.95)" : "rgba(6,11,9,0.9)"}
                strokeWidth={point.isSelected ? 3 : 2}
                className="cursor-move"
                onPointerDown={(event) => props.onPointPointerDown(event, index)}
              />
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}

export const ClipCurveEditor = memo(ClipCurveEditorInner);
