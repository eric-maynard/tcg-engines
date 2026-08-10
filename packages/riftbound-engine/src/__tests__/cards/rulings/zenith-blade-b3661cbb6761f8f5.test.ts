/**
 * Ruling b3661cbb6761f8f5 — Zenith Blade (OGN-262 → ogn-262-298) · Action · Calm/Order · 3 + [rainbow][rainbow]
 *   "Stun an enemy unit at a battlefield. You may move a friendly unit to that enemy unit's battlefield."
 *   × Rebuke (OGN-172 → ogn-172-298) · Action · Chaos · 2 + [chaos][chaos] · "Return a unit at a battlefield to its owner's hand."
 *
 * Q: The opponent moves a unit onto an OPEN battlefield (showdown). I Zenith Blade a unit of mine in at Action
 *    speed. Does the opponent still conquer the open field? What is the sequence?
 * A: My unit contests the battlefield and a combat becomes pending; the open showdown ends WITHOUT a conquer
 *    (control can't be established while contested), then combat begins — opponent attacks, I defend.
 *    If instead my unit is removed again (e.g. Rebuke) before that combat starts, no combat happens and the
 *    opponent conquers. If both units survive the combat (stun), the attacker is recalled and the defender
 *    takes control and scores.
 * Rules: 344 / 344.1 (showdown → combat when contested by units of two players), 464.2.c.1 (whoever applied
 *        Contested is the attacker), 466.1.a.2 (surviving attackers recalled), 467 / 190.4 (conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZENITH_BLADE = "ogn-262-298";
const REBUKE = "ogn-172-298";

/**
 * P1's turn (the opponent). bf1 is open. P1: Scout (3) in base, Rebuke in hand + 2 energy + [chaos][chaos].
 * P2 (you): Brawler (2) in base, Zenith Blade in hand + 3 energy + 2 rainbow.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 2 } })
    .resources(P2, { energy: 3, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 2, name: "Brawler" }, "brawler")
    .hand(P1, REBUKE, "rebuke")
    .hand(P2, ZENITH_BLADE, "zenith");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Pass priority around (answering P2's destination pick if asked) until the chain is empty. */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      await game.p2.pick("battlefield-bf1");
      continue;
    }
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
    await game.p2.pick("battlefield-bf1");
  }
}

/** P1's Scout walks onto open bf1 (non-combat showdown); P1 passes focus; P2 Zenith Blades: stun Scout, Brawler → bf1. */
async function zenithBladed(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("scout", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
  expect(showdown(game)?.isCombatShowdown ?? false).toBe(false);
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "zenith")).toBe(true);
  await game.p2.cast("zenith", { targets: ["scout", "brawler"] });
  await resolveChain(game);
  expect(game.zoneOf("zenith")).toBe("trash");
  expect(game.state("scout")).toMatchObject({ isStunned: true, location: "bf1" });
  expect(game.locationOf("brawler")).toBe("bf1");
  return game;
}

describe("Ruling b3661cbb6761f8f5 — Zenith Blade into an open-battlefield showdown: no conquer, then combat with the mover as attacker", () => {
  test("after Zenith Blade resolves the battlefield is still Contested by P1 and NOT controlled by anyone — P1 has not conquered or scored", async () => {
    const game = await zenithBladed();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("once the showdown plays out a COMBAT is under way at bf1 with P1 (who applied Contested) attacking and the Zenith Blade player defending — still no conquer point for P1", async () => {
    const game = await zenithBladed();
    // Pass focus around until the combat showdown is established (stop before combat damage).
    for (let i = 0; i < 6 && !(showdown(game)?.isCombatShowdown === true && game.state("scout").combatRole === "attacker"); i++) {
      const d = game.decision();
      if (d?.kind !== "action" || (d.context !== "showdown" && d.context !== "chain")) {
        break;
      }
      await game.seat(d.seat).pass();
    }
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("brawler").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
  });

  test("nuance — both survive (Scout is stunned and deals nothing; Brawler's 2 doesn't kill a 3): the ATTACKER's Scout is recalled, P2's Brawler holds, P2 gains control of bf1 and scores 1; P1 scores nothing", async () => {
    const game = await zenithBladed();
    await game.settle();
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("scout")).toMatchObject({ damage: 0, location: "base" });
    expect(game.state("brawler")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("nuance — if P1 Rebukes the Brawler back to hand before the combat starts, no combat occurs and P1 conquers bf1 after all (scores 1)", async () => {
    const game = await zenithBladed();
    // Focus passes back to P1 inside the still-open showdown.
    for (let i = 0; i < 3 && game.actingSeat() !== P1; i++) {
      await game.acting().pass();
    }
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 });
    expect(game.p1.can("cast", "rebuke")).toBe(true);
    await game.p1.cast("rebuke", { targets: "brawler" });
    await resolveChain(game);
    expect(game.zoneOf("brawler")).toBe("hand");
    await game.settle();
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("scout").combatRole).not.toBe("attacker");
    expect(game.locationOf("scout")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
