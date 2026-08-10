/**
 * Ruling 13ffc18faa8fc079 — Switcheroo (SFD-145 → sfd-145-221) · Spell · Chaos · [2][chaos][chaos] · [Hidden] [Action]
 *   "Swap the Might of two units at the same battlefield this turn."
 *
 * Q: Switcheroo on two units with the SAME Might — do they stay the same? And how does it interact with buffs?
 * A: It applies +/− the DIFFERENCE between the two units' current Mights (as of resolution) as a this-turn modifier: equal
 *    Mights → difference 0 → nothing changes. Buffs are already part of "current Might" when computing the difference; the
 *    units don't literally trade values/buffs. (Mundo-specific note not exercised here.)
 * Rules: 477.4 (swap = each unit gets ± the difference this turn), 702 (a buff counts toward Might), 317.2 (this-turn
 *        modifiers expire).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SWITCHEROO = "sfd-145-221";

/** P1's turn with [2][chaos][chaos] and Switcheroo in hand; P1 holds bf1 where the two subjects stand (one mine, one theirs). */
function board(mine: { might: number; buffed?: boolean }, theirs: { might: number; buffed?: boolean }) {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: mine.might, name: "Mine" }, "mine", mine.buffed ? { buffed: true } : undefined)
    .unit(P2, "bf1", { might: theirs.might, name: "Theirs" }, "theirs", theirs.buffed ? { buffed: true } : undefined)
    .hand(P1, SWITCHEROO, "sw");
}

describe("Ruling 13ffc18faa8fc079 — Switcheroo moves the DIFFERENCE; equal Mights change nothing; buffs count toward the difference", () => {
  test("two 4-Might units: the spell resolves (→ trash, cost paid) and both are still exactly 4 with a 0 modifier — 'swapping' equals is a no-op", async () => {
    const game = await board({ might: 4 }, { might: 4 }).build();
    await game.p1.cast("sw", { targets: ["mine", "theirs"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sw", targets: ["mine", "theirs"] })]);
    await game.settle();
    expect(game.zoneOf("sw")).toBe("trash");
    expect(game.state("mine")).toMatchObject({ might: 4, mightModifier: 0 });
    expect(game.state("theirs")).toMatchObject({ might: 4, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });

  test("equal only BECAUSE of a buff (Mine 3 + buff = 4 vs Theirs 4): still difference 0 → nothing changes, and the buff stays where it was", async () => {
    const game = await board({ buffed: true, might: 3 }, { might: 4 }).build();
    expect(game.state("mine")).toMatchObject({ isBuffed: true, might: 4 });
    await game.p1.cast("sw", { targets: ["mine", "theirs"] });
    await game.settle();
    expect(game.state("mine")).toMatchObject({ isBuffed: true, might: 4, mightModifier: 0 });
    expect(game.state("theirs")).toMatchObject({ isBuffed: false, might: 4, mightModifier: 0 });
  });

  test("buffs are factored into 'current Might': Mine 2 + buff = 3 vs Theirs 6 → difference 3: Mine gets +3 (→ 6, keeps its buff), Theirs gets −3 (→ 3, gains no buff) — a gain/loss, not a literal trade", async () => {
    const game = await board({ buffed: true, might: 2 }, { might: 6 }).build();
    expect(game.state("mine").might).toBe(3);
    await game.p1.cast("sw", { targets: ["mine", "theirs"] });
    await game.settle();
    expect(game.state("mine")).toMatchObject({ baseMight: 2, isBuffed: true, might: 6, mightModifier: 3 });
    expect(game.state("theirs")).toMatchObject({ baseMight: 6, isBuffed: false, might: 3, mightModifier: -3 });
    expect(game.violations()).toEqual([]);
  });

  test("'this turn': at end of turn the ± difference expires and both return to what they were (Mine 3 with its buff, Theirs 6)", async () => {
    const game = await board({ buffed: true, might: 2 }, { might: 6 }).build();
    await game.p1.cast("sw", { targets: ["mine", "theirs"] });
    await game.settle();
    await game.advanceTurn();
    expect(game.state("mine")).toMatchObject({ isBuffed: true, might: 3, mightModifier: 0 });
    expect(game.state("theirs")).toMatchObject({ might: 6, mightModifier: 0 });
    expect(game.trace().expiration[0]?.expired).toEqual(expect.arrayContaining(["mightModifier:mine", "mightModifier:theirs"]));
  });
});
