export interface ChatSuggestionChoice {
  title: string
  description: string
}

export interface ChatSuggestionCardData {
  title: string
  options: ChatSuggestionChoice[]
}

export interface ChatSuggestionMessageInput {
  id: string
  role: string
  content: string
  kind?: string
  attachments?: unknown[]
  toolCalls?: unknown[]
}

const OPTION_LINE_RE = /^\s*(?:[-*•]|\d{1,2}[.)])\s+(.*)$/
const CHECKBOX_LINE_RE = /^\s*[-*]\s+\[[ xX]\]\s+(.*)$/
const SUGGESTION_CUE_RE =
  /\b(sugest[aã]o|sugest[oõ]es|op[cç][aã]o|op[cç][oõ]es|escolh|aplicar|melhoria|alternativa|prefere|qual|cores?|estilos?|modelos?|formatos?|tipos?|posso fazer|posso te dar|posso oferecer|quer seguir|quer que eu|bot[aã]o|bot[oõ]es|menu|use quando|quando usar)\b/i
const MIN_PLAIN_CHOICE_OPTIONS = 4
const SHORT_CHOICE_MAX_LENGTH = 48
const TECHNICAL_CHOICE_RE =
  /(?:\.(?:md|json|ya?ml|toml|txt|tsx?|jsx?|css|html|py|go|sql|log|env)\b|^[a-z0-9_./-]+$)/

