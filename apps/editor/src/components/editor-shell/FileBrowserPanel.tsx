import { useState, useEffect, useCallback, type ReactNode } from "react";
import {
  FolderOpen,
  FolderClosed,
  File,
  FileJson,
  FileCode,
  FileImage,
  FileText,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  FolderPlus,
  Trash2,
  Pencil,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────

interface DirTreeEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  path: string;
  children?: DirTreeEntry[];
}

interface FileBrowserPanelProps {
  projectPath: string | null;
  onFileOpen: (filePath: string) => void;
  onClose: () => void;
}

// ── File Icon Resolver ──────────────────────────────────────────────

function getFileIcon(name: string): ReactNode {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const iconClass = "size-3.5 shrink-0";

  if (["json", "whmap"].includes(ext))
    return <FileJson className={cn(iconClass, "text-amber-400/70")} />;
  if (["ts", "tsx", "js", "jsx"].includes(ext))
    return <FileCode className={cn(iconClass, "text-sky-400/70")} />;
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "hdr", "exr"].includes(ext))
    return <FileImage className={cn(iconClass, "text-emerald-400/70")} />;
  if (["glb", "gltf", "fbx", "obj"].includes(ext))
    return <File className={cn(iconClass, "text-purple-400/70")} />;
  if (["css", "html", "md"].includes(ext))
    return <FileText className={cn(iconClass, "text-rose-400/70")} />;
  return <File className={cn(iconClass, "text-foreground/40")} />;
}

// ── Tree Node Component ─────────────────────────────────────────────

function TreeNode({
  entry,
  depth,
  expandedPaths,
  onToggle,
  onFileClick,
}: {
  entry: DirTreeEntry;
  depth: number;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  onFileClick: (path: string) => void;
}) {
  const isExpanded = expandedPaths.has(entry.path);
  const paddingLeft = 8 + depth * 14;

  if (entry.isDirectory) {
    return (
      <>
        <button
          className="group flex w-full items-center gap-1.5 py-[3px] text-[11px] text-foreground/60 hover:bg-white/6 hover:text-foreground/90 transition-colors"
          style={{ paddingLeft }}
          onClick={() => onToggle(entry.path)}
        >
          {isExpanded ? (
            <ChevronDown className="size-3 shrink-0 text-foreground/30" />
          ) : (
            <ChevronRight className="size-3 shrink-0 text-foreground/30" />
          )}
          {isExpanded ? (
            <FolderOpen className="size-3.5 shrink-0 text-amber-500/60" />
          ) : (
            <FolderClosed className="size-3.5 shrink-0 text-amber-500/50" />
          )}
          <span className="truncate">{entry.name}</span>
        </button>
        {isExpanded &&
          entry.children?.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              onFileClick={onFileClick}
            />
          ))}
      </>
    );
  }

  return (
    <button
      className="group flex w-full items-center gap-1.5 py-[3px] text-[11px] text-foreground/50 hover:bg-white/6 hover:text-foreground/80 transition-colors"
      style={{ paddingLeft: paddingLeft + 14 }}
      onClick={() => onFileClick(entry.path)}
    >
      {getFileIcon(entry.name)}
      <span className="truncate">{entry.name}</span>
    </button>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export function FileBrowserPanel({ projectPath, onFileOpen, onClose }: FileBrowserPanelProps) {
  const [tree, setTree] = useState<DirTreeEntry[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const api = (window as any).electronAPI;
  const isElectron = !!api?.isElectron;

  const loadTree = useCallback(async () => {
    if (!projectPath || !isElectron) return;

    setLoading(true);
    setError(null);

    try {
      const entries = await api.readDirTree(projectPath);
      setTree(entries);
    } catch (err: any) {
      setError(err.message ?? "Failed to read project");
      setTree([]);
    } finally {
      setLoading(false);
    }
  }, [projectPath, isElectron]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  if (!isElectron) {
    return (
      <div className="flex h-full flex-col bg-black/30 backdrop-blur-xl border-r border-white/6">
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/6">
          <span className="text-[11px] font-semibold tracking-wide text-foreground/50 uppercase">
            Project Files
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-[11px] text-foreground/30 text-center">
            File browser is only available in the Electron desktop app.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-black/30 backdrop-blur-xl border-r border-white/6">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/6">
        <span className="text-[11px] font-semibold tracking-wide text-foreground/50 uppercase">
          Project Files
        </span>
        <div className="flex items-center gap-1">
          <button
            className="rounded p-1 text-foreground/30 hover:bg-white/8 hover:text-foreground/70 transition-colors"
            onClick={loadTree}
            title="Refresh"
          >
            <RefreshCw className={cn("size-3", loading && "animate-spin")} />
          </button>
          <button
            className="rounded p-1 text-foreground/30 hover:bg-white/8 hover:text-foreground/70 transition-colors"
            onClick={onClose}
            title="Close"
          >
            ×
          </button>
        </div>
      </div>

      {/* Project name */}
      {projectPath && (
        <div className="px-3 py-1.5 border-b border-white/4">
          <p className="text-[10px] font-medium text-emerald-400/60 truncate">
            {projectPath.split(/[\\/]/).pop()}
          </p>
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto min-h-0 py-1">
        {!projectPath && (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
            <FolderOpen className="size-8 text-foreground/15" />
            <p className="text-[11px] text-foreground/30 text-center">
              No project open.<br />
              Use <span className="text-foreground/50">File → Open Project</span> to get started.
            </p>
          </div>
        )}

        {error && (
          <div className="p-3">
            <p className="text-[11px] text-red-400/70">{error}</p>
          </div>
        )}

        {!error && tree.map((entry) => (
          <TreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            expandedPaths={expandedPaths}
            onToggle={toggleExpanded}
            onFileClick={onFileOpen}
          />
        ))}
      </div>
    </div>
  );
}
