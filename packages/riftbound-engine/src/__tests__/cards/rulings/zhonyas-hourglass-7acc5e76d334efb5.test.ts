/**
 * Ruling 7acc5e76d334efb5 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2]
 *   "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Lee Sin, Ascetic (ogn-078-298, 5 Might, "[Shield] … [Exhaust]: Buff me. I can have any number of buffs.")
 *   × Yasuo, Remorseful (ogn-076-298, 6 Might, "When I attack, deal damage equal to my Might to an enemy unit here.")
 *   × Last Breath (ogn-260-298, "[Action] Ready a friendly unit. It deals damage equal to its Might to an enemy unit at a battlefield.")
 *
 * Q: Lee Sin takes 8 from Yasuo's signature spell, then 8 more from Yasuo's "When I attack" and would die; Zhonya's moves him
 *    to base. Does he (1) lose the damage already on him, and (2) lose his buffs?
 * A: He keeps his buffs — Zhonya's is a replacement effect, the unit never died. The damage IS removed: Zhonya's heals the
 *    unit as part of its effect (damage otherwise only clears at end of combat / end of turn).
 * Rules: 366–373 (replacement effects: the replaced event never happens), 702 (buffs stay on an object that stays in play),
 *        427 (heal removes damage).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const LEE_SIN = "ogn-078-298";
const YASUO = "ogn-076-298";
const LAST_BREATH = "ogn-260-298";

/**
 * P2's turn. P1 holds bf1 with Lee Sin, Ascetic carrying FIVE buffs (5 + 5 = 10 Might) and has Zhonya's face up in base.
 * P2: an exhausted Yasuo, Remorseful at 8 Might (+2 this turn) in base, Last Breath in hand with exactly [3] + 2 power.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { calm: 1, chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", LEE_SIN, "leesin", { buffed: true, extraBuffs: 4 })
    .gear(P1, ZHONYAS, "zhonyas")
    .unit(P2, "base", YASUO, "yasuo", { exhausted: true, mightModifier: 2 })
    .hand(P2, LAST_BREATH, "lastbreath");
}

/** Last Breath: ready Yasuo, he deals 8 to Lee Sin (survives, 8 damage). Then Yasuo attacks bf1 and his trigger deals 8 more. */
async function spellThenAttack(game: Game): Promise<void> {
  expect(game.state("leesin")).toMatchObject({ isBuffed: true, might: 10 });
  expect(game.state("yasuo").might).toBe(8);
  await game.p2.cast("lastbreath", { targets: ["yasuo", "leesin"] });
  await game.settle();
  expect(game.state("leesin")).toMatchObject({ damage: 8, location: "bf1" }); // 8 < 10: alive, damage stays on him
  expect(game.state("yasuo").isReady).toBe(true);
  await game.p2.move("yasuo", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P2, triggered: true })]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // "When I attack" resolves: 8 more → 16 ≥ 11 (Shield) → would die → Zhonya's
}

describe("Ruling 7acc5e76d334efb5 — a unit saved by Zhonya's keeps its buffs but loses its damage", () => {
  test("the spell damage alone does not clear: after Last Breath Lee Sin sits at bf1 with 8 damage and all five buffs", async () => {
    const game = await board().build();
    await game.p2.cast("lastbreath", { targets: ["yasuo", "leesin"] });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0, chaos: 0 } });
    await game.settle();
    expect(game.state("leesin")).toMatchObject({ damage: 8, isBuffed: true, location: "bf1", might: 10 });
    expect(game.zoneOf("zhonyas")).toBe("base"); // nothing died, Zhonya's untouched
  });

  test("Yasuo's attack trigger would kill him: Zhonya's is killed instead and Lee Sin is recalled to base exhausted — (1) damage healed to 0, (2) all buffs kept (still 10 Might, 5 counters)", async () => {
    const game = await board().build();
    await spellThenAttack(game);
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("leesin")).toBe("base"); // never went to the trash
    expect(game.p1.trash()).not.toContain("leesin");
    expect(game.state("leesin")).toMatchObject({ damage: 0, isBuffed: true, isExhausted: true, might: 10 });
    expect(game.state("leesin").meta.extraBuffs).toBe(4); // 1 + 4 = the same five buffs
  });

  test("aftermath: Yasuo is alone at bf1 and conquers it; Lee Sin stays safe in base", async () => {
    const game = await board().build();
    await spellThenAttack(game);
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.locationOf("yasuo")).toBe("bf1");
    expect(game.locationOf("leesin")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
