/**
 * Ruling d983850ed8cbaf1c — Sunken Temple (SFD-218 → sfd-218-221) · Battlefield
 *     "When you conquer here with one or more [Mighty] units, you may pay [1] to draw 1. (Mighty = 5+ [Might].)"
 *   × Noxus Hopeful (OGN-012 → ogn-012-298) · 4 Might × Blood Rush (SFD-003 → sfd-003-221) · Action · [1]
 *     "[Repeat] [1] Give a unit [Assault 2] this turn. (+2 [Might] while it's an attacker.)"
 *
 * Q: Empty Sunken Temple; I move Noxus Hopeful (4) onto it and, with priority in that showdown, Blood Rush it (no repeat).
 *    I conquer — may I pay [1] to draw for conquering with a Mighty unit?
 * A: No. Blood Rush grants Assault 2, i.e. +2 only "while it's an attacker". Moving onto an EMPTY battlefield is not an
 *    attack — there is no combat, the unit is never an attacker — so it stays 4 Might, is not Mighty at the moment of the
 *    conquer, and Sunken Temple's ability does not trigger at all.
 * Rules: 807.1.c–d (Assault applies only while designated attacker), 344 (non-combat showdown at an empty battlefield),
 *        466.5 / 471 (conquer), Mighty = 5+ Might checked when the conquer happens.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SUNKEN_TEMPLE = "sfd-218-221";
const NOXUS_HOPEFUL = "ogn-012-298";
const BLOOD_RUSH = "sfd-003-221";

/** P1's turn with [2] (Blood Rush + the would-be temple payment). Sunken Temple (P1's card) is empty and uncontrolled; Hopeful ready in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("temple", { controller: null, def: SUNKEN_TEMPLE, inert: false, owner: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", NOXUS_HOPEFUL, "hopeful")
    .hand(P1, BLOOD_RUSH, "rush");
}

/** Move Hopeful onto the empty temple (a non-combat showdown opens, P1 has Focus) and Blood Rush it there; resolve the spell. */
async function moveAndRush(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("hopeful", "temple");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.state("hopeful").combatRole).toBeNull(); // nobody to fight: not an attacker
  expect(game.p1.can("cast", "rush")).toBe(true); // Action speed is legal in the showdown
  await game.p1.cast("rush", { targets: "hopeful" });
  expect(game.p1.energy()).toBe(1);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Blood Rush resolves
  expect(game.zoneOf("rush")).toBe("trash");
  return game;
}

describe("Ruling d983850ed8cbaf1c — Blood Rush's Assault doesn't make a non-attacking Hopeful Mighty; Sunken Temple stays silent", () => {
  test("Blood Rush resolves on Hopeful at the empty temple: it has Assault 2 granted but, not being an attacker, is still 4 Might (not Mighty)", async () => {
    const game = await moveAndRush();
    expect(game.state("hopeful").grantedKeywords).toEqual([expect.objectContaining({ keyword: "Assault", value: 2 })]);
    expect(game.state("hopeful").combatRole).not.toBe("attacker");
    expect(game.state("hopeful").might).toBe(4);
  });

  test("both pass Focus → P1 conquers the temple (control + 1 point) with a 4-Might unit: NO 'pay [1] to draw 1' offer, hand and energy unchanged, straight back to the main phase", async () => {
    const game = await moveAndRush();
    const hand = game.p1.hand().length;
    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(game.gameState.battlefields.temple?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.locationOf("hopeful")).toBe("temple");
    const d = game.decision();
    expect(d?.kind === "yes-no").toBe(false);
    expect(d).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.state("hopeful").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });

  test("control: a genuinely Mighty conqueror (a 5-Might unit walking onto the empty temple) DOES get the offer and can pay [1] to draw 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("temple", { controller: null, def: SUNKEN_TEMPLE, inert: false, owner: P1 })
      .unit(P1, "base", { might: 5, name: "Juggernaut" }, "jugg")
      .build();
    const hand = game.p1.hand().length;
    await game.p1.move("jugg", "temple");
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind !== "action" || d.context === "main" || !d.passKey) {
        break;
      }
      await game.seat(d.seat).pass();
    }
    expect(game.gameState.battlefields.temple?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.hand()).toHaveLength(hand + 1);
  });
});
