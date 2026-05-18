import { describe, expect, it } from "vitest";

import type { SkillIntegration } from "@/api/integrations";
import {
  createIntegrationDraft,
  setDraftSecret,
  setDraftSecretCleared,
  setDraftValue,
} from "@/lib/integrations";

const integration: SkillIntegration = {
  skill_name: "agenda",
  title: "Agenda",
  active: true,
  configured: false,
  status: "pending",
  values: { api_url: "https://api.example.com" },
  secrets: { api_token: true },
  fields: [
    { key: "api_url", label: "URL", type: "url", required: true },
    { key: "notify", label: "Notify", type: "boolean" },
    { key: "channels", label: "Channels", type: "multiselect", options: [{ value: "sms", label: "SMS" }] },
  ],
};

describe("integration form helpers", () => {
  it("creates a draft without leaking existing secret values", () => {
    const draft = createIntegrationDraft(integration);

    expect(draft.values.api_url).toBe("https://api.example.com");
    expect(draft.secrets).toEqual({});
    expect(draft.clear_secrets).toEqual([]);
  });

  it("tracks secret replacement and explicit clearing", () => {
    let draft = createIntegrationDraft(integration);
    draft = setDraftSecret(draft, "api_token", "new-token");
    expect(draft.secrets.api_token).toBe("new-token");
    expect(draft.clear_secrets).toEqual([]);

    draft = setDraftSecretCleared(draft, "api_token", true);
    expect(draft.secrets.api_token).toBeUndefined();
    expect(draft.clear_secrets).toEqual(["api_token"]);

    draft = setDraftSecretCleared(draft, "api_token", false);
    expect(draft.clear_secrets).toEqual([]);
  });

  it("normalizes boolean and multiselect draft values", () => {
    let draft = createIntegrationDraft(integration);
    draft = setDraftValue(draft, integration.fields![1], true);
    draft = setDraftValue(draft, integration.fields![2], ["sms"]);

    expect(draft.values.notify).toBe(true);
    expect(draft.values.channels).toEqual(["sms"]);
  });
});
