/**
 * Ruling c216c5d074f021a0 — Wind Wall (OGN-064 → ogn-064-298) · Spell · Calm · 3+[calm][calm] · Reaction "Counter a spell."
 *   × Get Excited! (OGN-008 → ogn-008-298) · Spell · Fury · 2+[fury] · Action "Discard 1. Deal its Energy cost as damage
 *     to a unit at a battlefield."
 *   × Bullet Time (OGN-268 → ogn-268-298) · Spell · 1 · Action "Pay any amount of [rainbow] to deal that much damage to
 *     all enemy units at a battlefield."
 *
 * Q: When a spell gets countered by a Reaction like Wind Wall, when are the costs paid?
 * A: Energy/Power costs are paid as each card is put on the chain (declare → pay → opponent reacts → they pay → chain
 *    resolves); a countered spell's costs stay paid and both cards end in the trash. Costs written INTO the effect (Get
 *    Excited's discard, Bullet Time's power) are paid on resolution, so a countered spell never pays them. A countered
 *    card is not considered "played".
 * Rules: 354–357 (costs paid at finalization), 425.1 / 425.1.c (countered: no effect, no refund), 204.3.b (pay-X on
 *        resolution), 724 (Legion reads cards played).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WIND_WALL = "ogn-064-298";
const GET_EXCITED = "ogn-008-298";
const BULLET_TIME = "ogn-268-298";
const VANGUARD_CAPTAIN = "ogn-218-298"; // 3+[order] · "[Legion] — When you play me, play two 1 Might Recruit unit tokens here."
const FODDER = { cardType: "unit", energyCost: 4, might: 4, name: "Fodder" } as const;

/** P1's turn. P2 holds bf1 with a 5-Might Target and has Wind Wall with exactly 3+[calm][calm]. */
function base() {
  return scenario()
    .resources(P2, { energy: 3, power: { calm: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Target" }, "target")
    .hand(P2, WIND_WALL, "ww");
}

describe("Ruling c216c5d074f021a0 — costs are paid as cards enter the chain; effect-embedded costs only on resolution", () => {
  test("Get Excited: P1 pays 2+[fury] the moment it goes on the chain (the discard has NOT happened); Wind Wall's 3+[calm][calm] is likewise paid as P2 adds it", async () => {
    const game = await base().resources(P1, { energy: 2, power: { fury: 1 } }).hand(P1, GET_EXCITED, "ge").hand(P1, FODDER, "fodder").build();
    await game.p1.cast("ge", { targets: "target" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // paid now
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ge", controller: P1, targets: ["target"] })]);
    expect(game.p1.hand()).toEqual(["fodder"]); // "Discard 1" is part of the effect — not yet
    await game.p1.passPriority();
    expect(game.p2.can("cast", "ww")).toBe(true);
    await game.p2.cast("ww", { targets: "ge" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } }); // paid now, too
    expect(game.chain().map((c) => c.cardId)).toEqual(["ge", "ww"]);
  });

  test("the chain resolves: Wind Wall counters Get Excited — both cards in the trash, no damage, Fodder never discarded (resolution-time cost skipped), and nobody gets anything back", async () => {
    const game = await base().resources(P1, { energy: 2, power: { fury: 1 } }).hand(P1, GET_EXCITED, "ge").hand(P1, FODDER, "fodder").build();
    await game.p1.cast("ge", { targets: "target" });
    await game.p1.passPriority();
    await game.p2.cast("ww", { targets: "ge" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.zoneOf("ge")).toBe("trash");
    expect(game.state("target").damage).toBe(0);
    expect(game.zoneOf("fodder")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control — uncountered Get Excited pays its discard ON RESOLUTION: Fodder (cost 4) is discarded then and Target takes 4", async () => {
    const game = await base().resources(P1, { energy: 2, power: { fury: 1 } }).hand(P1, GET_EXCITED, "ge").hand(P1, FODDER, "fodder").build();
    await game.p1.cast("ge", { targets: "target" });
    expect(game.zoneOf("fodder")).toBe("hand");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("fodder");
      await game.settle();
    }
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.state("target").damage).toBe(4);
  });

  test("Bullet Time: only its [1] is paid on cast; the 'pay any amount of [rainbow]' is asked on RESOLUTION — so when Wind Wall counters it P1 is never asked and keeps all 3 power; uncountered, the pay-X prompt appears at resolution", async () => {
    const countered = await base().resources(P1, { energy: 1, power: { body: 3 } }).hand(P1, BULLET_TIME, "bt").build();
    await countered.p1.cast("bt");
    expect(countered.p1.resources()).toEqual({ energy: 0, power: { body: 3 } });
    await countered.p1.passPriority();
    await countered.p2.cast("ww", { targets: "bt" });
    let askedX = false;
    countered.script(P1, [(d) => ((askedX ||= d.kind === "integer"), undefined)]);
    await countered.settle();
    expect(askedX).toBe(false);
    expect(countered.zoneOf("bt")).toBe("trash");
    expect(countered.p1.resources()).toEqual({ energy: 0, power: { body: 3 } });
    expect(countered.state("target").damage).toBe(0);

    const resolved = await base().resources(P1, { energy: 1, power: { body: 3 } }).hand(P1, BULLET_TIME, "bt").build();
    await resolved.p1.cast("bt");
    const stop = await resolved.settle();
    expect(stop.reason).toBe("unanswered");
    expect(resolved.decision()).toMatchObject({ kind: "integer", seat: P1, timing: "RES", source: { cardId: "bt" } });
    await resolved.p1.chooseX(2);
    await resolved.settle({ policy: "first" });
    expect(resolved.p1.power("body")).toBe(1);
    expect(resolved.state("target").damage).toBe(2);
  });

  // The ruling's "a countered card is not considered played" is rule 425.1.b, which is scoped to abilities that
  // TRIGGER on cards being played (419.4.a.1). Non-triggered checks — Legion among them — read FINALIZATION instead:
  // rule 419.4.b spells this out with the Defy example, and rule 812.1.c defines Legion off "Finalized by you this
  // turn". So the countered Get Excited stays on P1's played tally and the next Vanguard Captain does get Legion.
  // (Its ORDINAL is voided for "when you play your Nth card" triggers — see darius-trifarian-5807cc9df8627167.)
  // rule 419.4.b: countered spell still counts for non-triggered "have you played a card" checks.
  test("ruling c216c5d074f021a0 — a countered spell is still Finalized, so Legion is on afterwards (419.4.b), even though it never 'triggers' a played-card ability (425.1.b)", async () => {
    const game = await base()
      .resources(P1, { energy: 5, power: { fury: 1, order: 1 } })
      .hand(P1, GET_EXCITED, "ge")
      .hand(P1, FODDER, "fodder")
      .hand(P1, VANGUARD_CAPTAIN, "captain")
      .build();
    await game.p1.cast("ge", { targets: "target" });
    await game.p1.passPriority();
    await game.p2.cast("ww", { targets: "ge" });
    await game.settle();
    expect(game.zoneOf("ge")).toBe("trash");
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(1); // finalized, then countered — the tally stands
    await game.p1.play("captain");
    await game.settle();
    expect(game.zoneOf("captain")).toBe("base");
    const names = game.p1.units("base").map((id) => game.state(id).name).sort();
    expect(names.filter((n) => n === "Recruit")).toHaveLength(2); // Legion was on
    expect(names).toHaveLength(3);
  });
});
