/**
 * Ruling 904ca6f2f3539f39 — Zaun Warrens (OGN-298 → ogn-298-298, battlefield) "When you conquer
 *   here, discard 1, then draw 1." × Voracious Gromp (UNL-100 → unl-100-219) · 5 Might ·
 *   "[Hunt 3] (When I conquer or hold, gain 3 XP.)"
 *
 * Q: Does a battlefield's conquer effect have priority over other "When I conquer" effects?
 * A: No. Every "when you conquer" trigger — from the battlefield, from a unit, from anywhere —
 *    triggers simultaneously off the one Conquer. Because they are simultaneous, the player who
 *    controls them chooses the order they go on the Chain, and they then resolve last-in-first-out.
 *    Nothing gives the battlefield's own trigger precedence.
 * Rules: 383.3.d (simultaneous triggers a player controls are ordered by that player), 336–340
 *        (the Chain resolves LIFO), 471.2 / 471.2.a (Conquer abilities trigger at the battlefield
 *        that Scored).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZAUN_WARRENS = "ogn-298-298";
const GROMP = "unl-100-219";

const SPARE = { cardType: "unit", domain: "fury", energyCost: 1, might: 2, name: "Test Spare" } as const;

/** P1's turn; bf1 IS Zaun Warrens (abilities live) and is P2's, held by a 1-Might Chaff. */
const board = () =>
  scenario()
    .battlefield("bf1", { controller: P2, def: ZAUN_WARRENS, inert: false })
    .unit(P2, "bf1", { might: 1, name: "Chaff" }, "chaff")
    .unit(P1, "base", GROMP, "gromp")
    .hand(P1, SPARE, "spare"); // something for the Warrens' "discard 1" to take

describe("Ruling 904ca6f2f3539f39 — a battlefield's conquer trigger has no precedence", () => {
  test("both conquer triggers exist off the ONE conquest, and their controller is offered the order", async () => {
    const game = await board().build();
    await game.p1.move("gromp", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus(); // close the showdown; combat resolves and P1 conquers
    const d = game.decision();
    // rule 383.3.d — the conquering player is asked how to sequence their two simultaneous triggers.
    expect(d).toMatchObject({ defaultable: true, kind: "order", seat: P1 });
    expect(d?.kind === "order" ? d.items.length : 0).toBe(2);
    expect(game.chain().length).toBe(2);
  });

  test("both then resolve: the Gromp's [Hunt 3] pays 3 XP and the Warrens' discard-then-draw happens", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("gromp", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(3);
    expect(game.p1.hand().length).toBe(handBefore); // discard 1, then draw 1
    expect(game.p1.trash().length).toBeGreaterThan(0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("the ordering really is the controller's: taking the offer and putting the Gromp's trigger on top resolves it first", async () => {
    const game = await board().build();
    await game.p1.move("gromp", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    const d = game.decision();
    const keys = d?.kind === "order" ? d.items.map((i) => i.key) : [];
    expect(keys.length).toBe(2);
    await game.p1.order([...keys].reverse()); // last key = top of the chain = resolves first
    await game.settle();
    // whichever order was chosen, BOTH resolved — neither was pre-empted by the other
    expect(game.p1.xp()).toBe(3);
    expect(game.p1.trash().length).toBeGreaterThan(0);
    expect(game.violations()).toEqual([]);
  });
});
