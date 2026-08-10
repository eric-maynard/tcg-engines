/**
 * Ruling 3afdd2605714ddbd — Icathian Rain (OGN-248 → ogn-248-298) · Spell · Fury/Mind · [7]+[rainbow]×3
 *     "Deal 2 to a unit." ×6
 *   × The Boss (Sett legend, OGN-269 → ogn-269-298) "If a buffed unit you control would die, you may pay [rainbow],
 *     exhaust me, and spend its buff to heal it, exhaust it, and recall it instead."
 *
 * Q: Icathian Rain deals lethal to a unit under Sett's protection partway through. Does the protection apply right
 *    then, and can the remaining instances still hit and kill the recalled, healed unit?
 * A: All six targets are chosen up front. The instances are dealt one at a time; when the 3rd makes the damage lethal
 *    the Boss replacement applies (heal, exhaust, recall to base). The remaining three instances still resolve against
 *    that unit and kill it again if they add up to lethal.
 * Rules: 355 (all choices made as the spell is played), 359.3 (instructions executed in order), 370–371 (a "would
 *        die" replacement applies at the moment of the death event), 359.3.f (the unit is tracked, not its location).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ICATHIAN_RAIN = "ogn-248-298";
const THE_BOSS = "ogn-269-298";

/**
 * P1's turn with exactly [7] + 3 rainbow. P2's legend is The Boss (ready) with 1 body in P2's pool; P2's BUFFED Brawler
 * (printed `might`, +1 buff) stands at P2's bf1.
 */
function board(might: number) {
  return scenario()
    .resources(P1, { energy: 7, power: { rainbow: 3 } })
    .resources(P2, { power: { body: 1 } })
    .legend(P2, THE_BOSS, "boss")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might, name: "Brawler" }, "brawler", { buffed: true })
    .hand(P1, ICATHIAN_RAIN, "rain");
}

const SIX = ["brawler", "brawler", "brawler", "brawler", "brawler", "brawler"] as const;
const isBossOffer = (d: Decision | null) => d?.kind === "yes-no" && d.seat === P2;

/** Cast all six instances at the Brawler and pass priority around until the Boss offer (or the end). */
async function rainAllSixUntilOffer(game: Game): Promise<void> {
  await game.p1.cast("rain", { targets: [...SIX] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rain", targets: [...SIX] })]); // all 6 chosen at once
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(isBossOffer(game.decision())).toBe(true);
}

describe("Ruling 3afdd2605714ddbd — Sett's save applies mid-Rain at the lethal instance; the remaining instances can kill the unit again", () => {
  // Expected: each "Deal 2 to a unit." is its own instruction; the would-die replacement is offered when the 3rd one
  // makes the damage lethal (6 on a 5-Might unit), with instances 4–6 still to come.
  // Actual: the engine deals all six instances (12) first and only then evaluates the death once — the Boss save
  // therefore wipes ALL the damage and nothing is left to re-kill the unit.
  test("ruling 3afdd2605714ddbd — engine deals all 12 before checking death; 4+1-Might buffed Brawler: the Boss offer appears at the 3rd instance (6 ≥ 5) — BEFORE the rest is dealt: Brawler still at bf1 with exactly 6 damage, Rain still resolving", async () => {
    const game = await board(4).build();
    expect(game.state("brawler")).toMatchObject({ isBuffed: true, might: 5 });
    await rainAllSixUntilOffer(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    expect(game.state("brawler")).toMatchObject({ damage: 6, location: "bf1" }); // 3 of 6 instances so far
    expect(game.zoneOf("rain")).not.toBe("trash");
  });

  test("ruling 3afdd2605714ddbd — engine's single post-hoc save leaves the Brawler alive in base; P2 accepts: [rainbow] paid, Boss exhausted, buff spent, Brawler healed/exhausted/recalled — then instances 4–6 deal 6 to the now-4-Might Brawler in base and it DIES anyway", async () => {
    const game = await board(4).build();
    await rainAllSixUntilOffer(game);
    await game.p2.yes();
    await game.settle();
    expect(game.p2.power("body")).toBe(0);
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.zoneOf("rain")).toBe("trash");
    expect(game.zoneOf("brawler")).toBe("trash"); // 2+2+2 = 6 ≥ 4 after the save
    expect(game.p2.units()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("ruling 3afdd2605714ddbd — engine saves after all 12 (0 damage left); 'if the damage is sufficient': a 6+1-Might Brawler goes lethal only at the 4th instance (8 ≥ 7); after the save the last two instances deal just 4 < 6 — it SURVIVES in base, exhausted, unbuffed, with 4 damage", async () => {
    const game = await board(6).build();
    expect(game.state("brawler").might).toBe(7);
    await rainAllSixUntilOffer(game);
    expect(game.state("brawler")).toMatchObject({ damage: 8, location: "bf1" }); // instances 1–4
    await game.p2.yes();
    await game.settle();
    expect(game.zoneOf("rain")).toBe("trash");
    expect(game.zoneOf("brawler")).toBe("base");
    expect(game.state("brawler")).toMatchObject({ damage: 4, isBuffed: false, isExhausted: true, might: 6 });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p2.power("body")).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — P2 declines the save: the Brawler simply dies to the Rain; Boss stays ready and the power is kept", async () => {
    const game = await board(4).build();
    await rainAllSixUntilOffer(game);
    await game.p2.no();
    await game.settle();
    expect(game.zoneOf("brawler")).toBe("trash");
    expect(game.state("boss").isReady).toBe(true);
    expect(game.p2.power("body")).toBe(1);
  });
});
