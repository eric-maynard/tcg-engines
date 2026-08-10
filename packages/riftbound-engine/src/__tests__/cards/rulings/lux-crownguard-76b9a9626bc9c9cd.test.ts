/**
 * Ruling 76b9a9626bc9c9cd — Lux, Crownguard (OGS-014 → ogs-014-024) · Champion Unit · 2 Might
 *     "[Exhaust]: [Reaction] — [Add] [2]. Use only to play spells."
 *   × Hard Bargain (SFD-136 → sfd-136-221) · Reaction [2] "[Repeat][2] Counter a spell unless its controller pays [2]."
 *
 * Q: Can Lux, Crownguard's [2] be used to pay Hard Bargain's "unless its controller pays [2]"?
 * A: No. Lux's energy may only PLAY spells. Hard Bargain's [2] is an effect cost demanded when Hard Bargain
 *    resolves — it is not part of playing the targeted spell (unlike an additional cost such as Deflect,
 *    which changes what the spell costs to play). So Lux cannot fund it and the spell is countered.
 * Rules: 429.3 (restricted [Add] resources), 357.1.a (costs of playing a spell), 158.1 (payments during
 *        resolution), 809 (Deflect is an additional cost — contrast).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LUX_CROWNGUARD = "ogs-014-024";
const HARD_BARGAIN = "sfd-136-221";
const DISCIPLINE = "ogn-058-298"; // plain 2-cost Reaction: "Give a unit +2 [Might] this turn. Draw 1."

/** P1's turn. Ready Lux + a 2-Might Squire in base, Discipline in hand and `energy` ordinary energy. P2: Hard Bargain + [2]. */
function board(energy: number) {
  return scenario()
    .resources(P1, { energy })
    .resources(P2, { energy: 2 })
    .unit(P1, "base", LUX_CROWNGUARD, "lux")
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P2, HARD_BARGAIN, "hb");
}

/** P1 casts Discipline on the Squire (paying 2); P2 answers with Hard Bargain on it and passes → P1 has priority under HB. */
async function bargained(energy: number): Promise<Game> {
  const game = await board(energy).build();
  await game.p1.cast("disc", { targets: "squire" });
  await game.p1.passPriority();
  await game.p2.cast("hb", { targets: "disc" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["disc", "hb"]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 76b9a9626bc9c9cd — Lux, Crownguard's spell-only [2] cannot pay Hard Bargain's ransom", () => {
  test("Lux's [Add] is a Reaction P1 may use under Hard Bargain: she exhausts, [2] lands in the pool immediately, nothing is added to the chain", async () => {
    const game = await bargained(2);
    expect(game.p1.energy()).toBe(0); // all ordinary energy went into Discipline
    expect(game.p1.can("activate", "lux")).toBe(true);
    await game.p1.activate("lux");
    expect(game.state("lux").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc", "hb"]);
  });

  test("Hard Bargain resolves: P1's only energy is Lux's → it cannot pay the [2] → Discipline is COUNTERED (Squire stays 2, no draw) and Lux's [2] sits unspent", async () => {
    const game = await bargained(2);
    const handBefore = game.p1.hand().length;
    await game.p1.activate("lux");
    // If the engine still asks, P1 tries to pay — it must not be accepted.
    game.script(P1, [(d) => (d.kind === "yes-no" ? d.canAccept !== false : undefined)]);
    await game.p1.passPriority();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("squire").might).toBe(2); // no +2
    expect(game.p1.hand()).toHaveLength(handBefore); // no "Draw 1"
    expect(game.p1.energy()).toBe(2); // Lux's energy could not be used for the ransom
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: with 2 ORDINARY energy left P1 is asked and may pay Hard Bargain's [2] — Discipline then resolves (Squire 4, draw 1), Lux untouched", async () => {
    const game = await bargained(4);
    const handBefore = game.p1.hand().length;
    expect(game.p1.energy()).toBe(2);
    await game.p1.passPriority(); // HB resolves → demand
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("squire").might).toBe(4);
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    expect(game.state("lux").isReady).toBe(true);
  });

  test("what Lux's [2] IS for: with no other energy, exhausting Lux lets P1 PLAY the 2-cost Discipline", async () => {
    const game = await board(0).build();
    expect(game.p1.can("cast", "disc")).toBe(false);
    await game.p1.activate("lux");
    expect(game.p1.can("cast", "disc")).toBe(true);
    await game.p1.cast("disc", { targets: "squire" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("squire").might).toBe(4);
  });
});
