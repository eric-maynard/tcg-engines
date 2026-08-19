import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * [rule:ui-autopass-no-real-action] Auto-passing a window that offers nothing
 * real. The risk this carries is passing through a window the player wanted,
 * so the classification is tested directly rather than through the DOM.
 */
const src = readFileSync("apps/riftbound-app/public/js/gameplay/prepass.js", "utf8");
const api = new Function(
  `${src}; return { autopassDecide, hasRealAction, autopassDefaultForOpponent };`,
)() as {
  autopassDecide(o: Record<string, unknown>): boolean;
  hasRealAction(m: { moveId: string }[]): boolean;
  autopassDefaultForOpponent(k: string | null): boolean;
};

const PASS = { moveId: "passChainPriority" };
const base = { enabled: true, hasPass: true, moves: [PASS], pendingChoice: false };

describe("auto-pass classification", () => {
  test("a lone pass is nothing real", () => {
    expect(api.hasRealAction([PASS])).toBe(false);
  });

  test("tapping a rune is NOT a real action", () => {
    // The user's exact carve-out: resource plumbing never holds priority.
    expect(api.hasRealAction([PASS, { moveId: "exhaustRune" }])).toBe(false);
    expect(api.hasRealAction([PASS, { moveId: "recycleRune" }])).toBe(false);
    expect(api.hasRealAction([PASS, { moveId: "channelRunes" }])).toBe(false);
  });

  test("anything that changes the game IS real", () => {
    for (const moveId of [
      "playSpell",
      "playUnit",
      "activateAbility",
      "standardMove",
      "conquerBattlefield",
      "equipCard",
      "resolvePendingChoice",
      "revealHidden",
    ]) {
      expect(api.hasRealAction([PASS, { moveId }])).toBe(true);
    }
  });
});

describe("auto-pass decision", () => {
  test("passes a window with nothing real", () => {
    expect(api.autopassDecide(base)).toBe(true);
  });

  test("holds when a real action exists", () => {
    expect(api.autopassDecide({ ...base, moves: [PASS, { moveId: "playSpell" }] })).toBe(false);
  });

  test("holds when a rune tap is the only extra — but still passes", () => {
    // Trivial extras do not make a window worth stopping for.
    expect(api.autopassDecide({ ...base, moves: [PASS, { moveId: "exhaustRune" }] })).toBe(true);
  });

  test("never auto-answers a pending choice", () => {
    // A prompt is a question addressed to the player, even if pass is the only
    // listed move.
    expect(api.autopassDecide({ ...base, pendingChoice: true })).toBe(false);
  });

  test("does nothing when disabled", () => {
    expect(api.autopassDecide({ ...base, enabled: false })).toBe(false);
  });

  test("does nothing when the seat has no priority", () => {
    expect(api.autopassDecide({ ...base, hasPass: false })).toBe(false);
  });
});

describe("default per opponent", () => {
  test("on against Claude and the goldfish", () => {
    expect(api.autopassDefaultForOpponent("claude")).toBe(true);
    expect(api.autopassDefaultForOpponent("goldfish")).toBe(true);
  });

  test("off against a person", () => {
    expect(api.autopassDefaultForOpponent("human")).toBe(false);
    expect(api.autopassDefaultForOpponent(null)).toBe(false);
  });
});
