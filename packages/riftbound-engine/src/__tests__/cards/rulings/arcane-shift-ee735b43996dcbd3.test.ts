/**
 * Ruling ee735b43996dcbd3 — Arcane Shift (sfd-200-221) · Spell · Mind/Chaos · 3 + [rainbow] · Action
 *   "Banish a friendly unit, then its owner plays it, ignoring its cost. Deal 3 to an enemy unit at a
 *    battlefield. Banish this."
 *
 * Q: Can I Arcane Shift my ONLY unit at a battlefield and replay it to that same battlefield?
 * A: Yes, as long as you control the battlefield. The replayed unit is a pending chain item throughout
 *    the cleanups that follow, so the turn is in a Closed State (309.1) and cleanup step 4 ("lose control
 *    of empty battlefields", 323.6) does not apply; when the pending play is finalized the battlefield is
 *    still yours and is a valid destination (355.2). Attackers cannot do this at the battlefield they are
 *    attacking — they never controlled it.
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ARCANE_SHIFT = "sfd-200-221";

type PickD = Extract<Decision, { kind: "pick" }>;

describe("Ruling ee735b43996dcbd3 — Arcane Shift can replay your only unit back to the battlefield it left", () => {
  test("P1's lone unit at 'home' is banished; while its replay is pending 'home' stays P1's, is offered as a destination, and the unit lands back there", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .battlefield("home", { controller: P1 })
      .battlefield("away", { controller: P2 })
      .unit(P1, "home", { might: 3, name: "Lone Sentinel" }, "solo")
      .unit(P2, "away", { might: 5, name: "Enemy Brute" }, "victim")
      .hand(P1, ARCANE_SHIFT, "shift")
      .build();
    expect(game.p1.units("home")).toEqual(["solo"]);

    await game.p1.cast("shift", { targets: ["solo", "victim"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    const r = await game.settle();

    // Arcane Shift has fully resolved (deal 3, banish self) and the replay is now being finalized by the OWNER (P1).
    expect(r.decision).toMatchObject({ kind: "pick", seat: P1 });
    expect(game.zoneOf("solo")).toBe("banishment");
    expect(game.state("victim").damage).toBe(3);
    expect(game.zoneOf("shift")).toBe("banishment");
    // Closed state: 'home' is empty but P1 has NOT lost control of it (323.6 only applies in an Open State).
    expect(game.cardsAt("home")).toEqual([]);
    expect(game.gameState.battlefields.home?.controller).toBe(P1);
    // …so it is a valid play destination alongside base (355.2.a); P2's battlefield is not.
    const keys = (r.decision as PickD).options.map((o) => o.key).sort();
    expect(keys).toEqual(["base", "battlefield-home"]);

    await game.p1.pick("battlefield-home");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("solo")).toBe("battlefield-home");
    expect(game.p1.units("home")).toEqual(["solo"]);
    expect(game.gameState.battlefields.home?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("attacker contrast: during a combat showdown at P2's battlefield, P1 Arcane Shifts its attacker — that battlefield is NOT a replay destination (P1 never controlled it); only base is", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .battlefield("fort", { controller: P2 })
      .unit(P1, "base", { might: 4, name: "Raider" }, "atk")
      .unit(P2, "fort", { might: 5, name: "Garrison" }, "def")
      .hand(P1, ARCANE_SHIFT, "shift")
      .build();

    await game.p1.move("atk", "fort");
    // Combat showdown at fort; the attacker (P1) has Focus and may play an [Action] spell.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.fort?.controller).toBe(P2);
    expect(game.p1.can("cast", "shift")).toBe(true);

    await game.p1.cast("shift", { targets: ["atk", "def"] });
    // Pass priority by hand (settle() would auto-take a single-option destination pick).
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || d.kind !== "action" || d.context !== "chain" || !d.passKey) {
        break;
      }
      await game.seat(d.seat).pass();
    }
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(game.zoneOf("atk")).toBe("banishment");
    expect(game.state("def").damage).toBe(3);
    // Fort is mid-combat and P2's: control cannot have passed to the attacker (190.4.b) …
    expect(game.gameState.battlefields.fort?.controller).toBe(P2);
    // … so the only valid replay destination is P1's base (355.2.a).
    const keys = (d as PickD).options.map((o) => o.key).sort();
    expect(keys).not.toContain("battlefield-fort");
    expect(keys).toEqual(["base"]);
    await game.p1.pick("base");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("atk")).toBe("base");
    expect(game.p1.units("fort")).toEqual([]);
    expect(game.gameState.battlefields.fort?.controller).toBe(P2);
  });
});
