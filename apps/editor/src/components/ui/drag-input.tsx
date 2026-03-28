import React, { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

interface DragInputProps {
  value?: number
  onChange: (value: number) => void
  onValueCommit?: (value: number) => void
  step?: number
  precision?: number
  min?: number
  id?: string
  max?: number
  className?: string
  label?: string
  suffix?: string
  disabled?: boolean
  compact?: boolean
}

export function DragInput({
  value,
  onChange,
  onValueCommit,
  step = 0.01,
  precision = 1,
  min,
  max,
  id,
  className,
  label,
  suffix,
  disabled = false,
  compact = false
}: DragInputProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value?.toFixed(precision) ?? "");
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartValue, setDragStartValue] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const displayRef = useRef<HTMLDivElement>(null);
  const hasDraggedRef = useRef(false);
  const lastValueRef = useRef<number | undefined>(value);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    // Don't update input value while actively dragging
    // This prevents external value changes from breaking the drag state
    if (!isEditing && !isDragging) {
      setInputValue(value !== undefined ? value.toFixed(precision) : "");
    }
  }, [value, precision, isEditing, isDragging]);

  // Handle cursor style and iframe blocking
  useEffect(() => {
    if (isDragging) {
      document.body.style.cursor = "ew-resize";
      // Disable pointer events on all iframes during drag
      const iframes = document.querySelectorAll("iframe");
      iframes.forEach(iframe => {
        iframe.style.pointerEvents = "none";
      });
      
      return () => {
        document.body.style.cursor = "default";
        // Re-enable pointer events on iframes
        iframes.forEach(iframe => {
          iframe.style.pointerEvents = "auto";
        });
      };
    }
  }, [isDragging]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isEditing || disabled) return;
    
    setIsDragging(true);
    setHasDragged(false);
    hasDraggedRef.current = false;
    setDragStartX(e.clientX);
    setDragStartValue(value ?? 0);
    lastValueRef.current = value ?? 0;
    
    e.preventDefault();
  }, [isEditing, disabled, value]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStartX;
    
    // Mark that we've actually dragged if moved more than 2 pixels
    if (Math.abs(deltaX) > 2) {
      hasDraggedRef.current = true;
      setHasDragged(true);
    }
    
    const deltaValue = deltaX * step;
    let newValue = dragStartValue + deltaValue;

    if (min !== undefined) newValue = Math.max(min, newValue);
    if (max !== undefined) newValue = Math.min(max, newValue);

    lastValueRef.current = newValue;
    onChange(newValue);
  }, [isDragging, step, min, max, onChange, dragStartX, dragStartValue]);

  const handleMouseUp = useCallback(() => {
    const didDrag = hasDraggedRef.current;

    setIsDragging(false);
    // Reset accumulated delta after a short delay to allow click detection
    setTimeout(() => {
      hasDraggedRef.current = false;
      setHasDragged(false);
    }, 0);
    if (didDrag && onValueCommit) {
      const v = lastValueRef.current ?? value ?? dragStartValue;
      window.setTimeout(() => {
        onValueCommit(v);
      }, 0);
    }
  }, [onValueCommit, value, dragStartValue]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const toggleEditing = () => {
    if (disabled) return;
    
    if (isEditing) {
      commitInputValue(inputRef.current?.value ?? inputValue);
      setIsEditing(false);
    } else {
      setIsEditing(true);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  };

  const handleClick = () => {
    // Only allow editing if we didn't actually drag
    if (!hasDragged && !disabled) {
      toggleEditing();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    
    if (e.key === "Enter") {
      e.preventDefault();
      toggleEditing();
    } else if (e.key === " ") {
      e.preventDefault();
      toggleEditing();
    } else if (/^[0-9]$/.test(e.key)) {
      // Start editing and replace the current value with the typed digit
      e.preventDefault();
      setIsEditing(true);
      setInputValue(e.key);
      setTimeout(() => {
        inputRef.current?.focus();
        // Position cursor at the end
        inputRef.current?.setSelectionRange(1, 1);
      }, 0);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const commitInputValue = useCallback((rawValue: string) => {
    const numValue = parseFloat(rawValue);

    if (!isNaN(numValue)) {
      let finalValue = numValue;
      if (min !== undefined) finalValue = Math.max(min, finalValue);
      if (max !== undefined) finalValue = Math.min(max, finalValue);
      lastValueRef.current = finalValue;
      setInputValue(finalValue.toFixed(precision));
      onChange(finalValue);
      if (onValueCommit) {
        window.setTimeout(() => {
          onValueCommit(finalValue);
        }, 0);
      }
      return;
    }

    setInputValue(value !== undefined ? value.toFixed(precision) : "");
  }, [max, min, onChange, onValueCommit, precision, value]);

  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false;
      return;
    }

    commitInputValue(e.currentTarget.value);
    setIsEditing(false);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      skipBlurCommitRef.current = true;
      commitInputValue(e.currentTarget.value);
      setIsEditing(false);
    } else if (e.key === "Escape") {
      skipBlurCommitRef.current = true;
      setInputValue(value?.toFixed(precision) ?? "");
      setIsEditing(false);
    }
  };

  return (
    <div className={cn("flex min-w-0 items-center gap-1.5 overflow-hidden", className)}>
      {label && (
        <span className={cn("shrink-0 text-[10px] font-medium tracking-[0.18em] text-foreground/42 uppercase", compact ? "min-w-0" : "min-w-9")}>
          {label}
        </span>
      )}
      {isEditing ? (
        <input
          id={id}
          ref={inputRef}
          type="text"
          className={cn(
            "h-7 min-w-0 flex-1 rounded-xl bg-white/6 px-2 text-[11px] text-foreground outline-none placeholder:text-foreground/20",
            disabled && "cursor-not-allowed text-foreground/28"
          )}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          disabled={disabled}
          value={inputValue}
        />
      ) : (
        <div
          ref={displayRef}
          tabIndex={disabled ? -1 : 0}
          className={cn(
            "flex h-7 min-w-0 flex-1 select-none items-center justify-between rounded-xl bg-white/5 px-2 text-[11px] text-foreground/78 transition-colors",
            disabled 
              ? "cursor-not-allowed text-foreground/28"
              : "cursor-ew-resize hover:bg-white/8 focus:outline-none",
            isDragging && !disabled && "bg-emerald-500/16 text-emerald-200"
          )}
          onMouseDown={handleMouseDown}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
        >
          <span className="truncate">{value?.toFixed(precision) ?? ""}</span>
          {suffix && <span className="ml-1 shrink-0 text-foreground/32">{suffix}</span>}
        </div>
      )}
    </div>
  );
}
