/**
 * Ruling b4ccb910cd43283b — Tibbers (OGS-018 → ogs-018-024) · Unit · Fury/Chaos · [8]+2 power · 7 Might
 *   "When you play me, deal 3 to all units at battlefields."
 *   × Star-Crossed (unl-128-219) · Reaction · [3][chaos] "Return a friendly unit and an enemy unit to their owners' hands." —
 *     the opponent's removal.
 *
 * Q: When a permanent with a "When you play me" trigger is played, can the opponent react and remove it BEFORE the
 *    triggered ability goes on the chain?
 * A: No. The permanent enters the chain and leaves it for the board immediately — no priority in between; its play
 *    trigger then goes on the chain and only now can players react (to the TRIGGER). If the permanent is removed after
 *    that, the ability still resolves and does as much as it can. Vanilla permanents leave no window at all.
 * Rules: 337.2 / 354 (a permanent resolves as soon as it is finalized — no priority), 383.3 (the trigger becomes a chain
 *        item), 336/340 (priority on chain items; LIFO), 359.3 (an ability resolves independently of its source).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIBBERS = "ogs-018-024";
const STAR_CROSSED = "unl-128-219";

/**
 * P1's turn with Tibbers money ([8] + 2 fury). P1 holds bf1 with a 5-Might Anchor; P2 holds bf2 with a 2-Might Scout and a
 * 6-Might Brute, keeps a 1-Might Pawn at home (Star-Crossed's "friendly unit"), and has exactly [3][chaos].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { fury: 2 } })
    .resources(P2, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 5, name: "Anchor" }, "anchor")
    .unit(P2, "bf2", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "bf2", { might: 6, name: "Brute" }, "brute")
    .unit(P2, "base", { might: 1, name: "Pawn" }, "pawn")
    .hand(P2, STAR_CROSSED, "star")
    .hand(P1, TIBBERS, "tibbers")
    .hand(P1, { cardType: "unit", energyCost: 0, might: 2, name: "Vanilla Bear" }, "vanilla");
}

async function tibbersPlayed(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("tibbers", { to: "base" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  return game;
}

describe("Ruling b4ccb910cd43283b — no reaction window between a permanent landing and its play trigger hitting the chain", () => {
  test("right after the play: Tibbers is already ON THE BOARD (never lingering on the chain), the only chain item is its triggered ability, and the first priority belongs to P1 — P2 has had no say yet", async () => {
    const game = await tibbersPlayed();
    expect(game.zoneOf("tibbers")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tibbers", controller: P1, triggered: true })]);
    expect(game.chain().some((c) => !c.triggered)).toBe(false); // no permanent item to respond to
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.zoneOf("star")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 3, power: { chaos: 1 } });
  });

  test("players CAN react to the triggered ability: P1 passes → P2 holds priority with the trigger pending and Star-Crossed is legal", async () => {
    const game = await tibbersPlayed();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "star")).toBe(true);
    await game.p2.cast("star", { targets: ["pawn", "tibbers"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["tibbers", "star"]);
    expect(game.zoneOf("tibbers")).toBe("base"); // still there — the removal is itself just a chain item for now
  });

  test("nuance: Star-Crossed resolves first (LIFO) and bounces Tibbers to P1's hand — yet the orphaned trigger STILL resolves: 3 to every unit at a battlefield (Scout dies, Brute and Anchor take 3), nothing to units in base/hand", async () => {
    const game = await tibbersPlayed();
    await game.p1.passPriority();
    await game.p2.cast("star", { targets: ["pawn", "tibbers"] });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Star-Crossed resolves
    expect(game.zoneOf("tibbers")).toBe("hand");
    expect(game.zoneOf("pawn")).toBe("hand");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tibbers", triggered: true })]);
    await game.settle(); // the trigger resolves without its source
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("scout")).toBe("trash"); // 3 ≥ 2
    expect(game.state("brute")).toMatchObject({ damage: 3, zone: "battlefield-bf2" });
    expect(game.state("anchor")).toMatchObject({ damage: 3, zone: "battlefield-bf1" }); // "all units" — friendly too
    expect(game.p1.hand()).toContain("tibbers");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: unanswered, the trigger simply resolves with Tibbers staying in base", async () => {
    const game = await tibbersPlayed();
    await game.settle();
    expect(game.zoneOf("tibbers")).toBe("base");
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.state("brute").damage).toBe(3);
    expect(game.state("tibbers").damage).toBe(0); // in base, not "at a battlefield"
  });

  test("nuance: a VANILLA permanent gives no window whatsoever — it lands, the chain stays empty and it is still P1's open main phase (P2 never received priority)", async () => {
    const game = await board().build();
    await game.p1.play("vanilla", { to: "base" });
    expect(game.zoneOf("vanilla")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.can("cast", "star")).toBe(false);
  });
});
