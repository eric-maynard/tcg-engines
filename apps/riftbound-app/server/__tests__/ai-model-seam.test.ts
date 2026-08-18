import { describe, expect, test } from "bun:test";

/**
 * The model list is a host seam, and this repo names no internal models.
 *
 * Two properties matter and neither is obvious from reading the code once:
 * the host can ADD a model without patching this file, and a malformed or
 * hostile value costs at most a menu row rather than the server.
 */

async function withEnv<T>(value: string | undefined, fn: (m: typeof import("../ai-opponent")) => T): Promise<T> {
  const prev = process.env.RB_AI_EXTRA_MODELS;
  if (value === undefined) {
    delete process.env.RB_AI_EXTRA_MODELS;
  } else {
    process.env.RB_AI_EXTRA_MODELS = value;
  }
  try {
    // Fresh module instance: AI_MODELS is computed once at import.
    const mod = (await import(`../ai-opponent?seam=${Math.random()}`)) as typeof import("../ai-opponent");
    return fn(mod);
  } finally {
    if (prev === undefined) {
      delete process.env.RB_AI_EXTRA_MODELS;
    } else {
      process.env.RB_AI_EXTRA_MODELS = prev;
    }
  }
}

describe("RB_AI_EXTRA_MODELS seam", () => {
  test("this repo ships only public Claude models", async () => {
    await withEnv(undefined, (m) => {
      const ids = Object.values(m.AI_MODELS).map((e) => e.id);
      expect(ids.every((id) => id.startsWith("claude-"))).toBe(true);
      expect(Object.keys(m.AI_MODELS).sort()).toEqual(["haiku", "opus", "sonnet"]);
    });
  });

  test("the host can add a model without patching this file", async () => {
    await withEnv('[{"key":"extra","id":"some-model-id","label":"Extra","short":"X"}]', (m) => {
      expect(m.resolveModel("extra")?.id).toBe("some-model-id");
      expect(m.listModels().map((x) => x.key)).toEqual(["haiku", "sonnet", "opus", "extra"]);
    });
  });

  test("built-ins keep their order; added models follow", async () => {
    await withEnv('[{"key":"aaa","id":"z","label":"A","short":"A"}]', (m) => {
      expect(m.listModels()[0]?.key).toBe("haiku");
      expect(m.listModels().at(-1)?.key).toBe("aaa");
    });
  });

  test("a built-in cannot be silently repointed", async () => {
    await withEnv('[{"key":"opus","id":"not-opus","label":"Nope","short":"N"}]', (m) => {
      expect(m.resolveModel("opus")?.id).toBe("claude-opus-5");
    });
  });

  test("malformed JSON costs a menu row, not the server", async () => {
    await withEnv("{not json", (m) => {
      expect(Object.keys(m.AI_MODELS).sort()).toEqual(["haiku", "opus", "sonnet"]);
    });
  });

  test("entries missing required fields are dropped individually", async () => {
    await withEnv('[{"key":"ok","id":"i","label":"L"},{"key":"bad"}]', (m) => {
      expect(m.resolveModel("ok")?.id).toBe("i");
      expect(m.resolveModel("bad")).toBeUndefined();
    });
  });

  test("an unknown key is still refused", async () => {
    await withEnv('[{"key":"ok","id":"i","label":"L"}]', (m) => {
      expect(m.resolveModel("gpt-4")).toBeUndefined();
      expect(m.resolveModel("claude-sonnet-5")).toBeUndefined();
    });
  });
});
