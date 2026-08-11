/**
 * Ruling c769ec7c8c80f87b — Fizz, Trickster (SFD-140 → sfd-140-221) · Unit [3][chaos] · 3 Might
 *   "When you play me, you may play a spell from your trash with Energy cost no more than [3], ignoring its Energy cost.
 *    Recycle that spell after you play it."
 *   × Arcane Shift (SFD-200 → sfd-200-221) · Action [3][rainbow] "Banish a friendly unit, then its owner plays it, ignoring
 *     its cost. Deal 3 to an enemy unit at a battlefield. Banish this."   × Wind Wall (ogn-064-298) "Counter a spell."
 *
 * Q: If the spell Fizz replays from trash is countered, is it still recycled?
 *
 * RULING-CONFLICT: riftjudge c769ec7c8c80f87b answers "no — countered goes to the trash, and a resolved Arcane Shift is
 * recycled instead of banishing itself". CR 390.3.a says the opposite on BOTH halves: "recycle it after you play it" is a
 * DELAYED REPLACEMENT reading "if it would leave the chain after becoming a finalized chain item, and leaving the chain
 * wasn't instructed by its own execution, perform the specified game action instead".
 *   - Countered (425.1.a/.a.1): the spell was finalized and leaves the chain for a reason that is NOT its own execution,
 *     so the recycle DOES replace the trip to the trash — bottom of the main deck.
 *   - Arcane Shift's closing "Banish this.": leaving the chain IS instructed by its own execution, so the recycle does
 *     NOT apply — it banishes itself.
 * The engine follows the CR; the same reading is encoded by rulings 625922c455e3ac96 / a077a40206465b5c /
 * a6ee6747d4217583 and interactions/fizz-replayed-spell-countered-recycled (3 rulings + 1 interaction vs this one).
 * Rules: 390.3.a, 425.1.a/.a.1/.b, 419.4.b (tallies still count a finalized-then-countered play), 369–372, 416.1.
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

describe("Ruling c769ec7c8c80f87b (RULING-CONFLICT) — CR 390.3.a: a countered Fizz-replayed spell is still recycled; one that banishes itself is not", () => {
  // RULING-CONFLICT: riftjudge c769ec7c8c80f87b sends the countered spell to the trash because it was never "played"
  // (425.1.b). The rider is not conditioned on being played: rule 390.3.a makes it a delayed replacement on LEAVING THE
  // CHAIN, and a countered spell is a finalized chain item leaving the chain other than by its own execution — engine
  // follows the CR (same reading as rulings 625922c455e3ac96 / a077a40206465b5c / a6ee6747d4217583).
  test("ruling c769ec7c8c80f87b — a countered Fizz-replayed spell is recycled to the bottom of the deck (390.3.a)", async () => {
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
    // rule 390.3.a: the recycle replaces the trip to the trash — bottom of the main deck (416.1).
    expect(game.p1.trash()).not.toContain("spell");
    expect(game.zoneOf("spell")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("spell");
  });

  // RULING-CONFLICT: riftjudge c769ec7c8c80f87b has Fizz's recycle override Arcane Shift's closing "Banish this."
  // rule 390.3.a exempts a departure "instructed by its own execution", so the self-banish stands and the recycle
  // never applies (matches rulings a077a40206465b5c / a6ee6747d4217583) — engine follows the CR.
  test("ruling c769ec7c8c80f87b — a resolved Arcane Shift replayed by Fizz banishes itself; the recycle does not apply (390.3.a)", async () => {
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
    expect(game.p1.deck()).not.toContain("spell");
    expect(game.p1.banishment()).toContain("spell");
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
