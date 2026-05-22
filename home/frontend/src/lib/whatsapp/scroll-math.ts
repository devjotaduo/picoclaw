export const AUTOSCROLL_THRESHOLD_PX = 200

export interface ScrollMetrics {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

export function distanceFromBottom(m: ScrollMetrics): number {
  return Math.max(0, m.scrollHeight - m.scrollTop - m.clientHeight)
}

export function isNearBottom(
  m: ScrollMetrics,
  threshold = AUTOSCROLL_THRESHOLD_PX,
): boolean {
  return distanceFromBottom(m) <= threshold
}

export function shouldAutoscroll(
  m: ScrollMetrics,
  options: { force?: boolean; threshold?: number } = {},
): boolean {
  if (options.force) return true
  return isNearBottom(m, options.threshold ?? AUTOSCROLL_THRESHOLD_PX)
}
