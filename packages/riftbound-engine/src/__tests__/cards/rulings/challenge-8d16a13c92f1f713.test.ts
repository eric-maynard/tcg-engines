/**
 * Ruling 8d16a13c92f1f713 — Challenge (OGN-128 → ogn-128-298) · [Action] · 2 + [body]
 *     "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *   × Discipline (OGN-058 → ogn-058-298) · [Reaction] · 2 · "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Q: Opponent Challenges; I respond with Discipline. Can I resolve that Discipline (drawing a card) and then play a
 *    SECOND Discipline before Challenge resolves?
 * A: Yes. The chain resolves one item at a time; after Discipline resolves Challenge is still on the chain and both
 *    players get priority again before it resolves — the freshly drawn Discipline can be played in that window.
 * Rules: 336–337 (LIFO, one item at a time), 340.4 (priority passes around again while items remain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";
const DISCIPLINE = "ogn-058-298";

/**
 * P1's turn (the Challenger) with 2 + [body]; Fighter (3) in base. P2: Elk (3) at its bf1, ONE Discipline in hand,
 * a second Discipline on top of the deck, and [4] — enough for both.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1 } })
    .resources(P2, { energy: 4 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Fighter" }, "fighter")
    .unit(P2, "bf1", { might: 3, name: "Elk" }, "elk")
    .hand(P1, CHALLENGE, "challenge")
    .hand(P2, DISCIPLINE, "disc1")
    .deck(P2, [DISCIPLINE, "ogn-175-298"], ["disc2", "filler"]);
}

/** Challenge (Fighter vs Elk) → P2 responds with disc1 on Elk → disc1 resolves (both pass). */
async function firstDisciplineResolved(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("challenge", { targets: ["fighter", "elk"] });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.cast("disc1", { targets: "elk" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["challenge", "disc1"]);
  expect(game.p2.hand()).toEqual([]); // the second Discipline is still in the deck
  await game.p2.passPriority();
  await game.p1.passPriority(); // disc1 resolves
  return game;
}

describe("Ruling 8d16a13c92f1f713 — resolve one Discipline, then play the drawn one, all before Challenge resolves", () => {
  test("after the first Discipline resolves (Elk 5, P2 drew disc2) Challenge is STILL on the chain, unresolved — nobody has taken damage", async () => {
    const game = await firstDisciplineResolved();
    expect(game.zoneOf("disc1")).toBe("trash");
    expect(game.state("elk").might).toBe(5);
    expect(game.p2.hand()).toEqual(["disc2"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["challenge"]);
    expect(game.state("elk").damage).toBe(0);
    expect(game.state("fighter").damage).toBe(0);
  });

  test("ruling 8d16a13c92f1f713 — a priority window opens again before Challenge resolves: P2 gets priority and can play the second Discipline onto the chain above Challenge", async () => {
    const game = await firstDisciplineResolved();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    // Whoever holds priority first, P2 must get it before Challenge resolves.
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
      expect(game.chain().map((c) => c.cardId)).toEqual(["challenge"]); // one pass does not resolve it
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "disc2")).toBe(true);
    await game.p2.cast("disc2", { targets: "elk" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["challenge", "disc2"]);
    expect(game.p2.energy()).toBe(0);
  });

  test("everything then resolves in order: disc2 (Elk 7, another draw), and finally Challenge — Fighter (3) takes 7 and dies, Elk (7) takes 3 and lives", async () => {
    const game = await firstDisciplineResolved();
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("disc2", { targets: "elk" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("disc2")).toBe("trash");
    expect(game.p2.hand()).toEqual(["filler"]);
    expect(game.state("elk")).toMatchObject({ damage: 3, might: 7, zone: "battlefield-bf1" });
    expect(game.zoneOf("fighter")).toBe("trash");
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
