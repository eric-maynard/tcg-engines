/**
 * Ruling 21fd0e939f521a58 — Unyielding Spirit (OGN-145 → ogn-145-298) · Spell · Body · 1 + [body] · [Reaction]
 *     "Prevent all spell and ability damage this turn."
 *   × Glowstone (VEN-133 → ven-133-166) · Gear "At the end of your turn, kill this and deal 5 to all units you control."
 *   × Challenge (OGN-128 → ogn-128-298) · [Action] "Choose a friendly unit and an enemy unit. They deal damage equal to
 *     their Mights to each other." — the contrast case.
 *
 * Q: How does Unyielding Spirit interact with Glowstone's triggered ability?
 * A: Glowstone's 5 is dealt BY THE ABILITY (ability damage), so Unyielding Spirit prevents it — even when played in
 *    reaction to the trigger. "Kill this" is not damage: Glowstone still dies. Contrast: Challenge's damage is dealt by
 *    the units (a fight), so Unyielding Spirit does nothing there.
 * Rules: 417.6.b.2 (source of ability damage is the ability), 420 (prevention), 417.6.b.1 (fight damage dealt by units).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const UNYIELDING_SPIRIT = "ogn-145-298";
const GLOWSTONE = "ven-133-166";
const CHALLENGE = "ogn-128-298";

/** P1's turn. P1: Glowstone, Small (3) + Big (6) in base, Unyielding Spirit + Challenge in hand, 3 energy + 2 body. P2: Foe (3) at bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { body: 2 } })
    .battlefield("bf1", { controller: P2 })
    .gear(P1, GLOWSTONE, "glow")
    .unit(P1, "base", { might: 3, name: "Small" }, "small")
    .unit(P1, "base", { might: 6, name: "Big" }, "big")
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .hand(P1, UNYIELDING_SPIRIT, "us")
    .hand(P1, CHALLENGE, "challenge");
}

describe("Ruling 21fd0e939f521a58 — Unyielding Spirit stops Glowstone's 5 (ability damage) but not its self-kill; fights are unaffected", () => {
  test("control: with no prevention, ending the turn puts Glowstone's trigger on the chain; it kills Glowstone and deals 5 to each of P1's units — Small (3) dies, Big (6) lives", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "glow", controller: P1, triggered: true });
    await game.settle();
    expect(game.zoneOf("glow")).toBe("trash");
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.zoneOf("big")).toBe("base");
    expect(game.zoneOf("foe")).toBe("battlefield-bf1"); // "units you control" only
    expect(game.turnPlayer()).toBe(P2);
  });

  test("Unyielding Spirit cast IN REACTION to the end-of-turn trigger resolves first; Glowstone's 5 to every friendly unit is then fully prevented (Small survives) — but Glowstone is still killed", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    expect(game.chain().map((c) => c.cardId)).toEqual(["glow"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "us")).toBe(true);
    await game.p1.cast("us");
    expect(game.chain().map((c) => c.cardId)).toEqual(["glow", "us"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Unyielding Spirit resolves; Glowstone's item still pending
    expect(game.zoneOf("us")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["glow"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Glowstone's trigger resolves
    expect(game.zoneOf("glow")).toBe("trash"); // "kill this" is not damage — not prevented
    expect(game.zoneOf("small")).toBe("base"); // 5 ability damage prevented
    expect(game.state("small").damage).toBe(0);
    expect(game.zoneOf("big")).toBe("base");
    expect(game.state("big").damage).toBe(0);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.units("base").sort()).toEqual(["big", "small"]);
    expect(game.violations()).toEqual([]);
  });

  test("cast earlier in the turn it works the same way ('this turn'): end of turn → no damage lands, Glowstone still dies", async () => {
    const game = await board().build();
    await game.p1.cast("us");
    await game.settle();
    expect(game.zoneOf("us")).toBe("trash");
    await game.advanceTurn();
    expect(game.zoneOf("glow")).toBe("trash");
    expect(game.zoneOf("small")).toBe("base");
    expect(game.zoneOf("big")).toBe("base");
  });

  test("contrast — Challenge is a fight: the UNITS deal the damage, so with Unyielding Spirit already resolved Small (3) and Foe (3) still kill each other", async () => {
    const game = await board().build();
    await game.p1.cast("us");
    await game.settle();
    await game.p1.cast("challenge", { targets: ["small", "foe"] });
    await game.settle();
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
