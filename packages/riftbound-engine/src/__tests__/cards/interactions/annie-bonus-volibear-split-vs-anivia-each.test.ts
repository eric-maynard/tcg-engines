/**
 * Interaction: Annie, Fiery (ogs-001-024) · Champion Unit · Fury · 5 · 4 Might
 *     "Your spells and abilities deal 1 Bonus Damage."
 *   × Volibear, Furious (ogn-041-298) · Champion Unit · Fury · 10 · 9 Might
 *     "[Deflect 2] When I attack, deal 5 damage split among any number of enemy units here."
 *   × Anivia, Primal (ogn-148-298) · Champion Unit · Body · 7 · 8 Might
 *     "When I attack, deal 3 to all enemy units here."
 *   vs P2's battlefield: Mystic Poro (2), Mystic Poro (2), Vanguard Sergeant (4).
 *
 * Q: Case A — Volibear attacks with Annie in P1's base. Is Annie's bonus +1 to the split POOL
 *    (6 total, up to 6 targets) or +1 per chosen target (5+3 = 8)? Can P1 go 2/2/2? Does
 *    Volibear's 9 combat damage afterwards also get +1? Case B — Anivia attacks instead: does each
 *    of the three enemy units take 4?
 *
 * Rules: 715 / 715.3 (split: Bonus Damage is added once to the amount being split — CR example is
 * literally Volibear + Annie → "6 damage split among up to 6 units"); 355.14.c / 355.14.f (target
 * count capped by the amount, each target ≥ 1); 715.2 (multiple targets: each instance +1
 * separately → Anivia deals 4/4/4); 714; 417.5 / 417.6.c (combat damage is dealt by units, not by a
 * spell or ability → no bonus on Volibear's 9); 465.1 (no defenders left → no combat damage step).
 */
