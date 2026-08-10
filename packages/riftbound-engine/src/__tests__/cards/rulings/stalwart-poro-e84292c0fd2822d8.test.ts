/**
 * Ruling e84292c0fd2822d8 — Stalwart Poro (OGN-052 → ogn-052-298) · 2 Might · [Shield] (+1 while defending)
 *   × Wuju Bladesman (Master Yi legend, OGS-019 → ogs-019-024) "While a friendly unit defends alone, it gets +2 [Might]." (PASSIVE)
 *   × Pakaa Cub (OGN-135 → ogn-135-298) · 3 Might · [Hidden] — facedown at the Poro's battlefield
 *   (contrast) Mask of Foresight (OGN-060 → ogn-060-298) · Gear · "When a friendly unit attacks or defends alone, give it
 *     +1 [Might] this turn." (TRIGGERED)
 *
 * Q: The lone-defending Poro gets Master Yi's +2; does it have it before I reveal the hidden Pakaa Cub there, and does it
 *    keep it after?
 * A: It has the +2 while it is the only defender. Revealing the Cub adds a second defender, so the passive's condition
 *    fails and the Poro loses the +2 immediately. (Unlike a triggered bonus such as Mask of Foresight's, which persists
 *    for the turn once given.)
 * Rules: 522 / 364.3 (passives apply only while their condition holds), 811 (playing a Hidden card as a Reaction),
 *        464.2.c.3 (a unit arriving mid-combat becomes a defender), 383 (triggered "this turn" bonuses persist).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STALWART_PORO = "ogn-052-298";
const WUJU_BLADESMAN = "ogs-019-024";
const PAKAA_CUB = "ogn-135-298";
const MASK_OF_FORESIGHT = "ogn-060-298";

/** P2's turn 3. P1 holds bf1 with a lone Stalwart Poro and a Pakaa Cub hidden there (since an earlier turn). P2's 4-Might Raider in base. */
function board(bonus: "yi" | "mask") {
  const s = scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", STALWART_PORO, "poro")
    .facedown(P1, "bf1", PAKAA_CUB, "cub")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider");
  return bonus === "yi" ? s.legend(P1, WUJU_BLADESMAN, "yi") : s.gear(P1, MASK_OF_FORESIGHT, "mask");
}

/** Raider attacks bf1; any initial chain (Mask trigger) is resolved; Focus is handed to P1. */
async function raiderAttacks(bonus: "yi" | "mask"): Promise<Game> {
  const game = await board(bonus).build();
  expect(game.state("poro").might).toBe(2);
  await game.p2.move("raider", "bf1");
  expect(game.state("poro").combatRole).toBe("defender");
  expect(game.p1.units("bf1")).toEqual(["poro"]); // defending ALONE
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  if (game.actingSeat() === P2) {
    await game.p2.passFocus();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** P1 reveals the hidden Cub at bf1 (for [0]) and it resolves onto the battlefield as a second defender. */
async function revealCub(game: Game): Promise<void> {
  expect(game.p1.can("reveal", "cub")).toBe(true);
  await game.p1.reveal("cub");
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.zoneOf("cub")).toBe("battlefield-bf1");
  expect(game.state("cub")).toMatchObject({ combatRole: "defender", might: 3 });
  expect(game.p1.units("bf1").sort()).toEqual(["cub", "poro"]);
}

describe("Ruling e84292c0fd2822d8 — Master Yi's +2 leaves the Poro the moment the revealed Pakaa Cub joins the defence", () => {
  test("before the reveal: the Poro defends alone → 2 + 1 (Shield) + 2 (Wuju Bladesman) = 5", async () => {
    const game = await raiderAttacks("yi");
    expect(game.state("poro")).toMatchObject({ baseMight: 2, might: 5 });
  });

  test("P1 reveals the Cub as a Reaction in the showdown: it becomes a second defender and the Poro IMMEDIATELY drops to 3 (Shield only) — the passive no longer applies", async () => {
    const game = await raiderAttacks("yi");
    await revealCub(game);
    expect(game.state("poro")).toMatchObject({ combatRole: "defender", might: 3 });
    expect(game.state("cub").might).toBe(3); // the Cub isn't alone either: no +2 for it
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Mask of Foresight is a TRIGGER: defending alone gives the Poro +1 'this turn' (2 + 1 + 1 = 4), and after the Cub is revealed the Poro KEEPS it (still 4)", async () => {
    const game = await raiderAttacks("mask");
    expect(game.state("poro")).toMatchObject({ might: 4, mightModifier: 1 });
    await revealCub(game);
    expect(game.state("poro")).toMatchObject({ might: 4, mightModifier: 1 });
  });
});
