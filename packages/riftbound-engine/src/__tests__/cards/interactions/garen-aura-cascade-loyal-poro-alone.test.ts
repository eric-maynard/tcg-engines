/**
 * Interaction: Garen, Commander (ogs-013-024) · Champion Unit · Order · 6 · 5 Might
 *     "Other friendly units have +1 [Might] here."
 *   × Loyal Poro (unl-156-219) · Unit · Order · 3 · 3 Might
 *     "[Deathknell][>] If I didn't die alone, draw 1. (I wasn't alone if there were other friendly units here.)"
 *   × Piercing Light (sfd-023-221) · Spell · Fury · 2+[fury]
 *     "Deal 2 to a unit at a battlefield, then deal 2 to up to one other unit."
 *   (Firestorm ogs-002-024 "Deal 3 to all enemy units at a battlefield" is the earlier event that left
 *    3 damage on each — modelled as pre-marked damage.)
 *
 * Question (P1's turn; P2 holds bf1 with Garen 5 and Loyal Poro 3→4, each carrying 3 damage):
 *   Case NO  — Piercing Light: 2 to Garen (5 = lethal), second 2 to nothing. Garen dies in Cleanup C1;
 *              the Poro is then a 3-Might body with 3 damage. Does it die in the same Cleanup, a cascaded
 *              one, or later? Was it "alone"? Does anyone get priority between the two deaths?
 *   Case YES — 2 to Garen, then 2 to the Poro (5 ≥ 4): both lethal at once.
 *
 * Rules: 321 (no Cleanup while an item resolves) → 319.5 (Cleanup after the spell leaves the chain);
 * 323.4/323.5 (3a note death-trigger info, 3b kill lethal units); 319.6 + 322/322.1 (Garen leaving the
 * board during C1 makes a NEW Cleanup outstanding that runs right after C1 — C1 is not re-entered);
 * 320/320.1 (no finalize/resolve/priority during a Cleanup → nobody acts between C1 and C2);
 * 740.2.a + 808.1.d.3 (alone = no other friendly unit here, noted as it dies — in C2 Garen is already
 * in the trash); 383.2.a.1 ("If I didn't die alone" directly follows the condition, so a lone death does
 * not even put the Deathknell on the chain — either way: no draw); 142.4 (lethal = damage ≥ Might,
 * re-evaluated once the +1 aura is gone); 323.6 (P2 loses the emptied bf1 once the state is Open);
 * 337.4 (YES: the Poro's trigger is P2's item → P2 gets priority first).
 *
 * Expected: NO → Garen dies (C1), Poro dies in the cascaded C2, alone → P2 draws nothing; there is no
 * decision for either player between the two deaths; bf1 ends uncontrolled. YES → both die in C1, the
 * Poro had Garen for company → Deathknell on the chain (P2) → P2 draws 1; bf1 stays P2's while that
 * trigger is on the chain, then is lost. Aiming the second 2 at the Poro hands P2 a card.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GAREN = "ogs-013-024";
const LOYAL_PORO = "unl-156-219";
const PIERCING_LIGHT = "sfd-023-221";
const TACTICAL_RETREAT = "unl-175-219"; // a Reaction in P2's hand — only to make P2's (single) response window visible

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn. P2 controls bf1 with Garen (5) and Loyal Poro (3, +1 from Garen), each already carrying
 * 3 damage (Firestorm earlier this turn). P1 holds Piercing Light with exactly 2+[fury]; a vanilla P1
 * Bystander sits in P1's base (a legal "other unit" for the second packet, never for the first).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", GAREN, "garen", { damage: 3 })
    .unit(P2, "bf1", LOYAL_PORO, "poro", { damage: 3 })
    .unit(P1, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P2, TACTICAL_RETREAT, "retreat")
    .hand(P1, PIERCING_LIGHT, "light");
}

/** The `targets` tuples Piercing Light offers: [first] or [first, second]. */
function targetTuples(game: Game): string[][] {
  const field = game.p1.option("cast", "light")?.fields.find((f) => f.name === "targets");
  return (field?.options ?? []).map((v) => (Array.isArray(v) ? (v as string[]) : [v as string]));
}

/** Cast Piercing Light with the given targets and have both players pass until it has resolved. */
async function resolveLight(targets: string[]): Promise<{ game: Game; p2Hand0: number }> {
  const game = await board().build();
  const p2Hand0 = game.p2.hand().length;
  await game.p1.cast("light", { targets });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "light", controller: P1, targets, triggered: false })]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // → Piercing Light resolves, leaves the chain, Cleanup(s) run
  expect(game.zoneOf("light")).toBe("trash");
  return { game, p2Hand0 };
}

