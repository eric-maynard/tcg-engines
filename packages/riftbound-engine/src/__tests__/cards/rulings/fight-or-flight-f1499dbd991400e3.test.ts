/**
 * Ruling f1499dbd991400e3 — Fight or Flight (OGN-168 → ogn-168-298) · Chaos [Hidden][Action] spell · [2]
 *   "Move a unit from a battlefield to its base."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Chaos [Action] · [2][chaos] — "Move a friendly unit and ready it."
 *
 * Q: I contest an EMPTY battlefield with a unit (non-combat showdown). My opponent bounces my unit with Fight or
 *    Flight, then Rides the Wind their own unit onto that battlefield. Does the showdown become a COMBAT showdown
 *    (attacker/defender designations, Shield/Assault live)?
 * A: No. A showdown never changes type. The non-combat showdown plays out; when it ends only P2's unit is there,
 *    so P2 conquers — no combat, no attacker/defender designations at any point.
 * Rules: 344 (non-combat showdown), 345–348 (Focus / all pass ⇒ showdown ends; sole occupant conquers),
 *        464 (a combat is only STAGED by opposing units present when a showdown closes / a Cleanup runs).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn. bf1 uncontrolled and empty. P1 Scout (3, Assault-less) in base; P2 Rider (3, [Shield]) in base with FoF + RtW, [4] + 1 chaos. */
function board() {
  return scenario()
    .resources(P2, { energy: 4, power: { chaos: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: 3, name: "Scout", keywords: ["Assault"] }, "scout")
    .unit(P2, "base", { might: 3, name: "Rider", keywords: ["Shield"] }, "rider")
    .hand(P2, FIGHT_OR_FLIGHT, "fof")
    .hand(P2, RIDE_THE_WIND, "ride");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1 walks Scout onto empty bf1 → non-combat showdown, P1 has Focus; P1 passes Focus to P2. */
async function contestEmpty(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("scout", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: false });
  expect(game.state("scout").combatRole).toBeNull();
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  return game;
}

describe("Ruling f1499dbd991400e3 — a non-combat showdown never turns into a combat showdown", () => {
  test("premise: contesting an empty battlefield opens a NON-combat showdown — no attacker/defender designations", async () => {
    const game = await contestEmpty();
    expect(showdown(game)?.isCombatShowdown).toBe(false);
    expect(game.state("scout").combatRole).toBeNull();
    expect(game.state("scout").might).toBe(3); // Assault not live (not an attacker)
  });

  test("P2 (holding Focus) may cast the ACTION Fight or Flight on Scout; it resolves and Scout is back in P1's base", async () => {
    const game = await contestEmpty();
    expect(game.p2.can("cast", "fof")).toBe(true);
    await game.p2.cast("fof", { targets: "scout" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["fof"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("scout")).toBe("base");
    expect(game.state("scout").combatRole).toBeNull();
    // The showdown does NOT end just because P1 has no unit there any more: it is still the same NON-combat
    // showdown, and (347.1.b) Focus passed on to P1 when the chain closed.
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", focusPlayer: P1, isCombatShowdown: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("ruling: P2 then Rides the Wind Rider onto bf1; passing Focus around ends the NON-combat showdown with only Rider there → P2 conquers bf1, no combat ever staged, no designations, Shield/Assault never live", async () => {
    const game = await contestEmpty();
    await game.p2.cast("fof", { targets: "scout" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("scout")).toBe("base");
    // 347.1.b: Focus passed to P1 when that chain closed; P1 passes it back and P2 — still inside the same
    // non-combat showdown — may cast the ACTION Ride the Wind.
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "ride")).toBe(true);
    await game.p2.cast("ride", { targets: "rider" });
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("battlefield-bf1");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["ride"]);
    // Drain: Ride resolves, players pass focus, showdown closes. Track that no combat showdown / role ever appears.
    let sawCombat = false;
    for (let i = 0; i < 12; i++) {
      const sd = showdown(game);
      if (sd?.active && sd.isCombatShowdown) {
        sawCombat = true;
      }
      if (game.state("rider").combatRole !== null || game.state("scout").combatRole !== null) {
        sawCombat = true;
      }
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      await game.seat(d.seat).pass();
    }
    expect(sawCombat).toBe(false);
    expect(game.zoneOf("rider")).toBe("battlefield-bf1");
    expect(game.state("rider")).toMatchObject({ isReady: true, might: 3, damage: 0 }); // Shield never applied / no damage
    expect(game.state("scout")).toMatchObject({ zone: "base", damage: 0 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast (nuance): without Fight or Flight, Rider joining Scout at bf1 means opposing units are present when the non-combat showdown closes → a COMBAT is then staged with P1 (who applied Contested first) as attacker", async () => {
    const game = await contestEmpty();
    await game.p2.cast("ride", { targets: "rider" });
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("battlefield-bf1");
    }
    await game.p2.passPriority();
    await game.p1.passPriority(); // Ride resolves: Rider at bf1
    expect(game.zoneOf("rider")).toBe("battlefield-bf1");
    // Pass focus until a combat showdown is live (or main phase).
    for (let i = 0; i < 8; i++) {
      const sd = showdown(game);
      if (sd?.active && sd.isCombatShowdown) {
        break;
      }
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      await game.seat(d.seat).pass();
    }
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("rider").combatRole).toBe("defender");
    expect(game.state("scout").might).toBe(4); // Assault live now
    expect(game.state("rider").might).toBe(4); // Shield live now
  });
});
