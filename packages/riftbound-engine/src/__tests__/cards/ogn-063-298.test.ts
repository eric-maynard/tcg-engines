/**
 * Spirit's Refuge — ogn-063-298 · Gear · Calm · 2 energy + [calm]
 *
 *   When you play this, buff a friendly unit. (If it doesn't have a buff, it gets a +1 [Might] buff.)
 *   Friendly buffed units have [Deflect] if they didn't already. (Opponents must pay
 *   [rainbow] to choose those units with a spell or ability.)
 *
 * Rule 809 — Deflect adds 1 Power (any domain) to opponents' spells/abilities that choose the unit;
 * "if they didn't already" means no extra Deflect is granted to a unit that has it (no 809.2 summing).
 * Across a turn start the new turn player channels 2 runes (used below to pay for P2's spell).
 */

import { describe, expect, test } from "bun:test";
import type { Scenario } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-063-298";
const POUTY_PORO = "ogn-013-298"; // 2-might unit with printed Deflect
const BOLT = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

function board(): Scenario {
  return scenario()
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .unit(P1, "base", { might: 2 }, "ally")
    .unit(P1, "base", { might: 2 }, "other")
    .unit(P2, "base", { might: 2 }, "foe", { buffed: true })
    .hand(P2, BOLT, "bolt")
    .hand(P1, CARD, "refuge");
}

/** P1 plays Spirit's Refuge and buffs `target` with its trigger. */
async function playAndBuff(b: Scenario, target: string) {
  const game = await b.build();
  await game.p1.play("refuge");
  const stop = await game.settle();
  if (stop.reason === "unanswered") {
    await game.p1.pick(target);
    await game.settle();
  }
  return game;
}

describe("Spirit's Refuge (ogn-063-298)", () => {
  test("costs 2 energy + 1 calm; lands in base as gear; unaffordable without the calm power", async () => {
    const game = await board().build();
    await game.p1.play("refuge");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("refuge")).toBe("base");
    const short = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", { might: 2 }, "ally").hand(P1, CARD, "refuge").build();
    expect(short.p1.can("play", "refuge")).toBe(false);
  });

  test("on play: buff a friendly unit (+1 Might buff); enemy units are not offered", async () => {
    const game = await board().build();
    await game.p1.play("refuge");
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(keys).toEqual(expect.arrayContaining(["ally", "other"]));
    expect(keys).not.toContain("foe");
    await game.p1.pick("ally");
    await game.settle();
    expect(game.state("ally").isBuffed).toBe(true);
    expect(game.state("ally").might).toBe(3);
    expect(game.state("other").isBuffed).toBe(false);
  });

  test("static: friendly buffed units have Deflect; unbuffed friendly and buffed ENEMY units do not", async () => {
    const game = await playAndBuff(board(), "ally");
    expect(game.state("ally").keywords).toContain("Deflect");
    expect(game.state("other").keywords).not.toContain("Deflect");
    expect(game.state("foe").isBuffed).toBe(true);
    expect(game.state("foe").keywords).not.toContain("Deflect");
  });

  test("granted Deflect is enforced: opponent must pay 1 extra power (any domain) to choose the buffed unit", async () => {
    const game = await playAndBuff(board(), "ally");
    await game.advanceTurn(); // P2's turn: 2 fresh runes channeled
    expect(game.state("ally").keywords).toContain("Deflect");
    await game.p2.tapRune(); // 1 energy
    const denied = await game.p2.try((p) => p.cast("bolt", { targets: "ally" }));
    expect(denied.ok).toBe(false);
    expect(game.p2.can("cast", "bolt")).toBe(true); // "other" is still a legal, affordable choice
    await game.p2.recycleRune(); // +1 power
    await game.p2.cast("bolt", { targets: "ally" });
    expect(game.p2.energy()).toBe(0);
    expect(game.p2.power()).toBe(0);
  });

  test.failing("BUG: 'if they didn't already' — a buffed Pouty Poro keeps Deflect 1, so one extra power suffices", async () => {
    // Expected: the static grants nothing to a unit that already has Deflect, so P2 pays 1 energy + 1 power.
    // Actual: the grant stacks with the printed keyword (Deflect 2) and the cast needs 2 power.
    const game = await playAndBuff(board().unit(P1, "base", POUTY_PORO, "poro"), "poro");
    expect(game.state("poro").isBuffed).toBe(true);
    await game.advanceTurn();
    expect(game.state("poro").keywords.filter((k) => k === "Deflect")).toHaveLength(1);
    await game.p2.tapRune();
    await game.p2.recycleRune(); // pool: 1 energy + 1 power
    await game.p2.cast("bolt", { targets: "poro" });
    expect(game.p2.energy()).toBe(0);
    expect(game.p2.power()).toBe(0);
  });
});
