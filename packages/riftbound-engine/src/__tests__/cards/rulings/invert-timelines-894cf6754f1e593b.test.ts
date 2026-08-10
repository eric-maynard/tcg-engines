/**
 * Ruling 894cf6754f1e593b — Invert Timelines (OGN-201 → ogn-201-298) · Spell · Chaos · 3+[chaos]
 *     "Each player discards their hand, then draws 4."
 *   × Jinx, Rebel (OGN-202 → ogn-202-298) · Champion · 5 Might "When you discard one or more cards, ready me and give me
 *     +1 [Might] this turn."
 *   (Super Mega Death Rocket ogn-252-298 is only cited as the FAQ contrast: separate discard events trigger separately.)
 *
 * Q: I discard 4 cards to Invert Timelines — does Jinx get +4?
 * A: No, +1. "Discard your hand" is ONE discard event (all cards leave at once), and Jinx says "one or more cards", so
 *    she triggers exactly once: readied once, +1 Might. Separate discard events (e.g. a later Traveling Merchant move)
 *    each trigger her again.
 * Rules: 383.1 ("one or more" triggers once per event), 409 (Discard), 340 (the trigger resolves as its own chain item).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const INVERT_TIMELINES = "ogn-201-298";
const JINX_REBEL = "ogn-202-298";
const TRAVELING_MERCHANT = "ogn-185-298"; // "When I move, discard 1, then draw 1." — a second, separate discard event
const FILLER = "ogn-175-298";

/**
 * P1's turn: EXHAUSTED Jinx (5) in base, Traveling Merchant ready in base, an open bf1. Hand = Invert Timelines + 4
 * filler cards; exactly 3+[chaos]. P2 holds 2 cards.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", JINX_REBEL, "jinx", { exhausted: true })
    .unit(P1, "base", TRAVELING_MERCHANT, "merchant")
    .hand(P1, INVERT_TIMELINES, "invert")
    .hand(P1, FILLER, "h1")
    .hand(P1, FILLER, "h2")
    .hand(P1, FILLER, "h3")
    .hand(P1, FILLER, "h4")
    .hand(P2, FILLER, "p2a")
    .hand(P2, FILLER, "p2b");
}

describe("Ruling 894cf6754f1e593b — discarding 4 to Invert Timelines triggers Jinx, Rebel once (+1), not four times", () => {
  test("Invert Timelines resolves: P1's 4 cards (and P2's 2) hit the trash in ONE event, everyone draws 4 — exactly ONE Jinx trigger goes on the chain", async () => {
    const game = await board().build();
    expect(game.state("jinx")).toMatchObject({ isExhausted: true, might: 5 });
    await game.p1.cast("invert");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Invert Timelines resolves
    expect(game.zoneOf("invert")).toBe("trash");
    for (const c of ["h1", "h2", "h3", "h4"]) {
      expect(game.zoneOf(c)).toBe("trash");
    }
    expect(game.zoneOf("p2a")).toBe("trash");
    expect(game.zoneOf("p2b")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(4);
    expect(game.p2.hand()).toHaveLength(4);
    // If the engine offers a soft trigger-order / priority window, look at the chain now: ONE Jinx item, never four.
    await game.acceptTriggerOrder();
    const jinxItems = game.chain().filter((c) => c.cardId === "jinx" && c.triggered);
    expect(jinxItems.length).toBeLessThanOrEqual(1);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("jinx")).toMatchObject({ isReady: true, might: 6 }); // readied once, +1 once — NOT 9
    expect(game.state("jinx").mightModifier).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a SEPARATE discard event triggers her again: after Invert Timelines (+1 → 6), moving Traveling Merchant ('discard 1, then draw 1') is a new event → Jinx +1 more (7) and readied again", async () => {
    const game = await board().build();
    await game.p1.cast("invert");
    await game.settle();
    expect(game.state("jinx")).toMatchObject({ isReady: true, might: 6 });
    await game.p1.move("merchant", "bf1");
    // Merchant's trigger: discard 1 (P1 picks any card from the new hand), then draw 1.
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options[0]?.key as string);
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else if (d.kind === "order") {
        await game.acceptTriggerOrder();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.locationOf("merchant")).toBe("bf1");
    expect(game.p1.trash().length).toBeGreaterThanOrEqual(6); // invert + 4 + the Merchant discard
    expect(game.state("jinx").might).toBe(7); // a second, independent +1
    expect(game.state("jinx").mightModifier).toBe(2);
  });
});
