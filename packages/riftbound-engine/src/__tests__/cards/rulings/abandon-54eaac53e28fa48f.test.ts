/**
 * Ruling 54eaac53e28fa48f — Abandon (UNL-131 → unl-131-219) · Reaction · Chaos · [2]
 *   "Counter a spell. Return it to its owner's hand instead of putting it in their trash. [Predict]."
 *   × Fizz, Trickster (SFD-140 → sfd-140-221) · Unit · [3][chaos] · "When you play me, you may play a spell from
 *     your trash with Energy cost no more than [3], ignoring its Energy cost. Recycle that spell after you play it."
 *   Spell used: Discipline (ogn-058-298) · Reaction · [2] · "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Q: The opponent Abandons the spell I played off Fizz — what happens to it?
 * A: It is RECYCLED (bottom of its owner's deck), not returned to hand. Fizz's "recycle it after you play it"
 *    and Abandon's "to hand instead of trash" are both replacements on the spell leaving the chain; the owner
 *    orders them (rule 372) but either order ends in the recycle.
 * Rules: 372 (multiple replacement effects — affected object's owner orders them), 412 (Counter),
 *        Fizz's recycle-after-play rider.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ABANDON = "unl-131-219";
const FIZZ_TRICKSTER = "sfd-140-221";
const DISCIPLINE = "ogn-058-298";

/** P1's turn with exactly [3][chaos] for Fizz; Discipline in P1's trash; 2-Might Ally in base. P2: Abandon + [2]. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .hand(P1, FIZZ_TRICKSTER, "fizz")
    .trash(P1, DISCIPLINE, "disc")
    .hand(P2, ABANDON, "abandon");
}

/** Play Fizz, opt into its trigger, let it resolve → Discipline is played from trash onto the Ally; P1 then passes. */
async function fizzPlaysDiscipline(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("fizz");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("disc"); // the only ≤3 spell in the trash
  }
  await game.p1.passPriority();
  await game.p2.passPriority(); // Fizz's trigger resolves: Discipline is played (energy ignored)
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("ally");
  expect(game.chain().map((c) => c.cardId)).toEqual(["disc"]);
  expect(game.zoneOf("disc")).toBe("chain");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } }); // nothing paid for Discipline
  await game.p1.passPriority();
  return game;
}

describe("Ruling 54eaac53e28fa48f — Abandon on a Fizz-played spell: it is recycled, not returned to hand", () => {
  test("baseline (no Abandon): the Fizz-played Discipline resolves (+2, draw 1) and is then RECYCLED to the bottom of P1's deck — not trashed", async () => {
    const game = await fizzPlaysDiscipline();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("ally").might).toBe(4);
    expect(game.zoneOf("disc")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("disc");
    expect(game.p1.trash()).toEqual([]);
  });

  test("P2 may Abandon the Fizz-played Discipline: it is a spell on the chain and a legal Counter target; Abandon resolves first and Discipline never gives +2 or draws", async () => {
    const game = await fizzPlaysDiscipline();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "abandon")).toBe(true);
    await game.p2.cast("abandon", { targets: "disc" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc", "abandon"]);
    const p1Hand = game.p1.hand().length;
    await game.settle({ policy: "first" }); // P2's Predict: take whatever
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("abandon")).toBe("trash");
    expect(game.state("ally").might).toBe(2); // countered
    expect(game.p1.hand().filter((c) => c !== "disc")).toHaveLength(p1Hand); // no "Draw 1" off Discipline
  });

  // Expected: the countered Discipline ends up RECYCLED (bottom of P1's main deck) — if P1 is asked to order the
  // two replacements (rule 372) either answer gives the same result; it is in neither hand nor trash.
  // Actual: the engine applies only Abandon's replacement and puts Discipline into P1's hand (no order prompt).
  test("ruling 54eaac53e28fa48f — Abandon'd Fizz spell should be recycled; engine returns it to P1's hand", async () => {
    const game = await fizzPlaysDiscipline();
    await game.p2.cast("abandon", { targets: "disc" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Abandon resolves: counter + replacement(s)
    const d = game.decision();
    if (d?.kind === "pick" && d.semantics === "replacement-order") {
      expect(d.seat).toBe(P1); // the spell's owner orders them
      await game.p1.pick(d.options[0]!.key);
    }
    await game.settle({ policy: "first" });
    expect(game.p1.hand()).not.toContain("disc");
    expect(game.p1.trash()).not.toContain("disc");
    expect(game.zoneOf("disc")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("disc");
  });
});
