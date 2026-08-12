/**
 * Ruling e1cd6a702d3c44f6 — Prodigal Explorer (SFD-199 → sfd-199-221, the Ezreal LEGEND)
 *   "[Exhaust]: [Reaction] — Draw 1. Use only if you've chosen enemy units and/or gear twice this turn with
 *    spells or unit abilities."
 *   × Frigid Touch (SFD-066 → sfd-066-221) · [Reaction] · [2] "Give a unit -2 [Might] this turn."
 *   × Royal Entourage (SFD-039 → sfd-039-221) · [3][calm] · "When you play me, ready or exhaust a legend."
 *
 * Q: If I ready Ezreal, must I choose two NEW targets before I can use his ability again?
 * A: No. "Use only if you've chosen … twice this turn" is a cumulative check on what has already happened
 *    this turn. Once satisfied it stays satisfied for the rest of the turn, so after readying him you may
 *    simply exhaust him again and draw.
 * Rules: 377.2.b ("Use only if…" is a restriction checked against this turn's history), 401 (activated
 *        ability costs), 355.14.d / 359.2 (choosing an object).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PRODIGAL_EXPLORER = "sfd-199-221";
const FRIGID_TOUCH = "sfd-066-221";
const ROYAL_ENTOURAGE = "sfd-039-221";
const FILLER = "ogn-175-298";

/** P1's turn: the legend, two Frigid Touches and a Royal Entourage in hand, [7] and a [calm]. P2 has a Foe. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { calm: 1 } })
    .legend(P1, PRODIGAL_EXPLORER, "pe")
    .unit(P2, "base", { might: 9, name: "Foe" }, "foe")
    .hand(P1, FRIGID_TOUCH, "ft1")
    .hand(P1, FRIGID_TOUCH, "ft2")
    .hand(P1, ROYAL_ENTOURAGE, "entourage")
    .deck(P1, [FILLER, FILLER, FILLER, FILLER], ["d1", "d2", "d3", "d4"]);
}

/** Cast both Frigid Touches at the enemy Foe, satisfying "chosen enemy units twice this turn". */
async function chooseTwice(game: Game): Promise<void> {
  await game.p1.cast("ft1", { targets: "foe" });
  await game.settle();
  await game.p1.cast("ft2", { targets: "foe" });
  await game.settle();
}

describe("Ruling e1cd6a702d3c44f6 — the 'chosen twice this turn' condition does not reset when the legend readies", () => {
  test("premise: before two choices the legend is unusable; after them it is", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "pe")).toBe(false);
    await game.p1.cast("ft1", { targets: "foe" });
    await game.settle();
    expect(game.p1.can("activate", "pe")).toBe(false); // once is not twice
    await game.p1.cast("ft2", { targets: "foe" });
    await game.settle();
    expect(game.p1.can("activate", "pe")).toBe(true);
  });

  test("first activation: exhaust the legend and draw 1", async () => {
    const game = await board().build();
    await chooseTwice(game);
    await game.p1.activate("pe");
    await game.settle();
    expect(game.state("pe").isExhausted).toBe(true);
    expect(game.p1.hand()).toEqual(["entourage", "d1"]);
    expect(game.p1.can("activate", "pe")).toBe(false); // only because he is exhausted
  });

  test("ruling: after Royal Entourage readies him, he is usable AGAIN with no new targets chosen — just exhaust and draw", async () => {
    const game = await board().build();
    await chooseTwice(game);
    await game.p1.activate("pe");
    await game.settle();
    const mightBefore = game.state("foe").might;

    await game.p1.play("entourage", { to: "base" });
    // "ready or exhaust a legend" — pick the READY branch, then the legend.
    for (let i = 0; i < 8 && !game.state("pe").isReady; i++) {
      const d = game.decision();
      if (!d) break;
      if (d.kind === "pick" || d.kind === "action") {
        if (d.kind === "pick") {
          const ready = d.options.find((o) => /ready/i.test(o.label ?? o.key));
          await game.seat(d.seat).pick(ready?.key ?? d.options[0]!.key);
        } else if (d.context === "chain") {
          await game.seat(d.seat).passPriority();
        } else {
          break;
        }
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.state("pe").isReady).toBe(true);

    // No fresh choices were made in between — the enemy Foe was not chosen again.
    expect(game.state("foe").might).toBe(mightBefore);
    expect(game.p1.can("activate", "pe")).toBe(true);
    await game.p1.activate("pe");
    await game.settle();
    expect(game.state("pe").isExhausted).toBe(true);
    expect(game.p1.hand()).toEqual(["d1", "d2"]); // drew twice off the one pair of choices
    expect(game.violations()).toEqual([]);
  });

  test("the condition is per TURN: next turn the counter is back to zero and a readied legend is unusable again", async () => {
    const game = await board().build();
    await chooseTwice(game);
    expect(game.p1.can("activate", "pe")).toBe(true);
    await game.advanceTurn();
    await game.advanceTurn(); // back to P1, legend ready again
    expect(game.state("pe").isReady).toBe(true);
    expect(game.p1.can("activate", "pe")).toBe(false);
  });
});
