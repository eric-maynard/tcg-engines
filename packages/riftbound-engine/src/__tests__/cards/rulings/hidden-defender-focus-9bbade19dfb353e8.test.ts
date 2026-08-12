/**
 * Ruling 9bbade19dfb353e8 — (general [Hidden] × showdown Focus) can the defender flip first?
 *   Stand-in: Sprite Call (OGN-094 → ogn-094-298) · [Hidden] [Action] "Play a ready 3 [Might] Sprite unit
 *   token with [Temporary]", hidden by the DEFENDER at their own battlefield on the previous turn.
 *
 * Q: Can a defender react with a hidden card before the attacker plays an action with Focus?
 * A: No. The attacker gains Focus as the showdown opens, so they act first; the defender cannot interrupt.
 *    A card played from Hidden gains Reaction timing, but that is a permission about WHEN a card may be
 *    played, not a licence to take priority away from the Focus holder. Once the attacker has played
 *    something (opening a chain) or passed Focus, the defender's hidden card becomes available.
 * Rules: 345 (the contester — the attacker — gains Focus), 313.1 / 347 (only the Focus holder may act),
 *        811.1 ([Hidden]: Reaction timing, and not on the turn it was hidden), 813 (Reaction is a
 *        permissive keyword), 337.4 (priority inside a live chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_CALL = "ogn-094-298";

const RALLY = {
  abilities: [{ effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Rally",
  rulesText: "[Action] Give a unit +1 [Might] this turn.",
  timing: "action",
} as const;

/** P2's turn 2: P2 hides Sprite Call at their own bf1. Then it becomes P1's turn and P1 attacks. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .resources(P2, { power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P2, SPRITE_CALL, "call")
    .hand(P1, RALLY, "rally");
}

async function attackIntoTheHiddenCard(): Promise<Game> {
  const game = await board().build();
  await game.p2.hide("call", "bf1");
  await game.advanceTurn(); // → P1's turn; the card was hidden on a previous turn, so it is live
  expect(game.turnPlayer()).toBe(P1);
  expect(game.zoneOf("call")).toBe("facedown-bf1");
  await game.p1.move("raider", "bf1");
  return game;
}

describe("Ruling 9bbade19dfb353e8 — a hidden card does not let the defender act before the attacker", () => {
  test("the showdown opens with Focus on the attacker: the defender's hidden card is NOT playable yet", async () => {
    const game = await attackIntoTheHiddenCard();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p2.can("reveal", "call")).toBe(false);
    expect((await game.p2.try((p) => p.reveal("call"))).ok).toBe(false);
    expect(game.zoneOf("call")).toBe("facedown-bf1");
  });

  test("after the attacker plays an Action (a chain now exists) the defender may answer with the hidden card", async () => {
    const game = await attackIntoTheHiddenCard();
    await game.p1.cast("rally", { targets: "raider" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("reveal", "call")).toBe(true);
    await game.p2.reveal("call");
    expect(game.chain().map((c) => c.cardId)).toEqual(["rally", "call"]);
  });

  test("or after the attacker simply passes Focus — either way it is the attacker's move that unlocks it", async () => {
    const game = await attackIntoTheHiddenCard();
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("reveal", "call")).toBe(true);
    await game.p2.reveal("call");
    await game.settle();
    expect(game.zoneOf("call")).toBe("trash");
    const sprite = game.p2.units("bf1").find((id) => id !== "guard");
    expect(sprite).toBeDefined();
    expect(game.state(sprite!)).toMatchObject({ isToken: true, might: 3 });
    expect(game.violations()).toEqual([]);
  });
});
