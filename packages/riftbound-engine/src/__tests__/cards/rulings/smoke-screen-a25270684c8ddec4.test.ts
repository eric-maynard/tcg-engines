/**
 * Ruling a25270684c8ddec4 — Smoke Screen (OGN-093 → ogn-093-298) · Reaction [2][mind] "Give a unit -4 Might this turn, to a
 *     minimum of 1 Might."
 *   × Stalwart Poro (OGN-052 → ogn-052-298) · 2 Might · [Shield] (+1 Might while I'm a defender)
 *   (+ Wuju Bladesman legend, ogs-019-024 "While a friendly unit defends alone, it gets +2 Might" — the "Master Yi effect".)
 *
 * Q: Two Smoke Screens on a buffed, shielded, Yi-boosted defending Poro (2 base + 1 buff + 1 Shield + 2 Yi = 6)?
 * A: Increases apply before decreases; each Smoke Screen snapshots when it resolves. #1 sees 6 → applies -4 (→ 2). #2 sees
 *    2 → can only apply -1 (→ 1). Total continuous -5: the Poro fights at 1. After combat, Shield and Yi lapse: 2 + 1 − 5
 *    = −2 Might, and it does NOT die (no damage on it). The "minimum of 1" is only checked when each effect is applied.
 * Rules: 477.3.e.2.a (decreases applied last), 143.2.b (Might below 0 is allowed; referenced as 0), Shield 727, 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMOKE_SCREEN = "ogn-093-298";
const STALWART_PORO = "ogn-052-298";
const WUJU_BLADESMAN = "ogs-019-024";
/** Inline P1 Reaction: deal 3 to a unit — removes the 3-Might attacker so combat ends with no damage assigned to the Poro. */
const ZAP = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Zap",
  timing: "reaction",
} as const;

/**
 * P2's turn. P1 (Wuju Bladesman legend) holds bf1 with a lone BUFFED Stalwart Poro; Zap in hand with [1].
 * P2: a 3-Might Raider in base and two Smoke Screens with [4] + 2 mind.
 */
function board() {
  return scenario()
    .active(P2)
    .legend(P1, WUJU_BLADESMAN, "yi")
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 4, power: { mind: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", STALWART_PORO, "poro", { buffed: true })
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P2, SMOKE_SCREEN, "smoke1")
    .hand(P2, SMOKE_SCREEN, "smoke2")
    .hand(P1, ZAP, "zap");
}

/** Raider attacks bf1: the Poro defends alone → 2 + 1 (buff) + 1 (Shield) + 2 (Yi) = 6. P2 has Focus. */
async function raiderAttacks(): Promise<Game> {
  const game = await board().build();
  expect(game.state("poro").might).toBe(3); // 2 + buff, before it is a defender
  await game.p2.move("raider", "bf1");
  expect(game.state("poro").combatRole).toBe("defender");
  expect(game.state("poro").might).toBe(6);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  return game;
}

/** The seat with Focus/priority casts `card` at `target` and both pass so it resolves on its own. */
async function castAndResolve(game: Game, seat: "p1" | "p2", card: string, target: string): Promise<void> {
  const want = seat === "p1" ? P1 : P2;
  if (game.actingSeat() !== want) {
    await game.acting().passFocus();
  }
  expect(game.actingSeat()).toBe(want);
  await game[seat].cast(card, { targets: target });
  await game[seat].passPriority();
  await game[seat === "p1" ? "p2" : "p1"].passPriority();
  expect(game.zoneOf(card)).toBe("trash");
}

describe("Ruling a25270684c8ddec4 — two Smoke Screens on a 6-Might defending Poro: -4 then -1 (snapshots), 1 in combat, −2 afterwards, no death", () => {
  test("Smoke Screen #1 resolves against the 6-Might Poro → full -4, Poro at 2", async () => {
    const game = await raiderAttacks();
    await castAndResolve(game, "p2", "smoke1", "poro");
    expect(game.state("poro")).toMatchObject({ might: 2, mightModifier: -4 });
  });

  test("Smoke Screen #2 then sees a 2-Might Poro → only -1 more (minimum 1 checked on application): Poro at 1, total reduction -5", async () => {
    const game = await raiderAttacks();
    await castAndResolve(game, "p2", "smoke1", "poro");
    await castAndResolve(game, "p2", "smoke2", "poro");
    expect(game.state("poro")).toMatchObject({ might: 1, mightModifier: -5 });
    expect(game.state("poro").isBuffed).toBe(true); // the buff "remains", merely outweighed
    expect(game.state("poro").combatRole).toBe("defender"); // still mid-combat: this is the Might it would fight with
  });

  test("after combat ends with no damage on the Poro (attacker Zapped away), Shield and Yi lapse but the -5 stays: 2 + 1 − 5 = −2 Might (referenced as 0), and the Poro does NOT die", async () => {
    const game = await raiderAttacks();
    await castAndResolve(game, "p2", "smoke1", "poro");
    await castAndResolve(game, "p2", "smoke2", "poro");
    await castAndResolve(game, "p1", "zap", "raider");
    expect(game.zoneOf("raider")).toBe("trash");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    const poro = game.state("poro");
    expect(poro.zone).toBe("battlefield-bf1"); // alive
    expect(poro.damage).toBe(0);
    expect(poro.combatRole).not.toBe("defender"); // Shield / Yi no longer apply
    expect(poro).toMatchObject({ baseMight: 2, isBuffed: true, mightModifier: -5 });
    expect(poro.baseMight + 1 + poro.mightModifier).toBe(-2); // the rules-level Might is −2 …
    expect(poro.might).toBeLessThanOrEqual(0); // … which spells/abilities read as 0 (143.2.b)
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("the reductions are 'this turn': on the next turn the Poro is back to 2 + buff = 3", async () => {
    const game = await raiderAttacks();
    await castAndResolve(game, "p2", "smoke1", "poro");
    await castAndResolve(game, "p2", "smoke2", "poro");
    await castAndResolve(game, "p1", "zap", "raider");
    await game.settle();
    await game.advanceTurn();
    expect(game.state("poro")).toMatchObject({ might: 3, mightModifier: 0, zone: "battlefield-bf1" });
  });
});
