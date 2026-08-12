/**
 * Ruling e221c2a2f6462e36 — Battle Mistress (SFD-203 → sfd-203-221) · Sivir's Legend
 *   "When you recycle a rune, you may exhaust me to play a Gold gear token exhausted.
 *    When one or more enemy units die, ready me."
 *
 * Q: Does Sivir's Legend ready when an enemy unit dies on the OPPONENT'S turn?
 * A: Yes. The trigger condition is just "when one or more enemy units die" — nothing restricts it to your own
 *    turn, and triggered abilities are live on every player's turn.
 * Rules: 383 (triggered abilities fire whenever their event occurs), 465 (combat damage), 370 (death).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BATTLE_MISTRESS = "sfd-203-221";

/**
 * P2's TURN. P1's Legend (Sivir) is exhausted in the legend zone. P1 holds bf1 with a big Guard; P2 will walk a
 * small Raider in and lose it — an enemy unit (from P1's seat) dying during the opponent's turn.
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .card("sivir", { def: BATTLE_MISTRESS, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
    .unit(P1, "bf1", { might: 6, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 2, name: "Raider" }, "raider");
}

describe("Ruling e221c2a2f6462e36 — Sivir's 'when enemy units die, ready me' fires on the opponent's turn too", () => {
  test("premise: it is P2's turn and P1's Legend starts exhausted", async () => {
    const game = await board().build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.legend()).toBe("sivir");
    expect(game.state("sivir").isExhausted).toBe(true);
  });

  test("an enemy unit dying during P2's turn readies Sivir", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // the enemy unit died…
    expect(game.state("sivir").isExhausted).toBe(false); // …on the opponent's turn, and Sivir readied
    expect(game.violations()).toEqual([]);
  });

  test("it is enemy-only: one of P1's OWN units dying on the opponent's turn leaves Sivir exhausted", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .card("sivir", { def: BATTLE_MISTRESS, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .unit(P1, "bf1", { might: 1, name: "Chaff" }, "chaff")
      .unit(P2, "base", { might: 9, name: "Bruiser" }, "bruiser")
      .build();
    await game.p2.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("chaff")).toBe("trash"); // a FRIENDLY (P1) unit died
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1"); // no enemy unit died
    expect(game.state("sivir").isExhausted).toBe(true);
  });
});
