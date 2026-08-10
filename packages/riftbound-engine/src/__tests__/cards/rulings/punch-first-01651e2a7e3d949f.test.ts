/**
 * Ruling 01651e2a7e3d949f — Punch First (SFD-097 → sfd-097-221) · Spell · Body · 1+[body][body] · Action
 *   "Give a unit +5 [Might] this turn."
 *   × Falling Star (OGN-029 → ogn-029-298) · Spell · Fury · 2+[fury][fury] · "Deal 3 to a unit. Deal 3 to a unit."
 *
 * Q: My opponent plays Falling Star at my unit — can I respond with Punch First to save it?
 * A: No. Falling Star on the chain makes the turn a Closed State; only [Reaction] cards may be played
 *    then. Punch First is an [Action] (your turn / showdowns, open chain only). By the time the chain is
 *    empty again Falling Star has already resolved and dealt its damage.
 * Rules: 309.1 / 331.1 (a chain ⇒ Closed State), 309.1.a / 338.1.a.1 (only Reactions in a Closed State),
 *        806 (Action timing), 813 (Reaction timing).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const PUNCH_FIRST = "sfd-097-221";
const FALLING_STAR = "ogn-029-298";
/** A [Reaction] +5 Might pump — the kind of card that COULD answer Falling Star (contrast). */
const REACTION_PUMP = {
  abilities: [{ effect: { amount: 5, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 1,
  name: "Reaction Pump",
  rulesText: "[Reaction]\nGive a unit +5 [Might] this turn.",
  timing: "reaction",
} as const;

/**
 * P2's turn. P1's 2-Might Victim holds bf1. P2 holds Falling Star with exactly 2 + fury fury; P1 holds
 * Punch First with exactly 1 + body body (so cost is never the reason it is illegal).
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { fury: 2 } })
    .resources(P1, { energy: 1, power: { body: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Victim" }, "victim")
    .hand(P2, FALLING_STAR, "star")
    .hand(P1, PUNCH_FIRST, "punch");
}

describe("Ruling 01651e2a7e3d949f — Punch First ([Action]) cannot answer Falling Star on the chain", () => {
  test("Falling Star (both instances at Victim) starts a chain; with priority, P1 is NOT offered Punch First and the attempt is illegal", async () => {
    const game = await board().build();
    await game.p2.cast("star", { targets: ["victim", "victim"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "star", controller: P2, targets: ["victim", "victim"] })]);
    await game.p2.passPriority();
    // P1 now holds priority in a Closed State.
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P1 });
    expect(game.p1.can("cast", "punch")).toBe(false);
    const r = await game.p1.try((p) => p.cast("punch", { targets: "victim" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("punch")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 2 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["star"]);
  });

  test("so P1 can only pass: Falling Star resolves, 3+3 damage kills the 2-Might Victim before any Action window reopens", async () => {
    const game = await board().build();
    await game.p2.cast("star", { targets: ["victim", "victim"] });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "punch")).toBe(false);
    await game.p1.passPriority();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("trash");
    // Chain empty again, but it is P2's turn and no showdown: an [Action] is still not playable by P1.
    expect(game.p1.can("cast", "punch")).toBe(false);
    expect(game.zoneOf("punch")).toBe("hand");
  });

  test("contrast: a [Reaction] with the same effect IS playable in that window and saves the Victim (2+5 = 7 > 6 damage)", async () => {
    const game = await board().hand(P1, REACTION_PUMP, "pump").resources(P1, { energy: 2, power: { body: 2 } }).build();
    await game.p2.cast("star", { targets: ["victim", "victim"] });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "punch")).toBe(false);
    expect(game.p1.can("cast", "pump")).toBe(true);
    await game.p1.cast("pump", { targets: "victim" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["star", "pump"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("victim")).toBe("battlefield-bf1");
    expect(game.state("victim").might).toBe(7);
    expect(game.state("victim").damage).toBe(6);
  });

  test("contrast: Punch First itself is a legal play for P1 in an OPEN state on P1's own turn", async () => {
    const game = await board().active(P1).build();
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    expect(game.p1.can("cast", "punch")).toBe(true);
    await game.p1.cast("punch", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("punch")).toBe("trash");
    expect(game.state("victim").might).toBe(7);
  });
});
