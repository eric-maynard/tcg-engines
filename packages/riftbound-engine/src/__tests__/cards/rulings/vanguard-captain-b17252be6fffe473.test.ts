/**
 * Ruling b17252be6fffe473 — Vanguard Captain (OGN-218 → ogn-218-298) "[Legion] — When you play me, play two 1 [Might]
 *   Recruit unit tokens here." × Gust (OGN-169 → ogn-169-298) Reaction "Return a unit at a battlefield with 3 [Might] or
 *   less to its owner's hand." × Soaring Scout (OGN-216 → ogn-216-298) 1-Might unit.
 *
 * Q: Can you react to a unit being played? When can reactions be played around unit movement / showdowns?
 * A: A unit (or gear) play itself opens no reaction window. A "when played" TRIGGER (Captain's Legion) goes on the
 *    chain and can be reacted to. Moving a unit to an EMPTY enemy/uncontrolled battlefield opens a Showdown in which
 *    everyone may play reactions / actions (with focus); conquering happens only in the cleanup that ends it — remove
 *    the unit first and nothing is scored.
 * Rules: 339–340 (permanents leave the chain immediately; triggers are chain items), 344.2 / 345 (non-combat showdown),
 *        444 (conquer on cleanup), 724 (Legion).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VANGUARD_CAPTAIN = "ogn-218-298";
const GUST = "ogn-169-298";
const SOARING_SCOUT = "ogn-216-298";

/**
 * P1's turn. P1 holds bf1 (Holder 4 there); bf2 is empty and uncontrolled. P1: a free Pawn (to turn Legion on),
 * Vanguard Captain, Soaring Scout, plenty of resources. P2: two Gusts + [2].
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 4, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 2, name: "Runner" }, "runner")
    .hand(P1, { cardType: "unit", energyCost: 0, might: 1, name: "Pawn" }, "pawn")
    .hand(P1, VANGUARD_CAPTAIN, "captain")
    .hand(P1, SOARING_SCOUT, "scout")
    .resources(P1, { energy: 10, power: { order: 2 } })
    .hand(P2, GUST, "gust")
    .hand(P2, GUST, "gust2")
    .resources(P2, { energy: 2 });
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

describe("Ruling b17252be6fffe473 — no reaction to a bare unit play; triggers and showdowns DO open windows", () => {
  test("a unit with no play trigger (Soaring Scout) played straight to a controlled battlefield: nothing goes on the chain, P2 never gets priority and cannot Gust it 'as it is played'", async () => {
    const game = await board().build();
    await game.p1.play("scout", { to: "bf1" });
    expect(game.zoneOf("scout")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([]);
    // Straight back to P1's open main phase — no chain/priority window for P2.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.can("cast", "gust")).toBe(false);
    expect(game.p2.legal()).toEqual([]);
  });

  test("a unit WITH a 'when you play me' trigger (Vanguard Captain, Legion on): the trigger is a chain item, P2 gets priority and may Gust the Captain in response", async () => {
    const game = await board().build();
    await game.p1.play("pawn", { to: "base" });
    await game.settle();
    await game.p1.play("captain", { to: "bf1" });
    expect(game.zoneOf("captain")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "captain", controller: P1, triggered: true })]);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "captain" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["captain", "gust"]);
    await game.settle();
    expect(game.zoneOf("captain")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });

  test("moving a unit to an EMPTY uncontrolled battlefield opens a (non-combat) Showdown; P2 becomes relevant and can act in it", async () => {
    const game = await board().build();
    await game.p1.move("runner", "bf2");
    expect(game.zoneOf("runner")).toBe("battlefield-bf2");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf2" });
    expect(showdown(game)?.isCombatShowdown).not.toBe(true);
    // Not conquered yet — that only happens in the cleanup that ends the showdown.
    expect(game.gameState.battlefields.bf2?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
    // P1 (mover) has focus first; passing hands focus to P2, who may now play Gust (a reaction — legal with focus too).
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
  });

  test("if the unit is removed (Gust) before the showdown's cleanup, P1 does NOT conquer bf2 and scores nothing", async () => {
    const game = await board().build();
    await game.p1.move("runner", "bf2");
    await game.p1.passFocus();
    await game.p2.cast("gust", { targets: "runner" });
    await game.settle();
    expect(game.zoneOf("runner")).toBe("hand");
    expect(showdown(game)).toBeUndefined();
    expect(game.gameState.battlefields.bf2?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: with no response the showdown ends and P1 conquers bf2 for 1 point", async () => {
    const game = await board().build();
    await game.p1.move("runner", "bf2");
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
