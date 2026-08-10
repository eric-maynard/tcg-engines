/**
 * Ruling f8012c908b285c4a — Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · [9][body][body]
 *   "At the end of your turn, reveal cards from the top of your Main Deck until you reveal a unit and banish it. Play it,
 *    ignoring its cost, and recycle the rest."
 *   × Deadbloom Predator (OGN-161 → ogn-161-298) · 8 Might · [Deflect] "You may play me to an occupied enemy battlefield."
 *
 * Q: With two Auroras on board, the first to resolve finds a Deadbloom Predator that is played into an occupied enemy
 *    battlefield (a Showdown). Does that Showdown happen right away, or does the second Aurora resolve first?
 * A: The Showdown waits for an empty chain: the second Aurora (and any triggers from it) resolves first, then the Showdown
 *    starts. Both Auroras trigger together at end of turn and their controller orders them; a unit found by the second
 *    Aurora can't be put at the Predator's battlefield (not controlled) — unless it is another Predator.
 * Rules: 317.1 (end-of-turn triggers), 383.3.d (order your simultaneous triggers), 344/450 + 323.12–13 (a staged showdown
 *        begins only in an Open-state Cleanup, i.e. once the chain is empty), 354/141 (play destinations = base or a
 *        battlefield you control, plus the Predator's own permission).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const DEADBLOOM_PREDATOR = "ogn-161-298";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit — what the second Aurora finds

type PickD = Extract<Decision, { kind: "pick" }>;

/** P1's turn, about to end. Two Auroras in P1's base; P1 holds bf2 with a Keeper; P2 holds bf1 with a 3-Might Holder.
 * P1's deck (top first): Predator, `second`, filler. */
function board(second: string = SKULKER) {
  return scenario()
    .gear(P1, DAZZLING_AURORA, "auroraA")
    .gear(P1, DAZZLING_AURORA, "auroraB")
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "bf2", { might: 2, name: "Keeper" }, "keeper")
    .deck(P1, [DEADBLOOM_PREDATOR, second, SKULKER, SKULKER], ["pred", "second", "d3", "d4"]);
}

const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};

/** Pass priority (both seats) until something other than a chain-priority decision is pending. */
async function passUntilPrompt(game: Game): Promise<Decision | null> {
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    return d;
  }
  return game.decision();
}

/** End P1's turn, take the trigger order as listed, and resolve the top Aurora up to the Predator's destination prompt. */
async function toPredatorDestination(game: Game): Promise<PickD> {
  await game.p1.endTurn();
  expect(game.phase()).toBe("ending");
  // Both Auroras triggered at once. DESIGN (FIXER-PRIMER §4, 383.3.d): two IDENTICAL copies are interchangeable, so the
  // soft order offer is skipped; tolerate it either way.
  if (game.decision()?.kind === "order") {
    await game.acceptTriggerOrder();
  }
  expect(game.chain().map((c) => c.cardId).toSorted()).toEqual(["auroraA", "auroraB"]);
  expect(game.chain().every((c) => c.triggered && c.controller === P1)).toBe(true);
  const d = await passUntilPrompt(game);
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect((d as PickD).options.map((o) => o.key)).toContain("battlefield-bf1"); // "occupied enemy battlefield" allowed
  return d as PickD;
}

describe("Ruling f8012c908b285c4a — the Predator's Showdown waits until the second Aurora has resolved", () => {
  test("both Auroras trigger together at the one end of turn: two triggered P1 items on the chain before anything resolves (identical copies — DESIGN: no order prompt is needed for interchangeable items)", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    const d = game.decision();
    if (d?.kind === "order") {
      expect(d.seat).toBe(P1);
      await game.acceptTriggerOrder();
    }
    const items = game.chain().filter((c) => c.triggered && c.controller === P1).map((c) => c.cardId).toSorted();
    expect(items).toEqual(["auroraA", "auroraB"]);
    expect(game.zoneOf("pred")).toBe("mainDeck"); // nothing revealed yet
  });

  test("first Aurora: Predator played (free) into occupied enemy bf1 ⇒ bf1 becomes Contested but NO Showdown starts — the other Aurora is still on the chain and priority continues on it", async () => {
    const game = await board().build();
    await toPredatorDestination(game);
    await game.p1.pick("battlefield-bf1");
    expect(game.locationOf("pred")).toBe("bf1");
    expect(game.p1.energy()).toBe(0); // ignoring its cost
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P2 });
    expect(showdown(game)).toBeUndefined(); // pending, not begun
    expect(game.state("pred").combatRole).not.toBe("attacker");
    expect(game.state("holder").damage).toBe(0);
    const remaining = game.chain().filter((c) => c.cardId === "auroraA" || c.cardId === "auroraB");
    expect(remaining).toHaveLength(1); // exactly the second Aurora is left
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.phase()).toBe("ending");
  });

  test("second Aurora resolves next (finds the Skulker); its destination menu does NOT include bf1 (P1 doesn't control it) — only base / bf2; only after the chain is empty does the Showdown at bf1 begin, still inside P1's turn", async () => {
    const game = await board().build();
    await toPredatorDestination(game);
    await game.p1.pick("battlefield-bf1");
    const d2 = await passUntilPrompt(game);
    // The second Aurora dug to the Skulker and asks where to play it.
    expect(game.zoneOf("second")).not.toBe("mainDeck");
    expect(d2).toMatchObject({ kind: "pick", seat: P1 });
    const keys = (d2 as PickD).options.map((o) => o.key);
    expect(keys).not.toContain("battlefield-bf1");
    expect(keys).toEqual(expect.arrayContaining(["base", "battlefield-bf2"]));
    expect(showdown(game)).toBeUndefined(); // still no showdown while this resolves
    await game.p1.pick("base");
    expect(game.locationOf("second")).toBe("base");
    // Chain now empty ⇒ the staged Showdown at bf1 begins (Predator attacking), still P1's Ending Phase.
    for (let i = 0; i < 6; i++) {
      const x = game.decision();
      if (x?.kind === "action" && x.context === "chain") {
        await game.seat(x.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.chain().filter((c) => c.cardId === "auroraA" || c.cardId === "auroraB")).toEqual([]);
    expect(showdown(game)).toBeDefined();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.state("pred").combatRole).toBe("attacker");
    expect(game.state("holder").combatRole).toBe("defender");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("ending");
    // Fight it out: Predator 8 kills Holder 3 and conquers; then the turn passes.
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.locationOf("pred")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("nuance: if the second Aurora finds ANOTHER Deadbloom Predator, bf1 IS offered for it (its own 'occupied enemy battlefield' permission)", async () => {
    const game = await board(DEADBLOOM_PREDATOR).build();
    await toPredatorDestination(game);
    await game.p1.pick("battlefield-bf1");
    const d2 = await passUntilPrompt(game);
    expect(d2).toMatchObject({ kind: "pick", seat: P1 });
    const keys = (d2 as PickD).options.map((o) => o.key);
    expect(keys).toContain("battlefield-bf1");
    await game.p1.pick("battlefield-bf1");
    expect(game.p1.units("bf1").toSorted()).toEqual(["pred", "second"]);
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.turnPlayer()).toBe(P2);
  });
});
