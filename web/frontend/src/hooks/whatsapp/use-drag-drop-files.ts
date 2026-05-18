import { useCallback, useEffect, useRef, useState } from "react"

export interface UseDragDropFilesOptions {
  enabled?: boolean
  onFiles: (files: File[]) => void
}

export interface UseDragDropFilesResult {
  isDragging: boolean
  rootRef: React.RefObject<HTMLDivElement | null>
}

/**
 * Tracks whether the user is dragging files over `rootRef`, so the caller can
 * render an overlay. Handles dragenter/leave reference counting (the naive
 * "isDragging on dragenter / off on dragleave" pattern flickers when children
 * fire their own leave events).
 */
export function useDragDropFiles({
  enabled = true,
  onFiles,
}: UseDragDropFilesOptions): UseDragDropFilesResult {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const counterRef = useRef(0)

  const onFilesRef = useRef(onFiles)
  useEffect(() => {
    onFilesRef.current = onFiles
  }, [onFiles])

  const carriesFiles = useCallback((e: DragEvent): boolean => {
    if (!e.dataTransfer) return false
    return Array.from(e.dataTransfer.types).includes("Files")
  }, [])

  useEffect(() => {
    if (!enabled) return
    const root = rootRef.current
    if (!root) return

    const onDragEnter = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      e.preventDefault()
      counterRef.current += 1
      setIsDragging(true)
    }
    const onDragOver = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"
    }
    const onDragLeave = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      counterRef.current = Math.max(0, counterRef.current - 1)
      if (counterRef.current === 0) setIsDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      e.preventDefault()
      counterRef.current = 0
      setIsDragging(false)
      const files = e.dataTransfer ? Array.from(e.dataTransfer.files) : []
      if (files.length > 0) onFilesRef.current(files)
    }

    root.addEventListener("dragenter", onDragEnter)
    root.addEventListener("dragover", onDragOver)
    root.addEventListener("dragleave", onDragLeave)
    root.addEventListener("drop", onDrop)
    return () => {
      root.removeEventListener("dragenter", onDragEnter)
      root.removeEventListener("dragover", onDragOver)
      root.removeEventListener("dragleave", onDragLeave)
      root.removeEventListener("drop", onDrop)
    }
  }, [carriesFiles, enabled])

  return { isDragging, rootRef }
}
