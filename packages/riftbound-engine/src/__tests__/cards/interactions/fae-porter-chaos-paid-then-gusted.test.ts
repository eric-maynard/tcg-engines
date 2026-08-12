/**
 * Interaction: the SAME "you may pay …" wording, two opposite window structures.
 *
 *   Fae Porter (sfd-125-221) Unit · 4 · 4 [Might]
 *     "When I move to a battlefield, you may pay [chaos] to move a unit you control to the same
 *      battlefield."                                  ← the cost LEADS the effect ⇒ base cost, FIN
 *   Gust (ogn-169-298) [Reaction] · 1 [chaos]
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   Insightful Investigator (unl-135-219) Unit · 3 · 3 [Might]
 *     "When you play me, choose an opponent. They reveal their hand. You may pay 2 XP to choose a
 *      card from their hand. If you do, they discard that card and draw 1."   ← pay at RESOLUTION
 *
 * Rules: 383.3.b / 383.3.b.1 (a cost in the instructions immediately following the leading "you
 * may" is the triggered ability's BASE COST — paid to finalize it onto the chain) · 383.3.a /
 * 383.3.a.2 (the leading "you may" is decided at finalization; declining removes the item and it is
 * treated as never having triggered) · 337.1.a (finalizing passes no priority) · 337.4 / 406.4
 * (the first window opens only once the item is finalized) · 340.1 (LIFO; a resolution is
 * uninterruptible) · 359.3.e / 359.3.e.5 (an instruction whose chosen object is no longer legal
 * simply does not execute) · 429.3 / 429.4.a ([Reaction] [Add] abilities during a payment are for
 * costs THAT player owes) · 203 (costs paid are not refunded when the effect does nothing) ·
 * 309.2 (Neutral Open: the non-turn player has no window with an empty chain).
 *
 * Q: (a) when is the [chaos] paid, and may P2 respond to the payment or to the choice of co-mover?
 *    (b) P2 Gusts the chosen co-mover in the window after the trigger is finalized — what happens on
 *    resolution, and is the [chaos] refunded? (c) if P1 declines, is there a chain item at all and
 *    does P2 get a window? (d) contrast with Insightful Investigator's 2 XP — when is THAT paid and
 *    can an opponent act between the payment and the discard it buys?
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FAE_PORTER = "sfd-125-221";
const GUST = "ogn-169-298";
const INVESTIGATOR = "unl-135-219";
const SKULKER = "ogn-175-298";

/**
 * P1's turn. P1 already controls bf1 (an Anchor stands there) and bf2 (a 2-Might Tagalong — the
 * only unit that can legally be dragged along, since a unit already at bf1 has no move to make).
 * The Porter waits in base with exactly one [chaos] to pay with; P2 holds a Gust and its runes.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Anchor" }, "anchor")
    .unit(P1, "bf2", { might: 2, name: "Tagalong" }, "tag")
    .unit(P1, "base", FAE_PORTER, "porter")
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .hand(P2, GUST, "gust");
}

/** Move the Porter to bf1 and stop on the trigger's finalization prompt. */
async function moved(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("porter", "bf1");
  return game;
}

describe("Fae Porter's [chaos] is a base cost — paid before anyone may answer, and never refunded", () => {
  test("(a) the opt-in + payment is a FINALIZATION prompt for P1 (383.3.b.1); P2 cannot respond to it (337.1.a)", async () => {
    const game = await moved();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    expect(game.decision()?.prompt).toMatch(/\[chaos\]/);
    expect(game.actingSeat()).toBe(P1);
    // 429.3 / 429.4.a — P2 owes no cost here, so P2 has no [Add] window and certainly no play window.
    expect(game.p2.can("cast", "gust")).toBe(false);
    expect(game.p1.power("chaos")).toBe(1); // not yet spent: accepting is what pays
  });

  test("(a) accepting pays the [chaos] AND binds the co-mover before priority — the item reaches the chain fully chosen (383.3.b, 402.2)", async () => {
    const game = await moved();
    await game.p1.yes();
    expect(game.p1.power("chaos")).toBe(0); // paid at finalization
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "porter", controller: P1, name: "Fae Porter", triggered: true }),
    ]);
    expect((game.chain()[0] as { targets?: readonly string[] }).targets).toEqual(["tag"]);
    // Only now does anyone get a window (337.4 / 406.4), and it starts with the item's controller.
    expect(game.actingSeat()).toBe(P1);
  });

  test("(b) P2 Gusts the chosen co-mover in that window: the trigger resolves doing NOTHING (359.3.e.5) and the [chaos] is NOT refunded (203)", async () => {
    const game = await moved();
    await game.p1.yes();
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("gust", { targets: "tag" });
    await game.settle();

    expect(game.zoneOf("tag")).toBe("hand"); // Gust resolved first — LIFO (340.1)
    expect(game.p1.hand()).toEqual(["tag"]);
    expect(game.p1.units("bf1")).toEqual(["anchor", "porter"]); // nothing was dragged along
    expect(game.p1.units("bf2")).toEqual([]);
    expect(game.p1.power("chaos")).toBe(0); // paid for nothing — costs are not refunded
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(c) declining removes the trigger entirely (383.3.a.2): no chain item, no payment, and P2 never gets a window (309.2)", async () => {
    const game = await moved();
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.p1.power("chaos")).toBe(1); // nothing was paid
    expect(game.p1.units("bf2")).toEqual(["tag"]); // nothing moved
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.can("cast", "gust")).toBe(false);
  });

  test("(d) CONTRAST — Insightful Investigator's 2 XP is not a base cost: it is asked at RESOLUTION (383.3.b's own example)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { chaos: 1 } })
      .xp(P1, 2)
      .hand(P1, INVESTIGATOR, "inv")
      .hand(P2, GUST, "theirGust")
      .hand(P2, SKULKER, "theirSkulker")
      .build();
    await game.p1.play("inv");
    // The trigger is on the chain with nothing asked yet — no FIN prompt, no XP spent.
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1, timing: "ACT" });
    expect(game.p1.xp()).toBe(2);

    await game.settle(); // both pass → the item resolves and only THEN asks
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "RES" });
    expect(game.p1.xp()).toBe(2); // still unpaid while the prompt is open
  });

  test("(d) no opponent can act between that payment and the discard it buys (340.1 — resolution is uninterruptible)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { chaos: 1 } })
      .xp(P1, 2)
      .hand(P1, INVESTIGATOR, "inv")
      .hand(P2, GUST, "theirGust")
      .hand(P2, SKULKER, "theirSkulker")
      .build();
    await game.p1.play("inv");
    await game.settle();
    await game.p1.pick("theirGust");

    // One step: XP spent, card discarded, replacement drawn — and the next decision is P1's own
    // main phase, never a window for P2.
    expect(game.p1.xp()).toBe(0);
    expect(game.zoneOf("theirGust")).toBe("trash");
    expect(game.p2.trash()).toContain("theirGust");
    expect(game.p2.hand()).toHaveLength(2); // Skulker + the replacement draw
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
