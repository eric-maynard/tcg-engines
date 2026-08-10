/**
 * Ruling 06ef6f4669b4f8c3 — Siphon Power (OGN-266 → ogn-266-298) · Reaction · 2 + [rainbow]
 *   "Choose a battlefield. Give friendly units there +1 [Might] this turn and enemy units there -1 [Might]
 *    this turn, to a minimum of 1 [Might]."
 *   × Challenge (ogn-128-298) · Action · "Choose a friendly unit and an enemy unit. They deal damage equal to
 *     their Mights to each other."
 *
 * Q: A unit takes damage in combat, is then pumped to a higher Might, then Siphon Power brings it back down.
 *    Does it die when its accumulated damage equals the reduced Might?
 * A: Yes. Damage stays marked through the combat and never changes Might; Might changes never change damage.
 *    Sequence: Sett 4→8; Challenge: takes 6 (8 Might, 6 dmg, alive); pumped to 9; Siphon Power → 8 and the
 *    enemy blocker → 2; combat damage adds 2 → 8 damage on an 8-Might unit → Sett dies.
 * Rules: 142.4 (lethal damage = damage ≥ Might), 323.5 (killed at cleanup), 465 (combat damage), 437 (damage
 *        persists until healed at end of combat / turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SIPHON_POWER = "ogn-266-298";
const CHALLENGE = "ogn-128-298";

/**
 * P1's "Sett": a 4-Might unit already buffed to 8 (+4 modifier). P2 holds bf1 with Big (6) and Small (1).
 * P1: Challenge + a Siphon Power (the "+1 to 9" pump). P2: a Siphon Power (the "back to 8 / blocker to 2").
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { body: 1, rainbow: 1 } })
    .resources(P2, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 4, name: "Sett" }, "sett", { mightModifier: 4 })
    .unit(P2, "bf1", { might: 6, name: "Big" }, "big")
    .unit(P2, "bf1", { might: 1, name: "Small" }, "small")
    .hand(P1, CHALLENGE, "challenge")
    .hand(P1, SIPHON_POWER, "pump")
    .hand(P2, SIPHON_POWER, "siphon");
}

async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context !== "chain" || !d.passKey) {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

/** If `seat` currently holds showdown Focus with nothing to do, pass it. */
async function passFocusIf(game: Game, seat: string): Promise<void> {
  const d = game.decision();
  if (d?.kind === "action" && d.context === "showdown" && d.seat === seat) {
    await game.seat(seat).pass();
  }
}

describe("Ruling 06ef6f4669b4f8c3 — damage persists through Might changes; Sett dies when 8 damage meets 8 Might", () => {
  test("full sequence: 8-Might Sett takes 6 (Challenge) → 9 (pump) → 8 (Siphon Power, blocker to 2) → +2 combat damage = 8 ⇒ dies", async () => {
    const game = await board().build();
    expect(game.state("sett").might).toBe(8); // "buffed from 4 to 8"
    await game.p1.move("sett", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // attacker has Focus
    expect(game.state("sett").combatRole).toBe("attacker");

    // Challenge: Sett (8) and Big (6) deal their Might to each other.
    await game.p1.cast("challenge", { targets: ["sett", "big"] });
    await resolveChain(game);
    expect(game.zoneOf("big")).toBe("trash"); // 8 ≥ 6
    expect(game.state("sett")).toMatchObject({ damage: 6, might: 8, zone: "battlefield-bf1" }); // 6 < 8: alive, damage marked

    // Pump Sett to 9 (P1's own Siphon Power on bf1: friendly +1; Small is floored at 1).
    await passFocusIf(game, P2);
    await game.p1.cast("pump", { targets: "bf1" });
    await resolveChain(game);
    expect(game.state("sett")).toMatchObject({ damage: 6, might: 9 }); // Might changed, damage did not
    expect(game.state("small").might).toBe(1);

    // P2's Siphon Power: Small +1 → 2, Sett -1 → back to 8. Still 6 damage < 8: alive.
    await passFocusIf(game, P1);
    await game.p2.cast("siphon", { targets: "bf1" });
    await resolveChain(game);
    expect(game.state("small").might).toBe(2);
    expect(game.state("sett")).toMatchObject({ damage: 6, might: 8, zone: "battlefield-bf1" });

    // Everyone passes Focus → combat damage: Small deals 2 to Sett → 8 damage on an 8-Might unit → lethal.
    await game.settle();
    expect(game.zoneOf("sett")).toBe("trash");
    expect(game.zoneOf("small")).toBe("trash"); // took 8
    // No attacker survived ⇒ nothing conquered, no point.
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — without P2's Siphon Power Sett stays 9: 6 + 1 combat damage = 7 < 9, he survives, Small dies, P1 conquers", async () => {
    const game = await board().build();
    await game.p1.move("sett", "bf1");
    await game.p1.cast("challenge", { targets: ["sett", "big"] });
    await resolveChain(game);
    await passFocusIf(game, P2);
    await game.p1.cast("pump", { targets: "bf1" });
    await resolveChain(game);
    expect(game.state("sett")).toMatchObject({ damage: 6, might: 9 });
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.zoneOf("sett")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("intermediate fact — Might changes never alter marked damage: after Challenge (6 dmg) the -1/+1 swings leave damage at exactly 6 each time", async () => {
    const game = await board().build();
    await game.p1.move("sett", "bf1");
    await game.p1.cast("challenge", { targets: ["sett", "big"] });
    await resolveChain(game);
    const damages: number[] = [game.state("sett").damage];
    await passFocusIf(game, P2);
    await game.p1.cast("pump", { targets: "bf1" });
    await resolveChain(game);
    damages.push(game.state("sett").damage);
    await passFocusIf(game, P1);
    await game.p2.cast("siphon", { targets: "bf1" });
    await resolveChain(game);
    damages.push(game.state("sett").damage);
    expect(damages).toEqual([6, 6, 6]);
  });
});
