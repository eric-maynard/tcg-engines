/**
 * Ruling 719bb7532e0c132f — Warwick, Hunter (OGN-159 → ogn-159-298) · 5 Might · "I enter ready. When I attack, kill all
 *   damaged enemy units here."   × Hidden Blade (OGN-213 → ogn-213-298) · [Hidden][Action] · "Kill a unit at a battlefield.
 *   Its controller draws 2."
 *
 * Q: When Warwick attacks and his trigger is on the chain, can the opponent play an ACTION spell to kill him before it
 *    resolves, or must they use something faster?
 * A: Only Reactions can be played in response to the trigger. Hidden Blade flipped from facedown (Reaction speed) can kill
 *    Warwick first; the trigger then does nothing because "here" is no longer a battlefield. Hidden Blade from HAND (Action)
 *    cannot be played in that window — the trigger resolves and kills the damaged units.
 * Rules: 811 (hidden → Reaction for [0]), 336/354 (closed state: Reactions only), 359.3.e.12 ("here" of a gone source).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WARWICK = "ogn-159-298";
const HIDDEN_BLADE = "ogn-213-298";

/** P1's turn 3. P2 holds bf1 with a DAMAGED Wounded (4 Might, 1 damage). Warwick ready in P1's base. */
function board(blade: "hidden" | "hand") {
  const s = scenario()
    .turn(3)
    .resources(P2, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Wounded" }, "wounded", { damage: 1 })
    .unit(P1, "base", WARWICK, "ww")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
  return blade === "hidden" ? s.facedown(P2, "bf1", HIDDEN_BLADE, "blade") : s.hand(P2, HIDDEN_BLADE, "blade");
}

async function warwickAttacks(game: Game): Promise<void> {
  await game.p1.move("ww", "bf1");
  expect(game.locationOf("ww")).toBe("bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ww", controller: P1, triggered: true })]);
  expect(game.zoneOf("wounded")).toBe("battlefield-bf1"); // nothing killed yet — the trigger is merely pending
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

describe("Ruling 719bb7532e0c132f — only Reactions answer Warwick's attack trigger", () => {
  test("hidden Hidden Blade (Reaction speed) IS legal in response: it goes on top, resolves first and kills Warwick; P1 (his controller) draws 2", async () => {
    const game = await board("hidden").build();
    await warwickAttacks(game);
    expect(game.p2.can("reveal", "blade")).toBe(true);
    await game.p2.reveal("blade");
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      await game.p2.pick("ww");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["ww", "blade"]);
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "blade"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
    // The trigger exists independently of its source and is still pending.
    expect(game.chain().map((c) => c.cardId)).toEqual(["ww"]);
    expect(game.zoneOf("wounded")).toBe("battlefield-bf1");
  });

  test("… the trigger then resolves with Warwick dead: 'here' is no battlefield, so the damaged Wounded is NOT killed and P2 keeps bf1", async () => {
    const game = await board("hidden").build();
    await warwickAttacks(game);
    await game.p2.reveal("blade");
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      await game.p2.pick("ww");
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.zoneOf("wounded")).toBe("battlefield-bf1");
    expect(game.state("wounded").damage).toBeLessThanOrEqual(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("Hidden Blade from HAND (an Action) is NOT playable while the trigger is on the chain; both pass and the trigger kills the damaged Wounded with Warwick alive", async () => {
    const game = await board("hand").build();
    await warwickAttacks(game);
    expect(game.p2.can("cast", "blade")).toBe(false);
    const r = await game.p2.try((p) => p.cast("blade", { targets: "ww" }));
    expect(r.ok).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ww"]);
    await game.p2.passPriority(); // both passed → the trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("wounded")).toBe("trash");
    expect(game.locationOf("ww")).toBe("bf1");
    expect(game.zoneOf("blade")).toBe("hand");
  });

  test("… only afterwards, in the showdown's open state with Focus, may P2 cast Hidden Blade from hand as an Action — too late for the Wounded", async () => {
    const game = await board("hand").build();
    await warwickAttacks(game);
    await game.p2.passPriority();
    expect(game.zoneOf("wounded")).toBe("trash");
    for (let i = 0; i < 4 && !(game.actingSeat() === P2 && game.decision()?.kind === "action"); i++) {
      await game.acting().pass();
    }
    for (let i = 0; i < 4 && game.actingSeat() !== P2; i++) {
      await game.acting().pass();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "blade")).toBe(true);
    await game.p2.cast("blade", { targets: "ww" });
    await game.settle();
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.zoneOf("wounded")).toBe("trash"); // it was already dead
    expect(game.violations()).toEqual([]);
  });
});
