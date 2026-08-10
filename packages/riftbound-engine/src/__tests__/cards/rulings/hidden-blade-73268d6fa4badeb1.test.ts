/**
 * Ruling 73268d6fa4badeb1 — Hidden Blade (OGN-213 → ogn-213-298) · Action · [2]+[order] · "Kill a unit at a battlefield. Its controller draws 2."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, recall it."
 *   (× Retreat ogn-104-298 / Flash ogs-011-024 for the "Retreated / moved to base first" half.)
 *
 * Q: Does Hidden Blade still give the draw if the unit doesn't die (Zhonya's, or it was Retreated)?
 * A: Zhonya's — yes: Hidden Blade resolved against a legal target at a battlefield, its controller is established, they draw 2
 *    (the Hourglass replaces the death afterwards). Retreated to hand / flashed to base before Hidden Blade resolves — no: the
 *    unit is no longer a legal "unit at a battlefield", the spell mistargets, nobody draws.
 * Rules: 355.9 / 359.3.e.9 (legality re-checked on resolution → mistarget), 371–373 (replacement), 359.3.e.14 (linked "its controller").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const ZHONYAS = "ogn-077-298";
const RETREAT = "ogn-104-298"; // Reaction [1]: return a friendly unit to its owner's hand …
const FLASH = "ogs-011-024"; // Reaction [2]: move up to 2 friendly units to base

/** P1's turn: Hidden Blade with exactly [2]+order at P2's Victim (3) on P2's bf1. P2: [3], Retreat + Flash in hand, known deck, optional Hourglass. */
function board(withHourglass: boolean) {
  const s = scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
    .unit(P2, "bf1", { might: 2, name: "Anchor" }, "anchor") // keeps bf1 controlled whatever happens to Victim
    .hand(P2, RETREAT, "retreat")
    .hand(P2, FLASH, "flash")
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["p2a", "p2b", "p2c"])
    .hand(P1, HIDDEN_BLADE, "blade");
  return withHourglass ? s.gear(P2, ZHONYAS, "zh") : s;
}

async function bladeAtVictim(withHourglass: boolean): Promise<Game> {
  const game = await board(withHourglass).build();
  await game.p1.cast("blade", { targets: "victim" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

const drawn = (game: Game) => game.p2.hand().filter((c) => ["p2a", "p2b", "p2c"].includes(c));

describe("Ruling 73268d6fa4badeb1 — Hidden Blade's draw needs a legal target on resolution, not an actual death", () => {
  test("control: unanswered — Victim dies and P2 (its controller) draws 2", async () => {
    const game = await bladeAtVictim(false);
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(drawn(game)).toEqual(["p2a", "p2b"]);
  });

  test("Zhonya's Hourglass: Victim is saved (Hourglass killed instead; healed, exhausted, recalled) — and P2 STILL draws 2", async () => {
    const game = await bladeAtVictim(true);
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim")).toMatchObject({ damage: 0, isExhausted: true });
    expect(drawn(game)).toEqual(["p2a", "p2b"]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("Retreat in response: Victim is in P2's hand when Hidden Blade resolves → mistarget: nothing killed, NOBODY draws", async () => {
    const game = await bladeAtVictim(false);
    await game.p2.cast("retreat", { targets: "victim" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "retreat"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("victim")).toBe("hand");
    expect(drawn(game)).toEqual([]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p2.deck().slice(0, 3)).toEqual(["p2a", "p2b", "p2c"]);
  });

  test("Flash in response: Victim is in BASE (no longer 'at a battlefield') when Hidden Blade resolves → mistarget: Victim lives, nobody draws", async () => {
    const game = await bladeAtVictim(false);
    await game.p2.cast("flash", { targets: ["victim"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "flash"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim").damage).toBe(0);
    expect(drawn(game)).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p2.deck().slice(0, 3)).toEqual(["p2a", "p2b", "p2c"]);
    expect(game.violations()).toEqual([]);
  });
});
