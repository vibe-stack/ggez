import { useState, useEffect, useCallback, useRef } from "react";
import Editor from "@monaco-editor/react";
import { X, FileJson, FileCode, FileText, File } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  language: string;
  isDirty: boolean;
}

interface MonacoEditorPanelProps {
  files: OpenFile[];
  activeFilePath: string | null;
  onSelectFile: (path: string) => void;
  onCloseFile: (path: string) => void;
  onSaveFile: (path: string, content: string) => void;
  onContentChange: (path: string, content: string) => void;
  onCloseAll: () => void;
}

// ── Language Resolver ───────────────────────────────────────────────

export function resolveLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    whmap: "json",
    css: "css",
    html: "html",
    md: "markdown",
    glsl: "glsl",
    wgsl: "wgsl",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    txt: "plaintext",
  };
  return map[ext] ?? "plaintext";
}

// ── Tab Icon ────────────────────────────────────────────────────────

function getTabIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const cls = "size-3 shrink-0";
  if (["json", "whmap"].includes(ext)) return <FileJson className={cn(cls, "text-amber-400/60")} />;
  if (["ts", "tsx", "js", "jsx"].includes(ext)) return <FileCode className={cn(cls, "text-sky-400/60")} />;
  if (["css", "html", "md"].includes(ext)) return <FileText className={cn(cls, "text-rose-400/60")} />;
  return <File className={cn(cls, "text-foreground/30")} />;
}

// ── Component ───────────────────────────────────────────────────────

export function MonacoEditorPanel({
  files,
  activeFilePath,
  onSelectFile,
  onCloseFile,
  onSaveFile,
  onContentChange,
  onCloseAll,
}: MonacoEditorPanelProps) {
  const activeFile = files.find((f) => f.path === activeFilePath);

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (activeFilePath && value !== undefined) {
        onContentChange(activeFilePath, value);
      }
    },
    [activeFilePath, onContentChange]
  );

  // Ctrl+S to save
  const handleEditorMount = useCallback(
    (editor: any) => {
      editor.addCommand(
        // Monaco KeyMod.CtrlCmd | Monaco KeyCode.KeyS
        2048 | 49, // CtrlCmd + S
        () => {
          if (activeFile) {
            onSaveFile(activeFile.path, activeFile.content);
          }
        }
      );
    },
    [activeFile, onSaveFile]
  );

  if (files.length === 0) {
    return null;
  }

  return (
    <div className="flex h-full flex-col bg-[#1e1e1e] border-t border-white/8">
      {/* Tab Bar */}
      <div className="flex items-center bg-[#252526] border-b border-white/6 overflow-x-auto">
        <div className="flex min-w-0">
          {files.map((file) => (
            <button
              key={file.path}
              className={cn(
                "group flex items-center gap-1.5 px-3 py-1.5 text-[11px] border-r border-white/4 transition-colors min-w-0 max-w-[180px]",
                file.path === activeFilePath
                  ? "bg-[#1e1e1e] text-foreground/90 border-t-2 border-t-emerald-400/60"
                  : "bg-[#2d2d2d] text-foreground/50 hover:bg-[#353535] border-t-2 border-t-transparent"
              )}
              onClick={() => onSelectFile(file.path)}
            >
              {getTabIcon(file.name)}
              <span className="truncate">{file.name}</span>
              {file.isDirty && (
                <span className="size-1.5 rounded-full bg-amber-400/70 shrink-0" />
              )}
              <span
                className="ml-1 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-white/10 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseFile(file.path);
                }}
              >
                <X className="size-2.5" />
              </span>
            </button>
          ))}
        </div>

        <div className="ml-auto shrink-0 px-2">
          <button
            className="rounded p-1 text-[10px] text-foreground/30 hover:bg-white/8 hover:text-foreground/60"
            onClick={onCloseAll}
            title="Close all"
          >
            Close All
          </button>
        </div>
      </div>

      {/* Editor Area */}
      <div className="flex-1 min-h-0">
        {activeFile ? (
          <Editor
            key={activeFile.path}
            height="100%"
            language={activeFile.language}
            value={activeFile.content}
            theme="vs-dark"
            onChange={handleEditorChange}
            onMount={handleEditorMount}
            options={{
              fontSize: 12,
              fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
              fontLigatures: true,
              minimap: { enabled: false },
              scrollbar: {
                verticalScrollbarSize: 8,
                horizontalScrollbarSize: 8,
              },
              padding: { top: 12 },
              lineNumbers: "on",
              renderWhitespace: "selection",
              bracketPairColorization: { enabled: true },
              guides: { bracketPairs: true, indentation: true },
              smoothScrolling: true,
              cursorBlinking: "smooth",
              cursorSmoothCaretAnimation: "on",
              wordWrap: "on",
              tabSize: 2,
              automaticLayout: true,
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-[11px] text-foreground/20">Select a file to edit</p>
          </div>
        )}
      </div>
    </div>
  );
}
