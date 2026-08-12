/**
 * Ruling 4fcf1f07fd63ed8e — Back Off (UNL-042 → unl-042-219) · Calm · [3] · [Hidden] [Action]
 *   "[Stun] a unit. If you played this from your hand, draw 1."
 *
 * Q: Can I use a Back Off hidden at ONE battlefield to stun a unit moving into a DIFFERENT battlefield?
 * A: No. A card played from Hidden may only choose targets from among the options at the battlefield where
 *    it was hidden, unless its own text contains a targeting restriction making that impossible. Back Off
 *    just says "[Stun] a unit", so it is locked to its own battlefield — it cannot reach the unit that moved
 *    in elsewhere.
 * Rules: 811.1.d.2 (targets of a card played from Hidden are limited to that battlefield), 423 ([Stun]).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BACK_OFF = "unl-042-219";

/**
 * Turn 3, P1's turn. P2 holds bf1 (Guard) and bf2 (Sentry + P1's Intruder) and hid a Back Off at EACH.
 * P1 attacks bf1 with a Raider.
 */
function board() {
  return scenario()
    .turn(3)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "bf2", { might: 2, name: "Sentry" }, "sentry")
    .unit(P1, "bf2", { might: 2, name: "Intruder" }, "intruder")
    .facedown(P2, "bf2", BACK_OFF, "far")
    .facedown(P2, "bf1", BACK_OFF, "near")
    .unit(P1, "base", { might: 5, name: "Raider" }, "raider");
}

const offered = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []);

/** P1 moves the Raider into bf1; pass Focus around until P2 may act. */
async function raiderAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  for (let i = 0; i < 4 && game.actingSeat() !== P2; i++) {
    await game.acting().pass();
  }
  expect(game.actingSeat()).toBe(P2);
  return game;
}

describe("Ruling 4fcf1f07fd63ed8e — a hidden Back Off cannot reach a unit at another battlefield", () => {
  test("ruling: the Back Off hidden at bf2 may only choose among bf2's units — the Raider that moved into bf1 is not offered", async () => {
    const game = await raiderAttacks();
    await game.p2.reveal("far");
    const d = game.decision();
    expect(offered(d)).toEqual(["intruder", "sentry"]);
    expect(offered(d)).not.toContain("raider");
    expect(offered(d)).not.toContain("guard");
    expect((await game.p2.try((p) => p.pick("raider"))).ok).toBe(false);
  });

  test("it can only stun something at its own battlefield: P2 is forced to spend it on a unit at bf2", async () => {
    const game = await raiderAttacks();
    await game.p2.reveal("far");
    await game.p2.pick("intruder");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "far", controller: P2, targets: ["intruder"] })]);
    for (let i = 0; i < 4 && game.chain().length > 0 && game.decision()?.kind === "action"; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("intruder").isStunned).toBe(true);
    expect(game.state("raider").isStunned).toBe(false);
    expect(game.p2.hand()).toEqual([]); // played from Hidden, not from hand: no draw
  });

  test("contrast — the Back Off hidden AT bf1 (where the move happened) does reach the incoming Raider", async () => {
    const game = await raiderAttacks();
    await game.p2.reveal("near");
    const d = game.decision();
    expect(offered(d)).toEqual(["guard", "raider"]);
    await game.p2.pick("raider");
    await game.settle();
    expect(game.state("raider").isStunned).toBe(true);
    // A stunned 5-Might Raider deals no combat damage, so the 3-Might Guard survives and keeps bf1.
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("control — the same card cast from HAND on P2's own turn may stun a unit anywhere", async () => {
    const game = await scenario()
      .turn(4)
      .active(P2)
      .resources(P2, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
      .unit(P1, "bf2", { might: 2, name: "Far" }, "far")
      .hand(P2, BACK_OFF, "backoff")
      .build();
    const targets = (game.p2.option("cast", "backoff")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect([...targets].toSorted()).toEqual(["far", "guard"]);
    const hand = game.p2.hand().length;
    await game.p2.cast("backoff", { targets: "far" });
    await game.settle();
    expect(game.state("far").isStunned).toBe(true);
    expect(game.p2.hand()).toHaveLength(hand - 1 + 1); // "If you played this from your hand, draw 1"
  });
});