describe("setup — the aura and the pre-existing damage", () => {
  test("Garen is 5 Might; the Poro is 3 + 1 (Garen's 'other friendly units here') = 4; both carry 3 damage and are alive (3 < 5, 3 < 4)", async () => {
    const game = await board().build();
    expect(game.state("garen")).toMatchObject({ damage: 3, might: 5, zone: "battlefield-bf1" });
    expect(game.state("poro")).toMatchObject({ baseMight: 3, damage: 3, might: 4, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("Piercing Light's first packet must hit a unit AT A BATTLEFIELD (Garen | Poro, never the Bystander in base); the optional second packet may hit any OTHER unit, never the first again (355.5, 355.13)", async () => {
    const game = await board().build();
    const tuples = targetTuples(game);
    const firsts = [...new Set(tuples.map((t) => t[0]))].sort();
    expect(firsts).toEqual(["garen", "poro"]);
    expect(tuples).toContainEqual(["garen"]); // second packet withheld
    expect(tuples).toContainEqual(["garen", "poro"]);
    expect(tuples).toContainEqual(["garen", "bystander"]); // "other unit" — anywhere
    expect(tuples.some((t) => t.length === 2 && t[0] === t[1])).toBe(false);
    await expect(game.p1.cast("light", { targets: ["bystander"] })).rejects.toThrow();
  });
});

describe("Case NO — 2 to Garen only: Garen dies in C1, the Poro dies ALONE in the cascaded C2", () => {
  test("P2's one and only response window is while Piercing Light is still on the chain (Tactical Retreat is offered there)", async () => {
    const game = await board().build();
    await game.p1.cast("light", { targets: ["garen"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "retreat")).toBe(true);
    expect(game.state("garen").zone).toBe("battlefield-bf1");
    expect(game.state("poro").zone).toBe("battlefield-bf1");
  });

  test("once P2 passes, the spell resolves and BOTH deaths happen back-to-back with no decision for anyone in between (320.1, 322): the very next prompt is P1's open main phase with Garen AND the Poro already in the trash", async () => {
    const game = await board().build();
    await game.p1.cast("light", { targets: ["garen"] });
    await game.p1.passPriority();
    const r = await game.p2.passPriority();
    // Nothing was auto-answered on anyone's behalf between the pass and the next prompt.
    expect(r.executed.filter((m) => m.auto !== true).map((m) => m.moveId)).toEqual(["passChainPriority"]);
    expect(game.zoneOf("garen")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    // P2 never held a menu "after Garen died but before the Poro died": Tactical Retreat is still in hand, unspent.
    expect(game.p2.hand()).toContain("retreat");
    expect(game.p2.energy()).toBe(2);
  });

  test("Garen took 3 + 2 = 5 ≥ 5 → killed (323.5); the Poro was NOT hit, but with Garen gone it is a 3-Might unit carrying 3 damage → lethal in the cascaded Cleanup (319.6 → 322, 142.4)", async () => {
    const { game } = await resolveLight(["garen"]);
    expect(game.p2.trash()).toEqual(expect.arrayContaining(["garen", "poro"]));
    expect(game.cardsAt("battlefield-bf1")).toEqual([]);
  });

  test("the Poro died ALONE (Garen was already in the trash when C2 noted its company — 740.2.a, 808.1.d.3): P2 draws nothing, and no Loyal Poro trigger is left waiting on the chain (383.2.a.1)", async () => {
    const { game, p2Hand0 } = await resolveLight(["garen"]);
    expect(game.chain()).toEqual([]);
    expect(game.p2.hand()).toHaveLength(p2Hand0);
    await game.settle();
    expect(game.p2.hand()).toHaveLength(p2Hand0);
  });

  test("with no P2 unit left at bf1 and the state Open again, P2 loses control of bf1 (323.6); nobody scores", async () => {
    const { game } = await resolveLight(["garen"]);
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.p2.battlefields({ controlled: true })).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});

describe("Case YES — 2 to Garen, then 2 to the Poro: both lethal in the SAME Cleanup, the Poro was not alone", () => {
  test("after the spell resolves both are in the trash simultaneously and the Poro's Deathknell sits on the chain as P2's triggered item; P2 (its controller) holds priority first (323.4, 337.4)", async () => {
    const { game, p2Hand0 } = await resolveLight(["garen", "poro"]);
    expect(game.zoneOf("garen")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", controller: P2, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.hand()).toHaveLength(p2Hand0); // not drawn yet — only on resolution
  });

  test("while that trigger is on the chain the state is Closed, so step 4 of the Cleanup is skipped: bf1 is still P2's (323.6 needs an Open State)", async () => {
    const { game } = await resolveLight(["garen", "poro"]);
    expect(game.chain()).toHaveLength(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("P2 pass, P1 pass → the Deathknell resolves: Garen (lethal but still on the board in 3a) kept the Poro company → P2 draws exactly 1; then the chain is empty, the state opens and P2 loses bf1", async () => {
    const { game, p2Hand0 } = await resolveLight(["garen", "poro"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.p2.hand()).toHaveLength(p2Hand0 + 1);
    expect(game.p1.hand()).toEqual([]); // the killer draws nothing
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("the judge's punchline: the same board, the same spell — withholding the second packet kills the Poro anyway with NO draw; aiming it at the Poro GIVES P2 a card", async () => {
    const no = await resolveLight(["garen"]);
    await no.game.settle();
    const yes = await resolveLight(["garen", "poro"]);
    await yes.game.settle();
    expect(no.game.zoneOf("poro")).toBe("trash");
    expect(yes.game.zoneOf("poro")).toBe("trash");
    expect(no.game.p2.hand().length - no.p2Hand0).toBe(0);
    expect(yes.game.p2.hand().length - yes.p2Hand0).toBe(1);
  });
});
