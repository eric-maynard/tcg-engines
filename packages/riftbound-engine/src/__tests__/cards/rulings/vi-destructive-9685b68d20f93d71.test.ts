/**
 * Ruling 9685b68d20f93d71 — Vi, Destructive (OGN-036 → ogn-036-298) · Champion · Fury · 2 · 3 Might
 *     "[Ganking] (I can move from battlefield to battlefield.) Recycle 1 from your trash: Give me +1 [Might] this turn."
 *   × Shakedown (OGN-033 → ogn-033-298, Reaction, 2+[fury]) as the opponent's response in the ability's chain window.
 *
 * Q: How does Vi, Destructive's ability work?
 * A: Ganking lets her move battlefield → battlefield. The activated ability is base speed (your turn, open state, empty chain,
 *    not in a showdown); its cost is recycling 1 card from your trash; each use gives +1 Might until end of turn and it can be
 *    used repeatedly while the trash has cards; it buffs only the Vi that activated it; it uses the chain, so the opponent may
 *    react (e.g. Shakedown) before the +1 resolves; it is not a trigger off other recycles.
 * Rules: 377–380 (activated abilities: cost then chain), 151.2 / 443 (base-speed timing), 720 (Ganking), 411 (Recycle).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VI = "ogn-036-298";
const SHAKEDOWN = "ogn-033-298";
const FILLER = "ogn-175-298";

/** P1's turn. Vi (3) at P1's bf1; P2's Guard (4) at bf2; two known cards in P1's trash; P2 holds Shakedown with exactly 2+[fury]. */
function board() {
  return scenario()
    .resources(P2, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", VI, "vi")
    .unit(P2, "bf2", { might: 4, name: "Guard" }, "guard")
    .trash(P1, FILLER, "t1")
    .trash(P1, FILLER, "t2")
    .hand(P2, SHAKEDOWN, "shake");
}

describe("Ruling 9685b68d20f93d71 — how Vi, Destructive works", () => {
  test("cost + chain + response window: activating recycles the chosen trash card to the bottom of the deck AT ONCE, puts the ability on the chain (Vi still 3), and P2 gets priority where the Reaction Shakedown is legal; on resolution Vi is 4 this turn", async () => {
    const game = await board().build();
    expect(game.p1.can("activateAbility:vi#1")).toBe(true);
    await game.p1.activate("vi", 1, { answers: ["t1"] });
    expect(game.p1.trash()).toEqual(["t2"]); // cost paid: t1 recycled
    expect(game.p1.deck().at(-1)).toBe("t1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", controller: P1, triggered: false })]);
    expect(game.state("vi").might).toBe(3); // not yet
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "shake")).toBe(true); // the opponent may react before the buff resolves
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("vi")).toMatchObject({ might: 4, mightModifier: 1 });
    expect(game.violations()).toEqual([]);
  });

  test("stacking and duration: used twice (two trash cards) → 5 Might this turn; a third use is impossible with an empty trash; next turn she is 3 again", async () => {
    const game = await board().build();
    await game.p1.activate("vi", 1, { answers: ["t1"] });
    await game.settle();
    await game.p1.activate("vi", 1, { answers: ["t2"] });
    await game.settle();
    expect(game.state("vi")).toMatchObject({ might: 5, mightModifier: 2 });
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.can("activateAbility:vi#1")).toBe(false); // no card to recycle → cost unpayable
    await game.advanceTurn();
    expect(game.state("vi").might).toBe(3);
  });

  test("only THIS Vi: with two copies in play, activating one (recycling one card) buffs that copy alone", async () => {
    const game = await board().unit(P1, "base", VI, "vi2").build();
    await game.p1.activate("vi2", 1, { answers: ["t1"] });
    await game.settle();
    expect(game.state("vi2").might).toBe(4);
    expect(game.state("vi").might).toBe(3);
  });

  test("base-speed timing: not during a showdown (Vi ganks into bf2 → showdown open, ability not offered), not on the opponent's turn, not while something is on the chain", async () => {
    const sd = await board().build();
    await sd.p1.gank("vi", "bf2");
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(sd.p1.can("activateAbility:vi#1")).toBe(false);

    const theirs = await board().active(P2).build();
    expect(theirs.p1.can("activateAbility:vi#1")).toBe(false);

    const busy = await board().build();
    await busy.p1.activate("vi", 1, { answers: ["t1"] }); // first activation now on the chain
    expect(busy.chain()).toHaveLength(1);
    expect(busy.p1.can("activateAbility:vi#1")).toBe(false); // can't stack a second one onto a non-empty chain
  });

  test("not a trigger: recycling a card for some OTHER reason (here: paying vi2's cost) never buffs the idle Vi", async () => {
    const game = await board().unit(P1, "base", VI, "vi2").build();
    await game.p1.activate("vi2", 1, { answers: ["t1"] });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("vi").mightModifier).toBe(0);
  });

  test("[Ganking]: from bf1 Vi may move straight to the other battlefield bf2 (a unit without Ganking could only go to base)", async () => {
    const game = await board().unit(P1, "bf1", { might: 2, name: "Grunt" }, "grunt").build();
    expect(game.p1.can("gank", "vi")).toBe(true);
    expect(game.p1.can("gank", "grunt")).toBe(false);
    await game.p1.gank("vi", "bf2");
    expect(game.locationOf("vi")).toBe("bf2");
    expect(game.state("vi").combatRole).toBe("attacker");
  });
});
