/**
 * Ruling b1ccc0be9ebccafa — Sett, Brawler (OGN-164 → ogn-164-298) · Champion Unit · Body · 5 · 4 Might
 *   "When I'm played and when I conquer, buff me. Spend my buff: Give me +4 [Might] this turn."
 *   × Pit Rookie (OGN-136 → ogn-136-298) · Unit · Body · 2 · 2 Might
 *   "When you play me, buff another friendly unit."
 *
 * Q: Can you spend Sett's buff, then re-buff him with Pit Rookie, then spend that second buff too?
 * A: Yes. Spend the buff (+4), play Pit Rookie (its trigger targets Sett — he no longer has a buff, so he
 *    gets a new one), then activate again with the chain empty: another +4. Only one buff can be on a
 *    unit at a time, which is why the first must be spent before Pit Rookie can apply a new one.
 * Rules: 702.3 (one buff per unit), 402 (activated-ability timing: your turn, empty chain), 383 (triggers).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SETT = "ogn-164-298";
const PIT_ROOKIE = "ogn-136-298";

/** P1's turn: buffed Sett (4 + 1 = 5) in base, Pit Rookie in hand, 2 energy for it. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .unit(P1, "base", SETT, "sett", { buffed: true })
    .unit(P2, "base", { might: 2, name: "Bystander" }, "foe")
    .hand(P1, PIT_ROOKIE, "rookie");
}

describe("Ruling b1ccc0be9ebccafa — Sett spends a buff, Pit Rookie re-buffs him, Sett spends again", () => {
  test("step 2: Sett spends his buff → +4 this turn (buff gone; 4 + 4 = 8)", async () => {
    const game = await board().build();
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
    await game.p1.activate("sett");
    await game.settle();
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 8, mightModifier: 4 });
    // With no buff left, the ability cannot be activated again yet.
    expect(game.p1.can("activate", "sett")).toBe(false);
  });

  test("steps 3–4: Pit Rookie is played, its trigger goes on the chain and — targeting the now-unbuffed Sett — gives him a NEW buff (8 → 9)", async () => {
    const game = await board().build();
    await game.p1.activate("sett");
    await game.settle();
    await game.p1.play("rookie");
    expect(game.zoneOf("rookie")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rookie", controller: P1, triggered: true })]);
    const r = await game.settle();
    if (r.reason === "unanswered") {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
      await game.p1.pick("sett");
      await game.settle();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 9, mightModifier: 4 });
    expect(game.state("rookie").isBuffed).toBe(false); // "another" friendly unit
  });

  test("step 5: with a fresh buff and the chain empty, Sett's ability is legal again — spend it for another +4 (4 + 4 + 4 = 12, unbuffed)", async () => {
    const game = await board().build();
    await game.p1.activate("sett");
    await game.settle();
    await game.p1.play("rookie");
    const r = await game.settle();
    if (r.reason === "unanswered") {
      await game.p1.pick("sett");
      await game.settle();
    }
    expect(game.p1.can("activate", "sett")).toBe(true);
    await game.p1.activate("sett");
    await game.settle();
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 12, mightModifier: 8 });
    expect(game.violations()).toEqual([]);
    // "this turn": both +4s expire at end of turn.
    await game.advanceTurn();
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 4, mightModifier: 0 });
  });

  test("rule 702.3 contrast: if Sett still HAS his buff when Pit Rookie's trigger resolves on him, no second buff is added (still exactly one buff, 5 Might)", async () => {
    const game = await board().build();
    await game.p1.play("rookie");
    const r = await game.settle();
    if (r.reason === "unanswered") {
      await game.p1.pick("sett");
      await game.settle();
    }
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
    // …and one activation empties it: only one +4 available from here.
    await game.p1.activate("sett");
    await game.settle();
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 8 });
    expect(game.p1.can("activate", "sett")).toBe(false);
  });
});
