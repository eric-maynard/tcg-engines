/**
 * Ruling ba428670813462b1 — Ruined Rex (UNL-067 → unl-067-219) · 6 Might
 *     "[Deathknell][>] Deal 4 to an enemy unit."
 *
 * Q: Rex dies in a combat showdown and his Deathknell deals 4 to a unit at ANOTHER battlefield. Does that
 *    damage get healed away as the showdown finishes?
 * A: No. The Combat Cleanup's "heal all units" step runs BEFORE the pending Deathknell resolves, so the 4 lands
 *    on an already-healed board. There is no second healing wave: the 4 stays marked on that unit until another
 *    Combat Cleanup happens at its battlefield or the turn ends.
 * Rules: 461.1.a.1 (heal all units, part of Combat Cleanup), 808.1 ([Deathknell] resolves from the chain after
 *        cleanup), 143.3.b (marked damage persists until end of turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUINED_REX = "unl-067-219";

/**
 * P2's turn 3. bf1: P1's Bulwark (7) meets P2's attacking Rex (6) — Rex dies. bf2 is P1's, held by a 9-Might
 * Watchtower that is nowhere near the fight and is the Deathknell's victim.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 7, name: "Bulwark" }, "bulwark")
    .unit(P1, "bf2", { might: 9, name: "Watchtower" }, "watchtower")
    .unit(P2, "base", RUINED_REX, "rex");
}

/** Fight at bf1, then aim the Deathknell at the far-away Watchtower and let everything resolve. */
async function fightAndAimAtBf2(game: Game): Promise<void> {
  await game.p2.move("rex", "bf1");
  await game.p2.passFocus();
  await game.p1.passFocus();
  expect(game.zoneOf("rex")).toBe("trash");
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "pick") {
      await game.seat(d.seat).pick("watchtower");
    } else if (d.kind === "order") {
      await game.acceptTriggerOrder();
    } else if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
}

describe("Ruling ba428670813462b1 — a Deathknell's 4 damage at another battlefield is NOT healed by the combat that killed Rex", () => {
  test("intermediate fact: the combat heal has already run when the Deathknell resolves — the Bulwark that fought is at 0 damage", async () => {
    const game = await board().build();
    await fightAndAimAtBf2(game);
    expect(game.state("bulwark").damage).toBe(0); // its 6 combat damage was healed
  });

  test("ruling: the Watchtower at bf2 keeps the 4 — it landed after the healing step, and no second heal follows", async () => {
    const game = await board().build();
    await fightAndAimAtBf2(game);
    expect(game.state("watchtower").damage).toBe(4);
    expect(game.zoneOf("watchtower")).toBe("battlefield-bf2"); // 4 < 9, it lives
    await game.settle();
    expect(game.state("watchtower").damage).toBe(4);
    expect(game.violations()).toEqual([]);
  });

  test("the marked damage only clears when the turn ends", async () => {
    const game = await board().build();
    await fightAndAimAtBf2(game);
    expect(game.state("watchtower").damage).toBe(4);
    await game.advanceTurn();
    expect(game.state("watchtower").damage).toBe(0);
  });
});
