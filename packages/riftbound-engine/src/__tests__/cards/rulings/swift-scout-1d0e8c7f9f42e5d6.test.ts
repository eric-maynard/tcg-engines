/**
 * Ruling 1d0e8c7f9f42e5d6 — Swift Scout (OGN-263 → ogn-263-298, Legend · Teemo)
 *   "You may pay [1] to hide a card with [Hidden] instead of [rainbow]. [1], [Exhaust]: Put a Teemo unit you own into
 *    your hand from your Champion Zone or the board."
 *   × Teemo, Scout (ogn-197-298, [Hidden]) × Caitlyn, Patrolling (ogn-068-298) × Gust (ogn-169-298)
 *   × Hidden Blade (ogn-213-298, [Hidden] Action)
 *
 * Q1: Can Teemo be HIDDEN straight from the Champion Zone?  Q2: Can a card hidden this turn be flipped as a reaction
 *     the same turn (opponent hides a card, activates Caitlyn, you Gust Caitlyn — can they answer with the hidden card)?
 * A1: The ruling says No (Hide needs the card in hand). CR 811.1.b / 421.2.a say Yes — a Hidden card may be hidden
 *     from hand OR the Champion Zone. Engine follows CR; see the RULING-CONFLICT note on the Q1 test below.
 * A2: No — a hidden card can only be played on a LATER turn, so it cannot answer the Gust that turn.
 * Rules: 811 (Hidden: hide from hand; play from facedown starting your next turn), 106.3 (Champion Zone → play only).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SWIFT_SCOUT = "ogn-263-298";
const TEEMO_SCOUT = "ogn-197-298";
const CAITLYN = "ogn-068-298";
const GUST = "ogn-169-298";
const HIDDEN_BLADE = "ogn-213-298";
const SCOUT_ABILITY = 1; // #0 is the hide-cost static

describe("Ruling 1d0e8c7f9f42e5d6 — Q1: no hiding from the Champion Zone", () => {
  /** P1's turn: Swift Scout legend, Teemo, Scout in the Champion Zone, bf1 controlled (a place to hide at), 3 energy + a rainbow. */
  function board() {
    return scenario()
      .resources(P1, { energy: 3, power: { rainbow: 1 } })
      .legend(P1, SWIFT_SCOUT, "scout")
      .champion(P1, TEEMO_SCOUT, "teemo")
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 2, name: "Grunt" }, "grunt");
  }

  test("premise: Teemo in the Champion Zone can be PLAYED from there", async () => {
    const game = await board().build();
    expect(game.zoneOf("teemo")).toBe("championZone");
    expect(game.p1.can("playChampion")).toBe(true);
  });

  // RULING-CONFLICT: riftjudge 1d0e8c7f9f42e5d6 says Hide takes a card from HAND only, so a Champion-Zone Teemo may
  // not be hidden; CR 811.1.b ("while this card is in your hand or in your Champion Zone … you may pay [A] to hide
  // this facedown") and CR 421.2.a ("any time they have a Hidden card in their hand or Champion Zone") explicitly
  // permit both zones — engine follows CR (core-rules/hidden-and-facedown-zones.test.ts asserts the same behaviour).
  // rule 811.1.b: hiding is legal from hand OR the Champion Zone.
  test("ruling 1d0e8c7f9f42e5d6 (CR-corrected) — Teemo may be hidden straight from the Champion Zone", async () => {
    const game = await board().build();
    expect(game.p1.can("hide", "teemo")).toBe(true);
    await game.p1.hide("teemo", "bf1");
    expect(game.zoneOf("teemo")).toBe("facedown-bf1");
    expect(game.state("teemo").isHidden).toBe(true);
  });

  test("after Swift Scout's [1],[Exhaust] puts Teemo into P1's HAND, hiding him at bf1 becomes legal (and costs [1] under Swift Scout)", async () => {
    const game = await board().build();
    await game.p1.activate("scout", SCOUT_ABILITY);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("teemo");
      await game.settle();
    }
    expect(game.zoneOf("teemo")).toBe("hand");
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("hide", "teemo")).toBe(true);
    await game.p1.hide("teemo", "bf1");
    expect(game.zoneOf("teemo")).toBe("facedown-bf1");
    expect(game.state("teemo").isHidden).toBe(true);
  });
});

describe("Ruling 1d0e8c7f9f42e5d6 — Q2: a card hidden THIS turn cannot be flipped in response the same turn", () => {
  /**
   * P1's turn 2. P1 controls bf1 with Caitlyn (3) and a Holder (3) on it and holds Hidden Blade + a rainbow to hide it.
   * P2's Target (2) sits at P2's bf2; P2 holds Gust + 1 energy.
   */
  function board() {
    return scenario()
      .resources(P1, { energy: 2, power: { rainbow: 1 } })
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CAITLYN, "cait")
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "bf2", { might: 2, name: "Target" }, "target")
      .hand(P1, HIDDEN_BLADE, "blade")
      .hand(P2, GUST, "gust");
  }

  test("P1 hides Hidden Blade at bf1, activates Caitlyn at P2's Target; P2 answers with Gust on Caitlyn — P1, holding priority, is NOT offered the freshly hidden Blade", async () => {
    const game = await board().build();
    await game.p1.hide("blade", "bf1");
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
    expect(game.p1.power("rainbow")).toBe(0); // hid for [rainbow]
    await game.p1.activate("cait", undefined, { targets: "target" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cait", controller: P1 })]);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "cait" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cait", "gust"]);
    await game.p2.passPriority();
    // P1 now holds priority with Gust on top of the chain — the turn it was hidden, the Blade cannot be flipped.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "blade")).toBe(false);
    expect((await game.p1.try((p) => p.reveal("blade"))).ok).toBe(false);
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
    // Gust resolves unopposed: Caitlyn returns to P1's hand.
    await game.settle({ policy: "first" });
    expect(game.zoneOf("cait")).toBe("hand");
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
  });

  test("on P1's NEXT turn the same hidden Blade is playable from face-down (for [0]; its object must be a unit here)", async () => {
    const game = await board().build();
    await game.p1.hide("blade", "bf1");
    expect(game.p1.can("reveal", "blade")).toBe(false); // not this turn, even in the open state
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1, turn 4
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "blade")).toBe(true);
    const energy = game.p1.energy();
    const hand = game.p1.hand().length;
    await game.p1.reveal("blade");
    expect(game.p1.energy()).toBe(energy); // [0]
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("holder"); // "Kill a unit at a battlefield" — from face-down, a unit here
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand + 2); // "Its controller draws 2"
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
