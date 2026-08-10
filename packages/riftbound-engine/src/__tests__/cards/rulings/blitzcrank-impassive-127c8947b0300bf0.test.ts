/**
 * Ruling 127c8947b0300bf0 — Blitzcrank, Impassive (OGN-067 → ogn-067-298)
 *   "[Tank] When you play me to a battlefield, you may move an enemy unit to here. When I hold, return me
 *    to my owner's hand."
 *   × Legend Ahri — Nine-Tailed Fox (ogn-255-298) "When an enemy unit attacks a battlefield you control,
 *     give it -1 [Might] this turn, to a minimum of 1 [Might]."  (the ruling's "Charm effects" family)
 *
 * Q: Does Blitzcrank pulling an enemy unit onto my battlefield trigger Legend Ahri, and is the pulled unit
 *    the attacker?
 * A: Yes. A unit that ends up on an enemy-controlled battlefield is the attacker no matter how it got there:
 *    the pulled unit's presence contests the battlefield, it is designated Attacker (Blitzcrank's side
 *    defends), and Ahri's passive triggers against it.
 * Rules: 190.3.a / 459 (whoever's unit applies Contested is the attacker), 464.2.c (designations),
 *        383.4.e (Attack Triggers fire on gaining the Attacker designation), 447 (moves by effects).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLITZCRANK = "ogn-067-298";
const NINE_TAILED_FOX = "ogn-255-298";

/**
 * P1's turn with the Nine-Tailed Fox legend. P1 holds bf1 with a 1-Might Holder; P2 holds bf2 with a Raider
 * (4) and has a Homebody (1) in base. P1 has Blitzcrank in hand with exactly [5][calm].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { calm: 1 } })
    .legend(P1, NINE_TAILED_FOX, "fox")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 4, name: "Raider" }, "raider")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "homebody")
    .hand(P1, BLITZCRANK, "blitz");
}

/** Play Blitzcrank to bf1, accept the optional pull, pick the Raider, and let the pull resolve. */
async function raiderPulled(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("blitz", { to: "bf1" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blitz", controller: P1, triggered: true })]);
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["homebody", "raider"]);
  await game.p1.pick("raider");
  await game.acting().passPriority();
  await game.acting().passPriority(); // the pull resolves
  expect(game.locationOf("raider")).toBe("bf1");
  return game;
}

describe("Ruling 127c8947b0300bf0 — a Blitzcrank-pulled unit is the ATTACKER and trips the Nine-Tailed Fox", () => {
  test("the pulled Raider's presence contests bf1 (contested BY P2, still controlled by P1); the Raider is designated Attacker and Blitzcrank/Holder are Defenders — P1, who used the effect, is not the attacker", async () => {
    const game = await raiderPulled();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(game.state("raider")).toMatchObject({ combatRole: "attacker", controller: P2, location: "bf1" });
    expect(game.state("blitz")).toMatchObject({ combatRole: "defender", controller: P1, location: "bf1" });
    expect(game.state("holder").combatRole).toBe("defender");
  });

  test("ruling 127c8947b0300bf0 — Ahri's passive TRIGGERS: a Nine-Tailed Fox item (P1's) is on the chain against the attacking Raider, and on resolution the Raider is 4 → 3 for the turn", async () => {
    const game = await raiderPulled();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fox", controller: P1, triggered: true })]);
    expect(game.state("raider").might).toBe(4); // not yet resolved
    await game.acting().passPriority();
    await game.acting().passPriority(); // Fox trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("raider")).toMatchObject({ baseMight: 4, might: 3 });
    // Still mid-showdown at bf1.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1 });
  });

  test("the ensuing combat plays out with those roles: Raider (3) attacks into Tank Blitzcrank (5) + Holder — the Raider dies, P1 keeps bf1, nobody scores", async () => {
    const game = await raiderPulled();
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("blitz")).toBe("battlefield-bf1");
    expect(game.zoneOf("holder")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
