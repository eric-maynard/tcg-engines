/**
 * Ruling 3849cab7663fa22f — Defy (OGN-045 → ogn-045-298) · [Reaction] · [1][calm]
 *   "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Shen, Kinkou (OGN-241 → ogn-241-298) · Unit · [3][order] · 3 Might
 *     "[Reaction] … [Shield 2] [Tank]" — a UNIT that is played at reaction speed.
 *
 * Q: Can Defy counter Shen, who is played at reaction speed?
 * A: No. Defy may only choose a SPELL; Shen is a unit card. Being playable as a
 *    Reaction changes when he may be played, not what kind of card he is.
 * Rules: 355.9 (a chosen object must match the descriptor), 425.1 (Counter targets a
 *        card on the chain named by the effect), 145/146 (card types), 421 (Reaction timing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const SHEN = "ogn-241-298";
const DREDGE_UP = "ven-049-166"; // Spell · [2] · "Draw 1." — a legal Defy target for contrast

/** P1's turn. P1 can pay for Shen ([3][order]) and Dredge Up ([2]); P2 holds Defy with [1][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { order: 1 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .hand(P1, SHEN, "shen")
    .hand(P1, DREDGE_UP, "dredge")
    .hand(P2, DEFY, "defy");
}

/** Everything Defy is willing to be aimed at right now, flattened out of the option's `targets` field. */
function defyTargets(game: Game): string[] {
  const field = game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets");
  return (field?.options ?? []).flat().map(String);
}

describe("Ruling 3849cab7663fa22f — Defy cannot counter Shen: he is a unit, not a spell", () => {
  test("premise: Shen, Kinkou is a UNIT card whose printed timing is Reaction (a 3-Might [Shield 2] [Tank])", async () => {
    const game = await board().build();
    expect(game.state("shen")).toMatchObject({ baseMight: 3, cardType: "unit" });
    expect(game.state("shen").keywords).toEqual(expect.arrayContaining(["Shield", "Tank"]));
  });

  test("Shen played alone: the chain stays empty (a unit play is not a chain item), so Defy has nothing to counter", async () => {
    const game = await board().build();
    await game.p1.play("shen", { to: "base" });
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("shen")).toBe("base");
    expect(defyTargets(game)).not.toContain("shen");
    expect(game.p2.can("cast", "defy")).toBe(false);
    expect((await game.p2.try((p) => p.cast("defy", { targets: "shen" }))).ok).toBe(false);
  });

  test("ruling 3849cab7663fa22f — Shen played at REACTION speed on top of a live spell: only the spell is on the chain, Defy is offered it alone, and aiming Defy at Shen is illegal", async () => {
    const game = await board().build();
    await game.p1.cast("dredge");
    expect(game.chain().map((c) => c.cardId)).toEqual(["dredge"]);
    await game.p1.play("shen", { to: "base" }); // Reaction timing: legal in this Closed State
    expect(game.zoneOf("shen")).toBe("base"); // he enters at once; he never becomes a chain item
    expect(game.chain().map((c) => c.cardId)).toEqual(["dredge"]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(defyTargets(game)).toEqual(["dredge"]);
    expect((await game.p2.try((p) => p.cast("defy", { targets: "shen" }))).ok).toBe(false);
    expect(game.zoneOf("defy")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 1 } }); // nothing paid
  });

  test("Shen is untouched by the exchange and sits on the board as a 3-Might unit", async () => {
    const game = await board().build();
    await game.p1.cast("dredge");
    await game.p1.play("shen", { to: "base" });
    await game.settle();
    expect(game.zoneOf("shen")).toBe("base");
    expect(game.state("shen").might).toBe(3); // no defender designation ⇒ no Shield
    expect(game.zoneOf("dredge")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("contrast — the SPELL on the chain is a legal Defy target: countered, cleared to trash, and it never drew", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await game.p1.cast("dredge");
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "dredge" });
    await game.settle();
    expect(game.zoneOf("dredge")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand - 1); // cast Dredge Up, drew nothing
  });
});
