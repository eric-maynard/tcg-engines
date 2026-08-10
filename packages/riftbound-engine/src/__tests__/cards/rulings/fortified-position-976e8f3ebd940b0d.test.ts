/**
 * Ruling 976e8f3ebd940b0d — Fortified Position (OGN-279 → ogn-279-298, Battlefield) "When you defend here, choose a unit. It
 *   gains [Shield 2] this combat."
 *   × Blitzcrank, Impassive (OGN-067 → ogn-067-298) · 5 Might · [Tank] …
 *   × Discipline (OGN-058 → ogn-058-298, Reaction, 2) "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Q: A defender kept alive by Fortified Position's Shield survives combat — when the Shield ends does it "lose Might" and die
 *    to the damage it took?
 * A: No. Combat cleanup clears damage from surviving units BEFORE the defender designation (and with it the Shield) goes away.
 *    In the example Blitzcrank ends as a 7-Might unit (5 + Discipline's 2) with no damage — not a 9/1 or 7/1 corpse.
 * Rules: 465–467 (combat damage, then cleanup: heal, then remove Attacker/Defender designations), Shield (only while defending),
 *        455 ("this combat" duration).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FORTIFIED_POSITION = "ogn-279-298";
const BLITZCRANK = "ogn-067-298";
const DISCIPLINE = "ogn-058-298";

/** P2's turn. P1 holds the live Fortified Position with Blitzcrank (5); Discipline + exactly [2]. P2's 8-Might Bruiser attacks from base. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2 })
    .battlefield("fort", { controller: P1, def: FORTIFIED_POSITION, inert: false })
    .unit(P1, "fort", BLITZCRANK, "blitz")
    .unit(P2, "base", { might: 8, name: "Bruiser" }, "bruiser")
    .hand(P1, DISCIPLINE, "disc");
}

/** Bruiser attacks; Fortified Position asks P1 for its unit → Blitzcrank; the trigger resolves; P2 passes Focus; P1 Disciplines Blitzcrank and it resolves. Stops in the showdown. */
async function defendWithShieldAndDiscipline(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("bruiser", "fort");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "fort" } }); // "When you defend here, choose a unit"
  await game.p1.pick("blitz");
  await game.p1.passPriority();
  await game.p2.passPriority(); // Fortified Position resolves
  expect(game.state("blitz")).toMatchObject({ combatRole: "defender", grantedKeywords: [{ duration: "combat", keyword: "Shield", value: 2 }], might: 7 });
  await game.p2.passFocus();
  await game.p1.cast("disc", { targets: "blitz" });
  await game.p1.passPriority();
  await game.p2.passPriority(); // Discipline resolves
  return game;
}

describe("Ruling 976e8f3ebd940b0d — a Shielded defender doesn't die when the Shield lapses after combat", () => {
  test("during the combat Blitzcrank defends at 9 (5 + 2 Discipline + Shield 2) against the 8-Might Bruiser", async () => {
    const game = await defendWithShieldAndDiscipline();
    expect(game.state("blitz")).toMatchObject({ baseMight: 5, combatRole: "defender", might: 9, mightModifier: 2 });
    expect(game.state("bruiser")).toMatchObject({ combatRole: "attacker", might: 8 });
  });

  test("combat resolves: Bruiser (takes 9) dies; Blitzcrank took 8 < 9 and SURVIVES — and after cleanup he is a 7-Might unit with 0 damage, no defender role and no Shield (not dead to 'left-over' damage); P1 keeps the battlefield", async () => {
    const game = await defendWithShieldAndDiscipline();
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.zoneOf("blitz")).toBe("battlefield-fort");
    expect(game.state("blitz")).toMatchObject({ combatRole: null, damage: 0, grantedKeywords: [], might: 7, mightModifier: 2 });
    expect(game.gameState.battlefields.fort?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("and once the turn ends Discipline wears off too: Blitzcrank is simply a healthy 5", async () => {
    const game = await defendWithShieldAndDiscipline();
    await game.settle();
    await game.p2.endTurn();
    expect(game.state("blitz")).toMatchObject({ damage: 0, might: 5, zone: "battlefield-fort" });
  });

  test("discriminating control: WITHOUT Discipline Blitzcrank defends at 7 (5 + Shield 2) — the Bruiser's 8 kills him outright, so the survival above really came from Might that included the temporary Shield", async () => {
    const game = await board().build();
    await game.p2.move("bruiser", "fort");
    await game.p1.pick("blitz");
    await game.settle();
    expect(game.zoneOf("blitz")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("battlefield-fort"); // took 7 < 8
    expect(game.gameState.battlefields.fort?.controller).toBe(P2);
  });
});
