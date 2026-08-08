/**
 * Ancient Warmonger — sfd-131-221 · Unit · Chaos · 5 energy · 4 Might
 *
 *   [Accelerate] (You may pay [1][chaos] as an additional cost to have me enter ready.)
 *   I have [Assault] equal to the number of enemy units here. (+1 [Might] while I'm an attacker
 *   for each instance of Assault.)
 *
 * Head-judge notes — the tricky spots for this card:
 *  1. The Assault VALUE is a continuously evaluated characteristic (807.1.c / 807.3): it is the live
 *     count of ENEMY units at the Warmonger's battlefield. Alone into 1 / 2 / 3 defenders it swings
 *     for 5 / 6 / 7. Friendly co-attackers never count.
 *  2. Assault only pays out while it holds the Attacker designation (807.1.d): at rest in the base,
 *     or as a DEFENDER with three enemy attackers "here", it is a plain 4.
 *  3. Lethal damage is measured against current Might (465.2.c reminder): alone into three 2-Might
 *     defenders it deals 7 (all three die), is dealt 6 < 7 and SURVIVES to conquer; with a wrong
 *     fixed Assault 1 it would deal 5 and die — exactly-lethal vs one short.
 *  4. The value tracks the board mid-combat: a defender killed during the showdown drops the bonus
 *     by one before combat damage.
 *  5. 807.2 — extra Assault from another source is summed: Vault Breaker (+Assault 2) on a Warmonger
 *     attacking one defender → 4 + 1 + 2 = 7.
 *  6. Accelerate: optional [1][chaos]; the power pip must be chaos (805.1.a.1); paid → enters ready
 *     (805.6), unpaid → exhausted. The static must not leak Assault onto any other unit.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-131-221";
const VAULT_BREAKER = "unl-010-219"; // [Action] Give a unit [Assault 2] and [Ganking] this turn. 1 + [fury]
const PICK_OFF = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  name: "Test Pick Off",
  timing: "action",
};

/** P1's Warmonger in base facing `defenders` enemy units (each `might`) at P2's bf1. */
function facing(defenders: number, might = 2) {
  const b = scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "war");
  for (let i = 1; i <= defenders; i++) {
    b.unit(P2, "bf1", { might, name: `Defender ${i}` }, `d${i}`);
  }
  return b;
}

