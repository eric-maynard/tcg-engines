/**
 * Ruling 04db1b244e837edc — Svellsongur (SFD-059 → sfd-059-221) · Equipment · Calm · [3][calm] · +0
 *     "[Equip] [1][calm] As this is attached to a unit, copy that unit's text to this Equipment's effect text for as long as this
 *      is attached to it."
 *   × Lee Sin, Ascetic (OGN-078 → ogn-078-298) · 5 Might · "[Shield] [Exhaust]: Buff me. I can have any number of buffs."
 *
 * Q: With Svellsongur on Lee Sin, can I exhaust him once and get BOTH copies of "[Exhaust]: Buff me" (two buffs)?
 * A: No. Svellsongur gives him a second, separate copy of the ability, but each copy's cost is exhausting Lee Sin; he can only be
 *    exhausted once, so only one of the two can be activated — the copy is essentially wasted for this ability.
 * Rules: 377 / 402.3 (each activation pays its own [Exhaust] cost; an exhausted permanent can't pay it), 718 (copied text = a
 *        separate ability instance).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LEE_SIN = "ogn-078-298";
const SVELLSONGUR = "sfd-059-221";

/** P1's turn. Ready, unbuffed Lee Sin (5) in base; Svellsongur loose in base with exactly its Equip cost [1][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "base", LEE_SIN, "lee")
    .gear(P1, SVELLSONGUR, "svell");
}

/** Equip Svellsongur onto Lee Sin and let the Equip resolve. */
async function equipped(): Promise<Game> {
  const game = await board().build();
  await game.p1.choose("equipCard:-", { params: { equipmentId: "svell", unitId: "lee" } });
  for (let i = 0; i < 4 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "chain"; i++) {
    await game.acting().passPriority();
  }
  expect(game.state("svell").attachedTo).toBe("lee");
  expect(game.state("svell").meta.copiedFromCardId).toBe("lee");
  expect(game.state("lee")).toMatchObject({ isBuffed: false, isReady: true, might: 5 });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  return game;
}

const activations = (game: Game) => game.p1.legal().filter((o) => o.verb === "activate").map((o) => o.key).toSorted();
const buffCount = (game: Game) => {
  const m = game.state("lee").meta as { buffs?: number; buffCount?: number; buffed?: boolean };
  return m.buffs ?? m.buffCount ?? (m.buffed ? 1 : 0);
};

describe("Ruling 04db1b244e837edc — Svellsongur's second copy of Lee Sin's '[Exhaust]: Buff me' can't be paid for: one exhaust, one buff", () => {
  test("with Svellsongur attached P1 sees TWO separate '[Exhaust]: Buff me' abilities — Lee Sin's own and Svellsongur's copy", async () => {
    const game = await equipped();
    expect(activations(game)).toEqual(["activateAbility:lee#1", "activateAbility:svell#1"]);
  });

  test("activating Lee Sin's own copy exhausts him (the cost) → the Svellsongur copy is at once un-activatable; he ends with exactly ONE buff (5 → 6)", async () => {
    const game = await equipped();
    await game.p1.activate("lee", 1);
    expect(game.state("lee").isExhausted).toBe(true);
    expect(activations(game)).toEqual([]);
    expect(game.p1.can("activateAbility:svell#1")).toBe(false);
    expect((await game.p1.try((p) => p.activate("svell", 1, { source: "lee" }))).ok).toBe(false);
    await game.settle();
    expect(game.state("lee")).toMatchObject({ isBuffed: true, isExhausted: true, might: 6 });
    expect(buffCount(game)).toBe(1);
    expect(activations(game)).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("the other way round is the same: Svellsongur's copy first exhausts Lee Sin (its cost) and locks out his printed copy — only ONE activation ever reaches the chain, never a 7-Might Lee Sin", async () => {
    const game = await equipped();
    await game.p1.activate("svell", 1, { source: "lee" });
    expect(game.state("lee").isExhausted).toBe(true);
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.can("activateAbility:lee#1")).toBe(false);
    expect(activations(game)).toEqual([]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect((await game.p1.try((p) => p.activate("lee", 1))).ok).toBe(false);
    expect(game.state("lee").might).toBeLessThan(7);
    expect(buffCount(game)).toBeLessThanOrEqual(1);
  });

  // Expected: the copied "[Exhaust]: Buff me" is appended to LEE SIN's rules text (718.3 — the sibling Caitlyn ruling 208d08e3 reads
  // "my Might" the same way), so activating Svellsongur's copy buffs Lee Sin: buffed, 6 Might.
  // Actual: the engine puts the buff on the Svellsongur equipment itself (svell.meta.buffed = true); Lee Sin stays an unbuffed 5.
  test("ruling 04db1b244e837edc — Svellsongur's copy of 'Buff me' buffs Lee Sin, not the equipment (718.3)", async () => {
    const game = await equipped();
    await game.p1.activate("svell", 1, { source: "lee" });
    await game.settle();
    expect(game.state("svell").isBuffed).toBe(false);
    expect(game.state("lee")).toMatchObject({ isBuffed: true, might: 6 });
    expect(buffCount(game)).toBe(1);
  });

  test("control: 'any number of buffs' is real — on a later turn (readied) a second activation DOES stack a second buff (7); the limit was only ever the single exhaust per turn", async () => {
    const game = await equipped();
    await game.p1.activate("lee", 1);
    await game.settle();
    expect(game.state("lee").might).toBe(6);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("lee")).toMatchObject({ isReady: true, might: 6 });
    await game.p1.activate("lee", 1);
    await game.settle();
    expect(game.state("lee").might).toBe(7);
  });
});
