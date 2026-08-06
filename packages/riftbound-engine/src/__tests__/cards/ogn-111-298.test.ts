/**
 * Heimerdinger, Inventor — ogn-111-298 · Champion Unit · Mind · 3 energy · [mind] · 3 might
 *
 *   I have all [Exhaust] abilities of all friendly legends, units, and gear.
 *
 * The [Exhaust] cost is paid by exhausting Heimerdinger (he "has" the
 * ability); other cost components ([1], power…) are paid normally and the
 * source permanent is left untouched.
 *
 * Helpers used: Seal of Insight (gear, "[Exhaust]: [Reaction] — [Add] [mind]"),
 * Blind Monk (legend, "[1], [Exhaust]: Buff a friendly unit"), Arena Kingpin
 * (unit, "[Exhaust]: Give a unit +3 [Might] this turn"), Forge of the Future
 * (gear, non-exhaust "Kill this:" ability), Energy Conduit (enemy gear).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-111-298";
const SEAL_OF_INSIGHT = "ogn-120-298";
const BLIND_MONK = "ogn-257-298";
const ARENA_KINGPIN = "unl-001-219";
const FORGE = "ogn-212-298";
const ENERGY_CONDUIT = "ogn-098-298";

function board(heimerExhausted = false) {
  return scenario()
    .resources(P1, { energy: 2 })
    .unit(P1, "base", CARD, "heimer", heimerExhausted ? { exhausted: true } : undefined)
    .gear(P1, SEAL_OF_INSIGHT, "seal")
    .legend(P1, BLIND_MONK, "monk")
    .unit(P1, "base", ARENA_KINGPIN, "kingpin")
    .gear(P1, FORGE, "forge")
    .gear(P2, ENERGY_CONDUIT, "conduit");
}

function heimerSources(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>): string[] {
  return game.p1
    .legal()
    .filter((o) => o.moveId === "activateAbility" && o.card === "heimer")
    .flatMap((o) => o.variants.map((v) => String(v.params.sourceCardId)));
}

describe("Heimerdinger, Inventor (ogn-111-298)", () => {
  test("costs 3 energy + 1 mind and enters the base exhausted as a 3-might unit", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { mind: 1 } }).hand(P1, CARD, "heimer").build();
    await game.p1.play("heimer", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("heimer")).toBe("base");
    expect(game.state("heimer").might).toBe(3);
    expect(game.state("heimer").isExhausted).toBe(true);
    const noPower = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "heimer").build();
    expect(noPower.p1.can("play", "heimer")).toBe(false);
  });

  test("friendly GEAR: uses Seal of Insight's [Exhaust] ability by exhausting himself — adds [mind], the Seal stays ready", async () => {
    const game = await board().build();
    await game.p1.activate("heimer", 0, { source: "seal" });
    await game.settle();
    expect(game.p1.power("mind")).toBe(1);
    expect(game.state("heimer").isExhausted).toBe(true);
    expect(game.state("seal").isExhausted).toBe(false);
  });

  test("friendly LEGEND: uses Blind Monk's '[1], [Exhaust]: Buff a friendly unit' — pays 1, exhausts himself, Monk stays ready", async () => {
    const game = await board().build();
    await game.p1.activate("heimer", 0, { source: "monk", targets: "kingpin" });
    expect(game.p1.energy()).toBe(1);
    expect(game.state("heimer").isExhausted).toBe(true);
    expect(game.state("monk").isExhausted).toBe(false);
    await game.settle();
    expect(game.state("kingpin").isBuffed).toBe(true);
    expect(game.state("kingpin").might).toBe(4); // 3 + buff
  });

  test("friendly UNIT: uses Arena Kingpin's '[Exhaust]: +3 Might this turn' on Kingpin — Kingpin stays ready", async () => {
    const game = await board().build();
    await game.p1.activate("heimer", 1, { source: "kingpin", targets: "kingpin" });
    expect(game.state("heimer").isExhausted).toBe(true);
    expect(game.state("kingpin").isExhausted).toBe(false);
    await game.settle();
    expect(game.state("kingpin").might).toBe(6); // 3 + 3
    await game.advanceTurn();
    expect(game.state("kingpin").might).toBe(3);
  });

  test("only [Exhaust] abilities and only FRIENDLY sources: no Forge 'Kill this:' and no enemy Energy Conduit", async () => {
    const game = await board().build();
    const sources = heimerSources(game);
    expect(sources).toEqual(expect.arrayContaining(["seal", "monk", "kingpin"]));
    expect(sources).not.toContain("forge");
    expect(sources).not.toContain("conduit");
  });

  test("the [Exhaust] cost is his own: an exhausted Heimerdinger cannot use any inherited ability", async () => {
    const game = await board(true).build();
    expect(heimerSources(game)).toEqual([]);
    const r = await game.p1.try((p) => p.activate("heimer", 0, { source: "seal" }));
    expect(r.ok).toBe(false);
    // The originals are still usable by their own permanents.
    expect(game.p1.can("activate", "seal")).toBe(true);
  });
});
