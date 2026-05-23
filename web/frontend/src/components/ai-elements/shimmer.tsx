"use client"

import type { MotionProps } from "motion/react"
import { motion } from "motion/react"
import type { CSSProperties, ElementType } from "react"
import { memo, useMemo } from "react"

import { cn } from "@/lib/utils"

export interface TextShimmerProps {
  children: string
  as?: ElementType
  className?: string
  duration?: number
  spread?: number
}

const ShimmerComponent = ({
  children,
  as: Component = "p",
  className,
  duration = 2,
  spread = 2,
}: TextShimmerProps) => {
  const dynamicSpread = useMemo(
    () => (children?.length ?? 0) * spread,
    [children, spread],
  )

  const shimmerProps: MotionProps & {
    className?: string
    style: CSSProperties
  } = {
    animate: { backgroundPosition: "0% center" },
    className: cn(
      "relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent",
      "[background-repeat:no-repeat,padding-box] [--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))]",
      className,
    ),
    initial: { backgroundPosition: "100% center" },
    style: {
      "--spread": `${dynamicSpread}px`,
      backgroundImage:
        "var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))",
    } as CSSProperties,
    transition: {
      duration,
      ease: "linear",
      repeat: Number.POSITIVE_INFINITY,
    },
  }

  if (Component === "span") {
    return <motion.span {...shimmerProps}>{children}</motion.span>
  }

  if (Component === "div") {
    return <motion.div {...shimmerProps}>{children}</motion.div>
  }

  return <motion.p {...shimmerProps}>{children}</motion.p>
}

export const Shimmer = memo(ShimmerComponent)
