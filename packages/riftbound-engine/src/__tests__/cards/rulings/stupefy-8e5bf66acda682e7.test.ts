/**
 * Ruling 8e5bf66acda682e7 — Stupefy (OGN-095 → ogn-095-298) × Ravenbloom Student (OGN-103 → ogn-103-298)
 *   × Defy (OGN-045 → ogn-045-298)
 *
 *   Stupefy — Reaction [1]: "Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1."
 *   Ravenbloom Student — Unit 2 · 2 Might: "When you play a spell, give me +1 [Might] this turn."
 *   Defy — Reaction [1]+[calm]: "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *
 * Q: If I Stupefy on my turn, can the opponent respond before the Student's trigger, or can I "chain" the Student
 *    to Stupefy to play around Defy?
 * A: The Student only triggers once the spell has been PLAYED (resolved). While Stupefy is on the chain with its
 *    target declared there is no Student trigger; the opponent may Defy it; if countered it was never played and
 *    the Student never triggers. If it resolves, THEN the Student triggers.
 * Rules: 419.4.a / 425.1.b (a countered card is not "played"), 383 (triggered abilities).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STUPEFY = "ogn-095-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";
const DEFY = "ogn-045-298";

/** P1's turn. P1: Student (2) in base, Stupefy + [1], a known top card. P2: Brute (5) at bf1, Defy + [1][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .unit(P2, "bf1", { might: 5, name: "Brute" }, "brute")
    .hand(P1, STUPEFY, "stupefy")
    .hand(P2, DEFY, "defy")
    .deck(P1, ["ogn-175-298"], ["p1top"]);
}

async function stupefyBrute(game: Game): Promise<void> {
  await game.p1.cast("stupefy", { targets: "brute" });
  expect(game.p1.energy()).toBe(0);
}

describe("Ruling 8e5bf66acda682e7 — Ravenbloom Student triggers only after the spell resolves; Defy gets in first", () => {
  test("declaring Stupefy puts ONLY Stupefy on the chain — no Student trigger yet, Student still 2 — and P2 receives priority to respond", async () => {
    const game = await board().build();
    await stupefyBrute(game);
    expect(game.chain().map((c) => c.cardId)).toEqual(["stupefy"]);
    expect(game.chain()[0]?.targets).toEqual(["brute"]);
    expect(game.chain().some((c) => c.cardId === "student")).toBe(false);
    expect(game.state("student")).toMatchObject({ might: 2, mightModifier: 0 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "defy")).toBe(true);
  });

  test("Defy counters Stupefy: Brute keeps 5, P1 draws nothing, and the Student NEVER triggers (a countered spell was not played) — 2 Might, empty chain", async () => {
    const game = await board().build();
    await stupefyBrute(game);
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "stupefy" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["stupefy", "defy"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.state("brute").might).toBe(5);
    expect(game.p1.hand()).toEqual([]);
    expect(game.state("student")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("if instead Stupefy resolves (P2 passes): Brute 5 → 4, P1 draws 1, and only NOW the Student's trigger hits the chain and resolves for +1 (→ 3)", async () => {
    const game = await board().build();
    await stupefyBrute(game);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Stupefy resolves
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.state("brute").might).toBe(4);
    expect(game.p1.hand()).toEqual(["p1top"]);
    // The "played a spell" trigger appears after resolution.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "student", controller: P1, triggered: true })]);
    expect(game.state("student").might).toBe(2);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("student")).toMatchObject({ might: 3, mightModifier: 1 });
  });
});
