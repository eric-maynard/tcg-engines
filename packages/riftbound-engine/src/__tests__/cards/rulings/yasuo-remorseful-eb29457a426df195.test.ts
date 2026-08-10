/**
 * Ruling eb29457a426df195 — Yasuo, Remorseful (OGN-076 → ogn-076-298) · Unit · Calm · 6 · 6 Might
 *     "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Fight or Flight (OGN-168 → ogn-168-298) · [Hidden] [Action] · 2 · "Move a unit from a battlefield to its base."
 *
 * Q: Yasuo attacks; the opponent Fight-or-Flights him to base in response. Does his damage trigger still kill a unit there?
 * A: No. The trigger goes on the chain, Fight or Flight (from hidden, as a Reaction) resolves first and moves Yasuo home;
 *    when his trigger resolves he is no longer "here", so it has no valid target and whiffs — no damage.
 * Rules: 811 (hidden → Reaction), 331/340 (LIFO), 359.2 / 359.3.e ("here" and the target re-checked on resolution → no effect).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO_REMORSEFUL = "ogn-076-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

/** Turn 3, P1 active. P2 holds bf1 with a 4-Might Sentry (dies to 6) and hid Fight or Flight there earlier. Yasuo ready in P1's base. */
function board() {
  return scenario()
    .turn(3)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Sentry" }, "sentry")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
    .unit(P1, "base", YASUO_REMORSEFUL, "yasuo");
}

/** Yasuo attacks bf1; his trigger (Sentry bound) is on the chain; P1 passes → P2 to respond. */
async function yasuoAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("yasuo", "bf1");
  for (let i = 0; i < 4; i++) {
    const d: Decision | null = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("sentry");
    } else {
      break;
    }
  }
  expect(game.state("yasuo").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling eb29457a426df195 — Fight or Flight in response sends Yasuo home and his 'here' trigger whiffs", () => {
  test("Yasuo's attack trigger goes on the chain; P2 flips the hidden Fight or Flight on him → chain [Yasuo trigger, Fight or Flight]", async () => {
    const game = await yasuoAttacks();
    expect(game.p2.can("reveal", "fof")).toBe(true);
    await game.p2.reveal("fof");
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("yasuo");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo", "fof"]);
    expect(game.chain()[1]).toMatchObject({ controller: P2, targets: ["yasuo"] });
    expect(game.state("sentry").damage).toBe(0);
  });

  test("LIFO: Fight or Flight resolves first — Yasuo is moved to P1's base while his trigger is still waiting", async () => {
    const game = await yasuoAttacks();
    await game.p2.reveal("fof");
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("yasuo");
    }
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.zoneOf("yasuo")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", triggered: true })]);
    expect(game.state("sentry").damage).toBe(0);
  });

  test("ruling: the trigger then resolves with Yasuo not 'here' — no valid target: Sentry takes NO damage and survives; bf1 stays P2's", async () => {
    const game = await yasuoAttacks();
    await game.p2.reveal("fof");
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("yasuo");
    }
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("sentry")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect((game.gameState.damageLog ?? []).filter((r) => r.target === "sentry")).toEqual([]);
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("battlefield-bf1");
    expect(game.zoneOf("yasuo")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — unanswered, the trigger deals Yasuo's 6 to Sentry 'here' and kills it", async () => {
    const game = await yasuoAttacks();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sentry")).toBe("trash");
  });
});
