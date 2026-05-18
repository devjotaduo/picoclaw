import { describe, expect, it } from "vitest";

import { getSkillDisplay } from "@/lib/skill-display";

describe("skill display helpers", () => {
  it("shows known skill names in Portuguese while preserving the slug", () => {
    const display = getSkillDisplay({
      name: "bug-report-builder",
      description: "Original description",
    });

    expect(display.name).toBe("Relatório de bug");
    expect(display.slug).toBe("bug-report-builder");
    expect(display.description).toBe("Original description");
  });

  it("localizes English built-in descriptions in the UI only", () => {
    const display = getSkillDisplay({
      name: "agent-browser",
      description: "Browser automation via agent-browser CLI.",
    });

    expect(display.name).toBe("Navegador automatizado");
    expect(display.description).toContain("Automação de navegador");
  });

  it("humanizes custom skills without requiring a catalog entry", () => {
    const display = getSkillDisplay({
      name: "agenda-whatsapp",
      description: "Agenda da recepção",
    });

    expect(display.name).toBe("Agenda WhatsApp");
    expect(display.hasLocalizedName).toBe(false);
    expect(display.slug).toBe("agenda-whatsapp");
  });
});
