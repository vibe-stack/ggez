import type { SceneSpatialAnalysis } from "@ggez/editor-core";
import { AlertTriangle, Layers3, Route, SquareStack } from "lucide-react";
import { FloatingPanel } from "@/components/editor-shell/FloatingPanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export function SpatialAnalysisPanel({
  analysis
}: {
  analysis: SceneSpatialAnalysis;
}) {
  return (
    <div className="pointer-events-none absolute left-4 top-20 z-30 w-80">
      <FloatingPanel className="overflow-hidden">
        <div className="flex items-center justify-between px-3.5 py-2.5">
          <div>
            <div className="text-[10px] font-medium tracking-[0.18em] text-foreground/42 uppercase">Spatial Analysis</div>
            <div className="mt-1 text-[11px] text-foreground/58">
              {analysis.walkableSurfaces.length} surfaces / {analysis.groups.length} groups
            </div>
          </div>
          <div
            className={cn(
              "rounded-full px-2 py-1 text-[10px] font-medium tracking-[0.08em]",
              analysis.issues.length === 0
                ? "bg-emerald-500/14 text-emerald-200"
                : "bg-amber-500/14 text-amber-200"
            )}
          >
            {analysis.issues.length === 0 ? "stable" : `${analysis.issues.length} issues`}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 px-3.5 py-3">
          <MetricTile icon={Layers3} label="Bands" value={String(analysis.elevationBands.length)} />
          <MetricTile icon={Route} label="Connectors" value={String(analysis.connectorValidations.length)} />
          <MetricTile icon={SquareStack} label="Walkable" value={String(analysis.walkableSurfaces.length)} />
        </div>

        <ScrollArea className="max-h-72 px-3.5 py-3">
          <section>
            <div className="mb-2 text-[10px] font-medium tracking-[0.16em] text-foreground/38 uppercase">Elevation Bands</div>
            <div className="flex flex-wrap gap-1.5">
              {analysis.elevationBands.length > 0 ? (
                analysis.elevationBands.map((band, index) => (
                  <span
                    className="rounded-full bg-white/6 px-2 py-1 text-[10px] text-foreground/68"
                    key={`band:${index}`}
                  >
                    y {band.averageElevation.toFixed(1)} / {band.totalArea.toFixed(1)}u²
                  </span>
                ))
              ) : (
                <EmptyLine text="No walkable bands detected." />
              )}
            </div>
          </section>

          <section className="mt-4">
            <div className="mb-2 text-[10px] font-medium tracking-[0.16em] text-foreground/38 uppercase">Connector Checks</div>
            <div className="space-y-2">
              {analysis.connectorValidations.length > 0 ? (
                analysis.connectorValidations.map((validation) => (
                  <div className="rounded-2xl bg-white/4 px-2.5 py-2" key={validation.groupId}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-[11px] font-medium text-foreground/78">
                        {validation.groupId.replace("group:blockout:", "")}
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium",
                          validation.valid
                            ? "bg-emerald-500/14 text-emerald-200"
                            : "bg-amber-500/14 text-amber-200"
                        )}
                      >
                        {validation.valid ? "valid" : "invalid"}
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-foreground/52">rise {validation.rise.toFixed(2)}</div>
                    {validation.reasons.length > 0 ? (
                      <div className="mt-2 text-[10px] leading-4 text-amber-100/78">
                        {validation.reasons.slice(0, 2).join(" ")}
                      </div>
                    ) : (
                      <div className="mt-2 text-[10px] leading-4 text-emerald-100/78">
                        Lower and upper landings both attach to external walkable surfaces.
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <EmptyLine text="No connector groups tagged yet." />
              )}
            </div>
          </section>

          <section className="mt-4">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium tracking-[0.16em] text-foreground/38 uppercase">
              <AlertTriangle className="size-3" />
              Issues
            </div>
            <div className="space-y-2">
              {analysis.issues.length > 0 ? (
                analysis.issues.slice(0, 6).map((issue) => (
                  <div className="rounded-2xl bg-amber-500/8 px-2.5 py-2 text-[10px] leading-4 text-amber-100/78" key={issue}>
                    {issue}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-emerald-500/8 px-2.5 py-2 text-[10px] leading-4 text-emerald-100/80">
                  No structural issues detected by the current blockout validator.
                </div>
              )}
            </div>
          </section>
        </ScrollArea>
      </FloatingPanel>
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Layers3;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-white/4 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-foreground/45">
        <Icon className="size-3.5" />
        <span className="text-[9px] tracking-[0.14em] uppercase">{label}</span>
      </div>
      <div className="mt-1 text-sm font-medium text-foreground/82">{value}</div>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="text-[10px] text-foreground/44">{text}</div>;
}
