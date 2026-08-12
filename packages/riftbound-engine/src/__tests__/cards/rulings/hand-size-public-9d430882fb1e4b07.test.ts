/**
 * Ruling 9d430882fb1e4b07 — (no specific card) may I track my opponent's hand size with dice?
 *
 * Q: Is it allowed to track an opponent's hand size with dice (or written notes)?
 * A: Yes — how many cards are in a hand is information both players are entitled to at any time, so
 *    recording it with dice or notes is a convenience, not hidden-information abuse. WHICH cards
 *    they are stays private. (The dice-and-notes half is Tournament Policy and has no in-game
 *    surface; what the engine can pin down is the information model underneath it: the COUNT of a
 *    hand is visible to everyone, its CONTENTS are not.)
 * Rules: 127 (private zones — non-owners may not see identities), 108.2 (the hand is a private
 *        zone, not a secret one: its size is knowable), 128.5 (hidden information).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GRUNT = { cardType: "unit", domain: "fury", energyCost: 0, might: 2, name: "Test Grunt" } as const;

const handSummary = (zones: readonly { zone: string; owner?: string; count: number; visible: boolean }[], owner: string) =>
  zones.find((z) => z.zone === "hand" && z.owner === owner);

/** P1's turn; P1 holds three cards, P2 holds one. */
const board = () =>
  scenario()
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .hand(P1, GRUNT, "a")
    .hand(P1, GRUNT, "b")
    .hand(P1, GRUNT, "c")
    .hand(P2, GRUNT, "x");

describe("Ruling 9d430882fb1e4b07 — hand SIZE is public, hand CONTENTS are not", () => {
  test("P2 can read the exact size of P1's hand", async () => {
    const game = await board().build();
    const seen = handSummary(game.p2.listZones({ all: true }), P1);
    expect(seen?.count).toBe(3);
  });

  test("…while the identities stay hidden from them", async () => {
    const game = await board().build();
    expect(handSummary(game.p2.listZones({ all: true }), P1)?.visible).toBe(false);
    expect(handSummary(game.p2.listZones({ all: true }), P2)?.visible).toBe(true); // their own
    const view = game.view(P2);
    expect(view.zones.hand?.filter((c) => "hidden" in c && c.hidden).length).toBe(3);
  });

  test("the number a tracker would follow stays correct as cards leave the hand", async () => {
    const game = await board().build();
    expect(handSummary(game.p2.listZones({ all: true }), P1)?.count).toBe(3);
    await game.p1.play("a");
    expect(handSummary(game.p2.listZones({ all: true }), P1)?.count).toBe(2);
    await game.p1.play("b");
    expect(handSummary(game.p2.listZones({ all: true }), P1)?.count).toBe(1);
    expect(game.p1.hand()).toEqual(["c"]);
  });

  test("…and as the turn hands over and the new turn player draws", async () => {
    const game = await board().build();
    const before = handSummary(game.p1.listZones({ all: true }), P2)?.count ?? 0;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(handSummary(game.p1.listZones({ all: true }), P2)?.count).toBe(before + 1); // the Draw Phase
    expect(game.violations()).toEqual([]);
  });
});
