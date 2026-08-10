/**
 * Ruling e309f6f69af95c8c — Void Seeker (OGN-024 → ogn-024-298) · Action · [3][fury] · "Deal 4 to a unit at a battlefield. Draw 1."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction · "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *
 * Q: During combat a spell chain (Void Seeker, Defied) resolves. Does the attacker conquer right away, or do players get to act
 *    again before combat damage?
 * A: Players get Focus/priority again and may start another chain (e.g. a second Void Seeker) before damage. Combat damage is
 *    only assigned once both players pass in a row with an empty chain.
 * Rules: 345–347 (Showdown Focus; a resolved chain returns to the showdown), 465.1 (damage step after all pass), 425.1 (counter).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_SEEKER = "ogn-024-298";
const DEFY = "ogn-045-298";

/** P1's turn. P1: Poro (2) in base, Defy in hand, [1]+calm. P2 holds bf1 with Guard (1) and has TWO Void Seekers with [6]+2 fury. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .resources(P2, { energy: 6, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 2, name: "Poro" }, "poro")
    .hand(P1, DEFY, "defy")
    .hand(P2, VOID_SEEKER, "vs1")
    .hand(P2, VOID_SEEKER, "vs2");
}

/** Poro attacks bf1; P1 passes Focus; P2 Void Seekers the Poro; P1 Defies it; both pass → Defy resolves, Void Seeker countered. */
async function defiedSeekerMidCombat(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("poro", "bf1");
  expect(game.state("poro").combatRole).toBe("attacker");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("vs1", { targets: "poro" });
  await game.p2.passPriority();
  await game.p1.cast("defy", { targets: "vs1" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["vs1", "defy"]);
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      break;
    }
    await game.seat(d.seat).passPriority();
  }
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("defy")).toBe("trash");
  expect(game.zoneOf("vs1")).toBe("trash");
  expect(game.state("poro").damage).toBe(0); // countered — no 4 damage, no draw
  return game;
}

describe("Ruling e309f6f69af95c8c — after a mid-combat chain resolves, players act again before combat damage", () => {
  test("with the chain empty the showdown is still open: no damage assigned, bf1 still contested and P2's, Poro and Guard untouched, and a player holds Focus", async () => {
    const game = await defiedSeekerMidCombat();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P2 });
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.p1.points()).toBe(0);
  });

  test("P2 can start ANOTHER chain: a second Void Seeker on the Poro is legal and, unopposed, deals 4 — the Poro dies before any combat damage, so nothing is conquered", async () => {
    const game = await defiedSeekerMidCombat();
    if (game.actingSeat() === P1) {
      await game.p1.passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "vs2")).toBe(true);
    const p2Hand = game.p2.hand().length;
    await game.p2.cast("vs2", { targets: "poro" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vs2", targets: ["poro"] })]);
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 1); // cast one, drew one
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("only when both players pass in a row on the empty chain does combat damage happen: Poro 2 vs Guard 1 → Guard dies, P1 conquers bf1", async () => {
    const game = await defiedSeekerMidCombat();
    // Two consecutive Focus passes close the showdown; then combat damage is a procedure step.
    const first = game.actingSeat() as string;
    await game.seat(first).passFocus();
    expect(game.state("guard").damage).toBe(0); // one pass is not enough
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    await game.seat(first === P1 ? P2 : P1).passFocus();
    await game.settle(); // runs the combat-damage procedure
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
