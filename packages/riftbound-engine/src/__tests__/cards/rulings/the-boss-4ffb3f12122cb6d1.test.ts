/**
 * Ruling 4ffb3f12122cb6d1 — The Boss (OGN-269 → ogn-269-298) · Legend · Body/Order · Sett
 *   "If a buffed unit you control would die, you may pay [rainbow], exhaust me, and spend its buff to heal it,
 *    exhaust it, and recall it instead. (Send it to base. This isn't a move.)
 *    When you conquer, ready me."
 *
 * Q: Sett's ability recalls a buffed unit that would die in a showdown — does the enemy unit still take the
 *    showdown damage?
 * A: Yes. Combat damage is dealt to both sides simultaneously; Sett's replacement only swaps YOUR unit's
 *    removal for a recall. The enemy unit already has its lethal damage and dies in that same Cleanup.
 * Rules: 465.2.c.1.a (all combat damage is dealt simultaneously), 371/372 (a die-replacement only replaces
 *        that one removal), 319/323 (units at lethal die in the Cleanup), 745.2 (spending a buff).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THE_BOSS = "ogn-269-298";
const unit = (might: number, name: string) => ({ cardType: "unit", energyCost: 1, might, name }) as const;

/** P1's Sett legend; a BUFFED 3-Might unit (⇒ 4 Might) attacks P2's 4-Might Enemy: mutual lethal. */
async function mutualLethalWithSett(power: Record<string, number>): Promise<Game> {
  const game = await scenario()
    .resources(P1, { power })
    .legend(P1, THE_BOSS, "sett")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", unit(4, "Enemy"), "enemy")
    .unit(P1, "base", unit(3, "Bruiser"), "bruiser", { buffed: true })
    .build();
  expect(game.state("bruiser")).toMatchObject({ isBuffed: true, might: 4 });
  await game.p1.move("bruiser", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  return game;
}

describe("Ruling 4ffb3f12122cb6d1 — Sett's recall saves your unit; the enemy still dies to the damage already dealt", () => {
  test("accepting the replacement recalls the Bruiser to base — and the Enemy is in the trash all the same", async () => {
    const game = await mutualLethalWithSett({ rainbow: 1 });

    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();

    expect(game.locationOf("bruiser")).toBe("base"); // recalled instead of dying
    expect(game.state("bruiser")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true }); // healed, buff spent, exhausted
    expect(game.zoneOf("enemy")).toBe("trash"); // the damage was already dealt, simultaneously
    expect(game.state("sett").isExhausted).toBe(true);
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("declining it: the Bruiser dies too, and the Enemy dies either way", async () => {
    const game = await mutualLethalWithSett({ rainbow: 1 });

    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();

    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.zoneOf("enemy")).toBe("trash");
    expect(game.state("sett").isExhausted).toBe(false); // nothing was paid
  });

  test("with no [rainbow] in the pool the replacement cannot be taken and both units die", async () => {
    const game = await mutualLethalWithSett({});

    await game.settle();

    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.zoneOf("enemy")).toBe("trash");
  });
});
