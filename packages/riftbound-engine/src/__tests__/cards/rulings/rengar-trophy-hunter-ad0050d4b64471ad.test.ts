/**
 * Ruling ad0050d4b64471ad — Rengar, Trophy Hunter (UNL-120 → unl-120-219) · Unit · Body · [5][body] · 6
 *     "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.) I can be played to a battlefield where
 *      there are enemy units (even if you don't have units there)."
 *   × Back Off (UNL-042 → unl-042-219) · Spell · [3] · Action · [Hidden] · "[Stun] a unit. If you played this from your hand, draw 1."
 *
 * Q: I start a showdown on an open battlefield with a 1-Might unit; the opponent answers with Rengar; I stun Rengar. Outcome?
 * A: My move contests the empty battlefield → Non-Combat Showdown, I'm the Attacker-to-be. Rengar arrives as a Reaction → he
 *    is the Defender and it becomes a Combat Showdown. Back Off stuns him. Combat: my unit deals 1 to Rengar (survives, 6);
 *    stunned Rengar deals 0. Both survive → the ATTACKER is recalled (a defender remains). Rengar alone remains → the opponent
 *    takes control of / conquers the battlefield.
 * Rules: 442.1.a (attacker = who applied Contested; defender = the other), 459.2 / 323.14 (non-combat showdown becomes combat),
 *        423.1.b (stunned deals no combat damage), 461.1.a.2 → 465/466 (attackers recalled if a defender remains), 466.5 (control).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RENGAR = "unl-120-219";
const BACK_OFF = "unl-042-219";

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1's turn. bf1 is empty and uncontrolled. P1: Scout (1) in base, Back Off in hand with exactly [3]. P2: Rengar in hand with exactly [5][body]. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 5, power: { body: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 1, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 2, name: "Homebody" }, "homebody")
    .hand(P1, BACK_OFF, "backoff")
    .hand(P2, RENGAR, "rengar")
    .deck(P1, ["ogn-175-298"], ["d1"]);
}

/** Scout walks onto empty bf1 (non-combat showdown); P1 passes Focus; P2 Reaction-plays Rengar to bf1 and it resolves. */
async function rengarAnswers(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("scout", "bf1");
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.p2.can("play", "rengar")).toBe(true);
  await game.p2.play("rengar", { to: "bf1" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0 } });
  for (let i = 0; i < 6 && game.zoneOf("rengar") !== "battlefield-bf1"; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || !d.passKey) {
      break;
    }
    await game.seat(d.seat).pass();
  }
  expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
  return game;
}

/** …then P1 (Focus back with the attacker) plays Back Off from hand on Rengar and it resolves. */
async function rengarStunned(): Promise<Game> {
  const game = await rengarAnswers();
  for (let i = 0; i < 4 && !(game.decision()?.seat === P1 && game.decision()?.kind === "action"); i++) {
    await game.acting().pass();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "backoff")).toBe(true);
  await game.p1.cast("backoff", { targets: "rengar" });
  expect(game.p1.energy()).toBe(0);
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  return game;
}

describe("Ruling ad0050d4b64471ad — 1-Might attacker vs an Ambushed-in, then stunned, Rengar: attacker recalled, Rengar's side conquers", () => {
  test("step 1: moving the Scout onto the empty, uncontrolled bf1 contests it and opens a NON-combat showdown with P1 (who applied Contested) holding Focus; no designations yet", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", focusPlayer: P1, isCombatShowdown: false });
    expect(game.state("scout").combatRole).toBeNull();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    // Rengar cannot jump in until P2 actually has Focus/priority.
    expect(game.p2.can("play", "rengar")).toBe(false);
  });

  test("step 2: with Focus passed, P2 plays Rengar as a Reaction straight to bf1 (enemy units there, none of his own); on entering he is the DEFENDER, the Scout the ATTACKER, and the showdown is now a COMBAT showdown", async () => {
    const game = await rengarAnswers();
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("rengar")).toMatchObject({ combatRole: "defender", controller: P2, might: 6 });
    expect(game.gameState.interaction?.showdownStack).toHaveLength(1); // transformed, not a second showdown
  });

  test("step 3: P1 answers with Back Off (an Action — legal: it is a showdown and P1 has Focus) → Rengar is stunned; played from hand, so P1 draws 1", async () => {
    const game = await rengarStunned();
    expect(game.zoneOf("backoff")).toBe("trash");
    expect(game.state("rengar")).toMatchObject({ combatRole: "defender", isStunned: true, location: "bf1" });
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(showdown(game)?.active).toBe(true);
  });

  test("step 4 → outcome: both pass; combat damage — Scout deals 1 to Rengar (not lethal), stunned Rengar deals 0; both survive, so the ATTACKING Scout is recalled to P1's base and Rengar stays", async () => {
    const game = await rengarStunned();
    await game.settle();
    expect(game.zoneOf("scout")).toBe("base");
    expect(game.state("scout")).toMatchObject({ damage: 0, location: "base" }); // took nothing (and healed anyway)
    expect(game.p1.trash()).not.toContain("scout");
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
    expect(game.state("rengar")).toMatchObject({ damage: 0, isStunned: true }); // the 1 damage healed at combat end
    expect(game.p2.trash()).not.toContain("rengar");
  });

  test("…and with only Rengar left standing there, P2 takes control of bf1 — a conquer for P2 (+1 point), nothing for P1; back to P1's main phase", async () => {
    const game = await rengarStunned();
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
