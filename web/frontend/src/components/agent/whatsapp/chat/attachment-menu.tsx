import {
  IconCamera,
  IconFile,
  IconMapPin,
  IconPaperclip,
  IconPhoto,
  IconUser,
  IconVideo,
} from "@tabler/icons-react"
import { useRef } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export type AttachmentKind =
  | "image"
  | "video"
  | "document"
  | "camera"
  | "contact"
  | "location"

export interface AttachmentMenuProps {
  /** Receives the picked file(s) from the OS dialog or capture intent. */
  onPickFiles: (kind: AttachmentKind, files: File[]) => void
  /** Stub callbacks for non-file kinds; the parent typically opens a sub-UI. */
  onPickContact?: () => void
  onPickLocation?: () => void
  disabled?: boolean
}

interface InputDescriptor {
  accept: string
  capture?: "user" | "environment"
}

const INPUTS: Record<"image" | "video" | "document" | "camera", InputDescriptor> = {
  image: { accept: "image/*" },
  video: { accept: "video/*" },
  document: { accept: "*/*" },
  camera: { accept: "image/*", capture: "environment" },
}

/**
 * Paperclip-style attachment menu with sub-items for Imagem/Vídeo, Documento,
 * Câmera, Contato, Localização. Hidden file inputs are reused per kind so the
 * browser dialog opens with the right `accept` filter.
 */
export function AttachmentMenu({
  onPickFiles,
  onPickContact,
  onPickLocation,
  disabled = false,
}: AttachmentMenuProps) {
  const imageRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)
  const docRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  function trigger(ref: React.RefObject<HTMLInputElement | null>) {
    ref.current?.click()
  }
  function handleChange(
    kind: "image" | "video" | "document" | "camera",
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) onPickFiles(kind, files)
    e.target.value = ""
  }

  return (
    <>
      <DropdownMenu>
        <Tooltip delayDuration={500}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0"
                disabled={disabled}
                aria-label="Anexar arquivo"
              >
                <IconPaperclip className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">Anexar</TooltipContent>
        </Tooltip>
        <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-52">
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              trigger(imageRef)
            }}
          >
            <IconPhoto className="mr-2 size-3.5" aria-hidden="true" />
            Imagem
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              trigger(videoRef)
            }}
          >
            <IconVideo className="mr-2 size-3.5" aria-hidden="true" />
            Vídeo
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              trigger(docRef)
            }}
          >
            <IconFile className="mr-2 size-3.5" aria-hidden="true" />
            Documento
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              trigger(cameraRef)
            }}
          >
            <IconCamera className="mr-2 size-3.5" aria-hidden="true" />
            Câmera
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              onPickContact?.()
            }}
            disabled={!onPickContact}
          >
            <IconUser className="mr-2 size-3.5" aria-hidden="true" />
            Contato
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              onPickLocation?.()
            }}
            disabled={!onPickLocation}
          >
            <IconMapPin className="mr-2 size-3.5" aria-hidden="true" />
            Localização
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={imageRef}
        type="file"
        accept={INPUTS.image.accept}
        className="hidden"
        multiple
        onChange={(e) => handleChange("image", e)}
        aria-hidden="true"
      />
      <input
        ref={videoRef}
        type="file"
        accept={INPUTS.video.accept}
        className="hidden"
        multiple
        onChange={(e) => handleChange("video", e)}
        aria-hidden="true"
      />
      <input
        ref={docRef}
        type="file"
        accept={INPUTS.document.accept}
        className="hidden"
        multiple
        onChange={(e) => handleChange("document", e)}
        aria-hidden="true"
      />
      <input
        ref={cameraRef}
        type="file"
        accept={INPUTS.camera.accept}
        capture={INPUTS.camera.capture}
        className="hidden"
        onChange={(e) => handleChange("camera", e)}
        aria-hidden="true"
      />
    </>
  )
}
