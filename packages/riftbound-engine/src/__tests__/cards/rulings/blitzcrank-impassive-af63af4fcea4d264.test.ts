/**
 * Ruling af63af4fcea4d264 — Blitzcrank, Impassive (OGN-067 → ogn-067-298) · 5 Might [Tank] "When you play me to a battlefield, you may move
 *   an enemy unit to here. When I hold, return me to my owner's hand."
 *   × Miss Fortune, Buccaneer (OGN-193 → ogn-193-298) "You may play me to an open battlefield. Friendly units may be played to open battlefields."
 *
 * Q: Playing Blitzcrank to an OPEN battlefield and hooking an enemy unit — who attacks and who defends?
 * A: You are the ATTACKER: Blitzcrank applied the Contested status to the open battlefield first; the pulled unit's controller defends.
 *    Contrast: play him to a battlefield you already CONTROL and the pulled enemy unit is what contests it — then you defend.
 * Rules: 464.2.c.1/.2 (attacker = the player who applied Contested; defender = the other), 344 (playing to an open battlefield stages
 *        a showdown), Miss Fortune's permission to play units to open battlefields.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLITZCRANK = "ogn-067-298";
const MISS_FORTUNE = "ogn-193-298";

const showdown = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).find((s) => s.active);

/**
 * P1's turn with exactly [5][calm] and Blitzcrank in hand; Miss Fortune, Buccaneer in P1's base ("friendly units may be played to open
 * battlefields"). "open" is uncontrolled and empty; "mine" is P1's, held by a Sentry (1). P2's Victim (3) sits in P2's base.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { calm: 1 } })
    .battlefield("open", { controller: null })
    .battlefield("mine", { controller: P1 })
    .unit(P1, "base", MISS_FORTUNE, "mf")
    .unit(P1, "mine", { might: 1, name: "Sentry" }, "sentry")
    .unit(P2, "base", { might: 3, name: "Victim" }, "victim")
    .hand(P1, BLITZCRANK, "blitz");
}

/** Play Blitzcrank to `to`, accept the hook, pull the Victim, and let the pull resolve. */
async function playAndHook(to: "open" | "mine"): Promise<Game> {
  const game = await board().build();
  const dests = (game.p1.option("playUnit", "blitz")?.fields.find((f) => f.name === "location")?.options ?? []).map(String);
  expect(dests).toContain("battlefield-open"); // Miss Fortune makes the open battlefield a legal destination
  await game.p1.play("blitz", { to });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  expect(game.locationOf("blitz")).toBe(to);
  // The hook: opt-in, then the enemy unit.
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
    } else if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key)).toContain("victim");
      await game.p1.pick("victim");
    } else if (d?.kind === "action" && (d.context === "chain" || (d.context === "showdown" && game.locationOf("victim") !== to))) {
      if (game.chain().length === 0 && game.locationOf("victim") === to) {
        break;
      }
      await game.acting().pass();
    } else {
      break;
    }
  }
  expect(game.locationOf("victim")).toBe(to);
  return game;
}

describe("Ruling af63af4fcea4d264 — Blitzcrank to an OPEN battlefield + hook: the Blitzcrank player attacks", () => {
  test("played to the open battlefield: it becomes contested BY P1 (a showdown is pending) before the hook even resolves", async () => {
    const game = await board().build();
    await game.p1.play("blitz", { to: "open" });
    expect(game.locationOf("blitz")).toBe("open");
    expect(game.gameState.battlefields.open).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blitz", controller: P1, triggered: true })]);
  });

  test("after the hook pulls the Victim in and the chain empties, the combat there has P1 as ATTACKER (Blitzcrank) and P2 as DEFENDER (Victim)", async () => {
    const game = await playAndHook("open");
    // Close a non-combat showdown first if the engine opens that before the combat.
    for (let i = 0; i < 6 && showdown(game) !== undefined && showdown(game)?.isCombatShowdown !== true && game.decision()?.kind === "action" && game.chain().length === 0; i++) {
      await game.acting().pass();
    }
    expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "open", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("blitz").combatRole).toBe("attacker");
    expect(game.state("victim").combatRole).toBe("defender");
    await game.settle(); // 5 vs 3: Blitzcrank wins and conquers the open battlefield
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.gameState.battlefields.open?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: played to a battlefield P1 already CONTROLS, the pulled Victim is what contests it — P2 attacks, Blitzcrank (and the Sentry) defend", async () => {
    const game = await playAndHook("mine");
    expect(game.gameState.battlefields.mine).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    for (let i = 0; i < 6 && showdown(game)?.isCombatShowdown !== true && game.decision()?.kind === "action" && game.chain().length === 0; i++) {
      await game.acting().pass();
    }
    expect(showdown(game)).toMatchObject({ attackingPlayer: P2, battlefieldId: "mine", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("victim").combatRole).toBe("attacker");
    expect(game.state("blitz").combatRole).toBe("defender");
    expect(game.state("sentry").combatRole).toBe("defender");
  });
});
