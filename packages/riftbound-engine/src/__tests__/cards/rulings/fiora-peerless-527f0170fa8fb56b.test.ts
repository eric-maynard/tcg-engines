/**
 * Ruling 527f0170fa8fb56b — Fiora, Peerless (SFD-110 → sfd-110-221) · Unit · Body · 3+[body] · 3 "When I attack or defend one
 *   on one, double my Might this combat." × Punch First (SFD-097 → sfd-097-221) · [Action] · 1+[body][body] "Give a unit +5
 *   [Might] this turn." × Wuju Bladesman - Starter (OGS-019 → ogs-019-024, Master Yi) "While a friendly unit defends alone,
 *   it gets +2 [Might]."
 *
 * Q: Fiora alone defends against a single attacker with Master Yi as my legend. Does Yi's +2 apply before the doubling?
 *    And if I Punch First once the showdown starts, is that +5 doubled too?
 * A: Yi's passive +2 applies the moment she is the lone defender (before anything resolves): 3 → 5, then her trigger
 *    doubles the CURRENT value → 10. Punch First is an Action, unplayable while her trigger is on the chain; played after,
 *    it adds +5 on top → 15 (the doubling does not re-apply).
 * Rules: 700–701 (arithmetic; passive applies continuously), 432.1 (double uses the value at resolution), 336 / 806.1.b.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIORA = "sfd-110-221";
const PUNCH_FIRST = "sfd-097-221";
const WUJU = "ogs-019-024";

/** P2's turn. P1: Master Yi legend, Fiora ALONE at P1's bf1, Punch First + 1+[body][body]. P2: a single 6-Might Raider. */
function board() {
  return scenario()
    .active(P2)
    .legend(P1, WUJU, "yi")
    .resources(P1, { energy: 1, power: { body: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", FIORA, "fiora")
    .unit(P2, "base", { might: 6, name: "Raider" }, "raider")
    .hand(P1, PUNCH_FIRST, "punch");
}

/** Raider attacks alone; Fiora's one-on-one defend trigger is on the initial chain. */
async function raiderAttacks(): Promise<Game> {
  const game = await board().build();
  expect(game.state("fiora").might).toBe(3);
  await game.p2.move("raider", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fiora", controller: P1, triggered: true })]);
  return game;
}

/** Pass priority around until the initial chain is empty. */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind !== "action") break;
    await game.seat(d.seat).passPriority();
  }
  expect(game.chain()).toEqual([]);
}

describe("Ruling 527f0170fa8fb56b — Yi's +2 lands before Fiora doubles; a later Punch First is not doubled", () => {
  test("as soon as Fiora is the lone defender (her trigger still unresolved on the chain) Yi's passive already makes her 5", async () => {
    const game = await raiderAttacks();
    expect(game.state("fiora").combatRole).toBe("defender");
    expect(game.state("fiora").might).toBe(5);
  });

  test("Punch First is an [Action]: with her trigger on the chain P1 cannot play it (only Reactions are legal in the Closed state)", async () => {
    const game = await raiderAttacks();
    // Fiora's controller (P1) put the trigger on the chain and holds priority first.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "punch")).toBe(false);
    const r = await game.p1.try((p) => p.cast("punch", { targets: "fiora" }));
    expect(r.ok).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["fiora"]);
  });

  test("the trigger resolves doubling the CURRENT 5 → Fiora is 10 (not 8)", async () => {
    const game = await raiderAttacks();
    await drainChain(game);
    expect(game.state("fiora").might).toBe(10);
  });

  test("after the chain empties P1 gets Focus and Punch First is playable; it adds +5 on top for 15 (not (5+5)×2 = 20); Fiora then wins the combat", async () => {
    const game = await raiderAttacks();
    await drainChain(game);
    // Attacker has Focus first; pass it to the defender.
    for (let i = 0; i < 2 && game.actingSeat() !== P1; i++) {
      await game.acting().passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "punch")).toBe(true);
    await game.p1.cast("punch", { targets: "fiora" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await drainChain(game);
    expect(game.state("fiora").might).toBe(15);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("fiora")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