function cleanInlineMarkdown(value: string): string {
  return value
    .replace(/^#{1,6}\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function isQuestionLike(value: string): boolean {
  const cleaned = cleanInlineMarkdown(value)
  return cleaned.endsWith("?") || SUGGESTION_CUE_RE.test(cleaned)
}

export function hasChatSuggestionCue(content: string): boolean {
  return content
    .split(/\r?\n/)
    .map(cleanInlineMarkdown)
    .some((line) => SUGGESTION_CUE_RE.test(line))
}

function matchOptionLine(line: string): string | null {
  const checkbox = line.match(CHECKBOX_LINE_RE)
  if (checkbox?.[1]) {
    return checkbox[1]
  }

  const option = line.match(OPTION_LINE_RE)
  return option?.[1] ?? null
}

function splitChoice(value: string): ChatSuggestionChoice {
  const cleaned = cleanInlineMarkdown(value)
  const cardTitle = cleaned.match(
    /(?:^|\s)T[ií]tulo:\s*(.+?)(?:\s+Descri[cç][aã]o:|\s+Bot[aã]o:|$)/i,
  )
  const cardDescription = cleaned.match(
    /(?:^|\s)Descri[cç][aã]o:\s*(.+?)(?:\s+Bot[aã]o:|$)/i,
  )
  const cardButton = cleaned.match(/(?:^|\s)Bot[aã]o:\s*(.+)$/i)

  if (cardTitle?.[1]) {
    return {
      title: cleanInlineMarkdown(cardButton?.[1] || cardTitle[1]),
      description: cleanInlineMarkdown(cardDescription?.[1] || cardTitle[1]),
    }
  }

  const cardPrefix = cleaned.replace(/^card\s*:\s*/i, "").trim()
  if (cardPrefix !== cleaned && cardPrefix) {
    return {
      title: cardPrefix,
      description: "",
    }
  }

  const useWhen = cleaned.match(/^(.+?)\s+Use quando\s+(.+)$/i)
  if (useWhen?.[1] && useWhen?.[2]) {
    return {
      title: cleanInlineMarkdown(useWhen[1]),
      description: `Use quando ${cleanInlineMarkdown(useWhen[2])}`,
    }
  }

  const whenToUse = cleaned.match(/^(.+?)\s+Quando usar:?\s+(.+)$/i)
  if (whenToUse?.[1] && whenToUse?.[2]) {
    return {
      title: cleanInlineMarkdown(whenToUse[1]),
      description: cleanInlineMarkdown(whenToUse[2]),
    }
  }

  const separator = cleaned.match(/\s(?:[-–—])\s|:\s/)

  if (!separator || separator.index === undefined) {
    return {
      title: cleaned,
      description: "",
    }
  }

  return {
    title: cleaned.slice(0, separator.index).trim(),
    description: cleaned.slice(separator.index + separator[0].length).trim(),
  }
}

function isOtherOption(value: string): boolean {
  return /^outro\b/i.test(cleanInlineMarkdown(value))
}

function isShortChoiceText(value: string): boolean {
  const cleaned = cleanInlineMarkdown(value)
  return (
    cleaned.length > 0 &&
    cleaned.length <= SHORT_CHOICE_MAX_LENGTH &&
    !/[.!?;:]$/.test(cleaned)
  )
}

function isTechnicalChoiceText(value: string): boolean {
  return TECHNICAL_CHOICE_RE.test(cleanInlineMarkdown(value))
}

function isChoiceDescriptionLine(value: string): boolean {
  return /^(use quando|quando usar:?)/i.test(cleanInlineMarkdown(value))
}

function findPlainChoiceRun(lines: string[]): number[] {
  let currentRun: number[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const optionText = matchOptionLine(lines[index])

    if (optionText && isShortChoiceText(optionText)) {
      currentRun.push(index)
      if (currentRun.length >= MIN_PLAIN_CHOICE_OPTIONS) {
        return currentRun
      }
      continue
    }

    currentRun = []
  }

  return []
}

export function isChatSuggestionOptionText(content: string): boolean {
  const lines = expandInlineOptions(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  )

  if (
    lines.length === 2 &&
    matchOptionLine(lines[0]) &&
    isQuestionLike(lines[1])
  ) {
    return true
  }

  return (
    lines.length > 0 && lines.every((line) => Boolean(matchOptionLine(line)))
  )
}

function expandInlineOptions(lines: string[]): string[] {
  return lines.flatMap((line) => {
    const optionText = matchOptionLine(line)
    const candidate = optionText ?? line
    const segments = candidate
      .split(/\s+-\s+/)
      .map(cleanInlineMarkdown)
      .filter(Boolean)

    if (
      segments.length >= 3 &&
      segments.some((segment) => SUGGESTION_CUE_RE.test(segment))
    ) {
      return segments.map((segment) => `- ${segment}`)
    }

    return [line]
  })
}

export function parseChatSuggestionCard(
  content: string,
  maxOptions = 4,
): ChatSuggestionCardData | null {
  const rawLines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const lines = expandInlineOptions(rawLines)

  if (lines.length < 3) {
    return null
  }

  const questionIndex = lines.findIndex(isQuestionLike)
  const optionIndexes = lines
    .map((line, index) => (matchOptionLine(line) ? index : -1))
    .filter((index) => index >= 0)

  if (optionIndexes.length < 2) {
    const singleOptionIndex = optionIndexes[0]
    if (singleOptionIndex === undefined) {
      return null
    }

    const optionText = matchOptionLine(lines[singleOptionIndex])
    const nextLine = lines[singleOptionIndex + 1] ?? ""
    const isSingleChoice =
      optionText &&
      !isTechnicalChoiceText(optionText) &&
      (SUGGESTION_CUE_RE.test(cleanInlineMarkdown(optionText)) ||
        isChoiceDescriptionLine(nextLine))

    if (!isSingleChoice) {
      return null
    }
  }

  const plainChoiceRun = findPlainChoiceRun(lines)
  const isPlainChoiceList =
    rawLines.length === lines.length &&
    plainChoiceRun.length >= MIN_PLAIN_CHOICE_OPTIONS
  const firstOptionIndex = isPlainChoiceList
    ? plainChoiceRun[0]
    : optionIndexes[0]
  const hasSuggestionCue =
    (isPlainChoiceList &&
      plainChoiceRun.some((index) => {
        const optionText = matchOptionLine(lines[index])
        return Boolean(optionText && !isTechnicalChoiceText(optionText))
      })) ||
    optionIndexes.some((index) => {
      const optionText = matchOptionLine(lines[index])
      const nextLine = lines[index + 1] ?? ""
      return Boolean(
        optionText &&
        !isTechnicalChoiceText(optionText) &&
        (SUGGESTION_CUE_RE.test(cleanInlineMarkdown(optionText)) ||
          SUGGESTION_CUE_RE.test(cleanInlineMarkdown(nextLine))),
      )
    }) ||
    lines
      .slice(0, firstOptionIndex + 1)
      .some((line) => SUGGESTION_CUE_RE.test(cleanInlineMarkdown(line)))

  if (!hasSuggestionCue) {
    return null
  }

  const title =
    questionIndex >= 0 && questionIndex < firstOptionIndex
      ? cleanInlineMarkdown(lines[questionIndex])
      : isPlainChoiceList
        ? "Escolha uma opção"
        : "Qual opção você quer seguir?"

  const options: ChatSuggestionChoice[] = []
  for (
    let index = 0;
    index < lines.length && options.length < maxOptions;
    index++
  ) {
    const optionText = matchOptionLine(lines[index])
    if (!optionText || isOtherOption(optionText)) {
      continue
    }

    const choice = splitChoice(optionText)
    const nextLine = lines[index + 1]
    const nextIsOption = nextLine ? Boolean(matchOptionLine(nextLine)) : false
    if (
      !isPlainChoiceList &&
      !choice.description &&
      nextLine &&
      !nextIsOption &&
      (!isQuestionLike(nextLine) || isChoiceDescriptionLine(nextLine))
    ) {
      choice.description = cleanInlineMarkdown(nextLine)
      index += 1
    }

    if (choice.title) {
      options.push(choice)
    }
  }

  if (options.length < 1) {
    return null
  }

  return { title, options }
}

function isPlainAssistantMessage(message: ChatSuggestionMessageInput): boolean {
  return (
    message.role === "assistant" &&
    (message.kind === undefined || message.kind === "normal") &&
    (message.attachments?.length ?? 0) === 0 &&
    (message.toolCalls?.length ?? 0) === 0 &&
    message.content.trim().length > 0
  )
}

function buildGroupedSuggestionMessage<T extends ChatSuggestionMessageInput>(
  messages: readonly T[],
  startIndex: number,
): { message: T; nextIndex: number } | null {
  const first = messages[startIndex]
  if (!first || !isPlainAssistantMessage(first)) {
    return null
  }

  const firstIsOption = isChatSuggestionOptionText(first.content)
  const firstIsLead = hasChatSuggestionCue(first.content)
  if (!firstIsOption && !firstIsLead) {
    return null
  }

  const optionStartIndex = firstIsOption ? startIndex : startIndex + 1
  const optionMessages: T[] = []
  let cursor = optionStartIndex

  while (
    cursor < messages.length &&
    isPlainAssistantMessage(messages[cursor]) &&
    isChatSuggestionOptionText(messages[cursor].content)
  ) {
    optionMessages.push(messages[cursor])
    cursor += 1
  }

  if (optionMessages.length < 1) {
    return null
  }

  const content = [
    firstIsOption ? "" : first.content,
    ...optionMessages.map((message) => message.content),
  ]
    .filter(Boolean)
    .join("\n")

  if (!parseChatSuggestionCard(content)) {
    return null
  }

  return {
    message: {
      ...first,
      id: `${first.id}-suggestions`,
      content,
      attachments: undefined,
      toolCalls: undefined,
    },
    nextIndex: cursor,
  }
}

function shouldGroupPlainAssistantMessage(
  messages: readonly ChatSuggestionMessageInput[],
  index: number,
): boolean {
  const message = messages[index]
  if (!message || !isPlainAssistantMessage(message)) {
    return false
  }

  return (
    !buildGroupedSuggestionMessage(messages, index) &&
    !isChatSuggestionOptionText(message.content)
  )
}

function buildGroupedPlainAssistantMessage<
  T extends ChatSuggestionMessageInput,
>(
  messages: readonly T[],
  startIndex: number,
): { message: T; nextIndex: number } | null {
  const first = messages[startIndex]
  if (!first || !shouldGroupPlainAssistantMessage(messages, startIndex)) {
    return null
  }

  const plainMessages: T[] = [first]
  let cursor = startIndex + 1

  while (
    cursor < messages.length &&
    shouldGroupPlainAssistantMessage(messages, cursor)
  ) {
    plainMessages.push(messages[cursor])
    cursor += 1
  }

  if (plainMessages.length < 2) {
    return null
  }

  return {
    message: {
      ...first,
      id: `${first.id}-grouped`,
      content: plainMessages
        .map((message) => message.content.trim())
        .filter(Boolean)
        .join("\n\n"),
    },
    nextIndex: cursor,
  }
}

export function groupChatSuggestionMessages<
  T extends ChatSuggestionMessageInput,
>(messages: readonly T[]): T[] {
  const grouped: T[] = []

  for (let index = 0; index < messages.length; index += 1) {
    const group = buildGroupedSuggestionMessage(messages, index)
    if (group) {
      grouped.push(group.message)
      index = group.nextIndex - 1
      continue
    }

    const plainGroup = buildGroupedPlainAssistantMessage(messages, index)
    if (plainGroup) {
      grouped.push(plainGroup.message)
      index = plainGroup.nextIndex - 1
      continue
    }

    grouped.push(messages[index])
  }

  return grouped
}
