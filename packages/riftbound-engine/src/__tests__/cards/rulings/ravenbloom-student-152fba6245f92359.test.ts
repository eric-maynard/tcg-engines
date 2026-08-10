/**
 * Ruling 152fba6245f92359 — Ravenbloom Student (OGN-103 → ogn-103-298) · 2-Might Mind unit
 *   "When you play a spell, give me +1 [Might] this turn."
 *   × Cleave (OGN-004 → ogn-004-298) · [1] Action — "Give a unit [Assault 3] this turn."
 *   × Hextech Ray (OGN-009 → ogn-009-298) · [1][fury] Action — "Deal 3 to a unit at a battlefield."
 *
 * Q: The Student moves onto an EMPTY battlefield (non-combat showdown); its owner Cleaves it, the opponent
 *    answers with Hextech Ray. Does the Student get Might from Assault/Cleave, and what happens afterwards?
 * A: No Assault bonus — there is no combat, so the Student is never an attacker; it sits at 3 Might (2 + its own
 *    +1 for the Cleave being played) and dies to Hextech Ray's 3 before the showdown resolves; nobody conquers.
 *    The mover gets Focus first but that does not make it "the attacker". If instead a 6-Might unit had moved
 *    in, it takes 3, conquers, and is NOT healed afterwards (healing is a combat cleanup thing).
 * Rules: 316.8.b.1 (moving to an empty battlefield ⇒ Non-Combat Showdown, no combat), 348.2 (non-combat
 *        showdown close ⇒ control/conquer), 801 (Assault only "while I'm an attacker"), 466.1.a.1 (heal is
 *        part of the COMBAT cleanup only).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RAVENBLOOM_STUDENT = "ogn-103-298";
const CLEAVE = "ogn-004-298";
const HEXTECH_RAY = "ogn-009-298";

/** P1's turn. bfX is empty and uncontrolled. P1: Student (2) in base, Cleave + [1]. P2: Hextech Ray + [1][fury]. */
function board(mover: string | { might: number; name: string } = RAVENBLOOM_STUDENT) {
  return scenario()
    .points(P1, 0)
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .battlefield("bfX", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", mover, "student")
    .hand(P1, CLEAVE, "cleave")
    .hand(P2, HEXTECH_RAY, "ray");
}

/** Move in, P1 Cleaves the mover, the chain (Cleave + any Student trigger) resolves; Focus is then with P2. */
async function moveAndCleave(game: Game): Promise<void> {
  await game.p1.move("student", "bfX");
  await game.p1.cast("cleave", { targets: "student" });
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
  if (game.actingSeat() === P1) {
    await game.p1.passFocus();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
}

describe("Ruling 152fba6245f92359 — Ravenbloom Student on an empty battlefield: no combat ⇒ no Assault; dies to Hextech Ray", () => {
  test("moving onto empty bfX opens a NON-combat showdown: P1 (the mover) has Focus first, but the Student has NO attacker designation", async () => {
    const game = await board().build();
    await game.p1.move("student", "bfX");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ active: true, battlefieldId: "bfX", isCombatShowdown: false });
    expect(game.state("student").combatRole).toBeNull();
    expect(game.gameState.battlefields.bfX?.controller).toBeNull();
    expect(game.p1.can("cast", "cleave")).toBe(true); // Action timing is fine inside a showdown
  });

  test("Cleave resolves: the Student gains [Assault 3] and +1 from its own 'you played a spell' trigger — effective Might is 3, NOT 6 (Assault needs an attacker)", async () => {
    const game = await board().build();
    await moveAndCleave(game);
    expect(game.state("student").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.state("student").combatRole).toBeNull();
    expect(game.state("student").might).toBe(3);
  });

  test("ruling: P2 (now holding Focus) casts Hextech Ray at the Student — 3 damage vs 3 Might kills it before the showdown resolves; bfX stays uncontrolled and P1 scores nothing", async () => {
    const game = await board().build();
    await moveAndCleave(game);
    expect(game.p2.can("cast", "ray")).toBe(true);
    await game.p2.cast("ray", { targets: "student" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Ray resolves
    expect(game.zoneOf("student")).toBe("trash");
    // The showdown had not resolved yet at that point (still open, nobody conquered).
    expect(game.gameState.battlefields.bfX?.controller).toBeNull();
    await game.settle();
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.gameState.battlefields.bfX?.controller).toBeNull();
    expect(game.gameState.battlefields.bfX?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance: a 6-Might unit instead survives the Ray with 3 damage, CONQUERS bfX when the showdown closes, and is NOT healed (no combat occurred)", async () => {
    const game = await board({ might: 6, name: "Big Student" }).build();
    await moveAndCleave(game);
    expect(game.state("student").might).toBe(6); // vanilla: no +1 trigger; Assault 3 granted but inert
    expect(game.state("student").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    await game.p2.cast("ray", { targets: "student" });
    await game.settle();
    expect(game.zoneOf("student")).toBe("battlefield-bfX");
    expect(game.gameState.battlefields.bfX?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("student").damage).toBe(3);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
