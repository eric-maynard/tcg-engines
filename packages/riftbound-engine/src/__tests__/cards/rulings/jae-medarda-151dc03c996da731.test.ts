/**
 * Ruling 151dc03c996da731 — Jae Medarda (SFD-142 → sfd-142-221) · Unit · Chaos · 5 Might
 *     "When you choose me with a spell, draw 1."
 *   × Frigid Touch (SFD-066 → sfd-066-221) · Spell · [Reaction] · [2] · "Give a unit -2 [Might] this turn."
 *
 * Q: An opponent chooses my Jae Medarda with a spell — do I draw a card?
 * A: No. "You" in card text always means the CONTROLLER of the card. Jae's trigger only fires when her own
 *    controller chooses her with a spell they control; an opponent's spell choosing her triggers nothing (and
 *    certainly does not draw for the opponent). Choosing your own Jae with your own spell does draw 1, and the
 *    card goes to Jae's controller.
 * Rules: 106.2 / 132.1.a ("you" = the ability's controller), 383 (triggered abilities need their event as written),
 *        355.14.d (each choice of a target is its own "choose" event).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const JAE = "sfd-142-221";
const FRIGID_TOUCH = "sfd-066-221";
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla 3-Might deck filler

const jaeTriggers = (game: Game) => game.chain().filter((c) => c.cardId === "jae" && c.triggered);

/** Jae in P1's base with a known deck top; `caster` holds Frigid Touch and exactly [2]. */
function board(active: string) {
  return scenario()
    .active(active)
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 2 })
    .unit(P1, "base", JAE, "jae")
    .deck(P1, [FILLER, FILLER], ["p1a", "p1b"])
    .deck(P2, [FILLER, FILLER], ["p2a", "p2b"]);
}

describe("Ruling 151dc03c996da731 — 'when YOU choose me' is Jae's controller only", () => {
  test("P2's Frigid Touch chooses P1's Jae: the spell is on the chain alone — NO Jae trigger is created", async () => {
    const game = await board(P2).hand(P2, FRIGID_TOUCH, "ft").build();
    await game.p2.cast("ft", { targets: "jae" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ft", controller: P2, targets: ["jae"] })]);
    expect(jaeTriggers(game)).toEqual([]);
  });

  test("…and it stays that way through resolution: Jae is 5 → 3 Might, but nobody draws — not P1 (not their spell) and not P2 (not their Jae)", async () => {
    const game = await board(P2).hand(P2, FRIGID_TOUCH, "ft").build();
    await game.p2.cast("ft", { targets: "jae" });
    await game.settle();
    expect(game.zoneOf("ft")).toBe("trash");
    expect(game.state("jae").might).toBe(3);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p2.hand()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("p1a"); // deck untouched
    expect(game.p2.deck()[0]).toBe("p2a");
    expect(game.violations()).toEqual([]);
  });

  test("nuance — P1 choosing their OWN Jae with their own spell: one trigger, and the card is drawn by Jae's controller", async () => {
    const game = await board(P1).hand(P1, FRIGID_TOUCH, "ft").build();
    await game.p1.cast("ft", { targets: "jae" });
    expect(jaeTriggers(game)).toEqual([expect.objectContaining({ cardId: "jae", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.p1.hand()).toEqual(["p1a"]);
    expect(game.p2.hand()).toEqual([]);
    expect(game.state("jae").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("both spells choose Jae in one chain (P1's, then P2's [Reaction] on top): exactly ONE Jae trigger — P1's — so exactly one card is drawn, and Jae ends at 1 Might", async () => {
    const game = await board(P1).hand(P1, FRIGID_TOUCH, "mine").hand(P2, FRIGID_TOUCH, "theirs").build();
    await game.p1.cast("mine", { targets: "jae" });
    expect(jaeTriggers(game)).toHaveLength(1);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.cast("theirs", { targets: "jae" });
    expect(jaeTriggers(game)).toHaveLength(1); // P2's choice added nothing
    await game.settle();
    expect(game.p1.hand()).toEqual(["p1a"]); // exactly one draw, for P1
    expect(game.p2.hand()).toEqual([]);
    expect(game.state("jae").might).toBe(1); // 5 − 2 − 2
    expect(game.violations()).toEqual([]);
  });
});
