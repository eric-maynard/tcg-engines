/**
 * Ruling c769ec7c8c80f87b — Fizz, Trickster (SFD-140 → sfd-140-221) · Unit [3][chaos] · 3 Might
 *   "When you play me, you may play a spell from your trash with Energy cost no more than [3], ignoring its Energy cost.
 *    Recycle that spell after you play it."
 *   × Arcane Shift (SFD-200 → sfd-200-221) · Action [3][rainbow] "Banish a friendly unit, then its owner plays it, ignoring
 *     its cost. Deal 3 to an enemy unit at a battlefield. Banish this."   × Wind Wall (ogn-064-298) "Counter a spell."
 *
 * Q: If the spell Fizz replays from trash is countered, is it still recycled?
 * A: No. A countered spell is cleared from the chain into the trash (425.1.a.1) and is not considered played (425.1.b), so
 *    Fizz's "recycle it after you play it" replacement never applies. If instead the spell resolves (or tries to banish
 *    itself, like Arcane Shift), it IS recycled.
 * Rules: 425.1.a/.b, 419.4.b (Legion-style tallies still count a finalized-then-countered play), 369–372 (replacement).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIZZ = "sfd-140-221";
const ARCANE_SHIFT = "sfd-200-221";
const WIND_WALL = "ogn-064-298";
const HEXTECH_RAY = "ogn-009-298";

function board(spellInTrash: string) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
    .unit(P1, "base", { energyCost: 1, might: 2, name: "Pal" }, "pal")
    .hand(P1, FIZZ, "fizz")
    .trash(P1, spellInTrash, "spell")
    .resources(P1, { energy: 3, power: { chaos: 2, fury: 1, mind: 1 } })
    .hand(P2, WIND_WALL, "windwall")
    .resources(P2, { energy: 3, power: { calm: 2 } });
}

/** Play Fizz, accept the trigger naming the trash spell, resolve the trigger so the spell is on the chain; stop at P2's priority. */
async function fizzReplays(spellInTrash: string): Promise<Game> {
  const game = await board(spellInTrash).build();
  await game.p1.play("fizz");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "fizz" } });
  await game.p1.yes();
  for (let i = 0; i < 16; i++) {
    const d: Decision | null = game.decision();
    if (d?.kind === "action" && d.context === "chain" && d.seat === P2 && game.chain().some((c) => c.cardId === "spell")) {
      break;
    }
    if (d?.kind === "pick" && d.seat === P1) {
      const o =
        d.options.find((x) => (x.card ?? x.key) === "spell") ??
        d.options.find((x) => (x.card ?? x.key) === "pal") ??
        d.options.find((x) => (x.card ?? x.key) === "wall") ??
        d.options[0]!;
      await game.p1.pick(o.card ?? o.key);
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.acting().passPriority();
    } else {
      break;
    }
  }
  expect(game.zoneOf("fizz")).toBe("base");
  expect(game.zoneOf("spell")).toBe("chain");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "spell", controller: P1, triggered: false })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling c769ec7c8c80f87b — a countered Fizz-replayed spell goes to trash; only a played (resolved) one is recycled", () => {
  // Expected (ruling): Wind Wall counters Arcane Shift → Arcane Shift is put in P1's trash (425.1.a.1); Fizz's recycle
  // rider does not apply because the spell was never "played" (425.1.b). Actual: the engine treats the rider as a
  // leave-the-chain replacement and recycles the countered spell to the bottom of the deck.
  test.failing("BUG: ruling c769ec7c8c80f87b — a countered Fizz-replayed spell goes to the trash, not the deck", async () => {
    const game = await fizzReplays(ARCANE_SHIFT);
    expect(game.p2.can("cast", "windwall")).toBe(true);
    await game.p2.cast("windwall", { targets: "spell" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["spell", "windwall"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    // Countered: none of Arcane Shift's effects happened.
    expect(game.state("wall").damage).toBe(0);
    expect(game.zoneOf("pal")).toBe("base");
    expect(game.zoneOf("windwall")).toBe("trash");
    // 419.4.b — the finalized play still counts for non-triggered "played a card" tallies (Fizz + the spell).
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2);
    // The ruling: countered → trash, NOT recycled.
    expect(game.p1.deck()).not.toContain("spell");
    expect(game.zoneOf("spell")).toBe("trash");
  });

  // Expected (ruling nuance): when Arcane Shift resolves, its closing "Banish this." is overridden by Fizz's pending
  // "recycle that spell" — it goes to the bottom of P1's main deck. Actual: the engine banishes it.
  test.failing("BUG: ruling c769ec7c8c80f87b — a resolved Arcane Shift replayed by Fizz is recycled, not banished", async () => {
    const game = await fizzReplays(ARCANE_SHIFT);
    await game.settle({ policy: "first" });
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick") {
        const o = d.options.find((x) => (x.card ?? x.key) === "pal") ?? d.options.find((x) => (x.card ?? x.key) === "wall") ?? d.options[0]!;
        await game.seat(d.seat).pick(o.card ?? o.key);
      } else if (d.kind === "yes-no") {
        await game.seat(d.seat).no();
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
      await game.settle();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("wall").damage).toBe(3); // it resolved
    expect(game.p1.banishment()).not.toContain("spell");
    expect(game.zoneOf("spell")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("spell");
  });

  test("control: a replayed spell that simply resolves (Hextech Ray) is recycled to the bottom of the deck, not trashed", async () => {
    const game = await fizzReplays(HEXTECH_RAY);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("wall").damage).toBe(3);
    expect(game.zoneOf("spell")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("spell");
    expect(game.p1.trash()).not.toContain("spell");
    expect(game.violations()).toEqual([]);
  });
});
