import { describe, expect, test } from "vitest";
import {
  advertisedOptions,
  DEFAULT_AGENT_PROFILES,
  isRunnableProfile,
  type AgentProfile,
} from "./profiles";

describe("ACP profile capabilities", () => {
  test("preserves opaque advertised option IDs", () => {
    const profile = { lastCapabilitySnapshot: { raw: { session: { configOptions: [{ id: "vendor/model:alpha", category: "model" }] } } } } as unknown as AgentProfile;
    expect(advertisedOptions(profile)).toEqual([{ id: "vendor/model:alpha", category: "model" }]);
  });
  test("does not invent unsupported controls", () => {
    expect(advertisedOptions({} as AgentProfile)).toEqual([]);
  });
});

describe("runnable agent profiles", () => {
  test("always exposes native Codex as the stable fallback", () => {
    expect(DEFAULT_AGENT_PROFILES).toEqual([
      expect.objectContaining({
        backendKind: "codex-app-server",
        experimental: false,
        id: "codex-native",
      }),
    ]);
  });

  test("does not advertise unimplemented ACP profiles as runnable", () => {
    expect(isRunnableProfile(DEFAULT_AGENT_PROFILES[0])).toBe(true);
    expect(
      isRunnableProfile({ backendKind: "acp-v1" } as AgentProfile),
    ).toBe(false);
  });
});
