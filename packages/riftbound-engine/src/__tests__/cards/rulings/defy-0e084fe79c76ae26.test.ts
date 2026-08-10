/**
 * Ruling 0e084fe79c76ae26 — Defy (OGN-045 → ogn-045-298) · Reaction spell · Calm · [1][calm]
 *     "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Dredge Up (ven-049-166) · Spell · [2] · "Draw 1."   × Trifarian Gloryseeker (ogn-217-298) · Unit · [2] · 2 Might
 *     "[Legion] — When you play me, buff me. (Get the effect if you've played another card this turn.)"
 *
 * Q: Will a Legion effect still work if a card I played gets countered?
 * A: Yes. Sequence: the card is played → Pending → targets/costs → FINALIZED (Legion condition met right there) → the
 *    opponent Defies it → it is countered and cleared without resolving. Legion abilities on cards played afterwards that
 *    turn are active regardless.
 * Rules: 419.4.b (Legion-style checks key off finalization), 425.1.a (countered ⇒ no effect, off the chain), 812 (Legion).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const DREDGE_UP = "ven-049-166";
const GLORYSEEKER = "ogn-217-298";

/** P1's turn with [4]. P1: Dredge Up + Gloryseeker in hand, known deck. P2: Defy + [1][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .hand(P1, DREDGE_UP, "dredge")
    .hand(P1, GLORYSEEKER, "glory")
    .hand(P2, DEFY, "defy")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

/** Steps 1–4 of the ruling: play → finalized → Defied → countered off the chain. Records the played-count at each step. */
async function playedThenCountered(): Promise<{ game: Game; countAtFinalize: number; countAfterCounter: number }> {
  const game = await board().build();
  await game.p1.cast("dredge"); // 1–2: played, finalized (no targets, cost paid)
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dredge", controller: P1, countered: false })]);
  const countAtFinalize = game.gameState.cardsPlayedThisTurn?.[P1] ?? 0;
  await game.p1.passPriority();
  await game.p2.cast("defy", { targets: "dredge" }); // 3: the reaction
  await game.p2.passPriority();
  await game.p1.passPriority(); // 4: Defy resolves → Dredge Up countered and cleared
  await game.settle();
  const countAfterCounter = game.gameState.cardsPlayedThisTurn?.[P1] ?? 0;
  return { countAfterCounter, countAtFinalize, game };
}

describe("Ruling 0e084fe79c76ae26 — Legion still works after the earlier card was countered", () => {
  test("the Legion condition is met at FINALIZATION (count 1 while Dredge Up is merely on the chain) and stays met after the counter; the spell itself never resolved (no draw)", async () => {
    const { game, countAtFinalize, countAfterCounter } = await playedThenCountered();
    expect(countAtFinalize).toBe(1);
    expect(countAfterCounter).toBe(1);
    expect(game.zoneOf("dredge")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual(["glory"]);
    expect(game.p1.deck()[0]).toBe("d1");
  });

  test("a Legion card played afterwards gets its effect: Trifarian Gloryseeker enters and buffs itself (2 → 3)", async () => {
    const { game } = await playedThenCountered();
    await game.p1.play("glory");
    await game.settle();
    expect(game.zoneOf("glory")).toBe("base");
    expect(game.state("glory")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.violations()).toEqual([]);
  });

  test("control: Gloryseeker as the FIRST card of the turn — Legion not met, it enters unbuffed at 2", async () => {
    const game = await board().build();
    await game.p1.play("glory");
    await game.settle();
    expect(game.state("glory")).toMatchObject({ isBuffed: false, might: 2 });
  });
});
