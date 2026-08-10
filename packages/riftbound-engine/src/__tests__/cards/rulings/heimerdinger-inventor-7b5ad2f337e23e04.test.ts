/**
 * Ruling 7b5ad2f337e23e04 — Heimerdinger, Inventor (OGN-111 → ogn-111-298) · 3+[mind] · 3 Might "I have all [Exhaust] abilities of
 *     all friendly legends, units, and gear."
 *   × Iron Ballista (OGN-017 → ogn-017-298) · Gear "[Exhaust]: Deal 2 to a unit at a battlefield."
 *   × Energy Conduit (OGN-098 → ogn-098-298) · Gear "[Exhaust]: [Reaction] — [Add] [1]."
 *
 * Q: With both artifacts out, can Heimerdinger use ALL their abilities when he exhausts, or only one?
 * A: Only one. He has each ability as a separate line, each with its own [Exhaust] cost; exhausting him pays for exactly one of
 *    them, so he must choose which single ability to use.
 * Rules: 366 (activated abilities; every cost paid per activation), 414.1.b (an exhausted permanent can't be exhausted again).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HEIMERDINGER = "ogn-111-298";
const IRON_BALLISTA = "ogn-017-298";
const ENERGY_CONDUIT = "ogn-098-298";

/** Both gear already exhausted so the only live copies of their abilities are Heimerdinger's inherited ones. P2's Guard (4) at bf1. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "base", HEIMERDINGER, "heimer")
    .gear(P1, IRON_BALLISTA, "ballista", { exhausted: true })
    .gear(P1, ENERGY_CONDUIT, "conduit", { exhausted: true });
}

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Heimerdinger's inherited abilities currently on offer: ability index → source gear. */
function heimerAbilities(game: Game): Record<number, string> {
  const out: Record<number, string> = {};
  for (const o of game.p1.legal()) {
    const m = /^activateAbility:heimer#(\d+)$/.exec(o.key);
    if (m) {
      const src = o.fields.find((f) => f.name === "sourceCardId")?.options?.[0];
      out[Number(m[1])] = String(src);
    }
  }
  return out;
}

describe("Ruling 7b5ad2f337e23e04 — Heimerdinger picks ONE inherited [Exhaust] ability per exhaust, not all of them", () => {
  test("ready Heimerdinger offers the Ballista ability and the Conduit ability as two SEPARATE activations (separate lines, not one combined effect)", async () => {
    const game = await board().build();
    expect(game.state("heimer").isExhausted).toBe(false);
    const offered = heimerAbilities(game);
    expect(Object.values(offered).toSorted()).toEqual(["ballista", "conduit"]);
    expect(Object.keys(offered)).toHaveLength(2);
  });

  test("choosing the Ballista line: Heimerdinger exhausts, the Guard takes 2 — and NO energy was added (the Conduit line did not also happen)", async () => {
    const game = await board().build();
    const offered = heimerAbilities(game);
    const ballistaIdx = Number(Object.entries(offered).find(([, src]) => src === "ballista")?.[0]);
    await game.p1.activate("heimer", ballistaIdx, { answers: ["guard"] });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("guard");
    }
    await game.settle();
    expect(game.state("heimer").isExhausted).toBe(true);
    expect(game.state("guard").damage).toBe(2);
    expect(game.p1.energy()).toBe(0);
    // Exhausted: neither inherited ability can be used again — one exhaust bought one ability.
    expect(heimerAbilities(game)).toEqual({});
    expect(game.p1.can("activate", "heimer")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("choosing the Conduit line instead: Heimerdinger exhausts and P1 gets [1] — and the Guard takes NOTHING; the Ballista line is no longer available", async () => {
    const game = await board().build();
    const offered = heimerAbilities(game);
    const conduitIdx = Number(Object.entries(offered).find(([, src]) => src === "conduit")?.[0]);
    await game.p1.activate("heimer", conduitIdx);
    await game.settle();
    expect(game.state("heimer").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(1);
    expect(game.state("guard").damage).toBe(0);
    expect(heimerAbilities(game)).toEqual({});
    const r = await game.p1.try((p) => p.activate("heimer", Number(Object.entries(offered).find(([, src]) => src === "ballista")?.[0])));
    expect(r.ok).toBe(false);
    expect(game.state("guard").damage).toBe(0);
  });
});
