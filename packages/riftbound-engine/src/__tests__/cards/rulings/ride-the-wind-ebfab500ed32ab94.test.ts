/**
 * Ruling ebfab500ed32ab94 — Ride the Wind (OGN-173 → ogn-173-298) · [Action] [2][chaos] "Move a friendly unit and ready it."
 *   × Yasuo, Remorseful (OGN-076 → ogn-076-298) 6 [Might] "When I attack, deal damage equal to my Might to an enemy unit here."
 *
 * Q: Ride the Wind pulls Yasuo out of a showdown at one battlefield and into another. Do both combats happen at once?
 * A: No. Two combats never run simultaneously. The showdown that is already active runs to the end of its combat
 *    damage step first; only then does the new one at the other battlefield begin. Yasuo was DEFENDING at the first
 *    battlefield, so his "when I attack" does not fire there — it fires when the new combat starts and he attacks.
 * Rules: 460 (one combat at a time), 462 (attacker designation), 466 (combat resolution), 355 (targets on play).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const YASUO = "ogn-076-298";

/** P2's turn. Yasuo DEFENDS P1's bf1; P2's Raider attacks it. P2's bf2 is guarded by an 8-Might Guard. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", YASUO, "yasuo")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .unit(P2, "bf2", { might: 8, name: "Guard" }, "guard")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Open the bf1 showdown (Yasuo defending) and hand Focus to P1. */
async function defendingAtBf1(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.state("yasuo").combatRole).toBe("defender");
  expect(game.state("raider").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([]); // "when I attack" did NOT fire for the defender
  await game.p2.passFocus();
  expect(game.actingSeat()).toBe(P1);
  return game;
}

/**
 * Pass/answer everything, snapshotting (bf1 complete?, bf2 complete?) after every act. Returns the battlefield
 * that was the FIRST to be seen finished while the other was still running (null if they only ever finish together).
 */
async function driveAndFindFirstFinished(game: Game): Promise<string | null> {
  const snaps: [boolean, boolean][] = [];
  const snap = () =>
    snaps.push([
      Boolean(game.gameState.battlefields.bf1?.showdownComplete),
      Boolean(game.gameState.battlefields.bf2?.showdownComplete),
    ]);
  snap();
  for (let i = 0; i < 24; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) break;
    if (d.kind === "action") await game.seat(d.seat).pass();
    else if (d.kind === "pick") await game.seat(d.seat).pick(d.options[0]!.key);
    else if (d.kind === "yes-no") await game.seat(d.seat).yes();
    else break;
    snap();
  }
  for (const [one, two] of snaps) {
    if (one && !two) return "bf1";
    if (two && !one) return "bf2";
  }
  return null;
}

describe("Ruling ebfab500ed32ab94 — Ride the Wind out of an active showdown", () => {
  test("Ride the Wind is an [Action] and IS playable inside the showdown; Yasuo lands at bf2 and is readied", async () => {
    const game = await defendingAtBf1();
    expect(game.p1.can("cast", "rtw")).toBe(true);
    await game.p1.cast("rtw", { answers: ["bf2"], targets: "yasuo" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("yasuo")).toBe("bf2");
    expect(game.state("yasuo").isReady).toBe(true);
  });

  test("both battlefields are now contested, but Yasuo's 'when I attack' fired only at bf2 — never at bf1 where he defended", async () => {
    const game = await defendingAtBf1();
    await game.p1.cast("rtw", { answers: ["bf2"], targets: "yasuo" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.gameState.battlefields.bf2?.contested).toBe(true);
    // The bf1 combat never gave him the Attacker designation, so the only trigger belongs to the bf2 attack.
    await driveAndFindFirstFinished(game);
    expect(game.zoneOf("guard")).toBe("trash"); // 6 from the trigger + 6 combat ≥ its 8 Might
    expect(game.zoneOf("yasuo")).toBe("trash"); // the Guard's 8 ≥ Yasuo's 6
  });

  test("outcome: the Raider is left alone at bf1 and conquers it", async () => {
    const game = await defendingAtBf1();
    await game.p1.cast("rtw", { answers: ["bf2"], targets: "yasuo" });
    await driveAndFindFirstFinished(game);
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  // The already-active bf1 showdown runs to the end of its combat damage step before the freshly staged bf2 one
  // begins: there is a moment where bf1 is finished and bf2 is still running, and never the reverse.
  test("the pre-existing bf1 showdown completes BEFORE the newly staged bf2 one — they never run simultaneously", async () => {
    const game = await defendingAtBf1();
    await game.p1.cast("rtw", { answers: ["bf2"], targets: "yasuo" });
    const first = await driveAndFindFirstFinished(game);
    expect(first).toBe("bf1");
  });
});
