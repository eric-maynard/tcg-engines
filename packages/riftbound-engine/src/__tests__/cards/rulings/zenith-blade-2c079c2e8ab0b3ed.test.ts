/**
 * Ruling 2c079c2e8ab0b3ed — Zenith Blade (OGN-262 → ogn-262-298) · Action · Calm/Order · [3]+[rainbow][rainbow]
 *     "Stun an enemy unit at a battlefield. You may move a friendly unit to that enemy unit's battlefield."
 *   × Stormbringer (OGN-250 → ogn-250-298) · Spell · [6]+[rainbow][rainbow] · "Choose a friendly unit in your base. Deal
 *     damage equal to its Might to all enemy units at a battlefield, then move your unit there."
 *
 * Q: I control a battlefield; on the opponent's turn all my units there die (Stormbringer) and their unit moves in; I then
 *    bring in a fresh unit (Zenith Blade) and keep the battlefield. Do I score a conquer point?
 * A: No. You controlled the battlefield when the combat started and still control it at the end — you never LOST control,
 *    so nothing was conquered. (The Stormbringer unit, stunned by Zenith Blade, can't kill the new defender and is repelled
 *    to base.)
 * Rules: 467 / 190.4 (Conquer = gaining control of a battlefield you did not control), 466 (stunned units deal no combat
 *        damage; attackers that fail are recalled), 464 (combat when units of the non-controller arrive).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZENITH_BLADE = "ogn-262-298";
const STORMBRINGER = "ogn-250-298";

/**
 * P2's turn. P1 (3 points already) holds bf1 with Holder (2) and keeps Backup (3) in base with Zenith Blade + [3]+2 rainbow.
 * P2: Storm (5) in base, Stormbringer + [6]+2 rainbow. bf2 exists so Stormbringer's battlefield is a real choice.
 */
function board() {
  return scenario()
    .active(P2)
    .points(P1, 3)
    .resources(P1, { energy: 3, power: { rainbow: 2 } })
    .resources(P2, { energy: 6, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 3, name: "Backup" }, "backup")
    .unit(P2, "base", { might: 5, name: "Storm" }, "storm")
    .hand(P2, STORMBRINGER, "sb")
    .hand(P1, ZENITH_BLADE, "zb");
}

/** P2 Stormbringers bf1 with Storm (5 to Holder → dead; Storm moves in); the showdown opens and P2 passes focus to P1. */
async function stormIn(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("sb", { targets: ["storm", "bf1"] });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("sb")).toBe("trash");
  expect(game.zoneOf("holder")).toBe("trash");
  expect(game.zoneOf("storm")).toBe("battlefield-bf1");
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2 });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** P1 Zenith Blades: stun Storm, move Backup to bf1; then everyone passes and the showdown/combat resolves. */
async function zenithAndFinish(game: Game): Promise<void> {
  expect(game.p1.can("cast", "zb")).toBe(true);
  await game.p1.cast("zb", { targets: ["storm", "backup"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("battlefield-bf1"); // "to that enemy unit's battlefield" — the only destination
  }
  expect(game.state("storm")).toMatchObject({ isStunned: true, zone: "battlefield-bf1" });
  expect(game.zoneOf("backup")).toBe("battlefield-bf1");
  await game.settle();
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
}

describe("Ruling 2c079c2e8ab0b3ed — re-manning a battlefield emptied BEFORE the showdown began (control lapsed) and winning is a conquer; re-manning mid-showdown would not be", () => {
  test("Stormbringer wipes P1's Holder and marches Storm onto bf1 → a showdown P2 started; with focus, P1 answers with Zenith Blade (stun Storm, move Backup in); the stunned Storm deals no damage, can't take bf1 and is repelled to base — Backup holds bf1 for P1", async () => {
    const game = await stormIn();
    await zenithAndFinish(game);
    expect(game.zoneOf("zb")).toBe("trash");
    expect(game.state("storm")).toMatchObject({ isStunned: true, location: "base" });
    expect(game.state("backup")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge 2c079c2e8ab0b3ed answers "you never lost control, no point" — true for units that
  // die while a combat is ONGOING (190.4.b), but in the sequence asked Stormbringer kills the lone Holder AND marches
  // Storm in during ONE resolution in a Neutral state: the Cleanup that follows kills Holder (323.5) and runs the
  // control-loss step (323.6, step 4) while the showdown is merely STAGED (323.8; it begins at step 9, 323.12) — so
  // P1 DOES lose bf1 there (CR order + rulings f69a1bb8709cf037 / 88f862ece2edcd29 / 10116d28a80433e5 on exactly this
  // "emptied by a spell, then contested" shape). Backup then wins the combat at an UNCONTROLLED bf1 and establishes
  // control = a Conquer (466.5 / 466.5.d): +1. Engine follows CR — operations/battlefield-control.ts.
  test("ruling 2c079c2e8ab0b3ed (rewritten to CR 323.6 step order) — Holder dies BEFORE any showdown is ongoing, so P1's control lapses in that Cleanup; Backup surviving the combat re-establishes it: a Conquer, 3 → 4", async () => {
    const game = await stormIn();
    expect(game.gameState.battlefields.bf1?.controller).toBeNull(); // lapsed at step 4, showdown began at step 9
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2 });
    await zenithAndFinish(game);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(4);
    expect(game.gameState.conqueredThisTurn?.[P1] ?? []).toEqual(["bf1"]);
  });
});
