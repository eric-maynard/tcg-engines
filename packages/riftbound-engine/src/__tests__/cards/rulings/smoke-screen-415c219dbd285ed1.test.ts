/**
 * Ruling 415c219dbd285ed1 — Smoke Screen (OGN-093 → ogn-093-298) · Spell · Mind · 2+[mind] · [Reaction]
 *   "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *   × Call to Glory (OGN-207 → ogn-207-298) · Spell · Order · 3 · [Reaction]
 *   "As you play this, you may spend a buff as an additional cost. If you do, ignore this spell's cost. Give a unit +3 [Might] this turn."
 *
 * Q: A buffed unit is Smoke Screened down to 1 Might; its controller then plays Call to Glory spending THAT buff as payment,
 *    which momentarily leaves the unit at 0 Might. Does it die before Call to Glory resolves?
 * A: No. 0 Might alone never kills — a unit dies only when its damage ≥ its Might, and this unit has no damage. Smoke Screen's
 *    reduction is a one-time snapshot (not continuous), 0-Might units can exist, and Call to Glory then resolves for +3.
 * Rules: 437 (lethal damage check: damage ≥ Might, and only for damaged units), 356 (additional costs paid as you play),
 *        Smoke Screen snapshot (FAQ), 429/444 (costs).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMOKE_SCREEN = "ogn-093-298";
const CALL_TO_GLORY = "ogn-207-298";
/** A 1-cost slow spell P1 casts afterwards so that P2 gets a priority window for its Reaction. */
const PEBBLE = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Pebble",
} as const;

/**
 * P1's turn: 3 energy + [mind] (Smoke Screen 2+[mind], Pebble 1). P2 controls bf1 with Champ — printed 2 Might, BUFFED (+1) = 3,
 * undamaged — and a 5-Might Other in base; P2 has ZERO energy but holds Call to Glory (free if a buff is spent).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { mind: 1 } })
    .resources(P2, { energy: 0 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Champ" }, "champ", { buffed: true })
    .unit(P2, "base", { might: 5, name: "Other" }, "other")
    .hand(P1, SMOKE_SCREEN, "smoke")
    .hand(P1, PEBBLE, "pebble")
    .hand(P2, CALL_TO_GLORY, "ctg");
}

/** Smoke Screen Champ (3 → 1); then P1 casts Pebble at Other and passes, handing P2 priority. */
async function smokeThenGiveP2Priority(): Promise<Game> {
  const game = await board().build();
  expect(game.state("champ")).toMatchObject({ damage: 0, isBuffed: true, might: 3 });
  await game.p1.cast("smoke", { targets: "champ" });
  await game.settle();
  expect(game.zoneOf("smoke")).toBe("trash");
  await game.p1.cast("pebble", { targets: "other" });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 415c219dbd285ed1 — a 0-Might undamaged unit does not die; Call to Glory paid with its buff still resolves", () => {
  test("Smoke Screen snapshots once: buffed Champ (3) drops to the floor of 1 — a fixed −2 modifier, buff still on it, no damage", async () => {
    const game = await smokeThenGiveP2Priority();
    expect(game.state("champ")).toMatchObject({ damage: 0, isBuffed: true, might: 1, mightModifier: -2, zone: "battlefield-bf1" });
  });

  test("P2 (0 energy) plays Call to Glory on Champ spending Champ's own buff: the cost is ignored, the buff is gone, and Champ sits at 0 MIGHT with the spell still on the chain — alive, on the battlefield", async () => {
    const game = await smokeThenGiveP2Priority();
    expect(game.p2.can("cast", "ctg")).toBe(true);
    await game.p2.cast("ctg", { payOptional: true, targets: "champ" });
    expect(game.p2.energy()).toBe(0); // "ignore this spell's cost"
    expect(game.chain().map((c) => c.cardId)).toEqual(["pebble", "ctg"]);
    expect(game.state("champ").isBuffed).toBe(false); // the buff was the payment
    expect(game.state("champ").might).toBe(0); // 2 − 2, no buff: zero…
    expect(game.state("champ").damage).toBe(0);
    expect(game.zoneOf("champ")).toBe("battlefield-bf1"); // …and still there
    // Even after another game action passes (P2 passes priority → P1 holds it), the 0-Might undamaged unit persists.
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.zoneOf("champ")).toBe("battlefield-bf1");
    expect(game.state("champ").might).toBe(0);
  });

  test("Call to Glory then resolves: Champ goes 0 → 3 for the turn and never visited the trash; P2 keeps bf1", async () => {
    const game = await smokeThenGiveP2Priority();
    await game.p2.cast("ctg", { payOptional: true, targets: "champ" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ctg")).toBe("trash");
    expect(game.state("champ")).toMatchObject({ damage: 0, isBuffed: false, might: 3, mightModifier: 1, zone: "battlefield-bf1" });
    expect(game.p2.trash()).not.toContain("champ");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.state("other")).toMatchObject({ damage: 1, zone: "base" }); // Pebble resolved too
    // "this turn": everything wears off at end of turn → printed 2, unbuffed.
    await game.advanceTurn();
    expect(game.state("champ")).toMatchObject({ isBuffed: false, might: 2, mightModifier: 0 });
  });
});
