/**
 * Altar to Unity — ogn-275-298 · Battlefield
 *
 *   When you hold here, play a 1 [Might] Recruit unit token in your base.
 *
 * Rules: 315.2.b / 469.2 (Hold = the turn player keeps control of a battlefield through their
 * Beginning Phase → scores 1), 383.4.d.2.b + 471.2.b (a battlefield's "When you hold here" is a Hold
 * Effect of the HOLDING player, put on the chain in the Beginning Phase), 471.2.c (once per turn),
 * 187 (Recruit = 1-Might unit token), 359.2.c / 140 (units — tokens included — enter exhausted),
 * 350.2 (a token is "played" → the base, not "here").
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. "You" is whoever HOLDS (controls) the Altar this Beginning Phase, not the player whose
 *     battlefield card it is: P2 holding P1's Altar gets the Recruit, P1 gets nothing.
 *  2. Hold ≠ Conquer: walking onto an empty Altar scores a conquer point but plays no token; and the
 *     opponent's Beginning Phase never holds YOUR battlefield.
 *  3. The token lands in the BASE (exhausted, 1 Might, a real unit token) even though the trigger
 *     lives at a battlefield — never at the Altar itself.
 *  4. Timing: the trigger sits on the chain during the Beginning Phase (P2 gets a priority window);
 *     the token exists before P1's Main Phase opens; one token per hold, so two of P1's turns → two.
 *  5. Partner: Blue Sentinel (unl-087-219, "your hold effects for holding here trigger an additional
 *     time") standing on the Altar → two Recruits from a single hold.
 *  6. Empty edge: a token that later leaves the board ceases to exist (186.1) — not asserted here; the
 *     hold with the Altar's only unit gone simply never happens (control is lost, 190.4.c).
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ogn-275-298";
const BLUE_SENTINEL = "unl-087-219"; // 4-Might unit: your hold effects for holding here trigger an additional time

const tokensOf = (game: Game, seat: "p1" | "p2", at?: string) => game[seat].units(at as "base").filter((id) => game.state(id).isToken);

/** P2 is about to end turn 2; P1 controls the Altar (live text) with a vanilla 2-Might holder on it. */
function aboutToHold() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("altar", { controller: P1, def: CARD, inert: false, owner: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "altar", { might: 2, name: "Holder" }, "holder");
}

