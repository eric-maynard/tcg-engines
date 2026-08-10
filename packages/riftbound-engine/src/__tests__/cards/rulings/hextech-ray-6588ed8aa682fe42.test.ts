/**
 * Ruling 6588ed8aa682fe42 — Hextech Ray (OGN-009 → ogn-009-298) · Action · [1][fury] · "Deal 3 to a unit at a battlefield."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Action · [2][chaos] · "Move a friendly unit and ready it."
 *   Reaction used for the "moved by some other means" clause: Flash (ogs-011-024) · Reaction · [2] · "Move up to 2 friendly units to base."
 *
 * Q: I Hextech Ray a unit in a showdown and pass priority — can my opponent Ride the Wind it away so the Ray fizzles?
 * A: No: Ride the Wind is an Action, and only Reactions (and triggers) can be added to an existing chain — "playable in showdowns"
 *    still means only as the FIRST item of a chain. If the target were moved by some other (Reaction-speed) means before the Ray
 *    resolves, the Ray would deal no damage (target no longer at a battlefield). After the chain resolves, whoever has Focus may
 *    start a new chain with an Action.
 * Rules: 337.2 (only Reactions onto a chain), 341–343 (Actions in showdowns start chains), 359.3.e (illegal target → no effect).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_RAY = "ogn-009-298";
const RIDE_THE_WIND = "ogn-173-298";
const FLASH = "ogs-011-024";

/** P1's turn: Raider (5) in base, Hextech Ray + [1][fury]. P2 holds bf1 with Guard (4); Ride the Wind + Flash in hand, [4] + chaos. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .resources(P2, { energy: 4, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P2, RIDE_THE_WIND, "ride")
    .hand(P2, FLASH, "flash");
}

/** Raider attacks bf1 (showdown, P1 has Focus); P1 casts Hextech Ray at Guard and passes priority to P2. */
async function rayOnTheChain(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("ray", { targets: "guard" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 6588ed8aa682fe42 — Ride the Wind (an Action) can't answer Hextech Ray; a Reaction-speed move would make the Ray whiff", () => {
  test("with Hextech Ray on the chain P2 holds priority but Ride the Wind is NOT playable (Action ≠ Reaction) — the attempt is rejected", async () => {
    const game = await rayOnTheChain();
    expect(game.p2.can("cast", "ride")).toBe(false);
    const r = await game.p2.try((p) => p.cast("ride", { targets: "guard" }));
    expect(r.ok).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]);
    // So the Ray resolves: 3 to the Guard.
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("guard")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
  });

  test("'moved by some other means': a genuine Reaction (Flash) IS playable in response, moves the Guard home first (LIFO), and Hextech Ray then deals nothing", async () => {
    const game = await rayOnTheChain();
    expect(game.p2.can("cast", "flash")).toBe(true);
    await game.p2.cast("flash", { targets: ["guard"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "flash"]);
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.zoneOf("ray")).toBe("trash"); // resolved without effect; still spent
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.state("guard")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("after the chain has fully resolved, the player who then holds Focus may START a new chain with an Action — that is when Ride the Wind is legal", async () => {
    const game = await rayOnTheChain();
    await game.p2.passPriority(); // Ray resolves (3 to Guard)
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    if (game.decision()?.seat === P1) {
      expect(game.p2.can("cast", "ride")).toBe(false); // not P2's Focus yet
      await game.p1.passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "ride")).toBe(true);
    await game.p2.cast("ride", { targets: "guard" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ride"]); // first (and only) item of a NEW chain
  });
});
