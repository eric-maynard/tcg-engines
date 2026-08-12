/**
 * Ruling 45204902b49495a8 — (general [Hidden] rules)
 *   Stand-ins: Fight or Flight (ogn-168-298) · [Hidden] [Action] [2] "Move a unit from a battlefield to
 *   its base." (the opponent's move effect) · Hidden Blade (ogn-213-298) · [Hidden] [Action] [2][order]
 *   "Kill a unit at a battlefield. Its controller draws 2." (my facedown card).
 *
 * Q: Can I react with a hidden card when my unit is being moved off a battlefield by an opponent's
 *    spell/unit/effect?
 * A: Yes — the opponent's spell goes on the chain, I get priority, and I may flip a card hidden on an
 *    EARLIER turn. Limits: it must not have been hidden this turn, it must have a legal target, and there
 *    is nothing to react to when the opponent plays a permanent or uses an [Add] effect.
 * Rules: 811.1 ([Hidden]: Reaction timing, not the turn it was hidden, targets restricted to "here"),
 *        332/336–340 (priority on a chain, LIFO), 337.2 (a permanent resolves at once — no window),
 *        355.8 (a spell with no legal target cannot be played), 430.3 ([Add] is not a chain item).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const HIDDEN_BLADE = "ogn-213-298";

/** Turn 3, P2 active with [2]. P1 holds bf1 with a Warden and a Hidden Blade hidden there earlier. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Warden" }, "warden")
    .unit(P2, "bf1", { might: 4, name: "Raider" }, "raider")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .hand(P2, FIGHT_OR_FLIGHT, "fof");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

describe("Ruling 45204902b49495a8 — reacting with a hidden card to a move effect", () => {
  test("the opponent's move spell puts an item on the chain; with priority I may flip my hidden card for [0] and it lands on top", async () => {
    const game = await board().build();
    await game.p2.cast("fof", { targets: "warden" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "blade")).toBe(true);
    await game.p1.reveal("blade", { answers: ["raider"] });
    expect(game.chain().map((i) => i.cardId)).toEqual(["fof", "blade"]);
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // the Blade resolved first (LIFO)
    expect(game.locationOf("warden")).toBe("base"); // then the move
    expect(game.violations()).toEqual([]);
  });

  test("limit — hidden THIS turn: a card hidden on the same turn cannot answer anything", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Warden" }, "warden")
      .unit(P2, "bf1", { might: 4, name: "Raider" }, "raider")
      .hand(P1, HIDDEN_BLADE, "blade")
      .build();
    await game.p1.hide("blade", "bf1");
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "blade")).toBe(false);
  });

  test("limit — no legal target: with no unit at a battlefield to kill, the hidden Blade is not playable even with priority", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 3, name: "Warden" }, "warden")
      .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
      .hand(P2, FIGHT_OR_FLIGHT, "fof")
      .build();
    await game.p2.cast("fof", { targets: "warden" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    // the only unit at a battlefield is the Warden — and 811.1.d restricts the flip to bf1, where it is
    expect(game.p1.can("reveal", "blade")).toBe(true);
    // once the Warden has left, the Blade has no legal target at all
    await game.p1.passPriority();
    expect(game.locationOf("warden")).toBe("base");
    expect(game.p1.can("reveal", "blade")).toBe(false);
  });

  test("limit — nothing to react to: the opponent playing a UNIT gives no window (the permanent resolves at once)", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P2, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Warden" }, "warden")
      .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
      .hand(P2, { cardType: "unit", energyCost: 3, might: 3, name: "Test Grunt" }, "grunt")
      .build();
    await game.p2.play("grunt");
    expect(game.zoneOf("grunt")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.isActing()).toBe(false);
  });

  test("limit — an [Add] gives no window either: exhausting a rune creates no chain item to answer", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .rune(P2, "fury", { alias: "pr" })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Warden" }, "warden")
      .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
      .build();
    await game.p2.tapRune("pr");
    expect(game.p2.energy()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(showdown(game)?.active).not.toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.isActing()).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
