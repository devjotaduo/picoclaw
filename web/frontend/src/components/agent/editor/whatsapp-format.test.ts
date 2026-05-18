import { describe, expect, it } from "vitest"

import {
  formatPhoneBR,
  groupJIDToHandle,
  handleToGroupJID,
  isValidPhone,
  jidToPhone,
  phoneToJID,
  shortGroupLabel,
} from "./whatsapp-format"

describe("jidToPhone", () => {
  it("extracts digits from full JID", () => {
    expect(jidToPhone("5511999999999@s.whatsapp.net")).toBe("5511999999999")
  })

  it("returns digits unchanged when no @", () => {
    expect(jidToPhone("5511999999999")).toBe("5511999999999")
  })

  it("ignores formatting characters", () => {
    expect(jidToPhone("+55 (11) 99999-9999")).toBe("5511999999999")
  })

  it("returns empty for empty input", () => {
    expect(jidToPhone("")).toBe("")
  })
})

describe("phoneToJID", () => {
  it("appends @s.whatsapp.net suffix", () => {
    expect(phoneToJID("5511999999999")).toBe("5511999999999@s.whatsapp.net")
  })

  it("strips non-digits before suffix", () => {
    expect(phoneToJID("+55 (11) 99999-9999")).toBe(
      "5511999999999@s.whatsapp.net",
    )
  })

  it("returns empty for empty input", () => {
    expect(phoneToJID("   ")).toBe("")
  })
})

describe("formatPhoneBR", () => {
  it("formats Brazilian numbers progressively", () => {
    expect(formatPhoneBR("55")).toBe("+55")
    expect(formatPhoneBR("5511")).toBe("+55 (11)")
    expect(formatPhoneBR("551199999")).toBe("+55 (11) 99999")
    expect(formatPhoneBR("5511999999999")).toBe("+55 (11) 99999-9999")
  })

  it("formats non-BR numbers generically", () => {
    expect(formatPhoneBR("4915123456789")).toMatch(/^\+\d/)
  })

  it("returns empty for empty input", () => {
    expect(formatPhoneBR("")).toBe("")
  })
})

describe("isValidPhone", () => {
  it("accepts BR full number", () => {
    expect(isValidPhone("+55 (11) 99999-9999")).toBe(true)
  })

  it("rejects too short", () => {
    expect(isValidPhone("123")).toBe(false)
  })

  it("rejects empty", () => {
    expect(isValidPhone("")).toBe(false)
  })
})

describe("groupJIDToHandle / handleToGroupJID", () => {
  it("strips group: prefix and @g.us suffix", () => {
    expect(groupJIDToHandle("group:120363000000000000@g.us")).toBe(
      "120363000000000000",
    )
  })

  it("round-trips handle to JID", () => {
    const handle = "120363000000000000"
    const jid = handleToGroupJID(handle)
    expect(jid).toBe("120363000000000000@g.us")
    expect(groupJIDToHandle(jid)).toBe(handle)
  })
})

describe("shortGroupLabel", () => {
  it("returns truncated label with tail digits", () => {
    expect(shortGroupLabel("120363000000000123@g.us")).toBe("Grupo ···000123")
  })

  it("falls back when empty", () => {
    expect(shortGroupLabel("")).toBe("Grupo")
  })
})
