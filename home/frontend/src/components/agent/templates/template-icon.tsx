import {
  IconHeadset,
  IconShoppingBag,
  IconSparkles,
  IconStethoscope,
  IconTargetArrow,
  IconUserCheck,
} from "@tabler/icons-react"
import type { ComponentType } from "react"

const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  IconUserCheck,
  IconStethoscope,
  IconShoppingBag,
  IconHeadset,
  IconTargetArrow,
}

export function TemplateIcon({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  const Component = ICON_MAP[name] ?? IconSparkles
  return <Component className={className} />
}
