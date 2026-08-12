/**
 * Ruling 49964b0f66bca7d4 — (no specific card) Focus after the showdown's INITIAL chain
 *
 * Q: How do Focus and priority work after the initial chain in a showdown?
 * A: The initial chain (the "when I attack" / "when I defend" triggers) is the one chain after which Focus
 *    does NOT pass: the attacker keeps Focus and priority. After every later chain resolves, Focus passes
 *    to the other player, and keeps alternating for the rest of the showdown.
 * Rules: 345 (the contesting player — the attacker — gains Focus as the showdown begins), 346 (Focus passes
 *        when the last chain item resolves), 346.1 (it does NOT pass when that chain opened from triggered
 *        abilities — the Combat Chain is the named example), 347.1.b/347.2.b (later chains pass Focus on).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** 3-Might attacker with "When I attack, draw 1." */
const VANGUARD = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "attack", on: "self" }, type: "triggered" }],
  cardType: "unit",
  domain: "fury",
  energyCost: 3,
  might: 3,
  name: "Test Vanguard",
  rulesText: "When I attack, draw 1.",
} as const;

/** 5-Might defender with "When I defend, draw 1." */
const WARDEN = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "defend", on: "self" }, type: "triggered" }],
  cardType: "unit",
  domain: "order",
  energyCost: 3,
  might: 5,
  name: "Test Warden",
  rulesText: "When I defend, draw 1.",
} as const;

/** [Action] "Give a unit +1 [Might] this turn." — the later chains. */
const NUDGE = {
  abilities: [
    { effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" },
  ],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Nudge",
  rulesText: "[Action] Give a unit +1 [Might] this turn.",
  timing: "action",
} as const;

function focus(game: Game): string | undefined {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).at(-1)?.focusPlayer;
}

/** P1's turn: P2 holds bf1 with the Warden; P1's Vanguard attacks. Each player holds two Nudges. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", WARDEN, "warden")
    .unit(P1, "base", VANGUARD, "vanguard")
    .hand(P1, NUDGE, "n1")
    .hand(P1, NUDGE, "n2")
    .hand(P2, NUDGE, "m1");
}

describe("Ruling 49964b0f66bca7d4 — the attacker keeps Focus after the initial chain, and only after that does Focus alternate", () => {
  test("the initial chain really is the attack/defend triggers, and it resolves before anyone acts", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.move("vanguard", "bf1");
    expect(game.chain().map((i) => i.cardId).sort()).toEqual(["vanguard", "warden"]);
    expect(game.chain().every((i) => i.triggered)).toBe(true);
    await game.acting().passPriority();
    await game.acting().passPriority();
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(p1Hand + 1); // both triggers drew
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
  });

  test("with the initial chain resolved, Focus is STILL the attacker's — it did not pass to the defender", async () => {
    const game = await board().build();
    await game.p1.move("vanguard", "bf1");
    // drain the initial chain by passing priority until it is empty (never `settle()`, which would
    // pass Focus for both players and fight the combat out)
    while (game.chain().length > 0) {
      await game.acting().passPriority();
    }
    expect(focus(game)).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "n1")).toBe(true); // the attacker may open the next chain
    expect(game.p2.can("cast", "m1")).toBe(false);
  });

  test("after the NEXT chain resolves Focus does pass, and it keeps alternating from there", async () => {
    const game = await board().build();
    await game.p1.move("vanguard", "bf1");
    while (game.chain().length > 0) {
      await game.acting().passPriority();
    }
    // Chain 2 — the attacker's Action.
    await game.p1.cast("n1", { targets: "vanguard" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(focus(game)).toBe(P2); // now it passes
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    // Chain 3 — the defender's Action; Focus comes back to the attacker.
    await game.p2.cast("m1", { targets: "warden" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(focus(game)).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
