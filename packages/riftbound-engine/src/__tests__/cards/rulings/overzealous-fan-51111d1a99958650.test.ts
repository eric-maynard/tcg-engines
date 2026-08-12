/**
 * Ruling 51111d1a99958650 — Overzealous Fan (SFD-128 → sfd-128-221) · Unit · [2] · 2 Might
 *     "When I defend, you may kill me to move an attacking unit to its base."
 *   × Stupefy (OGN-095 → ogn-095-298) · [Reaction] · [1] (the reaction both players would like to hold)
 *
 * Q: Do players play reactions before the Overzealous Fan's ability, or does the ability go on the chain first?
 * A: The ability goes on the chain first. When the Fan gains the Defender designation its ability triggers;
 *    if its controller uses it they pay the cost — killing the Fan — UP FRONT to place it on the chain. Only
 *    then does the state close and priority open: the defender, who controls the topmost item, may play
 *    reactions first, and the attacker after they pass.
 * Rules: 383.3.a/b + 204.3.a (a triggered ability is finalized — opt-in and base cost — before anyone gets
 *        priority), 402–404 (costs paid at finalization), 330–340 (priority once the item is on the chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const OVERZEALOUS_FAN = "sfd-128-221";
const STUPEFY = "ogn-095-298";

/** P1's turn. P2 holds bf1 with the Fan and a Grunt; P1 attacks with a Raider. Both hold a Reaction. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", OVERZEALOUS_FAN, "fan")
    .unit(P2, "bf1", { might: 3, name: "Grunt" }, "grunt")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, STUPEFY, "p1Stupefy")
    .hand(P2, STUPEFY, "p2Stupefy");
}

async function attacked(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  expect(game.state("fan").combatRole).toBe("defender");
  return game;
}

describe("Ruling 51111d1a99958650 — the Fan's trigger is placed (cost paid) before anybody may react", () => {
  test("the very first decision after the attack is the Fan's own opt-in, at FINALIZATION — nobody has had priority yet", async () => {
    const game = await attacked();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, timing: "FIN" });
    expect(game.zoneOf("fan")).toBe("battlefield-bf1"); // the cost has not been paid yet
    expect(game.locationOf("raider")).toBe("bf1"); // and nothing has resolved
  });

  test("no reaction can be played in that moment: neither player has an action menu while the opt-in is open", async () => {
    const game = await attacked();
    expect(game.p1.decision()).toBeNull();
    expect(game.p1.can("cast", "p1Stupefy")).toBe(false);
    expect((await game.p1.try((p) => p.cast("p1Stupefy", { targets: "raider" }))).ok).toBe(false);
    expect(game.p2.can("cast", "p2Stupefy")).toBe(false);
  });

  test("ruling: accepting pays the cost UP FRONT — the Fan is already in the trash as the ability reaches the chain", async () => {
    const game = await attacked();
    await game.p2.yes();
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", controller: P2, triggered: true })]);
  });

  test("only now does priority open, and the DEFENDER (controller of the topmost item) has it first", async () => {
    const game = await attacked();
    await game.p2.yes();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "p2Stupefy")).toBe(true);
    expect(game.p1.decision()).toBeNull();
  });

  test("the attacker gets their window after the defender passes, and the Fan's ability then resolves and bounces the Raider", async () => {
    const game = await attacked();
    await game.p2.yes();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "p1Stupefy")).toBe(true);
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("raider")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("declining removes the ability entirely: nothing reaches the chain and the Fan survives to fight", async () => {
    const game = await attacked();
    await game.p2.no();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fan")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });
});
