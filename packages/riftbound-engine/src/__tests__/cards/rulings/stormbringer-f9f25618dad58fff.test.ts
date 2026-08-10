/**
 * Ruling f9f25618dad58fff — Stormbringer (OGN-250 → ogn-250-298) · Spell · Fury/Body · [6][rainbow][rainbow]
 *     "Choose a friendly unit in your base. Deal damage equal to its Might to all enemy units at a battlefield, then
 *      move your unit there."
 *   × Emperor's Divide (SFD-043 → sfd-043-221) · [Hidden] [Action] · [2] "Move any number of friendly units at a
 *     battlefield to their base."
 *
 * Q: If my opponent uses Stormbringer, does that initiate a showdown, and am I allowed to use Emperor's Divide?
 * A: Yes. Both the unit and the battlefield are chosen as Stormbringer is played; on resolution the damage is dealt and
 *    the unit moves in. If my units survive, the battlefield is now contested and a Combat Showdown opens right after
 *    the spell resolves; in that showdown I get Focus and may play an [Action] such as Emperor's Divide.
 * Rules: 342.1 (spell uses the chain), 441.3/445 (the move makes the battlefield contested), 344.1 / 459.2 (combat
 *        showdown), 347 (Focus alternates; Actions are legal for the Focus holder), 812 ([Action] in showdowns).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STORMBRINGER = "ogn-250-298";
const EMPERORS_DIVIDE = "sfd-043-221";

/**
 * P2's turn with exactly [6] + 2 rainbow and a 3-Might Raider in base. P1 holds bf1 with Guard A (4) and Guard B (4)
 * — both survive 3 damage — and has Emperor's Divide in hand with [2].
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 6, power: { rainbow: 2 } })
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Guard A" }, "ga")
    .unit(P1, "bf1", { might: 4, name: "Guard B" }, "gb")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P2, STORMBRINGER, "storm")
    .hand(P1, EMPERORS_DIVIDE, "divide");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P2 casts Stormbringer [Raider → bf1]; both pass; it resolves. */
async function stormResolves(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("storm", { targets: ["raider", "bf1"] });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "storm", controller: P2, targets: ["raider", "bf1"] })]);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("storm")).toBe("trash");
  return game;
}

describe("Ruling f9f25618dad58fff — an opponent's Stormbringer into my held battlefield opens a combat showdown in which I may play Emperor's Divide", () => {
  test("Stormbringer is a spell on the chain: unit AND battlefield are chosen at play; while it is pending I (P1) get priority but may NOT play the Action Emperor's Divide (Closed State)", async () => {
    const game = await board().build();
    const fields = game.p2.option("cast", "storm")?.fields.find((f) => f.arg === "targets");
    expect(fields?.required).toBe(true);
    await game.p2.cast("storm", { targets: ["raider", "bf1"] });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "divide")).toBe(false);
  });

  test("on resolution: 3 damage (the Raider's Might) to each of my units at bf1, then the Raider moves there — bf1 is contested and a COMBAT showdown is open (P2 attacking, P1 defending), attacker holds Focus", async () => {
    const game = await stormResolves();
    expect(game.state("ga").damage).toBe(3);
    expect(game.state("gb").damage).toBe(3);
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1 });
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("ga").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("when Focus passes to me I MAY play Emperor's Divide (an [Action]) — pulling both Guards home; the Raider is then unopposed and conquers bf1", async () => {
    const game = await stormResolves();
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "divide")).toBe(true);
    await game.p1.cast("divide", { targets: ["ga", "gb"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "divide", controller: P1 })]);
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("divide")).toBe("trash");
    expect(game.locationOf("ga")).toBe("base");
    expect(game.locationOf("gb")).toBe("base");
    await game.settle();
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.zoneOf("ga")).toBe("base"); // saved from the 3-v-8 combat
    expect(game.zoneOf("gb")).toBe("base");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: without the Divide it is a real combat — the Guards' 8 kills the 3-Might Raider (whose 3 finishes off the pre-damaged Guards); P2 does not conquer", async () => {
    const game = await stormResolves();
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P2);
    expect(game.p2.points()).toBe(0);
  });
});
