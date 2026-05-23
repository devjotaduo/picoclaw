export interface ChatSuggestionChoice {
  title: string
  description: string
}

export interface ChatSuggestionCardData {
  title: string
  options: ChatSuggestionChoice[]
}

const OPTION_LINE_RE = /^\s*(?:[-*•]|\d{1,2}[.)])\s+(.*)$/
const CHECKBOX_LINE_RE = /^\s*[-*]\s+\[[ xX]\]\s+(.*)$/
const SUGGESTION_CUE_RE =
  /\b(sugest[aã]o|sugest[oõ]es|op[cç][aã]o|op[cç][oõ]es|escolh|aplicar|melhoria|alternativa|prefere|qual)\b/i

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
  const lines = expandInlineOptions(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  )

  if (lines.length < 3) {
    return null
  }

  const questionIndex = lines.findIndex(isQuestionLike)
  const optionIndexes = lines
    .map((line, index) => (matchOptionLine(line) ? index : -1))
    .filter((index) => index >= 0)

  if (optionIndexes.length < 2) {
    return null
  }

  const firstOptionIndex = optionIndexes[0]
  const hasSuggestionCue = lines
    .slice(0, firstOptionIndex + 1)
    .some((line) => SUGGESTION_CUE_RE.test(cleanInlineMarkdown(line)))

  if (!hasSuggestionCue) {
    return null
  }

  const title =
    questionIndex >= 0 && questionIndex < firstOptionIndex
      ? cleanInlineMarkdown(lines[questionIndex])
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
      !choice.description &&
      nextLine &&
      !nextIsOption &&
      !isQuestionLike(nextLine)
    ) {
      choice.description = cleanInlineMarkdown(nextLine)
      index += 1
    }

    if (choice.title) {
      options.push(choice)
    }
  }

  if (options.length < 2) {
    return null
  }

  return { title, options }
}
