import { describe, expect, it } from "vitest"

import type { SkillSupportItem } from "@/api/skills"
import {
  compareSkills,
  getOriginAccentClasses,
  getSkillOriginKind,
  sortOrigins,
} from "@/components/agent/skills/origin-utils"
import type { SkillSortOption } from "@/components/agent/skills/types"

function makeSkill(
  name: string,
  origin_kind: string,
  source?: string,
): SkillSupportItem {
  return {
    name,
    path: `/path/${name}`,
    source: source ?? "global",
    description: "",
    origin_kind,
  }
}

describe("getSkillOriginKind", () => {
  it("returns origin_kind when set (non-global)", () => {
    const skill = makeSkill("s", "manual")
    expect(getSkillOriginKind(skill)).toBe("manual")
  })

  it("converts origin_kind 'global' to 'builtin'", () => {
    const skill = makeSkill("s", "global")
    expect(getSkillOriginKind(skill)).toBe("builtin")
  })

  it("falls back to source when origin_kind is empty string", () => {
    const skill: SkillSupportItem = {
      name: "s",
      path: "/s",
      source: "global",
      description: "",
      origin_kind: "",
    }
    expect(getSkillOriginKind(skill)).toBe("builtin")
  })

  it("converts source 'global' to 'builtin' when origin_kind is absent", () => {
    const skill: SkillSupportItem = {
      name: "s",
      path: "/s",
      source: "global",
      description: "",
      origin_kind: "",
    }
    expect(getSkillOriginKind(skill)).toBe("builtin")
  })

  it("returns origin_kind 'third_party' unchanged", () => {
    const skill = makeSkill("s", "third_party")
    expect(getSkillOriginKind(skill)).toBe("third_party")
  })
})

describe("compareSkills — sort by source", () => {
  const order: SkillSortOption = "source"

  it("builtin comes before third_party", () => {
    const a = makeSkill("a", "builtin")
    const b = makeSkill("b", "third_party")
    expect(compareSkills(a, b, order)).toBeLessThan(0)
  })

  it("third_party comes before manual", () => {
    const a = makeSkill("a", "third_party")
    const b = makeSkill("b", "manual")
    expect(compareSkills(a, b, order)).toBeLessThan(0)
  })

  it("builtin comes before manual", () => {
    const a = makeSkill("a", "builtin")
    const b = makeSkill("b", "manual")
    expect(compareSkills(a, b, order)).toBeLessThan(0)
  })

  it("manual comes after third_party", () => {
    const a = makeSkill("a", "manual")
    const b = makeSkill("b", "third_party")
    expect(compareSkills(a, b, order)).toBeGreaterThan(0)
  })

  it("same origin resolves by name localeCompare", () => {
    const a = makeSkill("alpha", "builtin")
    const b = makeSkill("beta", "builtin")
    expect(compareSkills(a, b, order)).toBeLessThan(0)
    expect(compareSkills(b, a, order)).toBeGreaterThan(0)
  })

  it("same origin and same name returns 0", () => {
    const a = makeSkill("zap", "manual")
    const b = makeSkill("zap", "manual")
    expect(compareSkills(a, b, order)).toBe(0)
  })

  it("unknown origin goes after known origins", () => {
    const known = makeSkill("a", "builtin")
    const unknown = makeSkill("b", "unknown_origin")
    expect(compareSkills(known, unknown, order)).toBeLessThan(0)
    expect(compareSkills(unknown, known, order)).toBeGreaterThan(0)
  })
})

describe("compareSkills — sort by name-desc", () => {
  const order: SkillSortOption = "name-desc"

  it("returns reverse localeCompare", () => {
    const a = makeSkill("alpha", "builtin")
    const b = makeSkill("beta", "builtin")
    // name-desc: beta > alpha, so b before a
    expect(compareSkills(a, b, order)).toBeGreaterThan(0)
    expect(compareSkills(b, a, order)).toBeLessThan(0)
  })
})

describe("compareSkills — sort by name-asc (default)", () => {
  const order: SkillSortOption = "name-asc"

  it("returns forward localeCompare", () => {
    const a = makeSkill("alpha", "builtin")
    const b = makeSkill("beta", "builtin")
    expect(compareSkills(a, b, order)).toBeLessThan(0)
    expect(compareSkills(b, a, order)).toBeGreaterThan(0)
  })
})

describe("sortOrigins", () => {
  it("sorts known origins: builtin < third_party < manual", () => {
    expect(sortOrigins(["manual", "builtin", "third_party"])).toEqual([
      "builtin",
      "third_party",
      "manual",
    ])
  })

  it("unknown origins go after known ones", () => {
    const result = sortOrigins(["unknown_x", "manual", "builtin"])
    expect(result[0]).toBe("builtin")
    expect(result[1]).toBe("manual")
    expect(result[2]).toBe("unknown_x")
  })

  it("returns empty array without error", () => {
    expect(sortOrigins([])).toEqual([])
  })

  it("does not mutate original array", () => {
    const input = ["manual", "builtin"]
    const copy = [...input]
    sortOrigins(input)
    expect(input).toEqual(copy)
  })

  it("handles single element", () => {
    expect(sortOrigins(["third_party"])).toEqual(["third_party"])
  })
})

describe("getOriginAccentClasses", () => {
  it("manual returns emerald classes", () => {
    const classes = getOriginAccentClasses("manual")
    expect(classes).toContain("emerald")
  })

  it("third_party returns sky classes", () => {
    const classes = getOriginAccentClasses("third_party")
    expect(classes).toContain("sky")
  })

  it("builtin returns amber classes", () => {
    const classes = getOriginAccentClasses("builtin")
    expect(classes).toContain("amber")
  })

  it("unknown origin returns muted classes", () => {
    const classes = getOriginAccentClasses("unknown_source")
    expect(classes).toContain("muted")
  })

  it("empty string returns muted classes", () => {
    const classes = getOriginAccentClasses("")
    expect(classes).toContain("muted")
  })
})
