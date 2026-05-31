import { describe, expect, it } from "vitest";

import {
  shortWorkspaceHash,
  workspaceSyncBadgeClass,
  workspaceSyncLabel,
} from "@/lib/workspace-sync";

describe("workspace sync UI helpers", () => {
  it("maps sync states to admin badges", () => {
    expect(workspaceSyncLabel("synced")).toBe("Git OK");
    expect(workspaceSyncLabel("diverged")).toBe("Divergente");
    expect(workspaceSyncLabel("unknown")).toBe("Desconhecido");
    expect(workspaceSyncLabel(undefined)).toBe("Desconhecido");

    expect(workspaceSyncBadgeClass("synced")).toContain("emerald");
    expect(workspaceSyncBadgeClass("diverged")).toContain("amber");
    expect(workspaceSyncBadgeClass("unknown")).toContain("zinc");
  });

  it("shortens hashes without crashing on unknown endpoint data", () => {
    expect(shortWorkspaceHash("abcdef1234567890ff")).toBe("abcdef123456");
    expect(shortWorkspaceHash("abc")).toBe("abc");
    expect(shortWorkspaceHash("")).toBe("indisponivel");
    expect(shortWorkspaceHash(null)).toBe("indisponivel");
  });
});
