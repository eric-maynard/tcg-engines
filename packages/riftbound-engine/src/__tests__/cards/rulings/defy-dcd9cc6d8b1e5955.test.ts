/**
 * Ruling dcd9cc6d8b1e5955 — Defy (OGN-045 → ogn-045-298) · [Reaction] · 1 + [calm]
 *     "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Ravenbloom Student (OGN-103 → ogn-103-298) · 2 Might · "When you play a spell, give me +1 [Might] this turn."
 *   × Dredge Up (VEN-049 → ven-049-166) · Spell · 2 · "Draw 1." (the countered spell)
 *
 * Q: I control Ravenbloom Student and play a spell; my opponent Defies it. Does the Student still get +1 Might?
 * A: No. A countered spell never resolves, so it is not considered "played"; "When you play a spell" is never met and
 *    the Student's ability does not trigger.
 * Rules: 419.4.a / 419.4.a.1 (play-triggers fire on completed resolution; countered ⇒ none), 425.1.b (countered = not
 *        played), 425.1.a (countered card to trash), 425.1.c (no refund).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";
const DREDGE_UP = "ven-049-166";

/** P1's turn: Student in base, Dredge Up in hand with exactly [2]. P2: Defy with exactly 1 + [calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, DREDGE_UP, "dredge")
    .hand(P2, DEFY, "defy");
}

async function castDredge(): Promise<Game> {
  const game = await board().build();
  expect(game.state("student").might).toBe(2);
  await game.p1.cast("dredge");
  expect(game.p1.energy()).toBe(0);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dredge", controller: P1 })]);
  return game;
}

describe("Ruling dcd9cc6d8b1e5955 — a Defied spell does not pump Ravenbloom Student", () => {
  test("step 1: the spell goes on the chain; the Student's play-trigger has NOT fired yet (it waits for the spell to resolve, 419.4.a)", async () => {
    const game = await castDredge();
    expect(game.state("student").might).toBe(2);
    expect(game.chain().some((c) => c.cardId === "student")).toBe(false);
  });

  test("steps 2–5: P2 Defies it → Defy resolves, Dredge Up is countered to the trash (no draw, no refund) — and the Student stays at 2 Might: no 'When you play a spell' trigger ever appears", async () => {
    const game = await castDredge();
    const handBefore = game.p1.hand().length;
    await game.p1.passPriority();
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy", { targets: "dredge" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dredge", "defy"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("dredge")).toBe("trash"); // 425.1.a
    expect(game.p1.hand()).toHaveLength(handBefore); // countered: no "Draw 1"
    expect(game.p1.energy()).toBe(0); // 425.1.c
    expect(game.state("student")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(game.chain().some((c) => c.cardId === "student")).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control (no Defy): Dredge Up resolves, P1 draws 1, and the Student's trigger fires — 3 Might this turn", async () => {
    const game = await castDredge();
    const handBefore = game.p1.hand().length;
    await game.settle();
    expect(game.zoneOf("dredge")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    expect(game.state("student").might).toBe(3);
    await game.advanceTurn();
    expect(game.state("student").might).toBe(2); // "this turn"
  });
});
