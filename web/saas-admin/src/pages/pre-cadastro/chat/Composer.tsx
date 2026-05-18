import { ChipsComposer } from "./composers/ChipsComposer";
import { ConfirmComposer } from "./composers/ConfirmComposer";
import { FormComposer } from "./composers/FormComposer";
import { IntroComposer } from "./composers/IntroComposer";
import { TextComposer } from "./composers/TextComposer";
import { UploadComposer } from "./composers/UploadComposer";
import { VoiceComposer } from "./composers/VoiceComposer";
import type { ChatController } from "../conversation/useChatPreCadastro";

type Props = {
  controller: ChatController;
};

export function Composer({ controller }: Props) {
  const node = controller.currentNode;
  if (!node) return null;

  const composer = node.composer;
  const busy = controller.busy || controller.status === "typing";

  if (controller.status === "typing") {
    // Hide composer while Clara is typing so the user doesn't answer too soon.
    return <div className="h-12" aria-hidden />;
  }

  switch (composer.kind) {
    case "intro":
      return (
        <IntroComposer
          label={composer.ctaLabel}
          busy={busy}
          onStart={() => controller.submitAnswer({ kind: "intro" })}
        />
      );
    case "form":
      return (
        <FormComposer
          basic={controller.basic}
          patchBasic={controller.patchBasic}
          errors={controller.basicErrors}
          touched={controller.touched}
          touchField={controller.touchField}
          busy={busy}
          onSubmit={() =>
            controller.submitAnswer({ kind: "form", basic: controller.basic })
          }
        />
      );
    case "chips":
      return (
        <ChipsComposer
          options={composer.options}
          min={composer.min}
          storedAnswerKey={composer.key}
          storedAnswers={controller.answers}
          onToggleStore={controller.toggleAnswer}
          busy={busy}
          skippable={Boolean(node.skippable)}
          onSubmit={(values) => controller.submitAnswer({ kind: "chips", values })}
          onSkip={() => controller.submitAnswer({ kind: "skip" })}
        />
      );
    case "text":
      return (
        <TextComposer
          placeholder={composer.placeholder}
          multiline={composer.multiline}
          optional={composer.optional}
          busy={busy}
          skippable={Boolean(node.skippable)}
          onSubmit={(value) => controller.submitAnswer({ kind: "text", value })}
          onSkip={() => controller.submitAnswer({ kind: "skip" })}
        />
      );
    case "upload":
      return (
        <UploadComposer
          uploadKind={controller.uploadKind}
          setUploadKind={controller.setUploadKind}
          attachmentsCount={controller.attachments.length}
          busy={busy}
          onUpload={controller.uploadFile}
          onContinue={() =>
            controller.submitAnswer({
              kind: "upload",
              skipped: controller.attachments.length === 0,
            })
          }
        />
      );
    case "confirm":
      return (
        <ConfirmComposer
          label={composer.ctaLabel}
          action={composer.action}
          busy={busy}
          onConfirm={() => controller.submitAnswer({ kind: "confirm" })}
        />
      );
    case "voice":
      return (
        <VoiceComposer
          transcript={controller.transcript}
          setTranscript={controller.setTranscript}
          listening={controller.listening}
          busy={busy}
          onStartSpeech={controller.startSpeech}
          onSubmit={(transcript) =>
            controller.submitAnswer({ kind: "voice", transcript })
          }
          onSkip={() => controller.submitAnswer({ kind: "skip" })}
        />
      );
    default:
      return null;
  }
}
