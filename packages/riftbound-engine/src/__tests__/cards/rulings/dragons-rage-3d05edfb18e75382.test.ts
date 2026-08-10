/**
 * Ruling 3d05edfb18e75382 — Dragon's Rage (OGN-258 → ogn-258-298) · Spell · Calm/Body · 4+[rainbow] · [Action]
 *   "Move an enemy unit. Then do this: Choose another enemy unit at its destination. They deal damage equal to their
 *    Mights to each other."
 *
 * Q: A combat is staged (unit moved onto another player's held battlefield) but one side loses all its units there before
 *    combat begins (the reflexive fight kills the lone defender). What happens to Contested status / control?
 * A (riftjudge, self-described "known gap in the rules"): the battlefield stays contested indefinitely; control can be
 *    neither established nor lost because no combat cleanup / showdown ever happens.
 * Rules: 190.4 / 323.6 (control is lost in an Open-State Cleanup when the controller has no unit there), 323.11–323.13
 *        (staged showdowns begin from Cleanup), 348.2.a (non-combat showdown close: sole remaining player establishes
 *        control = Conquer), 461.5 / 461.5.e.
 * RULING-CONFLICT: riftjudge 3d05edfb18e75382 says "contested forever, nobody gains control"; CR 190.4/323.6 + 348.2.a
 *    (engine BATTLEFIELD CONTROL TIMING model, adjudicated with rulings f69a1bb8709cf037 / 88f862ece2edcd29: "spell kills
 *    the lone defender AND a unit arrives in the same resolution ⇒ control lapses, a showdown runs at the now-uncontrolled
 *    battlefield, the sole remaining player establishes control = Conquer") say otherwise — engine follows CR.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, P3, scenario } from "../../../harness";

const DRAGONS_RAGE = "ogn-258-298";

/**
 * 3 players, P1's turn with 4+[rainbow]. P3 holds bf1 with a lone Defender (2). P2 holds bf2 with Brute (5) + Holder (1).
 * bf3 is open. P1 holds Dragon's Rage.
 */
function board() {
  return scenario({ players: 3 })
    .resources(P1, { energy: 4, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P3 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: null })
    .unit(P3, "bf1", { might: 2, name: "Defender" }, "def")
    .unit(P2, "bf2", { might: 5, name: "Brute" }, "brute")
    .unit(P2, "bf2", { might: 1, name: "Holder" }, "holder")
    .hand(P1, DRAGONS_RAGE, "rage");
}

/** P1 Rages P2's Brute over to P3's bf1; the reflexive fight (Brute 5 ⇄ Defender 2) resolves. Stops at the first non-chain decision. */
async function rageBruteOntoDefender(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("rage", { targets: "brute" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rage", targets: ["brute"] })]);
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => o.key === "battlefield-bf1")) {
      await game.p1.pick("battlefield-bf1"); // destination of the move
      continue;
    }
    if (d.kind === "pick" && d.seat === P1) {
      await game.p1.pick("def"); // "another enemy unit at its destination" (auto-bound when alone)
      continue;
    }
    if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    break;
  }
  expect(game.chain()).toEqual([]);
  return game;
}

describe("Ruling 3d05edfb18e75382 — Dragon's Rage empties the defender's side before combat begins", () => {
  test("the move stages a combat at bf1 (Contested by P2, staged by P1) and the reflexive fight then kills P3's lone Defender: Brute (5) survives with 2 damage, alone at bf1 — no combat can be staged (only one player has units)", async () => {
    const game = await rageBruteOntoDefender();
    expect(game.zoneOf("rage")).toBe("trash");
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.state("brute")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    expect(game.state("brute").combatRole ?? null).toBeNull();
    expect((game.gameState.damageLog ?? []).filter((r) => r.combat)).toEqual([]);
    const bf1 = game.gameState.battlefields.bf1!;
    expect(bf1).toMatchObject({ contested: true, contestedBy: P2 });
  });

  // RULING-CONFLICT: riftjudge 3d05edfb18e75382 says P3 keeps control and bf1 stays contested indefinitely; CR 190.4/323.6
  // say P3 (no unit there, Open-State Cleanup, no showdown ongoing there yet) LOSES control — engine follows CR.
  test("CR 190.4/323.6 (contra ruling): P3's control lapses in the Cleanup after the chain empties — bf1 is uncontrolled, and a (non-combat) showdown opens there with Focus to P2, the contesting player", async () => {
    const game = await rageBruteOntoDefender();
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    const sd = (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).at(-1);
    expect(sd).toMatchObject({ battlefieldId: "bf1" });
    expect(sd?.isCombatShowdown ?? false).toBe(false);
    expect(game.p2.points()).toBe(0);
  });

  // RULING-CONFLICT: riftjudge 3d05edfb18e75382 says control can never be established here; CR 348.2.a / 461.5(.e) say the
  // player with units remaining when the showdown closes establishes control (a Conquer, even off-turn and even though P1
  // applied the Contested status) — engine follows CR.
  test("CR 348.2.a/461.5 (contra ruling): everyone passes Focus → the showdown closes, Contested falls off, P2 establishes control of bf1 and conquers (+1 point on P1's turn); P3 scores nothing", async () => {
    const game = await rageBruteOntoDefender();
    for (let i = 0; i < 6 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "showdown"; i++) {
      await game.acting().passFocus();
    }
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.seat(P3).points()).toBe(0);
    expect(game.p1.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
