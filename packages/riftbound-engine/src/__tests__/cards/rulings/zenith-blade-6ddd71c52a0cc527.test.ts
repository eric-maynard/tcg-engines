/**
 * Ruling 6ddd71c52a0cc527 — Zenith Blade (OGN-262 → ogn-262-298) · Action · [3][rainbow][rainbow]
 *   "Stun an enemy unit at a battlefield. You may move a friendly unit to that enemy unit's battlefield."
 *
 * Q: A showdown is already running at BF B when Zenith Blade stages a second one at BF A. Which
 *    battlefield is scored first?
 * A: The one the FIRST showdown was opened at. A showdown created while another is in progress only starts
 *    once the current one has completely finished, so BF B resolves and scores before BF A even opens.
 * Rules: 323.12/323.13 (a staged Showdown/Combat begins only in a Neutral Open State), 460 (one combat at a
 *        time), 190.4.b (control is held while a battlefield is contested).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZENITH_BLADE = "ogn-262-298";

const activeShowdowns = (game: Game) =>
  (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).map((s) => s.battlefieldId);

/**
 * P1's turn. bf1 (= "BF B") is P2's with two units; bf2 (= "BF A") is P1's with a lone Guard.
 * P1's Striker attacks bf1; P2 answers with Zenith Blade, stunning that Guard and pulling their own
 * Runner out of bf1 into bf2 — staging a second combat.
 */
function board() {
  return scenario()
    .resources(P2, { energy: 3, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Defender" }, "defender")
    .unit(P2, "bf1", { might: 2, name: "Runner" }, "runner")
    .unit(P1, "bf2", { might: 1, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 5, name: "Striker" }, "striker")
    .hand(P2, ZENITH_BLADE, "zenith");
}

/** Striker attacks bf1; P1 passes Focus; P2 plays Zenith Blade [stun Guard, move Runner] and it resolves. */
async function openBothShowdowns(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("striker", "bf1");
  expect(activeShowdowns(game)).toEqual(["bf1"]);
  await game.p1.passFocus();
  expect(game.actingSeat()).toBe(P2);

  await game.p2.cast("zenith", { targets: ["guard", "runner"] });
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "action" && game.chain().length > 0) {
      await game.acting().passPriority();
    } else if (d?.kind === "pick") {
      await game.seat(d.seat).pick(d.options.find((o) => (o.zone ?? o.key).includes("bf2"))?.key ?? d.options[0]!.key);
    } else if (d?.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else {
      break;
    }
  }
  return game;
}

describe("Ruling 6ddd71c52a0cc527 — Zenith Blade's new showdown waits: the original battlefield scores first", () => {
  test("Zenith Blade resolves inside the bf1 showdown: the Guard is stunned, the Runner arrives at bf2 — but only bf1 has an ACTIVE showdown", async () => {
    const game = await openBothShowdowns();
    expect(game.state("guard").isStunned).toBe(true);
    expect(game.locationOf("runner")).toBe("bf2");
    expect(game.chain()).toEqual([]);

    expect(activeShowdowns(game)).toEqual(["bf1"]); // the second one is only STAGED
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(game.state("guard").combatRole).toBeNull(); // bf2 has handed out no designations yet
    expect(game.state("runner").combatRole).not.toBe("attacker"); // it is not yet attacking bf2
  });

  test("bf1 is fought and SCORED first — only afterwards does the bf2 showdown open", async () => {
    const game = await openBothShowdowns();
    await game.acting().passFocus();
    await game.acting().passFocus(); // combat damage at bf1

    expect(game.zoneOf("defender")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0); // bf2 has not been decided yet
    expect(activeShowdowns(game)).toEqual(["bf2"]); // NOW the staged combat begins
    expect(game.zoneOf("guard")).toBe("battlefield-bf2");
  });

  test("then bf2 resolves: the stunned Guard deals nothing, the Runner takes the battlefield and P2 scores it", async () => {
    const game = await openBothShowdowns();
    await game.acting().passFocus();
    await game.acting().passFocus();
    await game.settle();

    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(1); // scored at bf1, first
    expect(game.p2.points()).toBe(1); // scored at bf2, second
    expect(game.violations()).toEqual([]);
  });
});
