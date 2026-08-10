/**
 * Ruling 58d025e3d844effc — Kha'Zix, Mutating Horror (UNL-143 → unl-143-219) · Champion Unit · Chaos · 4+[chaos] · 4 Might
 *   "[Ambush] When I attack or defend, if an enemy unit is alone here, give me +2 [Might] this turn and gain 2 XP."
 *   × Inferna (unl-002-219) · Fury · 2 · 1 Might "[Ambush] [Assault 2]" — the opponent's Ambush unit.
 *
 * Q: Can you play an Ambush unit to "cancel" Kha'Zix's trigger?
 * A: No. "if an enemy unit is alone here" is checked when Kha'Zix becomes an attacker/defender and the ability triggers.
 *    The opponent may Ambush a unit in as a Reaction (it enters first, LIFO), but the condition is not re-evaluated on
 *    resolution: Kha'Zix still gets +2 Might and 2 XP.
 * Rules: 383.5 (intervening "if" checked when the trigger fires), 338 (LIFO), 800 (Ambush: play as a Reaction to a
 *        battlefield where you have units).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KHAZIX = "unl-143-219";
const INFERNA = "unl-002-219";

/** P1's turn. P2 holds bf1 with a lone Defender (3) and has Inferna + its [2]. P1's Kha'Zix (4) attacks from base. */
function board() {
  return scenario()
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Defender" }, "def")
    .hand(P2, INFERNA, "inferna")
    .unit(P1, "base", KHAZIX, "khazix");
}

/** Kha'Zix attacks; his trigger (condition met: Defender is alone) is on the chain; P1 passes → P2's reaction window. */
async function khazixAttacksAlone(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.xp()).toBe(0);
  await game.p1.move("khazix", "bf1");
  expect(game.state("khazix").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "khazix", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 58d025e3d844effc — Ambushing a unit in does not undo Kha'Zix's already-triggered 'alone' bonus", () => {
  test("the trigger condition is met and checked as Kha'Zix attacks: with the Defender alone, his ability goes on the chain", async () => {
    const game = await khazixAttacksAlone();
    expect(game.p2.units("bf1")).toEqual(["def"]);
  });

  test("P2 CAN answer it with an Ambush play: Inferna is played as a Reaction to bf1 (where P2 has units) and enters at once, before Kha'Zix's ability resolves — the Defender is no longer alone", async () => {
    const game = await khazixAttacksAlone();
    expect(game.p2.can("play", "inferna")).toBe(true);
    await game.p2.play("inferna", { to: "bf1" });
    expect(game.zoneOf("inferna")).toBe("battlefield-bf1");
    expect(game.p2.units("bf1").sort()).toEqual(["def", "inferna"]);
    expect(game.chain()).toContainEqual(expect.objectContaining({ cardId: "khazix", triggered: true }));
    expect(game.state("khazix").might).toBe(4); // not resolved yet
    expect(game.p1.xp()).toBe(0);
  });

  test("…but the condition is NOT re-checked on resolution: Kha'Zix's ability still resolves in full — +2 [Might] this turn (4 → 6) and P1 gains 2 XP", async () => {
    const game = await khazixAttacksAlone();
    await game.p2.play("inferna", { to: "bf1" });
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind !== "action" || d.context !== "chain") {
        break;
      }
      await game.seat(d.seat).passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("khazix")).toMatchObject({ might: 6, mightModifier: 2 });
    expect(game.p1.xp()).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("control: had the Defender NOT been alone when Kha'Zix attacked (Inferna already there), the ability would not have triggered at all", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Defender" }, "def")
      .unit(P2, "bf1", INFERNA, "inferna")
      .unit(P1, "base", KHAZIX, "khazix")
      .build();
    await game.p1.move("khazix", "bf1");
    expect(game.chain().some((c) => c.cardId === "khazix")).toBe(false);
    expect(game.state("khazix").might).toBe(4);
    expect(game.p1.xp()).toBe(0);
  });
});
