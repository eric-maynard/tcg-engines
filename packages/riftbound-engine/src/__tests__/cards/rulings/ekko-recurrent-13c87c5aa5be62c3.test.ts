/**
 * Ruling 13c87c5aa5be62c3 — Ekko, Recurrent (OGN-110 → ogn-110-298) · Champion Unit · Mind · [5][mind] · 5 Might
 *     "[Accelerate] … [Deathknell] — Recycle me to ready your runes."
 *   × Shen, Kinkou (ogn-241-298) · Unit · Order · [3][order] · 3 Might · "[Reaction] (… including to a battlefield you
 *     control.) [Shield 2] [Tank]"
 *
 * Q: I have only one rune up when the opponent kills my Ekko. Can I let the Deathknell go through to ready my runes and then
 *    play a Shen?
 * A: Yes: Ekko dies → Deathknell goes on the chain; before it resolves you may exhaust your one ready rune for energy; it
 *    resolves (Ekko is recycled — mandatory — and your runes ready); with them ready you can now pay for Shen as a [Reaction]
 *    to a battlefield you control.
 * Rules: 808.1.d.2 (Deathknell), 383.3.b (Ekko: "Recycle me" is the trigger's cost), 416 (recycle), 157 / 419 (rune
 *        actions any time you could act), 811/354 (Reaction), 190.4.b (defended battlefield stays yours during the combat).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EKKO = "ogn-110-298";
const SHEN = "ogn-241-298";

/** P2's Action-speed removal (inline): kill a unit — cast with Focus in the showdown. */
const SMITE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 2,
  name: "Test Smite",
  timing: "action",
} as const;

/**
 * P2's turn 3 with [2]. P1 holds bf1 with a lone Ekko (5) and bf2 with Holder (1); P1 has FOUR order runes, exactly ONE ready;
 * Shen in hand; empty pool. P2's Raider (2) attacks bf1 and Smites Ekko with its Focus.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", EKKO, "ekko")
    .unit(P1, "bf2", { might: 1, name: "Holder" }, "holder")
    .rune(P1, "order", { alias: "r1" })
    .rune(P1, "order", { alias: "r2", exhausted: true })
    .rune(P1, "order", { alias: "r3", exhausted: true })
    .rune(P1, "order", { alias: "r4", exhausted: true })
    .hand(P1, SHEN, "shen")
    .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
    .hand(P2, SMITE, "smite");
}

/** Raider attacks bf1; P2 (Focus) Smites Ekko; both pass → Ekko dies. Stops with the Deathknell finalized on the chain. */
async function ekkoSmitten(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.runes({ ready: true })).toEqual(["r1"]);
  expect(game.p1.can("play", "shen")).toBe(false); // 1 rune up: nowhere near [3][order]
  await game.p2.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("smite", { targets: "ekko" });
  await game.p2.passPriority();
  await game.p1.passPriority(); // Smite resolves → Ekko dies → Deathknell
  if (game.decision()?.kind === "order") {
    await game.acceptTriggerOrder();
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ekko", controller: P1, triggered: true })]);
  return game;
}

describe("Ruling 13c87c5aa5be62c3 — let Ekko's Deathknell ready the runes, then Reaction-play Shen", () => {
  test("1. Ekko dies → his Deathknell is on the chain; 'Recycle me' being its (mandatory) cost, Ekko is already on the bottom of P1's deck; the runes are NOT ready yet", async () => {
    const game = await ekkoSmitten();
    expect(game.zoneOf("ekko")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("ekko");
    expect(game.p1.runes({ ready: true })).toEqual(["r1"]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1 }); // still P1's mid-combat
  });

  test("2. with the Deathknell pending P1 holds priority and may exhaust its ONE ready rune for energy first (pool 0 → 1) — the item is untouched", async () => {
    const game = await ekkoSmitten();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("tapRune")).toBe(true);
    await game.p1.tapRune("r1");
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.runes({ ready: true })).toEqual([]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ekko"]);
  });

  test("3. both pass → the Deathknell resolves: ALL four of P1's runes are ready (r1 included, again) and the floated 1 energy is kept", async () => {
    const game = await ekkoSmitten();
    await game.p1.tapRune("r1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.p1.runes({ ready: true }).slice().sort()).toEqual(["r1", "r2", "r3", "r4"]);
    expect(game.p1.energy()).toBe(1);
  });

  test("4. now P1 can afford Shen: with Focus back in the (still open) showdown P1 taps two more runes, recycles one for [order] and plays Shen as a Reaction — offered to base, bf2 (Holder) AND the defended bf1; played to bf1 he defends, Raider (2) dies into Shield 2 + 3, P1 keeps both battlefields", async () => {
    const game = await ekkoSmitten();
    await game.p1.tapRune("r1");
    await game.p1.passPriority();
    await game.p2.passPriority(); // runes ready
    // The showdown at bf1 is still running; get P1 its Focus.
    for (let i = 0; i < 3 && game.actingSeat() !== P1; i++) {
      await game.acting().passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.tapRune("r2");
    await game.p1.tapRune("r3");
    await game.p1.recycleRune("r4", "order");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { order: 1 } });
    expect(game.p1.can("play", "shen")).toBe(true);
    const dests = ((game.p1.option("play", "shen")?.fields.find((f) => f.arg === "to")?.options ?? []) as string[]).slice().sort();
    expect(dests).toEqual(expect.arrayContaining(["base", "battlefield-bf1", "battlefield-bf2"]));
    await game.p1.play("shen", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("shen")).toBe("battlefield-bf1");
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
