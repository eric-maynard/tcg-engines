/**
 * Ruling 8e7b036424a5e079 — (no specific card) responding to a unit being played to your base.
 *   Exercised with Fight or Flight (OGN-168 → ogn-168-298) "[Hidden] [Action] Move a unit from a
 *   battlefield to its base." as the would-be response.
 *
 * Q: If I play a unit to my base, can my opponent play a hidden card in response?
 * A: No. The unit is a Pending chain item only while it is being played; finalizing it takes it
 *    straight off the chain and onto the board. It never lingers there, so nobody ever gains priority
 *    to answer the unit itself. Only if the unit has a "When you play me" ability does something stay
 *    on the chain — and then the opponent may answer THAT ability, not the play.
 * Rules: 352.2 / 354.2 (a played card is Pending, then Finalized), 337.1.a (finalizing does not pass
 *        Priority), 337.4 (priority only exists while a Finalized item sits on the chain),
 *        811.6 (a facedown Hidden card answers at Reaction speed — when there is a window).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";

/** A plain 3-Might unit with no abilities at all. */
const VANILLA = { cardType: "unit", domain: "fury", energyCost: 1, might: 3, name: "Test Recruit" } as const;

/** The same body with "When you play me, draw 1." */
const HERALD = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "play-self" }, type: "triggered" }],
  cardType: "unit",
  domain: "fury",
  energyCost: 1,
  might: 3,
  name: "Test Herald",
  rulesText: "When you play me, draw 1.",
} as const;

/** P1's turn. P2 holds bf1 with a unit and a facedown Fight or Flight there; P1 has both units in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
    .hand(P1, VANILLA, "recruit")
    .hand(P1, HERALD, "herald");
}

describe("Ruling 8e7b036424a5e079 — a unit played to your base opens no response window", () => {
  test("the vanilla unit lands with an EMPTY chain — it never lingers there as a finalized item", async () => {
    const game = await board().build();
    await game.p1.play("recruit");
    expect(game.zoneOf("recruit")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("P2 never becomes the acting seat and the facedown Hidden card is not revealable at that moment", async () => {
    const game = await board().build();
    expect(game.p2.can("reveal", "fof")).toBe(false); // not P2's window before, either
    await game.p1.play("recruit");
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.can("reveal", "fof")).toBe(false);
    const attempt = await game.p2.try((p) => p.reveal("fof"));
    expect(attempt.ok).toBe(false);
    expect(game.zoneOf("fof")).toBe("facedown-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("if instead the unit has 'When you play me': the TRIGGER stays on the chain and P2 may answer it with the hidden card", async () => {
    const game = await board().build();
    await game.p1.play("herald");
    expect(game.zoneOf("herald")).toBe("base"); // the unit itself is already in play…
    // …and what remains on the chain is the triggered ability, not the unit's play.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "herald", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("reveal", "fof")).toBe(true);
    await game.p2.reveal("fof");
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("holder");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["herald", "fof"]);
    expect(game.violations()).toEqual([]);
  });

  test("the window in the 'when you play me' case answers the ABILITY: the unit is already on the board and cannot be countered by it", async () => {
    const game = await board().build();
    const before = game.p1.hand().length;
    await game.p1.play("herald");
    await game.settle();
    expect(game.zoneOf("herald")).toBe("base");
    expect(game.p1.hand().length).toBe(before); // -1 herald +1 drawn
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
