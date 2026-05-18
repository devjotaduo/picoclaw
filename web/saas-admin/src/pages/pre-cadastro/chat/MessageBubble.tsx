import { Bot, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "../conversation/useChatPreCadastro";

type Props = {
  message: ChatMessage;
  showAvatar?: boolean;
};

export function MessageBubble({ message, showAvatar = true }: Props) {
  if (message.kind === "clara") {
    return (
      <div className="flex items-end gap-2 pc-slide-up">
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white",
            !showAvatar && "invisible",
          )}
        >
          <Bot className="h-3.5 w-3.5" />
        </div>
        <div className="max-w-[88%] rounded-2xl rounded-bl-md bg-zinc-100 px-4 py-2.5 text-[15px] leading-relaxed text-zinc-900 sm:max-w-[80%]">
          {message.text.split("\n").map((line, idx) => (
            <p key={idx} className={idx > 0 ? "mt-1" : undefined}>
              {line}
            </p>
          ))}
        </div>
      </div>
    );
  }

  if (message.kind === "attachment") {
    return (
      <div className="flex justify-end pc-slide-up">
        <div className="flex max-w-[88%] items-center gap-2 rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2.5 text-white sm:max-w-[80%]">
          <FileText className="h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
              {message.label}
            </div>
            <div className="truncate text-sm">{message.name}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end pc-slide-up">
      <div className="max-w-[88%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-[15px] leading-relaxed text-white shadow-sm sm:max-w-[80%]">
        {message.text.split("\n").map((line, idx) => (
          <p key={idx} className={idx > 0 ? "mt-1" : undefined}>
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
