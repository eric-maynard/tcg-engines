/**
 * Ruling 72bab4ce80312d47 — Gust (OGN-169 → ogn-169-298) · Spell · [1] · Reaction
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Arise! (SFD-198 → sfd-198-221) — used only to put a real 2-Might TOKEN on a battlefield.
 *
 * Q: When can a moving unit be Gusted, and what happens to a token that gets Gusted?
 * A: A unit walking onto an EMPTY battlefield opens a showdown, and that showdown is the window in which Gust may
 *    be played — before the battlefield is conquered. A unit walking onto a battlefield its own controller already
 *    occupies opens no showdown at all, so no such window exists. A Gusted TOKEN does not go to hand: a token that
 *    leaves the board ceases to exist.
 * Rules: 344/347 (a move onto an uncontested battlefield opens a showdown; play windows live inside it),
 *        348.2.a (control is established when that showdown closes), 323.11 (un-contest when the contester's units
 *        are gone), 186.1 (a token in any non-board zone ceases to exist).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const ARISE = "sfd-198-221";
const SERRATED_DIRK = "sfd-009-221";

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

describe("Ruling 72bab4ce80312d47 — Gust's windows, and Gusting a token", () => {
  test("moving onto an EMPTY battlefield opens a showdown: that is the window, and P2 may Gust the arriving 2-Might Scout there", async () => {
    const game = await scenario()
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .hand(P2, GUST, "gust")
      .build();
    await game.p1.move("scout", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: false });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "scout" });
    await game.settle();
    // Gusted before conquest: the Scout is back in hand and nobody took bf1.
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("moving onto a battlefield its own controller ALREADY occupies opens no showdown — there is no reaction window at all, the turn simply returns to P1's main phase", async () => {
    const game = await scenario()
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .unit(P1, "base", { might: 2, name: "Walker" }, "walker")
      .hand(P2, GUST, "gust")
      .build();
    await game.p1.move("walker", "bf1");
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.decision()).toBeNull(); // P2 never gets a window here
  });

  test("a Gusted TOKEN disappears instead of going to hand — hand and trash stay empty and the token is in no zone", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .gear(P1, SERRATED_DIRK, "dirk")
      .hand(P1, ARISE, "arise")
      .hand(P2, GUST, "gust")
      .runes(P2, "chaos", 3)
      .build();
    await game.p1.cast("arise");
    await game.settle();
    await game.p1.pick("battlefield-bf1"); // the Sand Soldier is played to the battlefield P1 controls
    await game.p1.decline(); // decline "ready up to two"
    await game.settle();
    const tok = game.findAll({ name: "Sand Soldier" })[0] as string;
    expect(game.state(tok)).toMatchObject({ isToken: true, might: 2 });
    expect(game.zoneOf(tok)).toBe("battlefield-bf1");

    await game.advanceTurn(); // P2's turn: Gust is a Reaction, castable in their open main phase
    await game.p2.tapRunes(1);
    await game.p2.cast("gust", { targets: tok });
    await game.settle();
    expect(game.has(tok)).toBe(false);
    expect(game.zoneOf(tok)).toBe("gone");
    expect(game.locationOf(tok)).toBeUndefined();
    expect(game.p1.hand()).not.toContain(tok);
    expect(game.p1.trash()).not.toContain(tok);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // the Holder is still there
  });

  test("contrast — a real CARD Gusted from a battlefield does go to its owner's hand", async () => {
    const game = await scenario()
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .hand(P2, GUST, "gust")
      .build();
    await game.p1.move("scout", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("gust", { targets: "scout" });
    await game.settle();
    expect(game.p1.hand()).toContain("scout");
    expect(game.has("scout")).toBe(true);
  });
});
