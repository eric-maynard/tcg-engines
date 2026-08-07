/**
 * Overzealous Fan — sfd-128-221 · Unit · Chaos · 2 energy · 2 Might
 *
 *   When I defend, you may kill me to move an attacking unit to its base.
 *
 * Head-judge notes (the tricky spots this file covers):
 *   1. "kill me" is the COST of the triggered ability (204.3.a names this very card): the Fan must be
 *      killed to finalize the ability onto the chain — it is already in the trash while the opponent
 *      still holds priority over the trigger; declining costs nothing and combat proceeds normally.
 *   2. "an attacking unit" is exactly ONE unit with the Attacker designation in THIS combat: with two
 *      attackers the other one stays and the combat continues against whatever defenders remain.
 *   3. Sole defender + sole attacker + yes → nobody is left at the battlefield: no combat winner
 *      (466.3), no conquer point, and the empty battlefield becomes uncontrolled (323.6 / 190.4.c).
 *   4. Defend trigger only (383.4.f): the Fan ATTACKING, or sitting in base while a friend defends,
 *      never asks anything.
 *   5. The returned attacker really is back in its controller's base (still exhausted from its move)
 *      and takes no part in damage; the remaining fight uses only the units still there.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-128-221";

/** P2's turn; P1 holds bf1 with the Fan (+ optional buddy); P2 has the listed raiders in base. */
function defended(raiders: { alias: string; might: number }[], buddyMight?: number) {
  const b = scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "fan");
  if (buddyMight !== undefined) {
    b.unit(P1, "bf1", { might: buddyMight, name: "Buddy" }, "buddy");
  }
  for (const r of raiders) {
    b.unit(P2, "base", { might: r.might, name: r.alias }, r.alias);
  }
  return b;
}

describe("Overzealous Fan (sfd-128-221)", () => {
  test("registry payload: one optional self-defend trigger — killing self is the COST, the effect moves an ATTACKING unit to base", async () => {
    const game = await scenario().unit(P1, "base", CARD, "fan").build();
    expect(game.state("fan")).toMatchObject({ baseMight: 2, cardType: "unit", energyCost: 2, name: "Overzealous Fan" });
    expect(game.state("fan").powerCost).toEqual([]);
    const abilities = peekDefaultCardPool()?.get(CARD)?.abilities as Record<string, unknown>[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({ optional: true, trigger: { event: "defend", on: "self" }, type: "triggered" });
    // rule 204.3.a — "kill me to X" makes the kill the trigger's base cost, so it
    // rides on the opt-in (`pay-cost`) and only X is left in the effect body.
    expect(abilities[0]?.condition).toMatchObject({ cost: { kill: "self" }, type: "pay-cost" });
    expect(abilities[0]?.effect).toMatchObject({ target: { filter: { state: "attacking" }, type: "unit" }, to: "base", type: "move" });
  });

  test("cost: 2 energy, no power; enters base exhausted; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "fan").build();
    await game.p1.play("fan");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("fan")).toBe("base");
    expect(game.state("fan").isExhausted).toBe(true);
    const poor = await scenario().resources(P1, { energy: 1, power: { chaos: 2 } }).hand(P1, CARD, "fan").build();
    expect(poor.p1.can("play", "fan")).toBe(false);
  });

  test("when it defends the trigger goes on the chain and its controller (not the attacker) is asked 'you may'", async () => {
    const game = await defended([{ alias: "raider", might: 3 }]).build();
    await game.p2.move("raider", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.zoneOf("fan")).toBe("battlefield-bf1");
  });

  test("yes with two attackers: Fan dies, the CHOSEN attacker goes home, the other one conquers the now-empty battlefield", async () => {
    const game = await defended([
      { alias: "raider", might: 3 },
      { alias: "scout", might: 2 },
    ]).build();
    await game.p2.move(["raider", "scout"], "bf1");
    await game.p1.yes();
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const offered = (game.decision() as { options: { card?: string }[] }).options.map((o) => o.card);
    expect(offered.sort()).toEqual(["raider", "scout"]); // only attacking units — never the Fan's side
    await game.p1.pick("raider");
    await game.settle();
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("base");
    expect(game.state("raider")).toMatchObject({ controller: P2, damage: 0, isExhausted: true });
    expect(game.zoneOf("scout")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  test("yes, sole defender vs sole attacker: both gone → no winner, no point, battlefield left uncontrolled (466.3, 323.6)", async () => {
    const game = await defended([{ alias: "raider", might: 3 }]).build();
    await game.p2.move("raider", "bf1");
    await game.p1.yes();
    await game.settle(); // single legal target → auto-picked
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("base");
    expect(game.p2.points()).toBe(0);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("declining: nothing is paid, the Fan fights (2 vs 3) and dies, the attacker conquers", async () => {
    const game = await defended([{ alias: "raider", might: 3 }]).build();
    await game.p2.move("raider", "bf1");
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fan")).toBe("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  test("Fan + Buddy(3) defend vs Raider(5) + Scout(2): send Raider home → Scout 2 vs Buddy 3, Scout dies, P1 keeps the battlefield", async () => {
    const game = await defended(
      [
        { alias: "raider", might: 5 },
        { alias: "scout", might: 2 },
      ],
      3,
    ).build();
    await game.p2.move(["raider", "scout"], "bf1");
    await game.p1.yes();
    await game.settle();
    await game.p1.pick("raider");
    await game.settle();
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("base");
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("buddy")).toBe("battlefield-bf1");
    expect(game.state("buddy").damage).toBe(0); // took 2 (< 3), healed at end of combat
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("Fan + Buddy defend vs a single attacker: sending it home ends the combat with no damage dealt at all", async () => {
    const game = await defended([{ alias: "raider", might: 5 }], 1).build();
    await game.p2.move("raider", "bf1");
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("base");
    expect(game.zoneOf("buddy")).toBe("battlefield-bf1");
    expect(game.state("buddy").damage).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
  });

  test("negative space: the Fan ATTACKING is not 'defending' — no prompt, plain 2-vs-1 combat", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "fan")
      .unit(P2, "bf1", { might: 1, name: "Sentry" }, "sentry")
      .build();
    await game.p1.move("fan", "bf1");
    expect(game.chain()).toEqual([]);
    expect(game.decision()?.kind).toBe("action");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.locationOf("fan")).toBe("bf1");
    expect(game.p1.points()).toBe(1);
  });

  test("negative space: a Fan in base while a friend defends elsewhere does not trigger", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", CARD, "fan")
      .unit(P1, "bf1", { might: 1, name: "Buddy" }, "buddy")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.chain()).toEqual([]);
    expect(game.decision()?.kind).toBe("action");
    await game.settle();
    expect(game.zoneOf("fan")).toBe("base");
    expect(game.zoneOf("buddy")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bf1");
  });

  test("'kill me' is the ability's COST (204.3.a) — the Fan must already be in the trash once the ability is finalized, before anyone gets priority", async () => {
    // Expected: answering yes pays the cost → Fan in trash while its ability still sits on the chain
    // and P1/P2 get priority over it. Actual: the kill is executed as the first step of RESOLUTION,
    // so the Fan is still on bf1 (and could be removed in response, fizzling the whole thing).
    const game = await defended([{ alias: "raider", might: 3 }]).build();
    await game.p2.move("raider", "bf1");
    await game.p1.yes();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", triggered: true })]);
    expect(game.zoneOf("fan")).toBe("trash");
  });
});
