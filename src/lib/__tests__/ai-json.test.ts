import { describe, it, expect, vi } from "vitest";

// ai-json.server.ts reads AI_* env vars at module load — set them BEFORE the
// dynamic import so resolveConfig takes the env branch and never touches Supabase.
process.env.AI_API_KEY = "test-key";
process.env.AI_BASE_URL = "https://ai.test/v1";
process.env.AI_MODEL = "test-model";

describe("aiJson", () => {
  it("retries on provider timeout, then fails fast with 504 instead of hanging", async () => {
    const { aiJson } = await import("../ai-json.server");
    const timeoutError = Object.assign(
      new Error("The operation was aborted due to timeout"),
      { name: "TimeoutError" },
    );
    const fetchMock = vi.fn(async () => {
      throw timeoutError;
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const r = await aiJson({
        system: "s",
        user: "u",
        schema: {},
        name: "t",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.status).toBe(504);
        expect(r.error).toContain("took too long");
      }
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns parsed data when the provider answers", async () => {
    const { aiJson } = await import("../ai-json.server");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: JSON.stringify({ ok: 1 }) } }],
            }),
            { status: 200 },
          ),
      ),
    );
    try {
      const r = await aiJson({ system: "s", user: "u", schema: {}, name: "t" });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data).toEqual({ ok: 1 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
