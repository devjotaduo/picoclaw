import { describe, expect, it } from "vitest"

import {
  buildQuotedMessage,
  parseQuotedContent,
  truncatePreview,
} from "@/lib/whatsapp/quote"

describe("buildQuotedMessage", () => {
  it("encodes a single-line quote", () => {
    expect(
      buildQuotedMessage({ reply: { preview: "Olá" }, body: "tudo bem?" }),
    ).toBe("> Olá\n\ntudo bem?")
  })

  it("collapses whitespace and truncates very long previews", () => {
    const long = "a".repeat(300)
    const out = buildQuotedMessage({ reply: { preview: long }, body: "ok" })
    expect(out.startsWith("> ")).toBe(true)
    expect(out).toContain("…\n\nok")
  })

  it("WhatsApp markdown round-trip survives parseQuotedContent", () => {
    const encoded = buildQuotedMessage({
      reply: { preview: "Quanto custa?" },
      body: "R$ 199",
    })
    const parsed = parseQuotedContent(encoded)
    expect(parsed).toEqual({ preview: "Quanto custa?", body: "R$ 199" })
  })
})

describe("parseQuotedContent", () => {
  it("returns null when text has no quote prefix", () => {
    expect(parseQuotedContent("oi tudo bem")).toBeNull()
    expect(parseQuotedContent("")).toBeNull()
  })

  it("handles multi-line quotes", () => {
    const parsed = parseQuotedContent("> linha 1\n> linha 2\n\nresposta")
    expect(parsed).toEqual({ preview: "linha 1\nlinha 2", body: "resposta" })
  })

  it("tolerates '>' without space (older WhatsApp clients)", () => {
    expect(parseQuotedContent(">sem espaço\n\noi")?.preview).toBe("sem espaço")
  })

  it("preserves multi-paragraph body", () => {
    const parsed = parseQuotedContent("> q\n\nlinha A\n\nlinha B")
    expect(parsed?.body).toBe("linha A\n\nlinha B")
  })
})

describe("truncatePreview", () => {
  it("returns text unchanged when within limit", () => {
    expect(truncatePreview("curto")).toBe("curto")
  })
  it("collapses whitespace", () => {
    expect(truncatePreview("a   b\n\nc")).toBe("a b c")
  })
  it("appends a single ellipsis when truncated", () => {
    expect(truncatePreview("abcdefghij", 5)).toBe("abcd…")
  })
})
