/**
 * Ruling a077a40206465b5c — Fizz, Trickster (SFD-140 → sfd-140-221) · 3 Might · [3][chaos]
 *     "When you play me, you may play a spell from your trash with Energy cost no more than [3], ignoring its Energy
 *      cost. Recycle that spell after you play it."
 *   × Arcane Shift (SFD-200 → sfd-200-221) · Action · [3][rainbow] · "Banish a friendly unit, then its owner plays it,
 *     ignoring its cost. Deal 3 to an enemy unit at a battlefield. Banish this."
 *
 * Q: If Fizz replays a discarded Arcane Shift from the trash, is Arcane Shift recycled after it banishes itself?
 * A: No. Arcane Shift banishes itself as it resolves; Fizz's ability did not banish it, and an effect can only keep
 *    interacting with a banished card if it was the one that banished it — so the "recycle it" never happens and
 *    Arcane Shift stays in banishment.
 * Rules: 108/109 (banishment; only the banishing effect may reference the card), 594 (recycle), 356.1.b.2 (only the
 *        Energy cost is ignored).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIZZ = "sfd-140-221";
const ARCANE_SHIFT = "sfd-200-221";

/** P1's turn. P1: Fizz in hand, Arcane Shift in trash, Buddy (2) in base; [3] + chaos (Fizz) + rainbow (Shift's Power). P2: Wall (5) at P2's bf1. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
    .unit(P1, "base", { energyCost: 2, might: 2, name: "Buddy" }, "buddy")
    .hand(P1, FIZZ, "fizz")
    .trash(P1, ARCANE_SHIFT, "shift")
    .resources(P1, { energy: 3, power: { chaos: 1, rainbow: 1 } });
}

/** Play Fizz, say yes, name Arcane Shift; resolve the trigger so the Shift is played onto the chain (Buddy / Wall are its only objects). */
async function fizzReplaysShift(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("fizz");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "fizz" } });
  await game.p1.yes();
  for (let i = 0; i < 4; i++) {
    const d: Decision | null = game.decision();
    if (d?.kind !== "pick" || d.seat !== P1) {
      break;
    }
    const o = d.options.find((x) => (x.card ?? x.key) === "shift") ?? d.options[0]!;
    await game.p1.pick(o.card ?? o.key);
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fizz", controller: P1, targets: ["shift"], triggered: true })]);
  expect(game.p1.energy()).toBe(0);
  // Fizz's trigger resolves → Arcane Shift is played from the trash (Energy ignored, Power paid).
  for (let i = 0; i < 8 && !game.chain().some((c) => c.cardId === "shift"); i++) {
    const d: Decision | null = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.acting().passPriority();
    } else if (d?.kind === "pick" && d.seat === P1) {
      const o = d.options.find((x) => (x.card ?? x.key) === "buddy") ?? d.options.find((x) => (x.card ?? x.key) === "wall") ?? d.options[0]!;
      await game.p1.pick(o.card ?? o.key);
    } else {
      break;
    }
  }
  expect(game.zoneOf("shift")).toBe("chain");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shift", controller: P1, triggered: false })]);
  return game;
}

describe("Ruling a077a40206465b5c — Arcane Shift replayed by Fizz banishes itself and is NOT recycled", () => {
  test("setup: Fizz's trigger targets the Arcane Shift in the trash and plays it (Energy ignored — P1 had only [3], all spent on Fizz)", async () => {
    const game = await fizzReplaysShift();
    expect(game.zoneOf("fizz")).toBe("base");
    expect(game.p1.trash()).not.toContain("shift");
  });

  test("Arcane Shift resolves in full: Buddy is banished and replayed by its owner, the Wall takes 3 …", async () => {
    const game = await fizzReplaysShift();
    await game.settle({ policy: "first" });
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("buddy")).toBe("base"); // banished, then played again free
    expect(game.state("wall")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
  });

  test("… and 'Banish this' puts Arcane Shift into BANISHMENT, where Fizz's 'recycle it' can no longer reach it: it is not on the bottom of the deck, not in the trash", async () => {
    const game = await fizzReplaysShift();
    const deckBefore = [...game.p1.deck()];
    await game.settle({ policy: "first" });
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.p1.banishment()).toEqual(["shift"]);
    expect(game.p1.trash()).not.toContain("shift");
    expect(game.p1.deck()).not.toContain("shift");
    expect(game.p1.deck()).toEqual(deckBefore); // nothing was recycled under the deck
    expect(game.violations()).toEqual([]);
  });
});
