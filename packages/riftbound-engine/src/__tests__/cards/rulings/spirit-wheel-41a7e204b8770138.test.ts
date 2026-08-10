/**
 * Ruling 41a7e204b8770138 — Spirit Wheel (SFD-144 → sfd-144-221) · Gear · Chaos · [2]
 *     "When you choose a friendly unit, you may pay [1] and exhaust this to draw 1."
 *   × Discipline (OGN-058 → ogn-058-298) Reaction [2] "Give a unit +2 [Might] this turn. Draw 1."
 *   × En Garde (OGN-046 → ogn-046-298) Reaction [1] "Give a friendly unit +1 [Might] this turn, then +1 more if alone there."
 *   × Defy (OGN-045 → ogn-045-298) Reaction [1]+[calm] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × The Dreaming Tree (OGN-292 → ogn-292-298) Battlefield "When a player chooses a friendly unit here with a spell for the
 *     first time each turn, they draw 1."   (+ Cull sfd-134-221 as an [Equip] gear.)
 *
 * Q: When does Spirit Wheel "activate" off Discipline / En Garde, and when can opponents react?
 * A: It is a TRIGGERED ability: choosing a friendly unit puts its trigger on the chain at once (you decide the "may pay
 *    [1]" then), before opponents get any window. It resolves before the targeting spell; a later Defy on the spell
 *    doesn't undo the trigger. Dreaming Tree etc. trigger simultaneously from the same choice; Equip also counts.
 * Rules: 383.4.b.2 (targeting-event triggers), 383.3 (optional cost decided at finalization), 336–337 (LIFO), 340 (counter).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPIRIT_WHEEL = "sfd-144-221";
const DISCIPLINE = "ogn-058-298";
const EN_GARDE = "ogn-046-298";
const DEFY = "ogn-045-298";
const DREAMING_TREE = "ogn-292-298";
const CULL = "sfd-134-221";

/** P1's turn: Spirit Wheel (ready) + a 2-Might Ally in base, Discipline + En Garde in hand, [4]. P2: Defy with [1]+calm. */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .gear(P1, SPIRIT_WHEEL, "wheel")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P1, EN_GARDE, "eg")
    .hand(P2, DEFY, "defy");
}

/** P1 casts Discipline on Ally and accepts Spirit Wheel's "pay [1] and exhaust". */
async function disciplineWithWheel(): Promise<{ game: Game; hand0: number }> {
  const game = await board().build();
  const hand0 = game.p1.hand().length;
  await game.p1.cast("disc", { targets: "ally" });
  // The trigger is ALREADY on the chain above Discipline, and the "may pay" is asked right now (finalization).
  expect(game.chain()).toEqual([
    expect.objectContaining({ cardId: "disc", controller: P1 }),
    expect.objectContaining({ cardId: "wheel", controller: P1, triggered: true }),
  ]);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "wheel" } });
  expect(game.p1.energy()).toBe(2); // Discipline paid; the [1] not yet
  await game.p1.yes();
  expect(game.p1.energy()).toBe(1);
  expect(game.state("wheel").isExhausted).toBe(true);
  return { game, hand0 };
}

describe("Ruling 41a7e204b8770138 — Spirit Wheel triggers the moment you choose a friendly unit, ahead of any opposing reaction", () => {
  test("Discipline on Ally: Spirit Wheel's trigger + its pay decision come BEFORE the opponent's first window; P2's first priority already sees [Discipline, Spirit Wheel] on the chain", async () => {
    const { game } = await disciplineWithWheel();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    // This is the first moment P2 may act at all.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc", "wheel"]);
    expect(game.p2.can("cast", "defy")).toBe(true);
  });

  test("no response: Spirit Wheel resolves first (draw 1), then Discipline (+2 Might, draw 1) — P1 nets +1 card", async () => {
    const { game, hand0 } = await disciplineWithWheel();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Spirit Wheel's draw resolves
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc"]);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
    await game.settle();
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("ally").might).toBe(4);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 2);
    expect(game.violations()).toEqual([]);
  });

  test("P2 Defies Discipline AFTER the trigger is on the chain: Discipline is countered (no +2, no draw) but Spirit Wheel's trigger still resolves and P1 draws 1", async () => {
    const { game, hand0 } = await disciplineWithWheel();
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "disc" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc", "wheel", "defy"]);
    await game.settle();
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("ally").might).toBe(2); // countered
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1); // only Spirit Wheel's draw
    expect(game.state("wheel").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("En Garde (also chooses a friendly unit) triggers Spirit Wheel the same way", async () => {
    const game = await board().build();
    await game.p1.cast("eg", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["eg", "wheel"]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "wheel" } });
  });

  test("declining the 'may pay [1]': the trigger still went on the chain, but nothing is paid, the Wheel stays ready and no card is drawn from it", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await game.p1.cast("disc", { targets: "ally" });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    expect(game.p1.energy()).toBe(2);
    expect(game.state("wheel").isReady).toBe(true);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1); // Discipline's own draw only
    expect(game.state("ally").might).toBe(4);
  });

  test("simultaneous triggers: with Ally at The Dreaming Tree, one Discipline fires BOTH Spirit Wheel and the Tree; both resolve before Discipline (P1 ends +3 cards net of the spell)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1, def: DREAMING_TREE, inert: false })
      .gear(P1, SPIRIT_WHEEL, "wheel")
      .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
      .hand(P1, DISCIPLINE, "disc")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.cast("disc", { targets: "ally" });
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "wheel" } });
    await game.p1.yes();
    const ids = game.chain().map((c) => c.cardId);
    expect(ids[0]).toBe("disc");
    expect(ids.slice(1).toSorted()).toEqual(["bf1", "wheel"]);
    // Both triggers resolve while Discipline is still the bottom item.
    for (let i = 0; i < 8 && game.chain().length > 1; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc"]);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 2);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 3);
    expect(game.state("ally").might).toBe(4);
  });

  test("an [Equip] activation also 'chooses' the unit: equipping Cull onto Ally triggers Spirit Wheel", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { chaos: 1 } })
      .gear(P1, SPIRIT_WHEEL, "wheel")
      .gear(P1, CULL, "cull")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.do("equipCard", { equipmentId: "cull", unitId: "ally" });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "wheel" } });
    expect(game.chain().some((c) => c.cardId === "wheel" && c.triggered)).toBe(true);
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.state("cull").attachedTo).toBe("ally");
    expect(game.state("ally").might).toBe(3);
    expect(game.state("wheel").isExhausted).toBe(true);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.violations()).toEqual([]);
  });
});
