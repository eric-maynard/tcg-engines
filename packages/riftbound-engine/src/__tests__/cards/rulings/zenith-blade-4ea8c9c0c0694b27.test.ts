/**
 * Ruling 4ea8c9c0c0694b27 — Zenith Blade (OGN-262 → ogn-262-298) · Spell · Calm/Order · [3][rainbow][rainbow] · [Action]
 *   "Stun an enemy unit at a battlefield. You may move a friendly unit to that enemy unit's battlefield."
 *
 * Q: My opponent walks onto an EMPTY battlefield and opens a showdown; I answer with Zenith Blade, bringing a
 *    unit in. Who is the attacker and who is the defender?
 * A: The player who applied Contested is the attacker — so THEY attack and YOU defend, even though you had no
 *    unit there when it started. The open showdown ends and a combat showdown starts at once.
 *    You do not control the battlefield until the combat is over, so you could not have played a unit straight
 *    there; you play it to base and move it in with Zenith Blade, whose targets are named as it hits the chain.
 * Rules: 190.3.a/450 (Contested is applied by the arriving unit's controller = the Attacker),
 *        464.2.c.3.a (designations for units that join later), 344.1 (non-combat showdown upgrades to combat),
 *        355.2.a (units are played to base or a battlefield you control), 355.10 (targets chosen on the chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZENITH_BLADE = "ogn-262-298";
const unit = (might: number, name: string) => ({ cardType: "unit", energyCost: 1, might, name }) as const;

/** P2's turn: their Raider walks onto the empty, uncontrolled bf1, opening a non-combat showdown. */
async function raiderOnEmptyBattlefield(): Promise<Game> {
  const game = await scenario()
    .active(P2)
    .resources(P1, { energy: 3, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", unit(4, "Raider"), "raider")
    .unit(P1, "base", unit(3, "Guard"), "guard")
    .hand(P1, ZENITH_BLADE, "zb")
    .hand(P1, unit(2, "Recruit"), "recruit")
    .build();
  await game.p2.move("raider", "bf1");
  expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({
    active: true,
    attackingPlayer: P2,
    battlefieldId: "bf1",
    isCombatShowdown: false,
  });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
  return game;
}

/** P1 casts Zenith Blade on the Raider and rides the Guard in behind it. */
async function bladeIn(game: Game): Promise<void> {
  await game.p1.cast("zb", { targets: ["raider", "guard"] });
  expect(game.chain()).toMatchObject([{ cardId: "zb", targets: ["raider", "guard"] }]); // both named on the chain
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("battlefield-bf1");
}

describe("Ruling 4ea8c9c0c0694b27 — the player who contested the empty battlefield is the attacker", () => {
  test("Zenith Blade turns the open showdown into a combat where P2 attacks and the late-arriving P1 defends", async () => {
    const game = await raiderOnEmptyBattlefield();

    await bladeIn(game);

    expect(game.locationOf("guard")).toBe("bf1");
    expect(game.state("raider")).toMatchObject({ combatRole: "attacker", isStunned: true });
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({
      attackingPlayer: P2,
      defendingPlayer: P1,
      isCombatShowdown: true,
    });
    expect(game.violations()).toEqual([]);
  });

  test("the defender does NOT control the battlefield while the combat runs", async () => {
    const game = await raiderOnEmptyBattlefield();
    await bladeIn(game);

    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: null });
  });

  test("…which is why P1 cannot play a unit straight to bf1 — base first, then move it in", async () => {
    const game = await raiderOnEmptyBattlefield();

    expect(game.p1.can("play", "recruit")).toBe(false); // not a battlefield P1 controls, and it is P2's turn
    await bladeIn(game);
    expect(game.p1.can("play", "recruit")).toBe(false);
  });

  test("control is settled only when the combat resolves — the defender ends up conquering it", async () => {
    const game = await raiderOnEmptyBattlefield();
    await bladeIn(game);

    await game.settle();

    expect(game.locationOf("guard")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
  });
});
