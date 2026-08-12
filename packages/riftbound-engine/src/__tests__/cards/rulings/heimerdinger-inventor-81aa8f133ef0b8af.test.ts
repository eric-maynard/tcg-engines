/**
 * Ruling 81aa8f133ef0b8af — Heimerdinger, Inventor (OGN-111 → ogn-111-298) · Unit · Mind · [3][mind] · 3 Might
 *     "I have all [Exhaust] abilities of all friendly legends, units, and gear."
 *   Sources used: Unforgiven (ogn-259-298) legend "[2], [Exhaust]: Move a friendly unit to or from its base."
 *                Iron Ballista (ogn-017-298) gear "[Exhaust]: Deal 2 to a unit at a battlefield."
 *                Lee Sin, Ascetic (ogn-078-298) unit "[Exhaust]: Buff me."
 *
 * Q: When you exhaust Heimerdinger, do all the copied [Exhaust] abilities activate, or only one?
 * A: Only one. He HAS each of those abilities; exhausting him is the cost of activating ONE of them, which you choose
 *    and whose other costs you also pay. Nothing else fires, and he cannot use another until he is readied.
 * Rules: 151 / 376–377 (activating an ability = choose it and pay all of its costs), Heimerdinger's static grant.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEIMERDINGER = "ogn-111-298";
const UNFORGIVEN = "ogn-259-298";
const IRON_BALLISTA = "ogn-017-298";
const LEE_SIN = "ogn-078-298";
const RIDE_THE_WIND = "ogn-173-298"; // [2][chaos] "Move a friendly unit and ready it." — to ready Heimerdinger again

/**
 * P1's turn with [6][chaos]. Heimerdinger ready in base; the donor unit and gear are already EXHAUSTED, so only
 * Heimerdinger's inherited copies can act. P1's Scout sits at P1's bf1; P2's Guard (4) holds bf2 as a Ballista target.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { chaos: 1 } })
    .legend(P1, UNFORGIVEN, "yasuo")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
    .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "base", HEIMERDINGER, "heimer")
    .unit(P1, "base", LEE_SIN, "lee", { exhausted: true })
    .gear(P1, IRON_BALLISTA, "ballista", { exhausted: true })
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Every donor card whose [Exhaust] ability Heimerdinger is currently offering a copy of. */
function heimerDonors(game: Game): string[] {
  const out = new Set<string>();
  for (const o of game.p1.legal()) {
    if (!/^activateAbility:heimer#\d+$/.test(o.key)) {
      continue;
    }
    for (const src of (o.fields.find((f) => f.name === "sourceCardId")?.options ?? []) as string[]) {
      out.add(String(src));
    }
  }
  return [...out].sort();
}

/** The ability index carrying a copy donated by `src`. */
function lineFor(game: Game, src: string): number {
  for (const o of game.p1.legal()) {
    const m = /^activateAbility:heimer#(\d+)$/.exec(o.key);
    if (m && ((o.fields.find((f) => f.name === "sourceCardId")?.options ?? []) as string[]).includes(src)) {
      return Number(m[1]);
    }
  }
  throw new Error(`no Heimerdinger line donated by ${src}`);
}

describe("Ruling 81aa8f133ef0b8af — exhausting Heimerdinger activates exactly ONE of the copied abilities", () => {
  test("he is offered a copy of every friendly [Exhaust] ability at once — legend, unit and gear — and none of them has fired by itself", async () => {
    const game = await board().build();
    expect(heimerDonors(game)).toEqual(["ballista", "lee", "yasuo"]);
    expect(game.state("guard").damage).toBe(0);
    expect(game.state("heimer")).toMatchObject({ isBuffed: false, isExhausted: false, might: 3 });
    expect(game.locationOf("scout")).toBe("bf1");
    expect(game.p1.energy()).toBe(6);
  });

  test("ruling 81aa8f133ef0b8af — taking the Ballista copy fires ONLY that one: the Guard takes 2, Lee Sin's buff never happens, the legend's move never happens", async () => {
    const game = await board().build();
    await game.p1.activate("heimer", lineFor(game, "ballista"), { source: "ballista", targets: "guard" });
    await game.settle();
    expect(game.state("heimer").isExhausted).toBe(true);
    expect(game.state("guard").damage).toBe(2);
    expect(game.state("heimer").isBuffed).toBe(false); // Lee Sin's "Buff me" was not also taken
    expect(game.locationOf("scout")).toBe("bf1"); // the legend's move was not also taken
    expect(game.p1.energy()).toBe(6); // the Ballista copy has no energy cost
    expect(heimerDonors(game)).toEqual([]); // exhausted ⇒ nothing more on offer from him
    expect(game.violations()).toEqual([]);
  });

  test("taking the legend copy instead pays THAT ability's other cost ([2]) as well, and only its effect happens", async () => {
    const game = await board().build();
    await game.p1.activate("heimer", lineFor(game, "yasuo"), { source: "yasuo", targets: "scout" });
    expect(game.p1.energy()).toBe(4); // the [2] of the copied legend ability
    await game.settle({ policy: "first" });
    expect(game.state("heimer").isExhausted).toBe(true);
    expect(game.locationOf("scout")).toBe("base");
    expect(game.state("guard").damage).toBe(0);
    expect(game.state("heimer").isBuffed).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("one per exhaustion — readying Heimerdinger with Ride the Wind puts the menu back and lets him take a second, different copy", async () => {
    const game = await board().build();
    await game.p1.activate("heimer", lineFor(game, "ballista"), { source: "ballista", targets: "guard" });
    await game.settle();
    expect(heimerDonors(game)).toEqual([]);
    await game.p1.cast("rtw", { targets: "heimer" });
    await game.settle({ policy: "first" });
    expect(game.state("heimer").isExhausted).toBe(false);
    expect(heimerDonors(game)).toEqual(["ballista", "lee", "yasuo"]);
    await game.p1.activate("heimer", lineFor(game, "lee"), { source: "lee" });
    await game.settle();
    expect(game.state("heimer")).toMatchObject({ isBuffed: true, isExhausted: true });
    expect(game.state("guard").damage).toBe(2); // still just the one Ballista shot
    expect(game.violations()).toEqual([]);
  });
});
