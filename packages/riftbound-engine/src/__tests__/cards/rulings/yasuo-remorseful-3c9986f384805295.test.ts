/**
 * Ruling 3c9986f384805295 — Yasuo, Remorseful (OGN-076 → ogn-076-298) · Unit · Calm · [6][calm][calm] · 6 Might
 *   "When I attack, deal damage equal to my Might to an enemy unit here."
 *
 * Q: If the defenders include a unit with [Tank], can Yasuo's attack trigger bypass it?
 * A: Yes. [Tank] is a passive that only constrains how COMBAT damage is assigned in the Combat Damage
 *    Step ("must be assigned lethal damage before any other unit with the same controller"). Yasuo's
 *    trigger deals ability damage outside that process, so it may freely choose any enemy unit here.
 * Rules: 741.1.b ([Tank] restricts combat-damage assignment only), 443.1 / 465.2.c (the Combat Damage
 *        Step), 383 (a triggered ability is not combat damage).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO_REMORSEFUL = "ogn-076-298";

/** P1's turn. Yasuo (6) ready in P1's base. P2 holds bf1 with a [Tank] Bodyguard (8) and a squishy Sniper (3). */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { keywords: ["Tank"], might: 8, name: "Bodyguard" }, "tank")
    .unit(P2, "bf1", { might: 3, name: "Sniper" }, "sniper")
    .unit(P1, "base", YASUO_REMORSEFUL, "yasuo");
}

const offered = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []);

/** Yasuo attacks bf1; stops on the trigger's target prompt. */
async function yasuoAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("yasuo", "bf1");
  expect(game.state("yasuo").combatRole).toBe("attacker");
  expect(game.state("tank").keywords).toContain("Tank");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  return game;
}

describe("Ruling 3c9986f384805295 — [Tank] does not shield its allies from Yasuo, Remorseful's attack trigger", () => {
  test("the trigger's target menu offers BOTH enemy units here — the Tank does not have to be chosen first", async () => {
    const game = await yasuoAttacks();
    expect(offered(game.decision())).toEqual(["sniper", "tank"]);
  });

  test("ruling: Yasuo may name the non-Tank Sniper; it takes 6 (his Might) and dies while the Tank is untouched", async () => {
    const game = await yasuoAttacks();
    await game.p1.pick("sniper");
    for (let i = 0; i < 6 && game.chain().length > 0 && game.decision()?.kind === "action"; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("sniper")).toBe("trash");
    expect(game.state("tank")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
  });

  test("the Tank restriction still governs the COMBAT that follows: Yasuo's 6 cannot reach past the 8-Might Tank, so the attack fails", async () => {
    const game = await yasuoAttacks();
    await game.p1.pick("sniper");
    await game.settle();
    expect(game.zoneOf("sniper")).toBe("trash"); // killed by the trigger, not by combat
    expect(game.zoneOf("tank")).toBe("battlefield-bf1"); // 6 < 8: the Tank soaked all of the combat damage and lived
    expect(game.zoneOf("yasuo")).toBe("trash"); // the Tank's 8 is lethal on a 6-Might Yasuo
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("Yasuo may of course also point the trigger AT the Tank if he wants to", async () => {
    const game = await yasuoAttacks();
    await game.p1.pick("tank");
    for (let i = 0; i < 6 && game.chain().length > 0 && game.decision()?.kind === "action"; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("tank").damage).toBe(6);
    expect(game.state("sniper").damage).toBe(0);
  });
});
