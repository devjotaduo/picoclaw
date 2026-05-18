import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { SuccessChip } from "./SuccessChip";
import { Notice } from "../components/Notice";
import { ReportPreview } from "../components/ReportPreview";
import type { ChatController, ChatMessage } from "../conversation/useChatPreCadastro";

type Props = {
  controller: ChatController;
};

export function MessageList({ controller }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [controller.messages.length, controller.status]);

  // Auto-show report preview at the "confirm" step.
  const showReportInline =
    controller.currentNode?.id === "confirm" &&
    controller.hasSummary;

  return (
    <div
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      aria-label="Conversa com a Clara"
      className="flex flex-col gap-3 px-3 pb-2 pt-4 sm:px-4"
    >
      {controller.errorBanner && (
        <Notice tone="warning" onDismiss={controller.dismissError}>
          {controller.errorBanner}
        </Notice>
      )}

      {controller.messages.map((message, idx) => (
        <MessageBubble
          key={message.id}
          message={message}
          showAvatar={shouldShowAvatar(controller.messages, idx)}
        />
      ))}

      {controller.status === "typing" && <TypingIndicator />}

      {showReportInline && (
        <div className="px-1">
          <ReportPreview summary={controller.previewSummary} />
        </div>
      )}

      {controller.submitted && controller.intakeId && (
        <SuccessChip
          companyName={controller.basic.company_name}
          intakeId={controller.intakeId}
        />
      )}

      <div ref={bottomRef} />
    </div>
  );
}

function shouldShowAvatar(messages: ChatMessage[], idx: number): boolean {
  const current = messages[idx];
  if (current.kind !== "clara") return false;
  const next = messages[idx + 1];
  return !next || next.kind !== "clara";
}
