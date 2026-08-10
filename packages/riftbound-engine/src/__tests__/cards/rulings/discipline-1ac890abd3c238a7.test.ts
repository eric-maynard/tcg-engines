/**
 * Ruling 1ac890abd3c238a7 — Discipline (OGN-058 → ogn-058-298) [Reaction] · 2 "Give a unit +2 [Might] this turn. Draw 1."
 *   × Rune Prison (OGN-050 → ogn-050-298) [Action] · 2 + [calm] "Stun a unit."
 *
 * Q: In a showdown I pass; my opponent then plays a Reaction (Discipline). After it resolves, may I play an Action
 *    spell (Rune Prison)?
 * A: Yes. When Discipline's chain empties, Focus (and Priority) pass back to you, and an Action may be played on the
 *    now-empty chain. You could NOT have chained the Action onto the Reaction while it was on the chain. The showdown
 *    only closes when everyone passes Focus in a row without playing anything.
 * Rules: 346 (chain resolves in a showdown → Focus passes to the next player), 347.1, 348, 313.1.a.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DISCIPLINE = "ogn-058-298";
const RUNE_PRISON = "ogn-050-298";

/** P1's turn. P2 holds bf1 with a 3-Might Guard; P1's 3-Might Raider in base. P1: Rune Prison + 2 + [calm]. P2: Discipline + 2. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .hand(P1, RUNE_PRISON, "rp")
    .hand(P2, DISCIPLINE, "disc")
    .deck(P2, ["ogn-175-298"], ["p2top"]);
}

/** Raider attacks; P1 (attacker, Focus) passes; P2 takes Focus and plays Discipline on the Guard. Leaves Discipline on the chain. */
async function attackPassThenDiscipline(game: Game): Promise<void> {
  await game.p1.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "rp")).toBe(true); // an Action is playable with Focus on an empty chain
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("disc", { targets: "guard" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["disc"]);
}

describe("Ruling 1ac890abd3c238a7 — after the opponent's Reaction resolves in a showdown you get Focus back and may play an Action", () => {
  test("while Discipline (a Reaction) is on the chain, P1 has priority but can NOT chain the Action Rune Prison onto it", async () => {
    const game = await board().build();
    await attackPassThenDiscipline(game);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "rp")).toBe(false); // Actions need an empty chain
  });

  test("Discipline resolves (Guard +2, P2 draws 1), the chain empties, and Focus + Priority pass to P1 in an open showdown — the showdown does NOT close", async () => {
    const game = await board().build();
    await attackPassThenDiscipline(game);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("guard").might).toBe(5);
    expect(game.p2.hand()).toContain("p2top");
    // Still in the showdown, and it is P1 to act with Focus.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.zoneOf("raider")).toBe("battlefield-bf1"); // no combat damage yet
    expect(game.state("raider").damage).toBe(0);
  });

  test("P1 now plays Rune Prison (an Action) on the empty chain: it resolves and stuns the Guard; the stunned Guard deals no combat damage so the Raider survives", async () => {
    const game = await board().build();
    await attackPassThenDiscipline(game);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.p1.can("cast", "rp")).toBe(true);
    await game.p1.cast("rp", { targets: "guard" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["rp"]);
    expect(game.p1.energy()).toBe(0);
    // Resolve Rune Prison only.
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("rp")).toBe("trash");
    expect(game.state("guard").isStunned).toBe(true);
    // Finish the showdown → combat: Guard (5, stunned) deals nothing; Raider (3) can't kill the 5-Might Guard.
    await game.settle();
    expect(game.zoneOf("raider")).not.toBe("trash");
    expect(game.state("raider").damage).toBe(0);
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });
});