describe("Ancient Warmonger (sfd-131-221)", () => {
  test("cost: 5 energy, enters the base exhausted without Accelerate; 4 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "war").build();
    await game.p1.play("war");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("war")).toBe("base");
    expect(game.state("war")).toMatchObject({ baseMight: 4, isExhausted: true, might: 4 });
    const poor = await scenario().resources(P1, { energy: 4, power: { chaos: 1 } }).hand(P1, CARD, "war").build();
    expect(poor.p1.can("play", "war")).toBe(false);
  });

  test("Accelerate: paying the extra [1][chaos] (6 energy + 1 chaos total) makes it enter ready (805.6)", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { chaos: 1 } }).hand(P1, CARD, "war").build();
    await game.p1.play("war", { accelerate: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("war")).toBe("base");
    expect(game.state("war").isReady).toBe(true);
  });

  test("Accelerate negative space: only 5 energy + chaos, or 6 energy + a non-chaos power, cannot buy the ready entry (805.1.a.1)", async () => {
    const shortEnergy = await scenario().resources(P1, { energy: 5, power: { chaos: 1 } }).hand(P1, CARD, "war").build();
    const a = await shortEnergy.p1.try((p) => p.play("war", { accelerate: true }));
    expect(a.ok).toBe(false);
    expect(shortEnergy.zoneOf("war")).toBe("hand");
    const wrongDomain = await scenario().resources(P1, { energy: 6, power: { fury: 1 } }).hand(P1, CARD, "war").build();
    const b = await wrongDomain.p1.try((p) => p.play("war", { accelerate: true }));
    expect(b.ok).toBe(false);
    // ...but the plain play is still fine and it comes in exhausted.
    await wrongDomain.p1.play("war");
    await wrongDomain.settle();
    expect(wrongDomain.state("war").isExhausted).toBe(true);
    expect(wrongDomain.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
  });

  test("at rest it is a plain 4-Might unit that carries the Assault keyword; no other unit gains Assault from it", async () => {
    const game = await facing(3).unit(P1, "base", { might: 2, name: "Buddy" }, "buddy").build();
    expect(game.state("war").might).toBe(4);
    expect(game.state("war").keywords).toContain("Assault");
    expect(game.state("war").keywords).toContain("Accelerate");
    for (const other of ["d1", "d2", "d3", "buddy"]) {
      expect(game.state(other).keywords).not.toContain("Assault");
      expect(game.state(other).grantedKeywords).toEqual([]);
    }
  });

  test("attacking a lone defender: Assault 1 → 5 Might during the combat showdown; the 5-Might defender dies with it", async () => {
    const game = await facing(1, 5).build();
    await game.p1.move("war", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.state("war").combatRole).toBe("attacker");
    expect(game.state("war").might).toBe(5);
    expect(game.state("d1").might).toBe(5); // the defender gets nothing from the Warmonger's text
    await game.settle();
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.zoneOf("war")).toBe("trash"); // 5 back onto a 5-Might attacker is lethal
  });

  test("Assault equals the number of enemy units here — alone into two defenders it is a 6-Might attacker (807.1.c)", async () => {
    // Expected: 4 + Assault 2 = 6 while attacking two enemy units. Actual: the static is parsed as a
    // flat `grant-keyword Assault` (value 1), so the Warmonger is always 5 as an attacker.
    const game = await facing(2).build();
    await game.p1.move("war", "bf1");
    expect(game.state("war").combatRole).toBe("attacker");
    expect(game.state("war").might).toBe(6);
  });

  test("alone into three 2-Might defenders it swings for 7, kills all three, survives the 6 back (6 < 7) and conquers", async () => {
    // Expected: Assault 3 → 7 Might: 7 damage covers 2+2+2, and 6 incoming is not lethal on 7.
    // Actual: Assault 1 → 5 Might, so it cannot kill all three and 6 damage kills it.
    const game = await facing(3).build();
    await game.p1.move("war", "bf1");
    expect(game.state("war").might).toBe(7);
    await game.settle();
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.zoneOf("d2")).toBe("trash");
    expect(game.zoneOf("d3")).toBe("trash");
    expect(game.zoneOf("war")).toBe("battlefield-bf1");
    expect(game.state("war").damage).toBe(0); // healed in the combat cleanup (466.1.a.1)
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("only ENEMY units count — a friendly co-attacker adds nothing (two defenders + one buddy → still 6)", async () => {
    // Expected: 4 + 2 enemy units here = 6 (the buddy is friendly). Actual: flat Assault 1 → 5.
    const game = await facing(2).unit(P1, "base", { might: 2, name: "Buddy" }, "buddy").build();
    await game.p1.move(["war", "buddy"], "bf1");
    expect(game.state("war").combatRole).toBe("attacker");
    expect(game.state("buddy").combatRole).toBe("attacker");
    expect(game.state("war").might).toBe(6);
    expect(game.state("buddy").might).toBe(2);
  });

  test("as a DEFENDER the Assault does nothing: three enemy attackers 'here' and it is still a 4-Might unit (807.1.d)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "war")
      .unit(P2, "base", { might: 1, name: "Raider 1" }, "r1")
      .unit(P2, "base", { might: 1, name: "Raider 2" }, "r2")
      .unit(P2, "base", { might: 2, name: "Raider 3" }, "r3")
      .build();
    await game.p2.move(["r1", "r2", "r3"], "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.state("war").combatRole).toBe("defender");
    expect(game.state("war").might).toBe(4);
    await game.settle();
    // Its 4 back is exactly 1+1+2 (all raiders die); their 4 onto a 4-Might defender is exactly
    // lethal — with a (wrong) defender-side Assault 3 it would have lived on 7.
    expect(game.zoneOf("r1")).toBe("trash");
    expect(game.zoneOf("r2")).toBe("trash");
    expect(game.zoneOf("r3")).toBe("trash");
    expect(game.zoneOf("war")).toBe("trash");
  });

  test("the value tracks the board mid-combat — killing one of two defenders during the showdown drops it from 6 to 5", async () => {
    // Expected: 6 with two enemy units here, then 5 once Pick Off kills the 1-Might defender.
    // Actual: 5 throughout (flat Assault 1).
    const game = await facing(2, 1).resources(P1, { energy: 1 }).hand(P1, PICK_OFF, "pick").build();
    await game.p1.move("war", "bf1");
    expect(game.state("war").might).toBe(6);
    await game.p1.cast("pick", { targets: "d1" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.state("war").combatRole).toBe("attacker");
    expect(game.state("war").might).toBe(5);
  });

  test("807.2 stacking (observable today): Vault Breaker's Assault 2 on a Warmonger attacking one defender → 4 + 1 + 2 = 7", async () => {
    const game = await facing(1, 6).resources(P1, { energy: 1, power: { fury: 1 } }).hand(P1, VAULT_BREAKER, "vb").build();
    await game.p1.move("war", "bf1");
    expect(game.state("war").might).toBe(5);
    await game.p1.cast("vb", { targets: "war" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("vb")).toBe("trash");
    expect(game.state("war").might).toBe(7);
    await game.settle();
    expect(game.zoneOf("d1")).toBe("trash"); // 7 ≥ 6
    expect(game.zoneOf("war")).toBe("battlefield-bf1"); // 6 < 7 — survives and takes the field
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("after combat the Attacker designation is gone and so is the bonus: back to 4 Might on the conquered battlefield, and next turn too", async () => {
    const game = await facing(1, 2).build();
    await game.p1.move("war", "bf1");
    expect(game.state("war").might).toBe(5);
    await game.settle();
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.zoneOf("war")).toBe("battlefield-bf1");
    expect(game.state("war").combatRole).toBeNull();
    expect(game.state("war").might).toBe(4);
    await game.advanceTurn();
    expect(game.state("war").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });

  test("parsed abilities match the printed text — Accelerate [1][chaos] plus a SELF static whose Assault value counts enemy units here", async () => {
    // Expected: ability[1] is a self-targeted static Assault whose value is a count of enemy units
    // at this location (some `{ count: … enemy … here }` amount), not a flat grant to "a unit".
    // Actual: `{ effect: { keyword: "Assault", target: { type: "unit" }, type: "grant-keyword" } }`
    // with no value at all.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 5, might: 4 });
    const abilities = (def?.abilities ?? []) as { type: string; keyword?: string; cost?: unknown; effect?: Record<string, unknown> }[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toMatchObject({ cost: { energy: 1, power: ["chaos"] }, keyword: "Accelerate", type: "keyword" });
    expect(abilities[1]?.type).toBe("static");
    const eff = abilities[1]?.effect ?? {};
    expect(eff.keyword).toBe("Assault");
    expect([undefined, "self"]).toContain(eff.target as string | undefined);
    const value = JSON.stringify(eff.value ?? eff.amount ?? null);
    expect(value).toMatch(/enemy/);
    expect(value).toMatch(/here|same|location/);
  });
});
