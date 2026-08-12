/**
 * Ruling 859bb40b7ee24f3f — (no specific card) spells with no timing keyword on the opponent's turn.
 *   Exercised with Charm (OGN-043 → ogn-043-298) "Move an enemy unit." — a printed spell with neither
 *   [Action] nor [Reaction].
 *
 * Q: Can I play a spell that has neither [Action] nor [Reaction] during my opponent's turn?
 * A: No. A plain spell may only be played on YOUR turn, in an Open State with an empty chain.
 *    [Reaction] adds "playable in Closed States on any player's turn"; [Action] adds "playable
 *    during Showdowns on any player's turn". With neither keyword a spell has no such permission.
 * Rules: 155 (a spell is played in an Open State outside Showdowns on its controller's turn),
 *        806.1.b / 806.1.c.1 ([Action]), 813.1.b / 813.1.c.1 ([Reaction]).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298"; // no timing keyword — the card under test

/** [Action] — showdowns on any player's turn. */
const ACTION = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Action Spell",
  rulesText: "[Action] Draw 1.",
  timing: "action",
} as const;

/** [Reaction] — closed states on any player's turn. */
const REACTION = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Reaction Spell",
  rulesText: "[Reaction] Draw 1.",
  timing: "reaction",
} as const;

/** P1's turn. P2 holds bf1; P1 has a raider to open a showdown, a spare unit for Charm to aim at. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 3, power: { calm: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2")
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .unit(P1, "bf2", { might: 2, name: "Spare" }, "spare")
    .hand(P1, REACTION, "p1react")
    .hand(P2, CHARM, "charm")
    .hand(P2, ACTION, "action")
    .hand(P2, REACTION, "react");
}

describe("Ruling 859bb40b7ee24f3f — a spell with no [Action]/[Reaction] cannot be played on the opponent's turn", () => {
  test("closed state on P1's turn (a chain is up): P2 may cast its [Reaction] but NOT Charm and NOT the [Action]", async () => {
    const game = await board().build();
    await game.p1.cast("p1react"); // opens a chain → closed state
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // 337.4
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "react")).toBe(true);
    expect(game.p2.can("cast", "charm")).toBe(false);
    expect(game.p2.can("cast", "action")).toBe(false); // [Action] is showdown-only, and this is not a showdown
    expect((await game.p2.try((p) => p.cast("charm", { targets: "raider" }))).ok).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("showdown on P1's turn: P2 may cast its [Action] (and its [Reaction]) but still NOT Charm", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1"); // combat showdown opens
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ seat: P2 });
    expect(game.p2.can("cast", "action")).toBe(true);
    expect(game.p2.can("cast", "react")).toBe(true);
    expect(game.p2.can("cast", "charm")).toBe(false);
    expect((await game.p2.try((p) => p.cast("charm", { targets: "spare" }))).ok).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("open state on P1's turn: P2 is not even the acting seat, so nothing of theirs is castable", async () => {
    const game = await board().build();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p2.can("cast", "charm")).toBe(false);
    expect(game.p2.can("cast", "action")).toBe(false);
    expect(game.p2.can("cast", "react")).toBe(false);
  });

  test("contrast — on P2's OWN turn, in an open state with an empty chain, Charm is playable", async () => {
    // The same position, but it is P2's own turn (a fresh build: pools empty at the Ending Phase).
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3, power: { calm: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
      .hand(P2, CHARM, "charm")
      .build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.chain()).toEqual([]);
    expect(game.p2.can("cast", "charm")).toBe(true);
    await game.p2.cast("charm", { targets: "raider", answers: ["bf1"] });
    await game.settle();
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });
});
