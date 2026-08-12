/**
 * Ruling 25994235e6f07667 — Shakedown (OGN-033 → ogn-033-298) · Reaction · [2][fury]
 *     "Choose an enemy unit. Deal 6 to it unless its controller has you draw 2."
 *   × Darius, Trifarian (OGN-027 → ogn-027-298) · 5 Might ·
 *     "When you play your second card in a turn, give me +2 [Might] this turn and ready me."
 *
 * Q: Can Shakedown be cast in response to the opponent playing Darius?
 * A: Only if the play leaves something on the chain. A unit does not linger on the chain: played as the first
 *    card of the turn it simply enters, with no priority window at all. Played as the SECOND card it enters
 *    and leaves its Legion trigger on the chain — that trigger is the window in which you may Shakedown, and
 *    Darius (already on the board) is a legal choice.
 * Rules: 339 (permanents resolve immediately and never wait on the chain), 336/340 (priority exists only
 *        while a chain is open — or in a showdown), 355.10.e ("unless its controller…" hands the decision to
 *        the chosen unit's controller).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SHAKEDOWN = "ogn-033-298";
const DARIUS = "ogn-027-298";

/** P2's turn. P2 can afford a cheap Grunt then Darius ([5][fury]); P1 waits with Shakedown and exactly [2][fury]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .resources(P2, { energy: 10, power: { fury: 2 } })
    .hand(P2, { cardType: "unit", energyCost: 1, might: 1, name: "Grunt" }, "grunt")
    .hand(P2, DARIUS, "darius")
    .hand(P1, SHAKEDOWN, "shakedown");
}

describe("Ruling 25994235e6f07667 — a unit played with nothing on the chain gives no Reaction window", () => {
  test("Darius played as P2's FIRST card of the turn resolves at once: empty chain, no priority for P1, Shakedown uncastable", async () => {
    const game = await board().build();
    await game.p2.play("darius");
    expect(game.zoneOf("darius")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.can("cast", "shakedown")).toBe(false);
    expect((await game.p1.try((p) => p.cast("shakedown", { targets: "darius" }))).ok).toBe(false);
    expect(game.state("darius")).toMatchObject({ damage: 0, might: 5 });
  });

  test("played as the SECOND card his Legion trigger sits on the chain — now P1 has priority and Shakedown is legal with Darius as the target", async () => {
    const game = await board().build();
    await game.p2.play("grunt");
    expect(game.chain()).toEqual([]);
    await game.p2.play("darius");
    expect(game.zoneOf("darius")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "darius", controller: P2, triggered: true })]);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "shakedown")).toBe(true);
    await game.p1.cast("shakedown", { targets: "darius" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["darius", "shakedown"]);
  });

  test("Shakedown resolves first (LIFO) and the choice belongs to DARIUS'S controller: P2 elects to have P1 draw 2 instead of taking 6", async () => {
    const game = await board().build();
    await game.p2.play("grunt");
    await game.p2.play("darius");
    await game.p2.passPriority();
    await game.p1.cast("shakedown", { targets: "darius" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    const hand = game.p1.hand().length;
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    await game.p2.pick(0); // "Have them draw 2"
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand + 2);
    expect(game.state("darius").damage).toBe(0);
    // The Legion trigger then resolves as normal: +2 Might this turn and ready.
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7 });
    expect(game.violations()).toEqual([]);
  });
});
