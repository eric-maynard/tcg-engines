/**
 * Ruling 74c523a2ae70af63 — Back Off (UNL-042 → unl-042-219) · [Hidden][Action] · 3 "[Stun] a unit. If you played this from your
 *     hand, draw 1."
 *   × Rengar, Trophy Hunter (UNL-120 → unl-120-219) · 5+[body] · 6 Might "[Ambush] I can be played to a battlefield where there are
 *     enemy units (even if you don't have units there)."
 *
 * Q: My 2-Might unit moves onto an EMPTY battlefield; the opponent answers with Rengar there; I stun Rengar with Back Off. How
 *    does combat resolve, and does Rengar score?
 * A: The move opens a non-combat showdown (I'm the attacker). Rengar arrives as a Reaction (opponent becomes defender); Back Off
 *    stuns him. When everyone passes, units of both sides are present so a COMBAT showdown follows. Combat damage: my unit deals
 *    2 to Rengar; stunned Rengar deals none. Rengar (6) survives, so my attacker is recalled to base and Rengar, alone there,
 *    takes control — the opponent conquers and scores the point. (Had my unit killed Rengar, I would have conquered instead.)
 * Rules: 442.1.a (attacker/defender roles), 423.1.b (stunned: no combat damage), 461.1.a (heal, recall attackers), 461.5 / 464.1
 *        (control → conquer point).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BACK_OFF = "unl-042-219";
const RENGAR = "unl-120-219";

/** P1's turn. bf1 open. P1: Scout (2) in base, Back Off in hand + [3]. P2: Rengar in hand + 5+[body]. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .hand(P1, BACK_OFF, "backoff")
    .resources(P1, { energy: 3 })
    .hand(P2, RENGAR, "rengar")
    .resources(P2, { energy: 5, power: { body: 1 } });
}

function stack(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);
}

/** Scout → open bf1 (non-combat showdown); P1 passes Focus; P2 ambushes Rengar in; P1 Back-Offs Rengar; the spell resolves. */
async function scoutInRengarInBackOff(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("scout", "bf1");
  expect(stack(game)).toHaveLength(1);
  expect(stack(game)[0]).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: false });
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  // Rengar: Ambush (Reaction) + "can be played to a battlefield where there are enemy units".
  expect(game.p2.can("play", "rengar")).toBe(true);
  await game.p2.play("rengar", { to: "bf1" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0 } });
  expect(game.locationOf("rengar")).toBe("bf1");
  // Get P1 an action window in the showdown and stun Rengar with Back Off from hand.
  for (let i = 0; i < 4 && !(game.decision()?.seat === P1 && game.p1.can("cast", "backoff")); i++) {
    await game.acting().pass();
  }
  expect(game.p1.can("cast", "backoff")).toBe(true);
  const hand0 = game.p1.hand().length;
  await game.p1.cast("backoff", { targets: "rengar" });
  expect(game.p1.energy()).toBe(0);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("backoff")).toBe("trash");
  expect(game.state("rengar").isStunned).toBe(true);
  expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1); // played from hand → draw 1
  return game;
}

describe("Ruling 74c523a2ae70af63 — Back Off on an ambushing Rengar: stunned Rengar deals no combat damage but, surviving, still conquers", () => {
  // RULING-CONFLICT: the ruling's narration ("when everyone passes, … a COMBAT showdown follows") reads as if the
  // upgrade waits for both Focus passes. CR 344.1 is explicit that it does not: "If a Showdown is already ongoing at
  // that Battlefield, it will become a Combat Showdown and a Combat will initiate there" — i.e. as soon as Control is
  // Contested between two players, which happens the moment Rengar arrives. The engine follows CR 344.1, matching the
  // green rulings ride-the-wind-02c7fc7281f5b1b4 and vilemaw-10a5e8f8befd1db0; the ruling's OUTCOME (below) is
  // unaffected either way. This facet pins the engine's timing.
  // rule 344.1: an ongoing showdown becomes a Combat Showdown the moment the battlefield is contested by both sides.
  test("CR 344.1 (contra the ruling's narration) — Rengar's arrival upgrades the ongoing showdown to a COMBAT showdown at once, without waiting for Focus passes", async () => {
    const game = await scoutInRengarInBackOff();
    expect(stack(game)).toHaveLength(1);
    expect(stack(game)[0]).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.locationOf("scout")).toBe("bf1");
    expect(game.locationOf("rengar")).toBe("bf1");
    // The upgrade is timing only: no control is established and nobody has scored yet.
    expect(game.gameState.battlefields.bf1?.controller).toBe(null);
    expect(game.p1.points() + game.p2.points()).toBe(0);
  });

  test("once Focus has gone around, the showdown at bf1 is a COMBAT showdown with P1 (who applied contested) attacking and the stunned Rengar defending; no control, no points yet", async () => {
    const game = await scoutInRengarInBackOff();
    for (let i = 0; i < 6 && !(stack(game)[0]?.isCombatShowdown ?? false); i++) {
      await game.acting().pass();
    }
    expect(stack(game)).toHaveLength(1);
    expect(stack(game)[0]).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("rengar").combatRole).toBe("defender");
    expect(game.state("rengar").isStunned).toBe(true);
    expect(game.gameState.battlefields.bf1?.controller).toBe(null);
    expect(game.p2.points()).toBe(0);
  });

  test("combat resolves: Scout deals 2 to Rengar (survives at 6), stunned Rengar deals nothing so the Scout lives and is recalled to base healed; Rengar alone holds the field → P2 conquers bf1 and scores 1", async () => {
    const game = await scoutInRengarInBackOff();
    await game.settle();
    expect(stack(game)).toEqual([]);
    expect(game.zoneOf("scout")).toBe("base"); // recalled, not dead
    expect(game.state("scout").damage).toBe(0);
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
    expect(game.state("rengar").damage).toBe(0); // healed in combat cleanup
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast ('if your unit defeats Rengar'): a 6-Might attacker kills the stunned Rengar unanswered, stays, and P1 conquers bf1 for the point instead", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 6, name: "Bruiser" }, "bruiser")
      .hand(P1, BACK_OFF, "backoff")
      .resources(P1, { energy: 3 })
      .hand(P2, RENGAR, "rengar")
      .resources(P2, { energy: 5, power: { body: 1 } })
      .build();
    await game.p1.move("bruiser", "bf1");
    await game.p1.passFocus();
    await game.p2.play("rengar", { to: "bf1" });
    for (let i = 0; i < 4 && !(game.decision()?.seat === P1 && game.p1.can("cast", "backoff")); i++) {
      await game.acting().pass();
    }
    await game.p1.cast("backoff", { targets: "rengar" });
    await game.settle();
    expect(game.zoneOf("rengar")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1");
    expect(game.state("bruiser").damage).toBe(0); // Rengar was stunned: dealt nothing
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
  });
});