import { describe, expect, test } from "bun:test";
import type { DistributeDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ANNIE = "ogs-001-024";
const VOLIBEAR = "ogn-041-298";
const ANIVIA = "ogn-148-298";
const MYSTIC_PORO = "ogn-171-298"; // 2 might
const VANGUARD_SERGEANT = "ogn-219-298"; // 4 might

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P2 holds bf1 with Poro, Poro, Sergeant. P1 has Volibear + Anivia ready in base, Annie optional. */
function board(opts: { annie: boolean } = { annie: true }) {
  const s = scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", MYSTIC_PORO, "poroA")
    .unit(P2, "bf1", MYSTIC_PORO, "poroB")
    .unit(P2, "bf1", VANGUARD_SERGEANT, "sarge")
    .unit(P1, "base", VOLIBEAR, "voli")
    .unit(P1, "base", ANIVIA, "anivia");
  return opts.annie ? s.unit(P1, "base", ANNIE, "annie") : s;
}

/** Attack bf1 with Volibear and pass priority round so his attack trigger resolves into its split prompt. */
async function volibearAttacks(game: Game): Promise<DistributeDecision> {
  await game.p1.move("voli", "bf1");
  expect(game.chain()).toMatchObject([{ cardId: "voli", controller: P1, triggered: true, type: "ability" }]);
  await game.settle(); // both pass → the trigger resolves and asks for the split
  const d = game.decision();
  expect(d).toMatchObject({ kind: "distribute", seat: P1, source: { cardId: "voli" } });
  return d as DistributeDecision;
}

describe("Annie, Fiery bonus damage × Volibear split vs Anivia 'each'", () => {
  test("Case A: Volibear's attack trigger splits among ENEMY units HERE only — the two Poros and the Sergeant (not Annie/Anivia in base, not Volibear)", async () => {
    const game = await board().build();
    expect(game.state("annie").keywords).toContain("BonusDamage");
    const d = await volibearAttacks(game);
    expect(d.buckets.map((b) => b.card).sort()).toEqual(["poroA", "poroB", "sarge"]);
  });

  // Expected (715.3, the CR's own Volibear + Annie example): the amount being split becomes 5+1 = 6,
  // so the prompt distributes 6 and up to 6 units could be chosen. Actual: the engine still splits 5
  // (Annie's bonus is not applied to the pool at all — it is instead added per target, see below).
  test("Case A — with Annie the split POOL is 6, not 5 (715.3)", async () => {
    const game = await board().build();
    const d = await volibearAttacks(game);
    expect(d.total).toBe(6);
    expect(Math.max(...d.buckets.map((b) => b.max))).toBe(6);
  });

  // Expected: 2/2/2 is a legal division of the 6 (each target ≥ 1, 355.14.f) → both Poros die and the
  // Sergeant is left with exactly 2 damage (NOT 3 — the bonus is in the pool, not per target; total 6,
  // never 8). Actual: 2/2/2 is rejected because the engine's pool is 5.
  test("Case A — P1 may go 2/2/2: both Poros die, Sergeant has exactly 2 damage (715.3, 355.14.f)", async () => {
    const game = await board().build();
    await volibearAttacks(game);
    await game.p1.distribute({ poroA: 2, poroB: 2, sarge: 2 });
    expect(game.zoneOf("poroA")).toBe("trash");
    expect(game.zoneOf("poroB")).toBe("trash");
    expect(game.zoneOf("sarge")).toBe("battlefield-bf1");
    expect(game.state("sarge").damage).toBe(2);
  });

  // Expected (715 head + 715.3): Bonus Damage applies ONCE to the one Deal action's total, so a target
  // that is assigned 1 of the split takes exactly 1. Actual: the engine adds Annie's +1 to every chosen
  // target separately (1 assigned → 2 marked), i.e. the "5 + 1 per target" reading the CR rejects.
  test("Case A — the bonus is not added per chosen target: assigning 1 of the split to the Sergeant marks exactly 1 damage on it (715, 715.3)", async () => {
    const game = await board().build();
    const d = await volibearAttacks(game);
    await game.p1.distribute({ poroA: d.total - 1, sarge: 1 });
    expect(game.zoneOf("poroA")).toBe("trash");
    expect(game.zoneOf("poroB")).toBe("battlefield-bf1");
    expect(game.state("poroB").damage).toBe(0); // not chosen → untouched
    expect(game.state("sarge").damage).toBe(1);
  });

  test("Case A contrast: WITHOUT Annie the pool is the printed 5; 2/2/1 kills both Poros and leaves 1 on the Sergeant; 2/2/2 is not a legal split of 5 (355.14)", async () => {
    const game = await board({ annie: false }).build();
    const d = await volibearAttacks(game);
    expect(d.total).toBe(5);
    const tooMuch = await game.p1.try((p) => p.distribute({ poroA: 2, poroB: 2, sarge: 2 }));
    expect(tooMuch.ok).toBe(false);
    await game.p1.distribute({ poroA: 2, poroB: 2, sarge: 1 });
    expect(game.zoneOf("poroA")).toBe("trash");
    expect(game.zoneOf("poroB")).toBe("trash");
    expect(game.state("sarge").damage).toBe(1);
    // Combat then finishes it: Volibear 9 vs Sergeant 4 → Sergeant dies, Volibear conquers.
    await game.settle();
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.zoneOf("voli")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("Case A: on the question's board the whole sequence ends with all three defenders dead and Volibear conquering bf1 (trigger, then 9 combat damage onto whatever is left)", async () => {
    const game = await board().build();
    const d = await volibearAttacks(game);
    await game.p1.distribute({ sarge: d.total }); // dump the whole split on the Sergeant (5+ ≥ 4 → dead)
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.zoneOf("poroA")).toBe("battlefield-bf1");
    await game.settle(); // showdown closes → combat damage: 9 from Volibear vs 2+2 from the Poros
    expect(game.zoneOf("poroA")).toBe("trash");
    expect(game.zoneOf("poroB")).toBe("trash");
    expect(game.zoneOf("voli")).toBe("battlefield-bf1"); // 4 < 9, healed at combat cleanup
    expect(game.state("voli").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("Case A: Volibear's COMBAT damage is dealt by a unit, not a spell/ability — exactly 9, no Annie bonus (417.6.c): a 16-Might defender that took 6 from the trigger survives 6+9 = 15", async () => {
    // Variant board to make 9-vs-10 observable: one vanilla 16-might wall instead of the Poros/Sergeant.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 16, name: "Wall" }, "wall")
      .unit(P1, "base", VOLIBEAR, "voli")
      .unit(P1, "base", ANNIE, "annie")
      .build();
    const d = await volibearAttacks(game);
    expect(d.buckets.map((b) => b.card)).toEqual(["wall"]);
    await game.p1.distribute({ wall: d.total });
    // Whether the engine splits 6 (correct) or splits 5 and adds +1 per target (bug), the wall has 6 now.
    expect(game.state("wall").damage).toBe(6);
    await game.settle(); // combat: Volibear assigns his 9 to the wall; the wall assigns 16 to Volibear
    expect(game.zoneOf("voli")).toBe("trash"); // 16 ≥ 9
    expect(game.zoneOf("wall")).toBe("battlefield-bf1"); // 6 + 9 = 15 < 16 — a bonus-inflated 10 would have killed it
    expect(game.state("wall").damage).toBe(0); // healed at combat cleanup (466.1.a.1)
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("Case B: Anivia's 'deal 3 to all enemy units here' is a multi-target deal — each instance gets +1 (715.2): Poro 4, Poro 4, Sergeant 4 → all three die to the trigger, before any combat damage", async () => {
    const game = await board().build();
    await game.p1.move("anivia", "bf1");
    expect(game.chain()).toMatchObject([{ cardId: "anivia", controller: P1, triggered: true, type: "ability" }]);
    await game.p1.pass();
    expect(game.actingSeat()).toBe(P2); // P2 had a priority window on the trigger
    await game.p2.pass(); // → trigger resolves (no choices: "all enemy units here")
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("poroA")).toBe("trash");
    expect(game.zoneOf("poroB")).toBe("trash");
    expect(game.zoneOf("sarge")).toBe("trash"); // 3 + 1 = 4 ≥ 4
    // We are still inside the showdown (focus), i.e. this happened before the combat damage step.
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown" });
    expect(game.state("anivia").damage).toBe(0);
  });

  test("Case B: with no defenders remaining there is no combat damage step (465.1) — Anivia takes nothing and conquers bf1 for a point", async () => {
    const game = await board().build();
    await game.p1.move("anivia", "bf1");
    await game.settle();
    expect(game.zoneOf("anivia")).toBe("battlefield-bf1");
    expect(game.state("anivia").damage).toBe(0);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.units("bf1")).toEqual(["anivia"]);
  });

  test("Case B contrast: WITHOUT Annie Anivia deals the printed 3 each — both Poros die but the Sergeant survives the trigger with 3 damage (and only then dies to Anivia's 8 in combat)", async () => {
    const game = await board({ annie: false }).build();
    await game.p1.move("anivia", "bf1");
    await game.p1.pass();
    await game.p2.pass();
    expect(game.zoneOf("poroA")).toBe("trash");
    expect(game.zoneOf("poroB")).toBe("trash");
    expect(game.zoneOf("sarge")).toBe("battlefield-bf1");
    expect(game.state("sarge").damage).toBe(3);
    await game.settle();
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.zoneOf("anivia")).toBe("battlefield-bf1"); // took 4 < 8, healed
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
