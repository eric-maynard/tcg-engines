/**
 * Ruling 14eb2b750df2ccad — Svellsongur (SFD-059 → sfd-059-221) · Equipment · Calm · [3] · [Equip] [1][calm]
 *     "As this is attached to a unit, copy that unit's text to this Equipment's effect text for as long as this is
 *      attached to it."
 *   × Lux, Crownguard (OGS-014 → ogs-014-024) · Champion unit · 2 Might — "[Exhaust]: [Reaction] — [Add] [2].
 *     Use only to play spells."
 *
 * Q: Does Svellsongur DOUBLE the values of a unit's activated abilities — will Lux add 4 energy instead of 2?
 * A: No. Svellsongur grants a second instance of the same ability text, it does not double anything. Each copy
 *    costs exhausting the unit, and the unit can only be exhausted once, so exactly one of the two can be paid
 *    for → 2 energy, never 4. (Ready the unit again and it can be exhausted again — true without Svellsongur
 *    too.) Nuance: equipment grants its text to the UNIT, so you cannot exhaust Svellsongur itself to pay.
 * Rules: 377 / 402.3 (each activation pays its own [Exhaust] cost; an exhausted permanent can't pay it),
 *        718 (copied text is a separate ability instance, values unchanged), 136.2.d (attached text is the host's).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SVELLSONGUR = "sfd-059-221";
const LUX_CROWNGUARD = "ogs-014-024";

/** P1's turn. Ready Lux in base; Svellsongur loose in base with exactly its Equip cost [1][calm] available. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "base", LUX_CROWNGUARD, "lux")
    .gear(P1, SVELLSONGUR, "svell");
}

/** Attach Svellsongur to Lux and let the Equip ability resolve; pool is then empty. */
async function equipped(): Promise<Game> {
  const game = await board().build();
  await game.p1.choose("equipCard:-", { params: { equipmentId: "svell", unitId: "lux" } });
  for (let i = 0; i < 4 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "chain"; i++) {
    await game.acting().passPriority();
  }
  expect(game.state("svell").attachedTo).toBe("lux");
  expect(game.state("svell").meta.copiedFromCardId).toBe("lux");
  expect(game.state("lux").isReady).toBe(true);
  expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  return game;
}

const activations = (game: Game) =>
  game.p1
    .legal()
    .filter((o) => o.verb === "activate")
    .map((o) => o.key)
    .toSorted();

describe("Ruling 14eb2b750df2ccad — Svellsongur duplicates Lux's '[Exhaust]: [Add] [2]' rather than doubling it, and one exhaust pays for one copy", () => {
  test("Lux alone (no equipment) is the baseline: one activation, exactly 2 energy", async () => {
    const game = await board().build();
    await game.p1.activate("lux", 0);
    await game.settle();
    expect(game.p1.energy()).toBe(3); // 1 unspent + 2 added
    expect(game.state("lux").isExhausted).toBe(true);
  });

  test("with Svellsongur attached P1 sees TWO separate '[Exhaust]: [Add] [2]' abilities — Lux's own and Svellsongur's copy — not one doubled ability", async () => {
    const game = await equipped();
    expect(activations(game)).toEqual(["activateAbility:lux#0", "activateAbility:svell#0"]);
  });

  test("activating Lux's own copy exhausts him (the cost) → Svellsongur's copy is at once unpayable; P1 gains 2 energy, never 4", async () => {
    const game = await equipped();
    await game.p1.activate("lux", 0);
    expect(game.state("lux").isExhausted).toBe(true);
    expect(activations(game)).toEqual([]);
    expect((await game.p1.try((p) => p.activate("svell", 0, { source: "lux" }))).ok).toBe(false);
    await game.settle();
    expect(game.p1.energy()).toBe(2);
    expect(game.state("lux").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("the other order is the same: Svellsongur's copy exhausts LUX (the equipment's text is the host's), locking out his printed copy — still only 2 energy", async () => {
    const game = await equipped();
    await game.p1.activate("svell", 0, { source: "lux" });
    expect(game.state("lux").isExhausted).toBe(true);
    expect(game.state("svell").isExhausted).toBe(false); // the equipment itself was never the thing exhausted
    expect((await game.p1.try((p) => p.activate("lux", 0))).ok).toBe(false);
    expect(activations(game)).toEqual([]);
    await game.settle();
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.energy()).not.toBe(4);
  });

  test("readying Lux on a later turn lets him be exhausted again — a second 2 energy, which is equally true without Svellsongur", async () => {
    const game = await equipped();
    await game.p1.activate("lux", 0);
    await game.settle();
    expect(game.p1.energy()).toBe(2);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("lux").isReady).toBe(true);
    expect(activations(game).length).toBeGreaterThan(0);
    const before = game.p1.energy();
    await game.p1.activate("lux", 0);
    await game.settle();
    expect(game.p1.energy()).toBe(before + 2);
    expect(game.violations()).toEqual([]);
  });
});
