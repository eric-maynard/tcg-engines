/**
 * Interaction: Blighted Battleaxe (unl-019-219, Equipment, +4) "…At the end of your turn, if I didn't
 *   conquer this turn, unattach this and deal 4 to me."  (Effect Text conferred on the equipped unit)
 *   × Discipline (ogn-058-298) "[Reaction] Give a unit +2 [Might] this turn. Draw 1."
 *   × Vanguard Sergeant (ogn-219-298) vanilla 4 Might.
 *
 * Question: P1's Sergeant (4) wears the Battleaxe (+4 = 8) at bf1 and did NOT conquer this turn.
 *   Case A — no pump. Case B — P1 Disciplined it earlier (+2 this turn → 10).
 *   At the end of P1's turn the axe triggers, unattaches (−4) and deals 4 to the Sergeant. Does it die
 *   in A? In B the only reason 4 isn't lethal is a "this turn" pump — does it die when Discipline
 *   expires in the Expiration Step, or does the 3c heal save it? Where does the axe end up?
 *
 * Rules: 317.1.a (Ending Step: "at the end of turn" effects → chain item, FEPR), 319.5 + 323.5 (a
 * Cleanup after the item leaves the chain kills lethal-damaged units, 142.4.b lethal = damage ≥ Might),
 * 323.7 (unattached gear at a battlefield is recalled to base), 317.2.a–d (Expiration Step special
 * cleanup in fixed order: 3c heal all units, THEN 3d 'this turn' effects expire, THEN 3e pools empty),
 * 317.2.f (loop only if something FEPR'd during expiration).
 * Expected: A — unattach → Sergeant is a 4 with 4 damage → dies in the Ending Step; axe recalled to
 * P1's base. B — unattach → 6 with 4 damage survives; 3c heals to 0 BEFORE 3d drops it to 4, so it
 * lives into P2's turn undamaged at 4 Might, axe unattached in P1's base.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BATTLEAXE = "unl-019-219";
const DISCIPLINE = "ogn-058-298";
const SERGEANT = "ogn-219-298";

/** P1's turn 2 main phase; Sergeant + attached axe hold bf1 (nothing conquered this turn). */
function board() {
  return scenario()
    .turn(2)
    .active(P1)
    .resources(P1, { energy: 3 }) // Discipline is 2; 1 floats to show 3e emptying
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", SERGEANT, "sarge", { equippedWith: ["axe"] })
    .card("axe", { def: BATTLEAXE, meta: { attachedTo: "sarge" }, owner: P1, zone: "bf1" })
    .hand(P1, DISCIPLINE, "discipline")
    .unit(P2, "bf2", { might: 2, name: "Bystander" }, "bystander");
}

describe("Blighted Battleaxe EOT self-damage × Discipline × Expiration-step heal order", () => {
  test("precondition: Sergeant is 4 + 4 = 8 with the axe attached at bf1; P1 conquered nothing this turn", async () => {
    const game = await board().build();
    expect(game.state("sarge")).toMatchObject({ attachments: ["axe"], baseMight: 4, damage: 0, might: 8, zone: "battlefield-bf1" });
    expect(game.state("axe")).toMatchObject({ attachedTo: "sarge", zone: "battlefield-bf1" });
    expect(game.gameState.conqueredThisTurn[P1]).toEqual([]);
  });

  test("Ending Step (317.1.a): ending the turn raises exactly one triggered chain item — the axe's conferred 'end of your turn' ability, sourced from the equipped Sergeant — with priority to respond, before anything expires", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sarge", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    // Nothing has expired or emptied yet: still P1's Ending Step.
    expect(game.p1.energy()).toBe(3);
  });

  test("Case B timing: the trigger is raised while Discipline's +2 is still live (10 Might on the chain) — expiration only happens in the later Expiration Step (317.2)", async () => {
    const game = await board().build();
    await game.p1.cast("discipline", { targets: "sarge" });
    await game.settle();
    expect(game.state("sarge").might).toBe(10);
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toHaveLength(1);
    expect(game.state("sarge").might).toBe(10);
    expect(game.state("sarge").damage).toBe(0);
  });

  test("Case A — on resolution the axe unattaches first (8 → 4) then deals 4: lethal (142.4.b), the Sergeant is killed by the post-chain Cleanup in the Ending Step (319.5/323.5) and the loose axe is recalled to P1's base (323.7)", async () => {
    // Expected: sarge → P1's trash; axe → P1's base, unattached; bf1 left empty (control lapses).
    // Actual: the conferred trigger resolves as a no-op (effect parsed as raw text) — the axe stays
    // attached, no damage is dealt, the Sergeant survives at 8.
    const game = await board().build();
    await game.p1.endTurn();
    await game.settle(); // both pass → resolves → cleanup → expiration → P2's turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.zoneOf("axe")).toBe("base");
    expect(game.state("axe").attachedTo).toBeUndefined();
    expect(game.p1.units("bf1")).toEqual([]);
  });

  test("Case B: the Disciplined Sergeant is alive at bf1 and undamaged when P2's turn opens (4 on a 6 is not lethal; 3c heals before 3d expires the pump)", async () => {
    const game = await board().build();
    await game.p1.cast("discipline", { targets: "sarge" });
    await game.settle();
    await game.p1.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("sarge")).toBe("battlefield-bf1");
    expect(game.state("sarge").damage).toBe(0);
    expect(game.state("sarge").grantedKeywords).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.trash()).toEqual(["discipline"]);
  });

  test("Case B — end state: axe unattached and recalled to P1's base, Sergeant back to its printed 4 Might (Discipline expired at 3d, +4 gone with the unattach), 0 damage", async () => {
    // Expected: sarge { might: 4, damage: 0, attachments: [] } at bf1; axe in P1's base unattached.
    // Actual: the trigger is a no-op — axe still attached, Sergeant reads 8.
    const game = await board().build();
    await game.p1.cast("discipline", { targets: "sarge" });
    await game.settle();
    await game.p1.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("sarge")).toBe("battlefield-bf1");
    expect(game.state("sarge")).toMatchObject({ attachments: [], baseMight: 4, damage: 0, might: 4 });
    expect(game.state("axe")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.p1.gear()).toContain("axe");
  });

  test("Expiration Step 3d/3e in both cases: Discipline's 'this turn' +2 is gone and P1's floating energy emptied by the time P2 acts; exactly one Ending-Step chain item was ever raised (no expiration loop, 317.2.f)", async () => {
    const game = await board().build();
    await game.p1.cast("discipline", { targets: "sarge" });
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    expect(game.state("sarge").mightModifier).toBe(2);
    await game.p1.endTurn();
    const raised = game.chain().length;
    await game.settle();
    expect(raised).toBe(1);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("sarge").mightModifier ?? 0).toBe(0); // 3d: the 'this turn' +2 expired
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
