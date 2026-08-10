/**
 * Ruling 7f4a8bd9beab72e2 — Trifarian War Camp (OGN-294 → ogn-294-298) · Battlefield "Units here have +1 [Might]."
 *   × The Boss (OGN-269 → ogn-269-298, Sett legend) "If a buffed unit you control would die, you may pay [rainbow],
 *     exhaust me, and spend its buff to heal it, exhaust it, and recall it instead."
 *
 * Q: Does the War Camp's +1 Might count as a "buff" so Sett's legend can save a unit there?
 * A: No. A Buff is a specific game object (the buff counter); +1 Might from the War Camp is not a Buff. The Boss
 *    needs a genuinely buffed unit (and spends that buff), so an unbuffed unit at the War Camp just dies.
 * Rules: 702 (Buff — the +1 Might counter; "buffed" = has a Buff), 140 (Might modifiers), 369–373 (replacement).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WAR_CAMP = "ogn-294-298";
const THE_BOSS = "ogn-269-298";
/** Inline [Action] removal: "Kill a unit." */
const EXECUTE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Execute",
  timing: "action",
} as const;

/**
 * P2's turn. P1 (The Boss, ready, 1 body for the [rainbow]) controls the live War Camp with two printed-2 units:
 * "plain" (no buff → reads 3 here) and "champ" (buffed → reads 4 here). P2 holds two Executes with [2].
 */
function board() {
  return scenario()
    .active(P2)
    .legend(P1, THE_BOSS, "boss")
    .resources(P1, { power: { body: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1, def: WAR_CAMP, inert: false })
    .unit(P1, "bf1", { might: 2, name: "Plain Brawler" }, "plain")
    .unit(P1, "bf1", { might: 2, name: "Buffed Brawler" }, "champ", { buffed: true })
    .hand(P2, EXECUTE, "exe1")
    .hand(P2, EXECUTE, "exe2");
}

describe("Ruling 7f4a8bd9beab72e2 — the War Camp's +1 Might is not a Buff; The Boss can't save an unbuffed unit there", () => {
  test("premise: at the War Camp the unbuffed unit reads 2+1 = 3 but is NOT buffed; the buffed one reads 2+1+1 = 4 and IS buffed", async () => {
    const game = await board().build();
    expect(game.state("bf1").name).toBe("Trifarian War Camp");
    expect(game.state("plain")).toMatchObject({ isBuffed: false, might: 3 });
    expect(game.state("champ")).toMatchObject({ isBuffed: true, might: 4 });
  });

  test("killing the UNBUFFED unit at the War Camp: The Boss is never asked (no 'you may pay…' prompt for P1) — the unit simply dies; Boss stays ready, the body power unspent", async () => {
    const game = await board().build();
    await game.p2.cast("exe1", { targets: "plain" });
    const r = await game.settle();
    expect(r.reason).toBe("open"); // straight back to P2's main phase — no yes/no was raised on the way
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.zoneOf("plain")).toBe("trash");
    expect(game.state("boss").isReady).toBe(true);
    expect(game.p1.power("body")).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — killing the BUFFED unit: The Boss's replacement IS offered to P1; accepting pays [rainbow], exhausts the Boss, spends the buff and recalls the unit to base exhausted instead of dying", async () => {
    const game = await board().build();
    await game.p2.cast("exe2", { targets: "champ" });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("champ")).toBe("base");
    expect(game.state("champ")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, might: 2 });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.power("body")).toBe(0);
    expect(game.zoneOf("plain")).toBe("battlefield-bf1");
  });
});
