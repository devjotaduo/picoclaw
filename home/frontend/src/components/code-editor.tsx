import Editor, {
  type BeforeMount,
  type OnChange,
  type OnValidate,
} from "@monaco-editor/react"
import { IconLoader2 } from "@tabler/icons-react"
import { useEffect, useMemo, useState } from "react"

import { cn } from "@/lib/utils"

const editorFont =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace"

const definePicoclawThemes: BeforeMount = (monaco) => {
  monaco.editor.defineTheme("picoclaw-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6b7280" },
      { token: "keyword", foreground: "4b3aa6" },
      { token: "string", foreground: "0f766e" },
      { token: "number", foreground: "b45309" },
    ],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#18181b",
      "editor.lineHighlightBackground": "#f4f4f533",
      "editorLineNumber.foreground": "#a1a1aa",
      "editorLineNumber.activeForeground": "#3f3f46",
      "editor.selectionBackground": "#dbeafe",
      "editor.inactiveSelectionBackground": "#e4e4e7",
      "editorCursor.foreground": "#111827",
      "editorIndentGuide.background1": "#e4e4e7",
      "editorIndentGuide.activeBackground1": "#a1a1aa",
    },
  })

  monaco.editor.defineTheme("picoclaw-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "9ca3af" },
      { token: "keyword", foreground: "a5b4fc" },
      { token: "string", foreground: "5eead4" },
      { token: "number", foreground: "fbbf24" },
    ],
    colors: {
      "editor.background": "#181817",
      "editor.foreground": "#f4f4f5",
      "editor.lineHighlightBackground": "#ffffff08",
      "editorLineNumber.foreground": "#71717a",
      "editorLineNumber.activeForeground": "#d4d4d8",
      "editor.selectionBackground": "#334155",
      "editor.inactiveSelectionBackground": "#27272a",
      "editorCursor.foreground": "#f8fafc",
      "editorIndentGuide.background1": "#3f3f46",
      "editorIndentGuide.activeBackground1": "#a1a1aa",
    },
  })
}

function currentEditorTheme() {
  if (typeof document === "undefined") return "picoclaw-dark"
  return document.documentElement.classList.contains("dark")
    ? "picoclaw-dark"
    : "picoclaw-light"
}

function useEditorTheme() {
  const [theme, setTheme] = useState(currentEditorTheme)

  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => setTheme(currentEditorTheme()))
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])

  return theme
}

export interface CodeEditorProps {
  value: string
  onChange?: (value: string) => void
  language?: string
  path?: string
  readOnly?: boolean
  className?: string
  ariaLabel?: string
  minimap?: boolean
  wordWrap?: "on" | "off" | "wordWrapColumn" | "bounded"
  onValidate?: OnValidate
}

export function CodeEditor({
  value,
  onChange,
  language = "markdown",
  path,
  readOnly = false,
  className,
  ariaLabel,
  minimap = true,
  wordWrap = "on",
  onValidate,
}: CodeEditorProps) {
  const theme = useEditorTheme()

  const handleChange = useMemo<OnChange | undefined>(() => {
    if (!onChange) return undefined
    return (nextValue) => onChange(nextValue ?? "")
  }, [onChange])

  return (
    <div
      className={cn(
        "border-border/40 bg-background min-h-0 overflow-hidden rounded-lg border",
        readOnly && "bg-muted/30",
        className,
      )}
    >
      <Editor
        height="100%"
        width="100%"
        language={language}
        path={path}
        value={value}
        theme={theme}
        beforeMount={definePicoclawThemes}
        onChange={handleChange}
        onValidate={onValidate}
        loading={
          <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
            <IconLoader2 className="size-4 animate-spin" />
            Loading editor...
          </div>
        }
        options={{
          automaticLayout: true,
          bracketPairColorization: { enabled: true },
          cursorBlinking: "smooth",
          fontFamily: editorFont,
          fontLigatures: false,
          fontSize: 13,
          formatOnPaste: true,
          formatOnType: language === "json",
          lineHeight: 20,
          lineNumbersMinChars: 3,
          minimap: { enabled: minimap, maxColumn: 90, renderCharacters: false },
          padding: { top: 12, bottom: 12 },
          readOnly,
          renderWhitespace: "selection",
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          tabSize: 2,
          wordWrap,
        }}
        wrapperProps={{
          "aria-label": ariaLabel,
        }}
      />
    </div>
  )
}
