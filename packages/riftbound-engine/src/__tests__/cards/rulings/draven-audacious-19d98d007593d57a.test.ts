/**
 * Ruling 19d98d007593d57a — Draven, Audacious (SFD-148 → sfd-148-221) · 6 Might · Champion
 *     "[Deflect] The first time I win a combat each turn, you score 1 point. When I die in combat, choose an
 *      opponent. They score 1 point."
 *   × Flash (OGS-011 → ogs-011-024) · Spell · [Reaction] · [2] · "Move up to 2 friendly units to base."
 *
 * Q: Draven is pushed back to base during the combat but my side still wins — does he score his point?
 * A: No. Presence is required. Moving Draven away mid-showdown strips his Attacker designation, so he is no
 *    longer participating when the combat result is determined at Combat Cleanup — his "win a combat" ability
 *    never triggers, even though the rest of his side wins and conquers the battlefield.
 * Rules: 464.2.c / 464.3 (designations are held by units present at the battlefield; leaving loses them),
 *        466.5 (combat resolution / conquer), 383.2 (a trigger needs its event to actually occur), 445 (moves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAVEN_AUDACIOUS = "sfd-148-221";
const FLASH = "ogs-011-024";

/** P1's turn with exactly [2] for Flash. P2 holds bf1 with a Guard (2). P1: Draven (6) + Bruiser (5) in base, Flash in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "base", DRAVEN_AUDACIOUS, "draven")
    .unit(P1, "base", { might: 5, name: "Bruiser" }, "bruiser")
    .hand(P1, FLASH, "flash");
}

/** Draven + Bruiser attack bf1 together; stops in the open showdown with P1 holding Focus. */
async function bothAttack(): Promise<Game> {
  const game = await board().build();
  await game.p1.move(["draven", "bruiser"], "bf1");
  expect(game.state("draven")).toMatchObject({ combatRole: "attacker", location: "bf1" });
  expect(game.state("bruiser").combatRole).toBe("attacker");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 19d98d007593d57a — Draven flashed home mid-combat is not in the combat, so he wins nothing", () => {
  test("control: Draven stays and the attack wins — his 'first time I win a combat' triggers and P1 scores it ON TOP of the conquer point", async () => {
    const game = await bothAttack();
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.locationOf("draven")).toBe("bf1");
    expect(game.p1.points()).toBe(2); // 1 conquer + 1 Draven
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("Flash inside the showdown moves Draven home and he LOSES the Attacker designation at once (Bruiser keeps his)", async () => {
    const game = await bothAttack();
    await game.p1.cast("flash", { targets: ["draven"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "flash", controller: P1, targets: ["draven"] })]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Flash resolves
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.state("draven")).toMatchObject({ combatRole: null, location: "base" });
    expect(game.state("bruiser")).toMatchObject({ combatRole: "attacker", location: "bf1" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" }); // combat still open
  });

  test("the combat is then won by the Bruiser alone: the Guard dies, P1 conquers bf1 — but NO Draven trigger ever appears and P1 scores only the conquer point", async () => {
    const game = await bothAttack();
    await game.p1.cast("flash", { targets: ["draven"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.state("bruiser")).toMatchObject({ damage: 0, location: "bf1" }); // healed at combat cleanup
    expect(game.zoneOf("draven")).toBe("base");
    expect(game.p1.points()).toBe(1); // conquer only — Draven scored nothing
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("the same when Draven is the only unit flashed out of a solo attack: nobody remains to win, so no conquer and no Draven point either", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P1, "base", DRAVEN_AUDACIOUS, "draven")
      .hand(P1, FLASH, "flash")
      .build();
    await game.p1.move("draven", "bf1");
    await game.p1.cast("flash", { targets: ["draven"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("draven")).toMatchObject({ combatRole: null, location: "base" });
    await game.settle();
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
