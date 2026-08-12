/**
 * Ruling 9cca3e26ed790e76 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · 2 · [Hidden]
 *   "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: Does a unit's "when this unit dies" (Deathknell) effect trigger when Zhonya's pulls it out of play
 *    instead of letting it die?
 * A: No. The unit never dies — the death is REPLACED, and the Hourglass dies in its place. A Deathknell
 *    only fires when its own trigger condition (that unit dying) is actually met, so nothing triggers.
 *    (Our printing recalls the saved unit to base; the ruling's "returned to hand" wording is the same
 *    point — leaving the board is not dying.)
 * Rules: 437/438 (a replacement effect means the original event never happens), 809-ish [Deathknell]
 *        ("when I die"), 382 (a triggered ability fires only when its condition occurs),
 *        143 (recall = send to base, not a move).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";

/** "[Deathknell] — Draw 1." */
const MOURNER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "die", on: "self" }, type: "triggered" }],
  cardType: "unit",
  domain: "calm",
  energyCost: 2,
  keywords: ["Deathknell"],
  might: 3,
  name: "Test Mourner",
  rulesText: "[Deathknell] — Draw 1.",
} as const;

/** P2's turn: a 5-Might Raider walks into P1's bf1, where the Mourner stands. `saved` adds the Hourglass. */
function board(saved: boolean) {
  const b = scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", MOURNER, "mourner")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider");
  return saved ? b.gear(P1, ZHONYAS, "hourglass") : b;
}

describe("Ruling 9cca3e26ed790e76 — Zhonya's replaces the death, so the Deathknell never fires", () => {
  test("control: with no Hourglass the Mourner dies and its [Deathknell] draws a card", async () => {
    const game = await board(false).build();
    const before = game.p1.hand().length;
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("mourner")).toBe("trash");
    expect(game.p1.hand().length).toBe(before + 1);
    expect(game.violations()).toEqual([]);
  });

  test("with the Hourglass out: the Mourner is saved — healed, exhausted and recalled to base — and the gear dies instead", async () => {
    const game = await board(true).build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("hourglass")).toBe("trash"); // killed in its place
    expect(game.zoneOf("mourner")).not.toBe("trash");
    expect(game.locationOf("mourner")).toBe("base"); // recalled
    expect(game.state("mourner")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.violations()).toEqual([]);
  });

  test("the ruling: no draw happens — the Deathknell never became a chain item because the unit never died", async () => {
    const game = await board(true).build();
    const before = game.p1.hand().length;
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.p1.hand().length).toBe(before); // nothing drawn
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("the saved unit is still a live game object afterwards — it just left the battlefield", async () => {
    const game = await board(true).build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.has("mourner")).toBe(true);
    expect(game.zoneOf("mourner")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // nobody of P1's was left standing
    expect(game.violations()).toEqual([]);
  });
});
