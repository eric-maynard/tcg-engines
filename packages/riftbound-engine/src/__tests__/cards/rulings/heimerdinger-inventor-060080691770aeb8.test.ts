/**
 * Ruling 060080691770aeb8 — Heimerdinger, Inventor (OGN-111 → ogn-111-298) · Unit · Mind · [3][mind] · 3 Might
 *     "I have all [Exhaust] abilities of all friendly legends, units, and gear."
 *   Sources used: Iron Ballista (ogn-017-298) "[Exhaust]: Deal 2 to a unit at a battlefield." and The Syren (ogn-184-298)
 *   "[1], [Exhaust]: Move a friendly unit at a battlefield to its base."
 *
 * Q: When exhausted, does Heimerdinger fire ALL the exhaust abilities of your cards at once, or does he gain them and you
 *    pick one to activate?
 * A: He HAS each ability (the abilities themselves, not their effects); you choose ONE to activate per exhaustion, and you
 *    still pay that ability's other costs (energy/power).
 * Rules: 151 / 376–377 (activated abilities: choose one, pay all its costs incl. [Exhaust]), Heimerdinger's static grant.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HEIMERDINGER = "ogn-111-298";
const IRON_BALLISTA = "ogn-017-298";
const THE_SYREN = "ogn-184-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn with `energy`. Heimerdinger READY in base; both gear already EXHAUSTED so only Heimerdinger's inherited copies
 * are live. P1's Scout (2) at P1's bf1 (something for the Syren line to move); P2's Guard (4) at bf2 (a Ballista target).
 */
function board(energy: number) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
    .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "base", HEIMERDINGER, "heimer")
    .gear(P1, IRON_BALLISTA, "ballista", { exhausted: true })
    .gear(P1, THE_SYREN, "syren", { exhausted: true });
}

/** Heimerdinger's inherited abilities currently on offer: ability index → source gear. */
function heimerLines(game: Game): Record<number, string> {
  const out: Record<number, string> = {};
  for (const o of game.p1.legal()) {
    const m = /^activateAbility:heimer#(\d+)$/.exec(o.key);
    if (m) {
      out[Number(m[1])] = String(o.fields.find((f) => f.name === "sourceCardId")?.options?.[0]);
    }
  }
  return out;
}

const lineFrom = (game: Game, src: string) => Number(Object.entries(heimerLines(game)).find(([, s]) => s === src)?.[0]);

describe("Ruling 060080691770aeb8 — Heimerdinger has each [Exhaust] ability separately; one is chosen (and fully paid) per exhaust", () => {
  test("he GAINS the abilities: a ready Heimerdinger with [1] offers the Ballista line and the Syren line as two separate activations — and nothing happens by itself", async () => {
    const game = await board(1).build();
    expect(Object.values(heimerLines(game)).sort()).toEqual(["ballista", "syren"]);
    expect(game.state("guard").damage).toBe(0);
    expect(game.locationOf("scout")).toBe("bf1");
    expect(game.state("heimer").isExhausted).toBe(false);
  });

  test("choosing the Ballista line: Heimerdinger exhausts, the Guard takes 2 — the Syren line did NOT also happen (Scout unmoved, the [1] unspent) and no line is left to use", async () => {
    const game = await board(1).build();
    await game.p1.activate("heimer", lineFrom(game, "ballista"), { answers: ["guard"] });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("guard");
    }
    await game.settle();
    expect(game.state("heimer").isExhausted).toBe(true);
    expect(game.state("guard").damage).toBe(2);
    expect(game.locationOf("scout")).toBe("bf1");
    expect(game.p1.energy()).toBe(1);
    expect(heimerLines(game)).toEqual({});
    expect(game.violations()).toEqual([]);
  });

  test("choosing the Syren line instead: its OTHER cost is still paid — [1] spent — Heimerdinger exhausts, the Scout is moved to base, and the Guard takes nothing", async () => {
    const game = await board(1).build();
    await game.p1.activate("heimer", lineFrom(game, "syren"), { answers: ["scout"] });
    expect(game.p1.energy()).toBe(0); // paid on activation
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("scout");
    }
    await game.settle();
    expect(game.state("heimer").isExhausted).toBe(true);
    expect(game.locationOf("scout")).toBe("base");
    expect(game.state("guard").damage).toBe(0);
    expect(heimerLines(game)).toEqual({});
  });

  test("costs are per ability: with [0] the Syren line ([1], [Exhaust]) is NOT offered on Heimerdinger while the cost-free Ballista line still is", async () => {
    const game = await board(0).build();
    expect(Object.values(heimerLines(game))).toEqual(["ballista"]);
  });
});
