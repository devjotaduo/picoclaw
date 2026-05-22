import { z } from "zod"

export const ApprovalDecisionSchema = z.enum(["approved", "denied"])

export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>

export const ApprovalMetadataItemSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
})

export type ApprovalMetadataItem = z.infer<typeof ApprovalMetadataItemSchema>

export const SerializableApprovalCardSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  metadata: z.array(ApprovalMetadataItemSchema).optional(),
  variant: z.enum(["default", "destructive"]).optional(),
  confirmLabel: z.string().optional(),
  cancelLabel: z.string().optional(),
  choice: ApprovalDecisionSchema.optional(),
})

export type SerializableApprovalCard = z.infer<
  typeof SerializableApprovalCardSchema
>

export function safeParseSerializableApprovalCard(
  input: unknown,
): SerializableApprovalCard | null {
  const parsed = SerializableApprovalCardSchema.safeParse(input)
  return parsed.success ? parsed.data : null
}

export interface ApprovalCardProps extends SerializableApprovalCard {
  className?: string
  disabled?: boolean
  onConfirm?: () => void | Promise<void>
  onCancel?: () => void | Promise<void>
}
