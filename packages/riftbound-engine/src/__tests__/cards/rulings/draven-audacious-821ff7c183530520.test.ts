/**
 * Ruling 821ff7c183530520 — Draven, Audacious (SFD-148 → sfd-148-221) · Unit · Chaos · [6][chaos] · 6 Might
 *     "[Deflect] · The first time I win a combat each turn, you score 1 point. When I die in combat, choose an
 *      opponent. They score 1 point."
 *   × Fight or Flight (ogn-168-298) · [Action] · [2] · "Move a unit from a battlefield to its base."
 *
 * Q: Does Draven have to still be at the battlefield when combat concludes for "when I win a combat" to trigger?
 * A: Yes. Leaving the battlefield strips his Attacker/Defender designation, so he is not participating when the result
 *    is determined — his ability does not trigger even though his side wins the combat and conquers.
 * Rules: 464.2.c / 464.3 (designations belong to units present there; leaving loses them), 466.5 (combat result),
 *        383.2 (a trigger needs its event to occur).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAVEN_AUDACIOUS = "sfd-148-221";
const FIGHT_OR_FLIGHT = "ogn-168-298";

/** P1's turn with [2] for Fight or Flight. P2 holds bf1 with a 2-Might Guard. P1: Draven (6) + Bruiser (5) in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "base", DRAVEN_AUDACIOUS, "draven")
    .unit(P1, "base", { might: 5, name: "Bruiser" }, "bruiser")
    .hand(P1, FIGHT_OR_FLIGHT, "fof");
}

/** Draven and the Bruiser attack bf1 together; stops in the open showdown with P1 holding Focus. */
async function bothAttack(): Promise<Game> {
  const game = await board().build();
  await game.p1.move(["draven", "bruiser"], "bf1");
  expect(game.state("draven")).toMatchObject({ combatRole: "attacker", location: "bf1" });
  expect(game.state("bruiser").combatRole).toBe("attacker");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 821ff7c183530520 — Draven must still hold his designation when the combat concludes", () => {
  test("control — he stays for the whole combat and his side wins: P1 scores the conquer point AND Draven's point", async () => {
    const game = await bothAttack();
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.locationOf("draven")).toBe("bf1");
    expect(game.p1.points()).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("Fight or Flight sends Draven home mid-showdown: he loses the Attacker designation at once while the Bruiser keeps his, and the showdown continues", async () => {
    const game = await bothAttack();
    await game.p1.cast("fof", { targets: "draven" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("draven")).toMatchObject({ combatRole: null, location: "base" });
    expect(game.state("bruiser")).toMatchObject({ combatRole: "attacker", location: "bf1" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("ruling 821ff7c183530520 — the Bruiser then wins the combat alone: bf1 is conquered, but NO Draven trigger appears and P1 scores only the conquer point", async () => {
    const game = await bothAttack();
    await game.p1.cast("fof", { targets: "draven" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.zoneOf("draven")).toBe("base");
    expect(game.p1.points()).toBe(1); // conquer only
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("if DRAVEN is the one who left a solo attack, nobody remains to win: no conquer, no point, and bf1 stays P2's", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P1, "base", DRAVEN_AUDACIOUS, "draven")
      .hand(P1, FIGHT_OR_FLIGHT, "fof")
      .build();
    await game.p1.move("draven", "bf1");
    await game.p1.cast("fof", { targets: "draven" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("draven").combatRole).toBeNull();
    await game.settle();
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
