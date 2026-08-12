/**
 * Ruling 9a5afc5c5c64a3da — Cithria of Cloudfield (OGN-139 → ogn-139-298) · Unit · 2 · 1 [Might]
 *   "When you play ANOTHER unit, buff me. (If I don't have a buff, I get a +1 [Might] buff.)"
 *   × Wallop (OGN-146 → ogn-146-298) "[Action] As you play this, you may spend a buff as an additional
 *     cost. If you do, ignore this spell's cost. Ready a unit." — the way to take her buff off again.
 *
 * Q: Does Cithria buff herself when played alone? What happens when more units follow, and after her
 *    buff is spent?
 * A: Alone she gets nothing — her trigger needs ANOTHER unit to be played. Each later unit buffs her,
 *    but a unit holds at most one buff, so repeats do nothing while she already has one. Spend the
 *    buff and the next unit played buffs her again. Note "buff" is a game term: a plain +1 [Might]
 *    this turn is not a buff.
 * Rules: 383 (triggered abilities), 155/155.1 (Buff: one per unit), 355.10.d (programmatic self-target).
 */
import { describe, expect, test } from "bun:test";
import type { Game, InlineCardDef } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CITHRIA = "ogn-139-298";
const WALLOP = "ogn-146-298";

/** Plain +1 Might this turn — proves a might bump is NOT a buff. */
const PUMP: InlineCardDef = {
  abilities: [
    { effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" }, type: "spell" },
  ],
  cardType: "spell",
  domain: "order",
  energyCost: 0,
  name: "Filler Pump",
  rulesText: "Give a unit +1 [Might] this turn.",
  timing: "standard",
};

const RECRUIT = (name: string): InlineCardDef => ({ cardType: "unit", energyCost: 0, might: 2, name });

function board() {
  return scenario()
    .resources(P1, { energy: 8 })
    .hand(P1, CITHRIA, "cithria")
    .hand(P1, RECRUIT("Filler Recruit A"), "recA")
    .hand(P1, RECRUIT("Filler Recruit B"), "recB")
    .hand(P1, WALLOP, "wallop")
    .hand(P1, PUMP, "pump")
    .unit(P1, "base", { might: 2, name: "Filler Tired" }, "tired", { exhausted: true })
    .hand(P2, RECRUIT("Filler Enemy Recruit"), "enemyRec");
}

/** Play Cithria and let everything settle. */
async function cithriaOut(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("cithria");
  await game.settle();
  expect(game.zoneOf("cithria")).toBe("base");
  return game;
}

describe("Ruling 9a5afc5c5c64a3da — Cithria buffs herself only when ANOTHER unit is played", () => {
  test("played alone she gets no buff — the reminder text explains 'buff me', it does not grant one", async () => {
    const game = await cithriaOut();
    expect(game.state("cithria")).toMatchObject({ isBuffed: false, baseMight: 1, might: 1 });
    expect(game.chain()).toEqual([]);
  });

  test("playing another unit buffs her: +1 [Might] and isBuffed", async () => {
    const game = await cithriaOut();
    await game.p1.play("recA");
    await game.settle();
    expect(game.state("cithria")).toMatchObject({ isBuffed: true, might: 2 });
  });

  test("a second unit does not stack — a unit holds at most one buff", async () => {
    const game = await cithriaOut();
    await game.p1.play("recA");
    await game.settle();
    await game.p1.play("recB");
    await game.settle();
    expect(game.state("cithria")).toMatchObject({ isBuffed: true, might: 2 }); // still exactly +1
  });

  test("spend the buff and the NEXT unit played buffs her again", async () => {
    const game = await cithriaOut();
    await game.p1.play("recA");
    await game.settle();
    expect(game.state("cithria").isBuffed).toBe(true);
    // Wallop's optional additional cost spends a buff (Cithria's is the only one) to ready a unit.
    await game.p1.cast("wallop", { payOptional: true, targets: "tired" });
    await game.settle();
    expect(game.state("cithria")).toMatchObject({ isBuffed: false, might: 1 });
    await game.p1.play("recB");
    await game.settle();
    expect(game.state("cithria")).toMatchObject({ isBuffed: true, might: 2 });
  });

  test("a plain '+1 [Might] this turn' is not a buff — it never satisfies 'if I don't have a buff'", async () => {
    const game = await cithriaOut();
    await game.p1.cast("pump", { targets: "cithria" });
    await game.settle();
    expect(game.state("cithria")).toMatchObject({ isBuffed: false, might: 2, mightModifier: 1 });
    await game.p1.play("recA");
    await game.settle();
    // Now she really is buffed, on top of the (non-buff) +1.
    expect(game.state("cithria")).toMatchObject({ isBuffed: true, might: 3 });
  });

  test("an OPPONENT's unit is not 'you play another unit' — Cithria stays unbuffed", async () => {
    const game = await cithriaOut();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.play("enemyRec");
    await game.settle();
    expect(game.state("cithria").isBuffed).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
