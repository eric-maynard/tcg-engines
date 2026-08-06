/**
 * Whirlwind — ogn-187-298 · Spell · Chaos · 3 energy + [chaos] · (no timing keyword)
 *
 *   Starting with the next player, each player may return a unit to its owner's hand.
 *
 * Rules: each player makes their own optional choice as the spell RESOLVES, in turn order
 * beginning with the player after the caster (cf. King's Edict wording); nothing is targeted
 * when the spell is played. 349/806: a spell without [Action]/[Reaction] is played only on
 * your own turn in an Open State. 401: "return to hand" goes to the OWNER's hand.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-187-298";

function board(energy = 3, power: Record<string, number> = { chaos: 1 }) {
  return scenario()
    .resources(P1, { energy, power })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Raider" }, "raider")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .unit(P1, "base", { might: 2, name: "Friend" }, "friend")
    .hand(P1, CARD, "ww");
}

describe("Whirlwind (ogn-187-298)", () => {
  test("cost: castable with 3 energy + 1 chaos; not with 2 energy or without the chaos power", async () => {
    expect((await board().build()).p1.can("cast", "ww")).toBe(true);
    expect((await board(2).build()).p1.can("cast", "ww")).toBe(false);
    expect((await board(3, {}).build()).p1.can("cast", "ww")).toBe(false);
  });

  test("timing: no [Action]/[Reaction] — not castable on the opponent's turn", async () => {
    const oppTurn = await board().active(P2).build();
    expect(oppTurn.p1.can("cast", "ww")).toBe(false);
  });

  test("timing: without [Action] it cannot be played inside a showdown, even on your own turn (310.1.a, 806.1.b)", async () => {
    const game = await board().build();
    await game.p1.move("friend", "bf1"); // opens a combat showdown, P1 has focus
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "ww")).toBe(false);
  });

  test("a unit returned this way goes to its OWNER's hand (engine's single-choice approximation), spell to trash", async () => {
    const game = await board().build();
    await game.p1.cast("ww", { targets: "raider" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("hand");
    expect(game.state("raider").owner).toBe(P2);
    expect(game.p2.hand()).toContain("raider");
    expect(game.p1.hand()).not.toContain("raider");
    expect(game.zoneOf("ww")).toBe("trash");
  });

  test.failing("BUG: nothing is chosen on cast; on resolution EACH player, starting with the next player, may return a unit of their choice", async () => {
    // Expected: cast needs no target; when it resolves P2 (the next player) is prompted first with an
    // optional pick over all units, then P1; each returned unit goes to its owner's hand. Actual: the
    // caster must pick exactly one unit as a play-time target and only that unit is returned.
    const game = await board().build();
    await game.p1.cast("ww");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    const first = game.decision();
    expect(first).toMatchObject({ allowDecline: true, kind: "pick", seat: P2 });
    expect(first?.kind === "pick" && first.options.map((o) => o.card).sort()).toEqual(["friend", "home", "raider"]);
    await game.p2.pick("friend");
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    await game.p1.pick("raider");
    await game.settle();
    expect(game.p1.hand()).toContain("friend");
    expect(game.p2.hand()).toContain("raider");
    expect(game.zoneOf("home")).toBe("base");
    expect(game.zoneOf("ww")).toBe("trash");
  });

  test.failing("BUG: every player 'may' decline — with all players declining nothing moves", async () => {
    // Expected: both prompts can be declined and the board is unchanged. Actual: see above — the
    // caster is forced to name one unit when casting.
    const game = await board().build();
    await game.p1.cast("ww");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    await game.p2.decline();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.decline();
    await game.settle();
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.zoneOf("home")).toBe("base");
    expect(game.zoneOf("friend")).toBe("base");
    expect(game.zoneOf("ww")).toBe("trash");
  });
});
