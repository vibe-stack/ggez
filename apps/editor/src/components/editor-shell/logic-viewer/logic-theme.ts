const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string; edge: string }> = {
  Interaction: { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.35)", text: "#fbbf24", edge: "#f59e0b" },
  Trigger:     { bg: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.35)", text: "#fb923c", edge: "#f97316" },
  State:       { bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.35)", text: "#34d399", edge: "#10b981" },
  Motion:      { bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.35)", text: "#60a5fa", edge: "#3b82f6" },
  Inventory:   { bg: "rgba(168,85,247,0.12)", border: "rgba(168,85,247,0.35)", text: "#c084fc", edge: "#a855f7" },
  Combat:      { bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.35)",  text: "#f87171", edge: "#ef4444" },
  Spawning:    { bg: "rgba(236,72,153,0.12)", border: "rgba(236,72,153,0.35)", text: "#f472b6", edge: "#ec4899" },
  AI:          { bg: "rgba(6,182,212,0.12)",   border: "rgba(6,182,212,0.35)",  text: "#22d3ee", edge: "#06b6d4" },
  Feedback:    { bg: "rgba(139,92,246,0.12)",  border: "rgba(139,92,246,0.35)", text: "#a78bfa", edge: "#8b5cf6" },
  Flags:       { bg: "rgba(20,184,166,0.12)",  border: "rgba(20,184,166,0.35)", text: "#2dd4bf", edge: "#14b8a6" },
  Logic:       { bg: "rgba(99,102,241,0.12)",  border: "rgba(99,102,241,0.35)", text: "#818cf8", edge: "#6366f1" },
  Core:        { bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.35)", text: "#94a3b8", edge: "#64748b" },
  Custom:      { bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.35)", text: "#94a3b8", edge: "#64748b" }
};

const DEFAULT_COLOR = { bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.35)", text: "#94a3b8", edge: "#64748b" };

export function getCategoryColor(category: string) {
  return CATEGORY_COLORS[category] ?? DEFAULT_COLOR;
}

export function getEdgeColor(category: string) {
  return (CATEGORY_COLORS[category] ?? DEFAULT_COLOR).edge;
}
