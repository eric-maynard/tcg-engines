/**
 * Ruling 2d1b165d12476026 — Fizz, Trickster (SFD-140 → sfd-140-221) · 3 + [chaos] · 3 Might
 *   "When you play me, you may play a spell from your trash with Energy cost no more than [3],
 *    ignoring its Energy cost. RECYCLE THAT SPELL AFTER YOU PLAY IT."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction · [1][calm] "Counter a spell that costs no more than
 *     [4] and no more than [rainbow]."
 *
 * Q: A spell played from the trash by Fizz gets countered. Is it recycled or trashed?
 * A: Recycled. "Recycle that spell after you play it" replaces wherever the spell would otherwise
 *    go when it leaves the chain — including the trash a counter would send it to.
 * Rules: 425.1.a–b (a countered spell leaves the chain unresolved and would go to the trash),
 *        366 / 369 (a replacement effect changes that destination), 416 (Recycle → bottom of deck).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIZZ = "sfd-140-221";
const DEFY = "ogn-045-298";

/** [Reaction] [1] "Give a unit +1 [Might] this turn." — the cheap spell waiting in P1's trash. */
const NUDGE = {
  abilities: [
    { effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "reaction", type: "spell" },
  ],
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  name: "Nudge",
  rulesText: "[Reaction] Give a unit +1 [Might] this turn.",
  timing: "reaction",
} as const;

/** P1's turn: Fizz in hand with [3][chaos], a Nudge in the trash, an Ally to point it at; P2 holds Defy. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 2 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .trash(P1, NUDGE, "nudge")
    .hand(P1, FIZZ, "fizz")
    .hand(P2, DEFY, "defy");
}

/** Play Fizz, accept the trigger, and drive until the Nudge is on the chain aimed at the Ally. */
async function nudgeOnChain(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("fizz");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  for (let i = 0; i < 8 && game.zoneOf("nudge") !== "chain"; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    if (d?.kind === "pick") {
      await game.seat(d.seat).pick(d.options[0]!.key);
      continue;
    }
    break;
  }
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("ally"); // the Nudge's own target
  }
  expect(game.zoneOf("nudge")).toBe("chain");
  // The Nudge's controller holds priority first; pass so P2 may answer it.
  if (game.actingSeat() === P1) {
    await game.p1.passPriority();
  }
  return game;
}

describe("Ruling 2d1b165d12476026 — a Fizz-played spell that is countered is recycled, not trashed", () => {
  test("control: left alone, the trash Nudge resolves and is RECYCLED to the deck (never back to the trash)", async () => {
    const game = await nudgeOnChain();
    await game.settle();
    expect(game.state("ally").might).toBe(3);
    expect(game.p1.trash()).not.toContain("nudge");
    expect(game.zoneOf("nudge")).toBe("mainDeck");
  });

  test("premise: P2 can Defy the trash-played Nudge while it sits on the chain", async () => {
    const game = await nudgeOnChain();
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy", { targets: "nudge" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["nudge", "defy"]);
  });

  test("ruling: the countered Nudge goes to the BOTTOM OF THE DECK, not to the trash — and its effect never happens", async () => {
    const game = await nudgeOnChain();
    await game.p2.cast("defy", { targets: "nudge" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("ally")).toMatchObject({ might: 2, mightModifier: 0 }); // countered ⇒ no buff
    expect(game.zoneOf("nudge")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("nudge");
    expect(game.p1.trash()).not.toContain("nudge");
    expect(game.zoneOf("defy")).toBe("trash"); // Defy itself goes to the trash as normal
    expect(game.violations()).toEqual([]);
  });

  test("Fizz himself is unaffected: he is on the board either way", async () => {
    const game = await nudgeOnChain();
    await game.p2.cast("defy", { targets: "nudge" });
    await game.settle();
    expect(game.zoneOf("fizz")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
