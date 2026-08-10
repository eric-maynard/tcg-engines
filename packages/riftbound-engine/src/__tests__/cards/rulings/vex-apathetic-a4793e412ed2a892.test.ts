/**
 * Ruling a4793e412ed2a892 — Vex, Apathetic (UNL-150 → unl-150-219) · 4 Might · [Deflect] "When an opponent plays a unit while
 *     I'm at a battlefield, [Stun] it. They can't move it this turn."
 *   × Rengar, Trophy Hunter (UNL-120 → unl-120-219) · 6 Might · [Ambush] "I can be played to a battlefield where there are enemy
 *     units (even if you don't have units there)."
 *
 * Q: Opponent moves Vex to an EMPTY battlefield; I answer by Ambushing Rengar there. Who goes back to base, who stays?
 * A: The move opens a non-combat showdown (opponent attacks). Rengar arrives as a Reaction (I defend); Vex triggers and stuns
 *    Rengar (+ can't move this turn). Once the chain clears and Focus goes round, a combat follows: Vex deals 4 to Rengar, the
 *    stunned Rengar deals nothing back. Both survive → the ATTACKER (Vex) is recalled to the opponent's base; Rengar (defender)
 *    stays and, alone there, I take control and conquer.
 * Rules: 442.1.a (attacker/defender), 423.1.b (stunned deals no combat damage), 461.1.a.2 (attackers recalled if defenders
 *        remain), 461.5 (control → conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VEX = "unl-150-219";
const RENGAR = "unl-120-219";

/** P2's turn ("my opponent"). bf1 is empty/uncontrolled. P2: Vex (4) ready in base. P1 ("me"): Rengar in hand + [5][body]. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: null })
    .unit(P2, "base", VEX, "vex")
    .hand(P1, RENGAR, "rengar")
    .resources(P1, { energy: 5, power: { body: 1 } });
}

const stack = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);

/** Vex → empty bf1 (non-combat showdown, P2 attacks); P2 passes Focus; P1 Ambushes Rengar into bf1; drive until he stands there. */
async function vexInRengarIn(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("vex", "bf1");
  expect(stack(game)).toHaveLength(1);
  expect(stack(game)[0]).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: false });
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: null });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("play", "rengar")).toBe(true);
  const to = (game.p1.option("playUnit", "rengar")?.fields.find((f) => f.name === "location")?.options ?? []).map(String);
  expect(to).toContain("battlefield-bf1"); // an enemy unit (Vex) is there — Rengar's own permission
  await game.p1.play("rengar", { to: "bf1" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
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

describe("Ruling a4793e412ed2a892 — Vex to an empty field, answered by Rengar: Vex stuns him, but Vex is the one recalled and Rengar conquers", () => {
  test("Rengar's arrival trips Vex's trigger (P2's, on the chain); it resolves: Rengar is Stunned and can't move this turn", async () => {
    const game = await vexInRengarIn();
    // The trigger is (or was) a chain item controlled by P2, sourced from Vex.
    const sawTrigger = game.chain().some((c) => c.cardId === "vex" && c.triggered && c.controller === P2) || game.state("rengar").isStunned;
    expect(sawTrigger).toBe(true);
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("rengar").isStunned).toBe(true);
    expect(game.state("rengar").keywords).toContain("NoMove");
    expect(game.state("vex").isStunned).toBe(false);
    // Still no control change, no points: the showdown is ongoing.
    expect(stack(game)).toHaveLength(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(null);
    expect(game.p1.points() + game.p2.points()).toBe(0);
  });

  test("once Focus has gone round it is a COMBAT showdown: P2 (Vex) attacking, P1 (stunned Rengar) defending", async () => {
    const game = await vexInRengarIn();
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority(); // Vex's trigger resolves first
    }
    for (let i = 0; i < 8 && !(stack(game)[0]?.isCombatShowdown ?? false); i++) {
      await game.acting().pass();
    }
    expect(stack(game)).toHaveLength(1);
    expect(stack(game)[0]).toMatchObject({ attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("vex").combatRole).toBe("attacker");
    expect(game.state("rengar")).toMatchObject({ combatRole: "defender", isStunned: true });
  });

  test("combat resolves: Vex deals 4 to Rengar (6 — survives), stunned Rengar deals nothing; both live → the ATTACKER Vex is recalled to P2's base, Rengar stays; P1 takes control of bf1 and conquers for 1", async () => {
    const game = await vexInRengarIn();
    await game.settle();
    expect(stack(game)).toEqual([]);
    expect(game.zoneOf("vex")).toBe("base"); // recalled (not dead)
    expect(game.state("vex")).toMatchObject({ damage: 0, owner: P2 });
    expect(game.p2.base()).toContain("vex");
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1"); // the defender remains
    expect(game.state("rengar").damage).toBe(0); // healed at combat cleanup
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
