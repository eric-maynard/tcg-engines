/**
 * Ruling 97473229810b5333 — Battering Ram (SFD-012 → sfd-012-221) · [5] 5 Might "I cost [1] less for each card you've played this turn, to a
 *     minimum of [1]."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction [1][calm] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Ravenbloom Student (OGN-103 → ogn-103-298) "When you play a spell, give me +1 [Might] this turn."
 *   × Abandoned Hall (UNL-205 → unl-205-219) "When a player plays a spell, they may give a unit they control here +1 [Might] this turn."
 *
 * Q: An earlier riftjudge answer said a countered spell doesn't discount Battering Ram — but CR 419.4.b says otherwise. Which stands?
 * A: The Core Rule. Ram's discount is a NON-triggered check, which references Finalization (419.4.b); the countered spell was finalized
 *    before Defy countered it, so it counts: Ram costs [4]. Triggered "when you play a spell" abilities (Ravenbloom Student, Abandoned
 *    Hall) still do NOT fire for the countered spell (425.1.b).
 * Rules: 419.4.b (with this exact example), 419.4.a.1 / 425.1.b.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BATTERING_RAM = "sfd-012-221";
const DEFY = "ogn-045-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";
const ABANDONED_HALL = "unl-205-219";
const CLEAVE = "ogn-004-298";

/**
 * P1's turn with exactly [5] = Cleave [1] + a discounted Ram [4]. P1 controls the LIVE Abandoned Hall with Hallkeeper (2) there and has
 * Ravenbloom Student (2) in base. P2 holds Defy with [1][calm].
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 5 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("hall", { controller: P1, def: ABANDONED_HALL, inert: false })
    .unit(P1, "hall", { might: 2, name: "Hallkeeper" }, "keeper")
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .hand(P1, CLEAVE, "cleave")
    .hand(P1, BATTERING_RAM, "ram")
    .hand(P2, DEFY, "defy");
}

/** P1 Cleaves the Hallkeeper; P2 Defies it; everything resolves. */
async function cleaveDefied(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.can("play", "ram")).toBe(true); // [5] with 5 energy — but that would leave nothing for Cleave
  await game.p1.cast("cleave", { targets: "keeper" });
  expect(game.p1.energy()).toBe(4);
  await game.p1.passPriority();
  await game.p2.cast("defy", { targets: "cleave" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "defy"]);
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("cleave")).toBe("trash");
  expect(game.state("keeper").grantedKeywords).toEqual([]); // countered: no Assault
  return game;
}

describe("Ruling 97473229810b5333 — a Defied spell still discounts Battering Ram (419.4.b), but fires no play-triggers", () => {
  test("control: with NO card played this turn Ram costs the full [5] — not playable on 4 energy", async () => {
    const game = await board().resources(P1, { energy: 4 }).build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.p1.can("play", "ram")).toBe(false);
  });

  test("the countered Cleave was FINALIZED: it counts as a card played this turn, so Ram costs [4] and P1 plays it with exactly the 4 energy left", async () => {
    const game = await cleaveDefied();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(1);
    expect(game.p1.energy()).toBe(4);
    expect(game.p1.can("play", "ram")).toBe(true);
    await game.p1.play("ram", { to: "base" });
    await game.settle();
    expect(game.zoneOf("ram")).toBe("base");
    expect(game.p1.energy()).toBe(0); // 5 − 1
  });

  test("…while the TRIGGERED 'when you play a spell' abilities did not fire for the countered spell: Ravenbloom Student stays 2, and Abandoned Hall offered nothing (Hallkeeper stays 2)", async () => {
    const game = await cleaveDefied();
    expect(game.state("student").might).toBe(2);
    expect(game.state("keeper")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // no Hall "you may" pending
    expect(game.violations()).toEqual([]);
  });
});
