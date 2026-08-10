/**
 * Ruling a6ee6747d4217583 — Fizz, Trickster (SFD-140 → sfd-140-221) · 3 Might · [3][chaos]
 *     "When you play me, you may play a spell from your trash with Energy cost no more than [3], ignoring its Energy cost. Recycle
 *      that spell after you play it. (You must still pay its Power cost.)"
 *   × Arcane Shift (SFD-200 → sfd-200-221) [Action] [3][rainbow] "Banish a friendly unit, then its owner plays it, ignoring its cost.
 *     Deal 3 to an enemy unit at a battlefield. Banish this."
 *
 * Q: When Fizz plays Arcane Shift from the trash, is it banished (its own text) or recycled (Fizz)?
 * A: Banished. Arcane Shift banishes itself as part of its own resolution; Fizz's later "recycle that spell" can no longer find
 *    "that spell" (it is in banishment, which Fizz did not put it in), so it stays banished.
 * Rules: 359.3 (a spell performs its text then leaves the chain), 124 (zone change → new object), 380 (delayed abilities).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIZZ = "sfd-140-221";
const ARCANE_SHIFT = "sfd-200-221";
const HEXTECH_RAY = "ogn-009-298"; // [1][fury] "Deal 3 to a unit at a battlefield" — control spell without self-banish

/** P1's turn. P2's Wall (5) at bf1. P1: Fizz in hand, Pal (2) in base, `spell` in trash; [3] + chaos for Fizz + 1 rainbow/fury for the replayed spell's Power. */
function board(spell: string) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
    .unit(P1, "base", { energyCost: 2, might: 2, name: "Pal" }, "pal")
    .hand(P1, FIZZ, "fizz")
    .trash(P1, spell, "replayed")
    .resources(P1, { energy: 3, power: { chaos: 1, fury: 1, rainbow: 1 } });
}

/** Play Fizz, accept his trigger naming the trash spell, and drive the whole thing to the open main phase (picking Pal / Wall / base when asked). */
async function fizzReplays(spell: string): Promise<Game> {
  const game = await board(spell).build();
  const deckBottom = game.p1.deck().at(-1);
  await game.p1.play("fizz");
  expect(game.p1.energy()).toBe(0);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "fizz" } });
  await game.p1.yes();
  let sawOnChain = false;
  for (let i = 0; i < 20; i++) {
    const d: Decision | null = game.decision();
    if (game.chain().some((c) => c.cardId === "replayed" && !c.triggered)) {
      sawOnChain = true; // the trash spell really was PLAYED (a spell on the chain)
    }
    if (d?.kind === "pick" && d.seat === P1) {
      const keys = d.options.map((o) => o.card ?? o.key);
      const want = ["replayed", "pal", "wall", "base"].find((k) => keys.includes(k)) ?? String(keys[0]);
      await game.p1.pick(want);
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.acting().passPriority();
    } else if (d?.kind === "order") {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  expect(sawOnChain).toBe(true);
  expect(game.chain()).toEqual([]);
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  expect(game.zoneOf("fizz")).toBe("base");
  (game as unknown as { deckBottomBefore?: string }).deckBottomBefore = deckBottom;
  return game;
}

describe("Ruling a6ee6747d4217583 — Arcane Shift replayed by Fizz banishes itself; Fizz does not recycle it", () => {
  test("Arcane Shift resolves in full (a friendly unit is banished and replayed, the Wall takes 3) and ends in BANISHMENT — not on the bottom of P1's deck, not in the trash", async () => {
    const game = await fizzReplays(ARCANE_SHIFT);
    expect(game.state("wall").damage).toBe(3);
    expect(game.p1.units("base").sort()).toEqual(["fizz", "pal"]); // the shifted unit came back
    expect(game.zoneOf("replayed")).toBe("banishment");
    expect(game.p1.banishment()).toEqual(["replayed"]);
    expect(game.p1.trash()).not.toContain("replayed");
    expect(game.p1.deck()).not.toContain("replayed");
    expect(game.p1.deck().at(-1)).toBe((game as unknown as { deckBottomBefore?: string }).deckBottomBefore);
    expect(game.p1.power("rainbow") + game.p1.power("fury")).toBe(1); // its [rainbow] Power was still paid
    expect(game.violations()).toEqual([]);
  });

  test("control: an ordinary spell (Hextech Ray) replayed the same way IS recycled by Fizz — bottom of P1's deck", async () => {
    const game = await fizzReplays(HEXTECH_RAY);
    expect(game.state("wall").damage).toBe(3);
    expect(game.zoneOf("replayed")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("replayed");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.trash()).not.toContain("replayed");
  });
});
