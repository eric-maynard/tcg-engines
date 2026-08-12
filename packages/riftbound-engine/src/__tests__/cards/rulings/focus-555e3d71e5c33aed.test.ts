/**
 * Ruling 555e3d71e5c33aed — (no specific card) who acts first in a showdown.
 *
 * Q: When a player attacks, can they wait to see whether the opponent responds before playing their own
 *    combat trick, or must they play it right after moving?
 * A: The attacker ALWAYS receives Focus first and must use it then — the defender cannot act while the
 *    attacker holds Focus, so "waiting to see" is only possible by passing Focus (and is angle shooting).
 *    If the attacker passes Focus the defender may act; both passing in succession with no chain started
 *    ends the showdown. (The etiquette half of the answer — announce Focus passes explicitly — is
 *    tournament policy, not a game rule, and is not encodable here.)
 * Rules: 465.1 / 464.2.d (the attacker gets Focus first in a showdown), 347 / 355.2.a (an Action needs
 *        Focus), 346 / 348 (all players passing Focus in succession closes the showdown).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** [Action] "Give a unit +2 [Might] this turn." */
const RALLY = {
  abilities: [
    { effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" },
  ],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Rally",
  rulesText: "[Action] Give a unit +2 [Might] this turn.",
  timing: "action",
} as const;

const board = () =>
  scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, RALLY, "mine")
    .hand(P2, RALLY, "theirs");

describe("Ruling 555e3d71e5c33aed — the attacker holds Focus first; the defender only acts once it is passed", () => {
  test("straight after the attacking move it is the ATTACKER's decision — the defender can neither cast nor pass Focus", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "mine")).toBe(true);
    expect(game.p2.can("cast", "theirs")).toBe(false);
    const attempt = await game.p2.try((p) => p.passFocus());
    expect(attempt.ok).toBe(false);
  });

  test("the attacker's trick lands before the defender ever gets a say", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.cast("mine", { targets: "raider" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["mine"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // P1 still first on the chain
  });

  test("passing Focus is what lets the defender act; both passing in succession ends the showdown and resolves combat", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "theirs")).toBe(true);
    await game.p2.passFocus(); // second pass in succession, no chain started → showdown closes, combat resolves
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // 3 vs 3 — mutual lethal
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
