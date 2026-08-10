/**
 * Ruling e46f73ea585d6ae8 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · [Hidden] "If a friendly unit would die, kill this
 *     instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: All my units at a battlefield are about to be killed in combat and I have a Zhonya's hidden there — must I flip it during the
 *    showdown, or can I wait until cleanup and just move it to base?
 * A: You must reveal (play) it during the showdown step, before combat damage. There is no timing window between the units dying and
 *    the hidden card being trashed: if all your units die you lose the battlefield and the facedown card goes to the trash. Once in
 *    play it applies automatically in that combat's cleanup (it is not "saved" for later if a friendly unit dies now).
 * Rules: 465–466 (showdown step → combat damage → resolution), 466.5.c / 323.7 (loser's facedown card trashed), 811 (hidden ⇒
 *        Reaction for [0]), 366–372 (replacement must be in play before the event; not optional).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";

/** Turn 3, P2's turn. P1 holds bf1 with a lone Guard (2) and a facedown Zhonya's there. P2's Raider (5) attacks from base. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
    .facedown(P1, "bf1", ZHONYAS, "zhonya")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider");
}

async function raided(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.state("guard").combatRole).toBe("defender");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Ruling e46f73ea585d6ae8 — a hidden Zhonya's must be flipped during the showdown; after lethal combat it is simply trashed", () => {
  test("during the showdown step P1 (with Focus) CAN reveal the hidden Zhonya's for [0]; it applies automatically in this combat's cleanup: Zhonya's killed instead, Guard healed/exhausted/recalled, Raider conquers the emptied bf1", async () => {
    const game = await raided();
    expect(game.p1.can("reveal", "zhonya")).toBe(true);
    await game.p1.reveal("zhonya");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("zhonya")).toBe("trash"); // used now — not kept for a future showdown
    expect(game.state("guard")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("waiting is fatal: both pass Focus → combat damage kills the Guard → P1 gets NO decision before control flips and the still-facedown Zhonya's is trashed", async () => {
    const game = await raided();
    await game.p1.passFocus(); // P2 already passed; combat resolves
    // Drive any residual forced steps, recording whether P1 was ever offered the reveal after damage.
    let offeredAfterDamage = false;
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.seat === P1 && game.zoneOf("guard") === "trash" && game.p1.can("reveal", "zhonya")) {
        offeredAfterDamage = true;
      }
      await game.settle();
    }
    expect(offeredAfterDamage).toBe(false);
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.p1.gear()).toEqual([]); // never reached the base
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });
});
