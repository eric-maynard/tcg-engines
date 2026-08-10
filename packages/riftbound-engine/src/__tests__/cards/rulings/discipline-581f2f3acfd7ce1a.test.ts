/**
 * Ruling 581f2f3acfd7ce1a — Discipline (OGN-058 → ogn-058-298) · [Reaction] 2 · "Give a unit +2 [Might] this turn. Draw 1."
 *   × En Garde (OGN-046 → ogn-046-298) · [Reaction] 1 · "Give a friendly unit +1 [Might] this turn, then an additional +1 … if
 *   it is the only unit you control there."
 *   × Meditation (OGN-048 → ogn-048-298) · [Reaction] 2 · "As an additional cost to play this, you may exhaust a friendly unit.
 *   If you do, draw 2. Otherwise, draw 1."
 *   Subject: Irelia, Fervent (sfd-057-221) · 4 Might · "When you choose or ready me, give me +1 [Might] this turn."
 *
 * Q: Does Irelia's +1 trigger every time she readies or is chosen (turn ready step, spells), and does it stack in one turn?
 * A: Yes — no once-per-turn limit: readying while exhausted at start of turn gives +1, each spell that CHOOSES her gives +1
 *    (ready + Discipline + En Garde = +3 from triggers). Meditation's exhaust does not choose her → no trigger. A ready
 *    Irelia can't be readied, so no +1 from the ready step then.
 * Rules: 383 (triggered abilities, no implicit once-per-turn), 315 (Awaken readies your permanents), 355 (choosing),
 *        356 (additional costs are not choices of a spell's target).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DISCIPLINE = "ogn-058-298";
const EN_GARDE = "ogn-046-298";
const MEDITATION = "ogn-048-298";
const IRELIA = "sfd-057-221";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * End of P2's turn 3; P1: Irelia in base (exhausted or not per case) next to a Bystander (so En Garde is a flat +1),
 * hand Discipline + En Garde + Meditation. P1's pool is refilled by hand after the turn starts (pools empty at end of turn).
 */
function board(ireliaExhausted: boolean) {
  return scenario()
    .turn(3)
    .active(P2)
    .unit(P1, "base", IRELIA, "irelia", ireliaExhausted ? { exhausted: true } : undefined)
    .unit(P1, "base", { might: 1, name: "Bystander" }, "by")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P1, EN_GARDE, "engarde")
    .hand(P1, MEDITATION, "med");
}

/** P2 ends the turn; settle into P1's main phase (Irelia's ready trigger, if any, resolves on the way); give P1 [5]. */
async function intoP1Turn(game: Game): Promise<void> {
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("main");
  await game.p1.do("addResources", { energy: 5 });
}

describe("Ruling 581f2f3acfd7ce1a — Irelia's +1 fires on every ready / every choose, and stacks", () => {
  test("exhausted at start of turn: the Awaken ready triggers her → 5 Might (4 + 1) in P1's main phase, and she is ready", async () => {
    const game = await board(true).build();
    expect(game.state("irelia")).toMatchObject({ isExhausted: true, might: 4 });
    await intoP1Turn(game);
    expect(game.state("irelia")).toMatchObject({ isReady: true, might: 5, mightModifier: 1 });
  });

  test("already ready at start of turn: nothing to ready → no +1 (still 4)", async () => {
    const game = await board(false).build();
    await intoP1Turn(game);
    expect(game.state("irelia")).toMatchObject({ isReady: true, might: 4, mightModifier: 0 });
  });

  test("stacking in one turn: ready (+1) → Discipline chooses her (+1 trigger, +2 spell) → En Garde chooses her (+1 trigger, +1 spell) = 4 + 3 + 3 = 10", async () => {
    const game = await board(true).build();
    await intoP1Turn(game);
    expect(game.state("irelia").might).toBe(5);
    await game.p1.cast("disc", { targets: "irelia" });
    // Her "chosen" trigger joins the chain right away.
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["disc", "irelia"]);
    await game.settle();
    expect(game.state("irelia").might).toBe(8); // 5 + 1 (chosen) + 2 (Discipline)
    await game.p1.cast("engarde", { targets: "irelia" });
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["engarde", "irelia"]);
    await game.settle();
    expect(game.state("irelia").might).toBe(10); // + 1 (chosen) + 1 (En Garde; not alone — Bystander is there)
    expect(game.state("irelia").mightModifier).toBe(6); // three trigger +1s and +2 +1 from the spells
    expect(game.p1.energy()).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("Meditation exhausting Irelia as its additional cost does NOT choose her: no trigger, Might unchanged; P1 draws 2", async () => {
    const game = await board(false).build();
    await intoP1Turn(game);
    const hand = game.p1.hand().length;
    expect(game.state("irelia").might).toBe(4);
    await game.p1.cast("med", { payOptional: true, costs: { paid: { exhaust: "irelia" } } });
    expect(game.state("irelia").isExhausted).toBe(true);
    expect(game.chain().map((c) => c.cardId)).toEqual(["med"]); // no Irelia trigger alongside
    await game.settle();
    expect(game.state("irelia")).toMatchObject({ might: 4, mightModifier: 0 });
    expect(game.p1.hand()).toHaveLength(hand - 1 + 2);
  });

  test("all of it is 'this turn': next turn Irelia is back to 4", async () => {
    const game = await board(true).build();
    await intoP1Turn(game);
    await game.p1.cast("disc", { targets: "irelia" });
    await game.settle();
    expect(game.state("irelia").might).toBe(8);
    await game.advanceTurn(); // → P2
    expect(game.state("irelia")).toMatchObject({ might: 4, mightModifier: 0 });
  });
});
