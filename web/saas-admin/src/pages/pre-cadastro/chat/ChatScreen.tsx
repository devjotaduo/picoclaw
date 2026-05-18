import { useEffect, useRef } from "react";
import { useChatPreCadastro } from "../conversation/useChatPreCadastro";
import { ChatHeader } from "./ChatHeader";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";

export function ChatScreen() {
  const controller = useChatPreCadastro();
  const composerRef = useRef<HTMLDivElement>(null);

  // When typing finishes, scroll composer into view so the user sees the input.
  useEffect(() => {
    if (controller.status === "idle") {
      composerRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    }
  }, [controller.status, controller.currentNode?.id]);

  if (!controller.hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-50">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
          Carregando conversa…
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50">
      <ChatHeader
        status={controller.status}
        canGoBack={controller.canGoBack}
        onBack={controller.goBack}
        draftSavedAt={controller.draftSavedAt}
      />

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
        <main className="flex-1 px-1 pb-32">
          <MessageList controller={controller} />
        </main>

        {!controller.submitted && (
          <div
            ref={composerRef}
            className="sticky bottom-0 z-20 border-t border-zinc-200 bg-white/95 backdrop-blur-md"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}
          >
            <div className="px-3 pt-3 sm:px-4">
              <Composer controller={controller} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
