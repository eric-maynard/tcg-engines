/**
 * Ruling 213de1e6a8cd73e7 — Hextech Ray (OGN-009 → ogn-009-298) · Action [1][fury] "Deal 3 to a unit at a battlefield."
 *   × Arcane Shift (SFD-200 → sfd-200-221) · Action [3][rainbow] "Banish a friendly unit, then its owner plays it,
 *     ignoring its cost. Deal 3 to an enemy unit at a battlefield. Banish this."
 *
 * Q: I move my 4-Might unit to an EMPTY battlefield; the enemy Hextech Rays it. Can I Arcane Shift in response and
 *    play the unit back to the same battlefield?
 * A (riftjudge, self-flagged "could not fully verify"): Yes you can respond with Arcane Shift; it needs both a friendly
 *    unit and an enemy unit at a battlefield; it resolves first (LIFO), the replayed unit is a NEW object so the locked-in
 *    Ray no longer hits it; outside combat you don't keep the battlefield — the replay can't hold it through cleanup.
 * Rules: 336/337 (LIFO, targets locked at finalization), 344.2/348.2 (non-combat showdown), 806 (Action timing).
 * NOTE: the "respond with an Action" step conflicts with 343.1.a / ruling 23daaac4c0613901 (only Reactions may be
 * played onto an open chain); the engine enforces the latter — recorded below as a failing ruling assertion.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_RAY = "ogn-009-298";
const ARCANE_SHIFT = "sfd-200-221";

/**
 * P1's turn. bf1 is empty and uncontrolled; P2 holds bf2 with a 5-Might Bystander (Arcane Shift's enemy target).
 * P1: 4-Might Champ in base, Arcane Shift in hand, [3]+1 power. P2: Hextech Ray in hand, [1]+fury.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 4, name: "Champ" }, "champ")
    .unit(P2, "bf2", { might: 5, name: "Bystander" }, "bystander")
    .hand(P1, ARCANE_SHIFT, "shift")
    .hand(P2, HEXTECH_RAY, "ray")
    .resources(P1, { energy: 3, power: { mind: 1 } })
    .resources(P2, { energy: 1, power: { fury: 1 } });
}

/** Champ moves to the empty bf1 → non-combat showdown (P1 has Focus); P1 passes Focus; P2 plays Hextech Ray at Champ. */
async function rayOnTheChain(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("champ", "bf1");
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: null });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("ray", { targets: "champ" });
  // 1. Hextech Ray is finalized with its target locked in.
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P2, targets: ["champ"] })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 213de1e6a8cd73e7 — Hextech Ray on a unit that walked onto an empty battlefield, answered by Arcane Shift", () => {
  // RULING-CONFLICT: riftjudge 213de1e6a8cd73e7 (self-flagged "could not fully verify") says Arcane Shift may be
  // played "in response" to Hextech Ray; CR 343.1.a says only Reaction-timing cards may be played onto an open
  // chain (Closed State), and Arcane Shift is an [Action] — engine follows CR, as does ruling 23daaac4c0613901
  // ("Actions can never react").
  // rule 343.1.a: while a chain is open the game is in the Closed State — only Reactions may be added to it.
  test("Arcane Shift is an [Action], so with Hextech Ray on the chain P1 may not play it — only pass", async () => {
    const game = await rayOnTheChain();
    expect(game.p1.can("cast", "shift")).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]);
  });

  test("what the engine does allow: P1 passes, Ray resolves for 3 on Champ, the chain closes and Focus passes to P1 — who may NOW play Arcane Shift", async () => {
    const game = await rayOnTheChain();
    await game.p1.passPriority();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.state("champ").damage).toBe(3);
    expect(game.zoneOf("champ")).toBe("battlefield-bf1"); // 3 < 4: it survives
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "shift")).toBe(true);
  });

  test("targeting (FAQ #592): Arcane Shift takes BOTH a friendly unit and an enemy unit at a battlefield — [champ, bystander] is the only legal pair here", async () => {
    const game = await rayOnTheChain();
    await game.p1.passPriority();
    const field = game.p1.option("cast", "shift")?.fields.find((f) => f.name === "targets");
    expect(field).toMatchObject({ max: 2, min: 2, required: true });
    expect(field?.options).toEqual([["champ", "bystander"]]);
  });

  test("…and with no enemy unit at any battlefield it cannot be played at all", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { might: 4, name: "Champ" }, "champ")
      .unit(P2, "base", { might: 5, name: "Bystander" }, "bystander") // in base, not at a battlefield
      .hand(P1, ARCANE_SHIFT, "shift")
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .build();
    expect(game.p1.can("cast", "shift")).toBe(false);
  });

  test("not in combat: Arcane Shift banishes Champ and replays it as a NEW object (damage gone) — but not back onto the uncontrolled bf1; the showdown then closes with nobody controlling bf1", async () => {
    const game = await rayOnTheChain();
    await game.p1.passPriority(); // Ray resolves: Champ has 3 damage
    await game.p1.cast("shift", { targets: ["champ", "bystander"] });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Arcane Shift resolves
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      // A destination offer, if any, must not include the battlefield P1 does not control.
      expect(d.options.map((o) => o.key)).not.toContain("battlefield-bf1");
      await game.p1.pick(d.options[0]?.key as string);
    }
    expect(game.zoneOf("shift")).toBe("banishment"); // "Banish this."
    expect(game.state("bystander").damage).toBe(3); // "Deal 3 to an enemy unit at a battlefield."
    expect(game.zoneOf("champ")).toBe("base"); // replayed — to base, the only place P1 may play a unit
    expect(game.state("champ").damage).toBe(0); // a new object: Ray's 3 damage did not follow it
    await game.settle(); // both pass Focus → the non-combat showdown closes
    expect(game.gameState.battlefields.bf1?.controller).toBeNull(); // no unit left there → P1 never takes bf1
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