describe("Altar to Unity (ogn-275-298)", () => {
  test("registry payload: one triggered ability — hold here by a friendly player → create a 1-Might Recruit unit token in base", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Altar to Unity" });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { location: "base", token: { might: 1, name: "Recruit", type: "unit" }, type: "create-token" },
      trigger: { event: "hold", on: { controller: "friendly", location: "here" } },
      type: "triggered",
    });
  });

  test("holding: P1 scores 1 in the Beginning Phase and the Altar's trigger goes on the chain under P1's control; P2 gets a priority window before it resolves", async () => {
    const game = await aboutToHold().build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "altar", controller: P1, triggered: true })]);
    expect(tokensOf(game, "p1")).toHaveLength(0); // nothing yet — it is a chain item, not an [Add]
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(tokensOf(game, "p1", "base")).toHaveLength(1);
  });

  test("the Recruit: exactly one 1-Might unit TOKEN, in P1's BASE (not at the Altar), exhausted, owned and controlled by P1 — ready for use when the Main Phase opens", async () => {
    const game = await aboutToHold().build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    const toks = tokensOf(game, "p1");
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0]!)).toMatchObject({ baseMight: 1, cardType: "unit", controller: P1, isExhausted: true, isToken: true, might: 1, name: "Recruit", owner: P1, zone: "base" });
    expect(tokensOf(game, "p1", "altar")).toHaveLength(0);
    expect(game.p1.units("altar")).toEqual(["holder"]);
    expect(tokensOf(game, "p2")).toHaveLength(0);
    expect(game.violations()).toEqual([]);
  });

  test("'you' = the HOLDER: P2 holding an Altar that is P1's battlefield card gets the Recruit in P2's base; P1 gets nothing", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("altar", { controller: P2, def: CARD, inert: false, owner: P1 })
      .unit(P2, "altar", { might: 2, name: "Squatter" }, "squatter")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(1);
    const toks = tokensOf(game, "p2", "base");
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0]!)).toMatchObject({ controller: P2, might: 1, name: "Recruit", owner: P2 });
    expect(tokensOf(game, "p1")).toHaveLength(0);
  });

  test("negative — only YOUR Beginning Phase holds: across the opponent's turn start P1's held Altar yields no point and no token for anyone", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("altar", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "altar", { might: 2 }, "holder")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(tokensOf(game, "p1")).toHaveLength(0);
    expect(tokensOf(game, "p2")).toHaveLength(0);
  });

  test("negative — hold ≠ conquer: moving onto the empty Altar conquers it (1 point) but plays no Recruit", async () => {
    const game = await scenario()
      .battlefield("altar", { controller: null, def: CARD, inert: false, owner: P1 })
      .unit(P1, "base", { might: 2, name: "Walker" }, "walker")
      .build();
    await game.p1.move("walker", "altar");
    await game.settle();
    await game.settle();
    expect(game.gameState.battlefields.altar?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(tokensOf(game, "p1")).toHaveLength(0);
    expect(game.chain()).toEqual([]);
  });

  test("one Recruit per hold: conquer on turn 2 (no token), hold on P1's next two turns → 2 tokens total, none added during P2's turns; 3 points overall", async () => {
    const game = await scenario()
      .battlefield("altar", { controller: null, def: CARD, inert: false, owner: P1 })
      .unit(P1, "base", { might: 2, name: "Walker" }, "walker")
      .build();
    await game.p1.move("walker", "altar");
    await game.settle();
    await game.settle();
    expect(game.p1.points()).toBe(1);
    await game.advanceTurn(); // → P2
    expect(tokensOf(game, "p1")).toHaveLength(0);
    await game.advanceTurn(); // → P1 holds
    expect(game.p1.points()).toBe(2);
    expect(tokensOf(game, "p1")).toHaveLength(1);
    await game.advanceTurn(); // → P2
    expect(tokensOf(game, "p1")).toHaveLength(1);
    await game.advanceTurn(); // → P1 holds again
    expect(game.p1.points()).toBe(3);
    expect(tokensOf(game, "p1")).toHaveLength(2);
    expect(tokensOf(game, "p1").every((t) => game.state(t).zone === "base")).toBe(true);
  });

  test("no unit, no hold: if the lone holder is killed during P2's turn, P1 loses the Altar and the next Beginning Phase brings neither point nor Recruit", async () => {
    const game = await aboutToHold().unit(P2, "base", { might: 5, name: "Raider" }, "raider").build();
    await game.p2.move("raider", "altar");
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.gameState.battlefields.altar?.controller).toBe(P2);
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(tokensOf(game, "p1")).toHaveLength(0);
    expect(tokensOf(game, "p2")).toHaveLength(0); // P2 conquered, and it is not P2's Beginning Phase
  });

  test("partner — Blue Sentinel on the Altar: 'your hold effects for holding here trigger an additional time' → two Recruits from one hold (still 1 point)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("altar", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "altar", BLUE_SENTINEL, "sentinel")
      .build();
    await game.p2.endTurn();
    expect(game.chain().filter((i) => i.cardId === "altar")).toHaveLength(2);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(tokensOf(game, "p1", "base")).toHaveLength(2);
  });

  test("inert control: the same position with the Altar's text stripped scores the point but plays nothing (the token really comes from the card)", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("altar", { controller: P1, def: CARD, inert: true }).unit(P1, "altar", { might: 2 }, "holder").build();
    await game.advanceTurn();
    expect(game.p1.points()).toBe(1);
    expect(tokensOf(game, "p1")).toHaveLength(0);
  });
});
