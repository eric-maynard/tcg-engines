/**
 * Ruling f647a7133f913c55 — Vex, Apathetic (UNL-150 → unl-150-219) · 4 Might · [Deflect] "When an opponent plays a unit while I'm
 *     at a battlefield, [Stun] it. They can't move it this turn."
 *   × Rengar, Trophy Hunter (UNL-120 → unl-120-219) · 6 Might · [Ambush]-style: "I can be played to a battlefield where there are
 *     enemy units (even if you don't have units there)."
 *
 * Q: Opponent moves Vex into an (empty) battlefield; I answer by playing Rengar there. If combat "ties" (both survive), does
 *    Rengar stay and Vex get pushed back, since Rengar is defending?
 * A: Yes. The mover applied Contested → the opponent is the ATTACKER; playing Rengar there makes me the DEFENDER. Vex's trigger
 *    stuns Rengar (no combat damage from him). Combat: Vex deals 4 to Rengar (survives), Rengar deals 0; both live → attackers
 *    are recalled because a defender remains. Rengar stays; alone there, I establish control and conquer.
 * Rules: 442.1.a (attacker/defender), 423.1.b (stunned deals no combat damage), 461.1.a.2 (recall attackers), 461.5 (conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VEX = "unl-150-219";
const RENGAR = "unl-120-219";

/** P2's turn ("my opponent"). bf1 open and empty. P2: Vex ready in base. P1 ("me"): Rengar in hand + exactly [5][body]. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", VEX, "vex")
    .hand(P1, RENGAR, "rengar")
    .resources(P1, { energy: 5, power: { body: 1 } });
}

const showdown = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).find((s) => s.active);

/** Vex → bf1 (P2 attacks a non-combat showdown); P2 passes Focus; P1 plays Rengar into bf1 and it lands there. */
async function vexThenRengar(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("vex", "bf1");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  const to = (game.p1.option("playUnit", "rengar")?.fields.find((f) => f.name === "location")?.options ?? []).map(String);
  expect(to).toContain("battlefield-bf1");
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

/** Pass priority until the chain is empty. */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
}

describe("Ruling f647a7133f913c55 — Vex moves in, Rengar answers: the 'tie' recalls the ATTACKER Vex; defender Rengar stays and conquers", () => {
  test("1. the opponent's move contests the empty bf1 and opens a non-combat showdown with P2 as the attacker-to-be", async () => {
    const game = await board().build();
    await game.p2.move("vex", "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: null });
    expect(showdown(game)).toMatchObject({ attackingPlayer: P2, battlefieldId: "bf1", isCombatShowdown: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("2–3. Rengar may be played INTO bf1 (an enemy unit is there); Vex's trigger goes on the chain for P2 and resolves: Rengar Stunned + can't move this turn", async () => {
    const game = await vexThenRengar();
    const pendingOrDone = game.chain().some((c) => c.cardId === "vex" && c.triggered && c.controller === P2) || game.state("rengar").isStunned;
    expect(pendingOrDone).toBe(true);
    await drainChain(game);
    expect(game.state("rengar")).toMatchObject({ isStunned: true, location: "bf1" });
    expect(game.state("rengar").keywords).toContain("NoMove");
    expect(game.state("vex").isStunned).toBe(false);
  });

  test("4. with the chain clear and Focus passed round it is a COMBAT showdown: P2/Vex attacking, P1/Rengar defending", async () => {
    const game = await vexThenRengar();
    await drainChain(game);
    for (let i = 0; i < 8 && !(showdown(game)?.isCombatShowdown ?? false); i++) {
      await game.acting().pass();
    }
    expect(showdown(game)).toMatchObject({ attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("vex").combatRole).toBe("attacker");
    expect(game.state("rengar")).toMatchObject({ combatRole: "defender", isStunned: true });
    // Nothing decided yet: no control, no points.
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points() + game.p2.points()).toBe(0);
  });

  test("combat: Vex's 4 doesn't kill Rengar (6), stunned Rengar deals nothing; both survive → Vex (attacker) is RECALLED to P2's base undamaged, Rengar remains at bf1", async () => {
    const game = await vexThenRengar();
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(game.zoneOf("vex")).toBe("base");
    expect(game.p2.base()).toContain("vex");
    expect(game.state("vex").damage).toBe(0);
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
    expect(game.state("rengar").damage).toBe(0); // healed in combat cleanup
    expect(game.p2.trash()).not.toContain("vex");
    expect(game.p1.trash()).not.toContain("rengar");
  });

  test("final state: only P1 has a unit at bf1 → P1 establishes control and CONQUERS (1 point); play returns to P2's main phase", async () => {
    const game = await vexThenRengar();
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
