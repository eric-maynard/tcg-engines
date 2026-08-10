/**
 * Ruling 729ee1e5391c9e41 — Ahri, Inquisitive (OGN-119 → ogn-119-298) · Champion Unit · Mind · 3 Might
 *     "When I attack or defend, give an enemy unit here -2 [Might] this turn, to a minimum of 1 [Might]."
 *   × Retreat (OGN-104 → ogn-104-298) · Reaction · "Return a friendly unit to its owner's hand. Its owner
 *     channels 1 rune exhausted."
 *
 * Q: Ahri is defending and Retreat is cast on her — does her -2 still apply?
 * A: Two cases. (a) Retreat cast in response, BEFORE her trigger resolves: Ahri leaves first, so when the
 *    trigger resolves she is no longer "here" → it resolves with no effect (no fizzle rule; 0 effect).
 *    (b) Her trigger resolves first (−2 applied), then Retreat is cast on a later chain: the −2 stays.
 * Rules: 340.1 (LIFO), 359.3.e (effect that can't locate its referent/"here" does nothing), 383 (trigger is
 *        independent of its source), 346/347 (Focus in a showdown).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AHRI = "ogn-119-298";
const RETREAT = "ogn-104-298";

/** P2's turn. P1 controls bf1 with Ahri and holds Retreat with [1]. P2 attacks with a vanilla 4-Might unit. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", AHRI, "ahri")
    .unit(P2, "base", { might: 4, name: "Brute" }, "brute")
    .hand(P1, RETREAT, "retreat");
}

/** P2 moves Brute into bf1 → combat showdown; Ahri's DEFEND trigger (P1's item, choosing Brute) is on the chain. */
async function bruteAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("brute", "bf1");
  expect(game.state("ahri").combatRole).toBe("defender");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", controller: P1, targets: ["brute"], triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 729ee1e5391c9e41 — Retreat vs Ahri's defend trigger: timing decides whether the −2 lands", () => {
  test("(a) P1 responds to Ahri's own trigger with Retreat on Ahri: Retreat is a legal Reaction here and sits above the trigger", async () => {
    const game = await bruteAttacks();
    expect(game.p1.can("cast", "retreat")).toBe(true);
    await game.p1.cast("retreat", { targets: "ahri" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ahri", "retreat"]);
  });

  test("(a) LIFO: Retreat resolves first — Ahri returns to P1's hand and P1 channels 1 rune exhausted — while her trigger is still waiting on the chain", async () => {
    const game = await bruteAttacks();
    const runesBefore = game.p1.runes().length;
    await game.p1.cast("retreat", { targets: "ahri" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("retreat")).toBe("trash");
    expect(game.zoneOf("ahri")).toBe("hand");
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", triggered: true })]);
    expect(game.state("brute").might).toBe(4); // nothing applied yet
  });

  test("(a) then Ahri's trigger resolves with NO effect — she is not 'here' any more — Brute keeps its full 4 Might; no attacker-vs-nobody damage, P2 conquers bf1", async () => {
    const game = await bruteAttacks();
    await game.p1.cast("retreat", { targets: "ahri" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Retreat
    // rule 340.4 — the controller of the newest remaining item (Ahri's trigger, P1's) regains priority.
    await game.p1.passPriority();
    await game.p2.passPriority(); // Ahri's trigger → 0 effect
    expect(game.chain()).toEqual([]);
    expect(game.state("brute")).toMatchObject({ might: 4, mightModifier: 0 });
    await game.settle();
    expect(game.state("brute")).toMatchObject({ damage: 0, might: 4, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.zoneOf("ahri")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });

  test("(b) instead both pass: Ahri's trigger resolves first — Brute is 2 Might this turn (4 − 2)", async () => {
    const game = await bruteAttacks();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("brute")).toMatchObject({ baseMight: 4, might: 2 });
    expect(game.zoneOf("ahri")).toBe("battlefield-bf1");
  });

  test("(b) then, on a SEPARATE chain (P2 passes Focus, P1 gains it), P1 Retreats Ahri: she goes to hand but the already-applied −2 REMAINS on Brute for the turn", async () => {
    const game = await bruteAttacks();
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolved: Brute 2
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "retreat")).toBe(true);
    await game.p1.cast("retreat", { targets: "ahri" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["retreat"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("ahri")).toBe("hand");
    expect(game.state("brute")).toMatchObject({ baseMight: 4, might: 2 }); // the −2 stays
    await game.settle(); // showdown ends; lone attacker conquers
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.state("brute").might).toBe(2); // still this turn
    await game.advanceTurn();
    expect(game.state("brute").might).toBe(4); // "this turn" wore off
    expect(game.violations()).toEqual([]);
  });
});
