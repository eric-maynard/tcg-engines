/**
 * Ruling 14b9bb39f23b7864 — Diana, No Longer Human (UNL-149 → unl-149-219) · Champion Unit · Chaos · [4][chaos] · 3 Might
 *   "[Ambush] … When you play a spell, give me +2 [Might] this turn."
 *   × Feral Strength (SFD-034 → sfd-034-221) · Spell · Reaction · [2] · "[Repeat] [2] … Give a unit +2 [Might] this turn."
 *   × Defy (OGN-045 → ogn-045-298) · Spell · Reaction · [1][calm] · "Counter a spell that costs no more than [4]…"
 *
 * Q: Does Diana, No Longer Human get +2 Might each time a spell is played?
 * A: Yes — it triggers once per spell YOU play and, being "this turn", the bonuses stack (three spells ⇒ +6).
 *    It is a triggered ability, so it goes on the chain and can be responded to. A countered spell was never
 *    played, so it grants nothing; and a [Repeat]ed spell is still only ONE spell played, so it triggers once.
 * Rules: 383.1 / 355.10.c (triggered ability, uses the chain), 425.1.b (a countered card was not played),
 *        820.1 ([Repeat] repeats the effect, not the play), 317.2 ("this turn" ends in the Expiration Step).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DIANA = "unl-149-219";
const FERAL_STRENGTH = "sfd-034-221";
const DEFY = "ogn-045-298";
/** Inline [1] Action "Deal 1 to a unit." — the cheapest thing that counts as playing a spell. */
const spark = (name: string) =>
  ({
    abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
    cardType: "spell",
    domain: "chaos",
    energyCost: 1,
    name,
    timing: "action",
  }) as const;
/** P2's cheap Reaction, so "a spell was played — but not by you" is easy to stage. */
const TRICK = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  energyCost: 1,
  name: "Trick",
  timing: "reaction",
} as const;

/**
 * P1's turn. Diana (3 Might) sits in P1's base with three Sparks, Feral Strength and 8 energy.
 * P2 holds bf1 with a 9-Might Dummy (a legal Spark target that survives everything) and a Trick.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 8 })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Dummy" }, "dummy")
    .unit(P1, "base", DIANA, "diana")
    .hand(P1, spark("Spark A"), "spark1")
    .hand(P1, spark("Spark B"), "spark2")
    .hand(P1, spark("Spark C"), "spark3")
    .hand(P1, FERAL_STRENGTH, "feral")
    .hand(P2, TRICK, "trick");
}

/** Pass priority for whoever holds it until the chain is empty (or a non-pass decision appears). */
async function drainChain(game: Game, max = 10): Promise<void> {
  for (let i = 0; i < max && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || !d.passKey) {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

describe("Ruling 14b9bb39f23b7864 — Diana gains +2 Might per spell you play, and the bonuses stack for the turn", () => {
  test("premise: Diana is a 3-Might unit with no modifier before anything is played", async () => {
    const game = await board().build();
    expect(game.state("diana")).toMatchObject({ baseMight: 3, might: 3, mightModifier: 0 });
  });

  test("it is a TRIGGERED ability: casting Spark puts only the spell on the chain; Diana's trigger joins the chain when the spell is played (resolves), and the +2 lands only when the trigger itself resolves", async () => {
    const game = await board().build();
    await game.p1.cast("spark1", { targets: "dummy" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["spark1"]);
    expect(game.state("diana").might).toBe(3); // merely on the chain — not played yet
    await game.p1.passPriority();
    await game.p2.passPriority(); // Spark resolves → "when you play a spell" fires
    expect(game.zoneOf("spark1")).toBe("trash");
    expect(game.state("dummy").damage).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "diana", controller: P1, triggered: true })]);
    expect(game.state("diana").might).toBe(3); // the trigger has not resolved yet
    await drainChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("diana")).toMatchObject({ might: 5, mightModifier: 2 });
  });

  test("ruling 14b9bb39f23b7864 — it fires EACH time: three spells in one turn stack to +6 (3 → 9)", async () => {
    const game = await board().build();
    await game.p1.cast("spark1", { targets: "dummy" });
    await game.settle();
    expect(game.state("diana").might).toBe(5);
    await game.p1.cast("spark2", { targets: "dummy" });
    await game.settle();
    expect(game.state("diana").might).toBe(7);
    await game.p1.cast("spark3", { targets: "dummy" });
    await game.settle();
    expect(game.state("diana")).toMatchObject({ baseMight: 3, might: 9, mightModifier: 6 });
    expect(game.violations()).toEqual([]);
  });

  test("the bonus is 'this turn' only: after the turn ends Diana is a 3-Might unit again", async () => {
    const game = await board().build();
    await game.p1.cast("spark1", { targets: "dummy" });
    await game.settle();
    await game.p1.cast("spark2", { targets: "dummy" });
    await game.settle();
    expect(game.state("diana").might).toBe(7);
    await game.advanceTurn();
    expect(game.state("diana")).toMatchObject({ might: 3, mightModifier: 0 });
  });

  test("'when YOU play a spell': an opponent's spell gives her nothing", async () => {
    const game = await board().build();
    await game.p1.cast("spark1", { targets: "dummy" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "trick")).toBe(true);
    await game.p2.cast("trick");
    await game.settle();
    expect(game.zoneOf("trick")).toBe("trash");
    // Exactly one trigger happened — P1's own Spark — so +2, not +4.
    expect(game.state("diana")).toMatchObject({ might: 5, mightModifier: 2 });
  });

  test("[Repeat] is still ONE spell played: Feral Strength repeated once applies its effect twice but triggers Diana only once (+2, not +4)", async () => {
    const game = await board().build();
    await game.p1.cast("feral", { repeat: 1, targets: "dummy" });
    expect(game.p1.energy()).toBe(4); // [2] + the [2] Repeat cost
    expect(game.chain().map((c) => c.cardId)).toEqual(["feral"]);
    await game.settle();
    expect(game.zoneOf("feral")).toBe("trash");
    expect(game.state("dummy").might).toBe(13); // 9 + 2 + 2 — the EFFECT did happen twice
    expect(game.state("diana")).toMatchObject({ might: 5, mightModifier: 2 });
  });

  test("a countered spell was never played: Defy on the Spark leaves Diana at 3 and no trigger ever reaches the chain", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8 })
      .resources(P2, { energy: 1, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Dummy" }, "dummy")
      .unit(P1, "base", DIANA, "diana")
      .hand(P1, spark("Spark A"), "spark1")
      .hand(P2, DEFY, "defy")
      .build();
    await game.p1.cast("spark1", { targets: "dummy" });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "spark1" });
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      expect(game.chain().some((c) => c.cardId === "diana")).toBe(false);
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("spark1")).toBe("trash");
    expect(game.state("dummy").damage).toBe(0); // countered: no effect
    expect(game.state("diana")).toMatchObject({ might: 3, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });
});
