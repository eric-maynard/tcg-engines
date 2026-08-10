/**
 * Ruling 1113d1fe5253c35b — Teemo, Strategist (OGN-121 → ogn-121-298) · Champion Unit · Mind · [2][mind] · 2 Might
 *     "[Hidden] When I defend, choose an enemy unit here and reveal the top 5 cards of your Main Deck. Deal 1 to that unit
 *      for each card with [Hidden] revealed this way, then recycle the revealed cards."
 *
 * Q: Can the ability hit multiple units (e.g. tokens) if more than one [Hidden] card is revealed?
 * A: No. You choose exactly ONE enemy unit; it takes 1 per [Hidden] card revealed — all of it on that one unit.
 * Rules: 355.10 / 402.2 ("choose an enemy unit" = a single target chosen for the trigger), 383 (defend trigger).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEEMO_STRATEGIST = "ogn-121-298";
const ZHONYAS = "ogn-077-298"; // a [Hidden] card
const SKULKER = "ogn-175-298"; // not Hidden

type PickD = Extract<Decision, { kind: "pick" }>;

/**
 * P2's turn 3. P1 holds bf1 with Teemo (2) + Anchor (6). P1's deck top 5: Zhonya's, Zhonya's, Teemo (all [Hidden]) + 2 Skulkers
 * ⇒ 3 Hidden cards. P2 attacks with two 3-Might tokens-in-spirit, Fang and Claw.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", TEEMO_STRATEGIST, "teemo")
    .unit(P1, "bf1", { might: 6, name: "Anchor" }, "anchor")
    .unit(P2, "bf2", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 3, name: "Fang" }, "fang")
    .unit(P2, "base", { might: 3, name: "Claw" }, "claw")
    .deck(P1, [ZHONYAS, ZHONYAS, TEEMO_STRATEGIST, SKULKER, SKULKER, SKULKER], ["h1", "h2", "h3", "s1", "s2", "s3"]);
}

/** Fang + Claw attack bf1 together; returns at Teemo's target prompt. */
async function attackWithBoth(): Promise<{ game: Game; d: PickD }> {
  const game = await board().build();
  await game.p2.move(["fang", "claw"], "bf1");
  expect(game.state("teemo").combatRole).toBe("defender");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  return { d: d as PickD, game };
}

describe("Ruling 1113d1fe5253c35b — Teemo, Strategist chooses exactly one enemy unit, however many Hidden cards turn up", () => {
  test("the defend trigger asks P1 for ONE target (max 1) among the enemy units here: Fang | Claw", async () => {
    const { d } = await attackWithBoth();
    expect(d.max).toBe(1);
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["claw", "fang"]);
  });

  test("choosing Fang: 3 Hidden cards are revealed → Fang takes all 3 (and, at 3 Might, dies); Claw takes NOTHING; no second target is ever asked; the revealed cards are recycled", async () => {
    const { game } = await attackWithBoth();
    await game.p1.pick("fang");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P1, triggered: true })]);
    let extraTargetAsked = false;
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "claw")) {
        extraTargetAsked = true;
        break;
      } else {
        break;
      }
    }
    expect(extraTargetAsked).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fang")).toBe("trash"); // 3 damage on a 3-Might unit
    expect(game.state("claw")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    // top 5 recycled: s3 is now on top and the Hidden cards sit near the bottom
    expect(game.p1.deck()[0]).toBe("s3");
    expect(game.p1.hand()).toEqual([]);
  });

  test("choosing Claw instead puts all 3 on Claw and leaves Fang untouched — the damage is never split", async () => {
    const { game } = await attackWithBoth();
    await game.p1.pick("claw");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("claw")).toBe("trash");
    expect(game.state("fang")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    await game.settle();
    // combat: Fang (3) into Teemo 2 + Anchor 6 → Fang dies too; P1 holds bf1
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
