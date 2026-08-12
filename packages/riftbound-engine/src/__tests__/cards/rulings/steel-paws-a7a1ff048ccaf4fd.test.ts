/**
 * Ruling a7a1ff048ccaf4fd — Steel Paws (VEN-043 → ven-043-166) · Unit · 1 · 0 Might
 *   "[Deflect] · [Empower] [7] ([7]: Empower me. Use only if not Empowered.) · [Empowered] I have +7 [Might]."
 *
 * Q: I already empowered one Steel Paws. If I play a second Steel Paws, does the first one's Empowered
 *    state spread to it (or vice versa)?
 * A: No. Empower is a per-unit activated ability: each copy must pay its own [7]. [Empowered] is only a
 *    continuous +7 [Might] while THAT unit is empowered — nothing on the card triggers off playing another
 *    Steel Paws. The new copy enters at 0 [Might] and stays there until you pay Empower [7] on it too.
 * Rules: 355.10 (an ability affects only what it names), 383 (no trigger without trigger text),
 *        "[Empowered] …" = a static conditioned on this unit's own Empowered state.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const STEEL_PAWS = "ven-043-166";

/** P1's turn with 15 energy: one Steel Paws already in base, a second in hand. */
function board() {
  return scenario().resources(P1, { energy: 15 }).unit(P1, "base", STEEL_PAWS, "paws1").hand(P1, STEEL_PAWS, "paws2");
}

/** Empower the board copy for [7]. */
async function empowerFirst(): Promise<Game> {
  const game = await board().build();
  await game.p1.activate("paws1");
  await game.settle();
  expect(game.state("paws1").isEmpowered).toBe(true);
  expect(game.state("paws1").might).toBe(7);
  expect(game.p1.energy()).toBe(8);
  return game;
}

describe("Ruling a7a1ff048ccaf4fd — Empower is paid per Steel Paws; playing another does not empower anything", () => {
  test("baseline: Steel Paws is a 0-Might unit until its own Empower [7] is activated (+7 while Empowered)", async () => {
    const game = await board().build();
    expect(game.state("paws1")).toMatchObject({ baseMight: 0, isEmpowered: false, might: 0 });
    await game.p1.activate("paws1");
    await game.settle();
    expect(game.state("paws1")).toMatchObject({ isEmpowered: true, might: 7 });
  });

  test("ruling: playing a SECOND Steel Paws leaves the empowered one untouched and the newcomer at 0 Might, un-Empowered", async () => {
    const game = await empowerFirst();
    await game.p1.play("paws2");
    await game.settle();
    expect(game.zoneOf("paws2")).toBe("base");
    expect(game.state("paws2")).toMatchObject({ isEmpowered: false, might: 0 });
    // …and nothing rubbed off the other way either.
    expect(game.state("paws1")).toMatchObject({ isEmpowered: true, might: 7 });
    expect(game.violations()).toEqual([]);
  });

  test("ruling: playing the second copy fires no trigger at all — no chain item, no prompt, just the play", async () => {
    const game = await empowerFirst();
    await game.p1.play("paws2");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(7); // 15 − 7 (Empower) − 1 (the unit)
  });

  test("ruling: the newcomer must be empowered individually — paying its own [7] takes it (and only it) to 7 Might", async () => {
    const game = await empowerFirst();
    await game.p1.play("paws2");
    await game.settle();
    expect(game.p1.can("activate", "paws2")).toBe(true);
    await game.p1.activate("paws2");
    await game.settle();
    expect(game.state("paws2")).toMatchObject({ isEmpowered: true, might: 7 });
    expect(game.state("paws1")).toMatchObject({ isEmpowered: true, might: 7 });
    expect(game.p1.energy()).toBe(0); // 15 − 7 − 1 − 7
  });

  test("ruling: 'Use only if not Empowered' — an already-empowered Steel Paws cannot be empowered a second time", async () => {
    const game = await empowerFirst();
    expect(game.p1.can("activate", "paws1")).toBe(false);
    expect((await game.p1.try((p) => p.activate("paws1"))).ok).toBe(false);
  });
});
