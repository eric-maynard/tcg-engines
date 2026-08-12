/**
 * Ruling 84112eb576bd0adb — Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · 9
 *   "At the end of your turn, reveal cards from the top of your Main Deck until you reveal a unit and
 *    banish it. Play it, ignoring its cost, and recycle the rest." — two copies, so two triggers.
 *
 * Q: With two Aurora triggers, does the unit hit by the SECOND trigger resolve between the two
 *    triggers, or do both Aurora triggers finish first?
 * A: The unit becomes Pending during the second trigger's resolution and is played in the cleanup right
 *    after that trigger — before the first Aurora trigger resolves. Any "when you play me" effect of
 *    that unit goes on the chain ON TOP of the still-waiting first Aurora trigger, resolves there, and
 *    only then does Aurora trigger 1 resolve.
 * Rules: 340.1 (LIFO: the newest finalized item resolves), 354.3 / 337.1 (a card played mid-resolution
 *        is Pending and is finalized after the current resolution ends), 318/320 (nothing resolves
 *        inside a Cleanup, but pending items are added there), 383.3.d (the controller orders
 *        simultaneous triggers).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const CLEAVE = "ogn-004-298"; // a spell, so the reveal keeps digging
const SKULKER = "ogn-175-298"; // a plain 3-Might unit, no triggers

/** "When you play me, draw 1." — the WYPM whose position on the chain the ruling is about. */
const SCRYER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "play-self" }, type: "triggered" }],
  cardType: "unit",
  domain: "fury",
  energyCost: 1,
  might: 3,
  name: "Test Scryer",
  rulesText: "When you play me, draw 1.",
} as const;

/** P1's turn, two Auroras out. Deck top→: spell, Scryer (WYPM unit), spell, Skulker (plain unit), spell. */
function board() {
  return scenario()
    .gear(P1, DAZZLING_AURORA, "aurora1")
    .gear(P1, DAZZLING_AURORA, "aurora2")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .deck(P1, [CLEAVE, SCRYER, CLEAVE, SKULKER, CLEAVE], ["s1", "scryer", "s2", "skulker", "s3"]);
}

describe("Ruling 84112eb576bd0adb — the unit resolves between the two Aurora triggers, and its WYPM rides above the first", () => {
  test("ending the turn queues BOTH Aurora triggers on the same chain before either resolves", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    const auroras = game.chain().filter((c) => c.cardId === "aurora1" || c.cardId === "aurora2");
    expect(auroras).toHaveLength(2);
    expect(auroras.every((c) => c.triggered && c.controller === P1)).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("the top Aurora resolves first, plays the revealed unit at once, and that unit's WYPM sits ABOVE the remaining Aurora trigger", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    await game.acceptTriggerOrder();
    // Drain priority until the first Aurora has resolved and a new item has appeared on top.
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || d.kind !== "action" || d.context !== "chain") {
        break;
      }
      if (game.chain().length === 2 && game.chain().some((c) => c.cardId === "scryer")) {
        break;
      }
      await game.seat(d.seat).passPriority();
    }
    const ids = game.chain().map((c) => c.cardId);
    // One Aurora trigger is still waiting at the bottom; the played unit's WYPM is on top of it.
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe("scryer");
    expect(ids[0]).toMatch(/^aurora[12]$/);
    expect(game.zoneOf("scryer")).toBe("base"); // the unit itself was played immediately
    expect(game.violations()).toEqual([]);
  });

  test("full run: the WYPM draw happens before the second Aurora trigger resolves, and both revealed units end up in play", async () => {
    const game = await board().build();
    const before = game.p1.hand().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("scryer")).toBe("base");
    expect(game.zoneOf("skulker")).toBe("base"); // the second Aurora dug to the next unit
    expect(game.p1.hand().length).toBe(before + 1); // the Scryer's "when you play me, draw 1"
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("the draw order proves the ordering: s1 is recycled to the bottom, and the Scryer's WYPM draw takes s2 — i.e. it resolved BEFORE the remaining Aurora trigger dug for its own unit", async () => {
    const game = await board().build();
    await game.advanceTurn();
    expect(game.p1.deck().slice(-1)).toEqual(["s1"]); // "recycle the rest" → bottom of the deck
    expect(game.zoneOf("s2")).toBe("hand"); // drawn by the played unit's "when you play me"
    expect(game.zoneOf("skulker")).toBe("base"); // the other Aurora then dug past s2 to the next unit
    expect(game.violations()).toEqual([]);
  });
});
