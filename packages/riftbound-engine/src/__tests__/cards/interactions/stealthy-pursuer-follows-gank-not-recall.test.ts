/**
 * Interaction: Stealthy Pursuer (ogn-177-298) · Unit · Chaos · 4 · 4 Might
 *     "When a friendly unit moves from my location, I may be moved with it."
 *   × Vi, Destructive (ogn-036-298) · Champion Unit · Fury · 3 Might · "[Ganking] …"
 *   × Zhonya's Hourglass (ogn-077-298) · Gear · "If a friendly unit would die, kill this instead. Heal
 *     that unit, exhaust it, and recall it. (This isn't a move.)"
 *   × Mageseeker Investigator (unl-163-219) · "Opponents must pay [rainbow] for each unit beyond the
 *     first to move multiple units to my battlefield at the same time."
 *
 * Rules: 144.2 / 420.3.a (a Standard Move exhausts only the unit(s) making it — exhaustion is its COST,
 * not a precondition for being moved by an effect), 383.3.a (optional trigger: choice at finalization),
 * 449.1 (an effect move's destination comes from the effect: "with it"), 450 / 453 / 323.8 / 323.9 /
 * 323.13 / 460 (Contested is applied and combat is Staged in Cleanup, but combat only BEGINS from a
 * Neutral Open state with an empty chain — so the Pursuer's pending trigger delays it), 464.2.c.1 /
 * 464.2.c.3 (every unit of the attacker at the battlefield when combat opens is an Attacker),
 * 810.1.c / 810.1.c.3 (Ganking only widens a unit's OWN Standard Move; effects may move bf→bf freely),
 * 455 / 456.1 (recalls are not moves and do not fire move triggers), 466.1.a.2 (surviving attackers are
 * RECALLED when defenders remain), 190.4.c (an emptied battlefield is lost at the next Open cleanup),
 * 204.4 (Investigator's applied cost is for ONE action moving several units at the same time).
 *
 * Question / expected:
 *   (a) exhausted Pursuer + ready Vi in base; Vi Standard-Moves to enemy bfB (4-Might holder). Pursuer
 *       may follow for free (stays exhausted); combat waits for the trigger; ONE combat, both attack
 *       (7 vs 4), holder dies, P1 conquers.
 *   (b) Vi ganks bfA→bfC; Pursuer (no Ganking) still follows bf→bf; bfA, now empty, is lost.
 *   (c) Zhonya's recalls a dying Vi — no Pursuer trigger.
 *   (d) failed attack → both recalled — no Pursuer trigger.
 *   (e) Investigator at the destination taxes nothing: Vi moved alone, Pursuer moved later by a
 *       separately-resolved trigger.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const PURSUER = "ogn-177-298";
const VI = "ogn-036-298";
const ZHONYAS = "ogn-077-298";
const INVESTIGATOR = "unl-163-219";

/** P2's 1-cost "Deal 3 to a unit" — enough to kill Vi (3 Might). */
const BOLT3 = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Bolt 3",
  rulesText: "Deal 3 to a unit.",
  timing: "action",
} as const;

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** (a) P1: ready Vi + EXHAUSTED Pursuer in base. P2 holds bfB with a 4-Might Holder. bfA is P1's (empty). */
function boardA() {
  return scenario()
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P2, "bfB", { might: 4, name: "Holder" }, "holder")
    .unit(P1, "base", VI, "vi")
    .unit(P1, "base", PURSUER, "sp", { exhausted: true });
}

/** (b) P1: ready Vi + ready Pursuer both AT bfA (P1's). P2 holds bfC with a 4-Might Holder. */
function boardB() {
  return scenario()
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfC", { controller: P2 })
    .unit(P2, "bfC", { might: 4, name: "Holder" }, "holder")
    .unit(P1, "bfA", VI, "vi")
    .unit(P1, "bfA", PURSUER, "sp");
}

/** The Pursuer's "may be moved with it" prompt is pending for P1. */
function expectPursuerPrompt(game: Game): void {
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "sp" } });
}

describe("Stealthy Pursuer follows Standard/Ganking moves — not recalls", () => {
  // ── (a) exhausted Pursuer tags along into an attack ─────────────────────────────────────────

  test("(a) Vi's Standard Move exhausts only Vi; bfB becomes Contested by P1 but NO showdown/combat has begun — the Pursuer's trigger sits on the chain awaiting P1's 'may' (450, 323.13, 460, 383.3.a)", async () => {
    const game = await boardA().build();
    await game.p1.move("vi", "bfB");
    expect(game.locationOf("vi")).toBe("bfB");
    expect(game.state("vi").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sp", controller: P1, triggered: true })]);
    expectPursuerPrompt(game);
    expect(game.decision()).toMatchObject({ canAccept: true }); // nothing to pay — being exhausted is no obstacle
    expect(game.locationOf("sp")).toBe("base");
  });

  test("(a) P1 says yes → P2 gets a priority window on the trigger before it resolves; on resolution the EXHAUSTED Pursuer is moved base→bfB and stays exhausted (144.2 / 420.3.a, 449.1)", async () => {
    const game = await boardA().build();
    await game.p1.move("vi", "bfB");
    await game.p1.yes();
    expect(game.locationOf("sp")).toBe("base"); // not yet — the item still has to resolve
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2 may React
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]); // still no combat
    await game.p2.passPriority(); // resolves
    expect(game.locationOf("sp")).toBe("bfB");
    expect(game.state("sp").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
  });

  test("(a) then ONE combat begins at bfB with both Vi and the Pursuer as Attackers (464.2.c.3): 7 vs 4 → Holder dies, P1 conquers bfB and scores 1; the Pursuer survives there", async () => {
    const game = await boardA().build();
    await game.p1.move("vi", "bfB");
    await game.p1.yes();
    await game.p1.passPriority();
    await game.p2.passPriority();
    // combat showdown now open at bfB with both P1 units designated attackers
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ active: true, battlefieldId: "bfB", isCombatShowdown: true });
    expect(game.state("vi").combatRole).toBe("attacker");
    expect(game.state("sp").combatRole).toBe("attacker");
    expect(game.state("holder").combatRole).toBe("defender");
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.zoneOf("sp")).toBe("battlefield-bfB");
    // Holder's 4 is assigned lethal-first: 3 to Vi (+1 to Pursuer) or all 4 to the Pursuer — either is legal.
    expect(["trash", "battlefield-bfB"]).toContain(game.zoneOf("vi"));
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.gameState.battlefields.bfB?.contested).toBe(false);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(a, NO) declining leaves the Pursuer in base and Vi attacks alone: 3 vs 4 → Vi dies, Holder keeps bfB", async () => {
    const game = await boardA().build();
    await game.p1.move("vi", "bfB");
    await game.p1.no();
    await game.settle();
    expect(game.locationOf("sp")).toBe("base");
    expect(game.zoneOf("vi")).toBe("trash");
    expect(game.zoneOf("holder")).toBe("battlefield-bfB");
    expect(game.gameState.battlefields.bfB?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  // ── (b) following a Ganking move battlefield → battlefield ───────────────────────────────────

  test("(b) Vi's Ganking move bfA→bfC is a move 'from my location' → the Pursuer (no Ganking of its own) is offered the follow and lands at bfC (810.1.c.3, 449.1)", async () => {
    const game = await boardB().build();
    expect(game.p1.can("gank", "vi")).toBe(true);
    expect(game.p1.can("gank", "sp")).toBe(false); // the Pursuer itself cannot Standard-Move bf→bf
    await game.p1.gank("vi", "bfC");
    expect(game.locationOf("vi")).toBe("bfC");
    expectPursuerPrompt(game);
    await game.p1.yes();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("sp")).toBe("bfC");
    expect(game.state("sp").isReady).toBe(true); // moved by an effect: not exhausted
    expect(game.state("vi").isExhausted).toBe(true);
  });

  test("(b) both attack bfC together (Holder dies, P1 conquers) and bfA — left with no P1 unit — is no longer controlled by P1 after the following Open-state cleanup (190.4.c)", async () => {
    const game = await boardB().build();
    await game.p1.gank("vi", "bfC");
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.zoneOf("sp")).toBe("battlefield-bfC");
    expect(game.gameState.battlefields.bfC?.controller).toBe(P1);
    expect(game.p1.units("bfA")).toEqual([]);
    expect(game.gameState.battlefields.bfA?.controller).not.toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (c) Zhonya's recall is not a move ─────────────────────────────────────────────────────────

  test("(c) P2 bolts Vi for lethal at bfA; Zhonya's dies instead and RECALLS Vi to base healed+exhausted — the Pursuer is never asked and stays at bfA (455 / 456.1)", async () => {
    const game = await boardB()
      .active(P2)
      .resources(P2, { energy: 1 })
      .gear(P1, ZHONYAS, "zhonyas")
      .hand(P2, BOLT3, "bolt")
      .build();
    await game.p2.cast("bolt", { targets: "vi" });
    const r = await game.settle();
    expect(r.reason).toBe("open"); // never stopped on a Pursuer yes/no
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("vi")).toBe("base");
    expect(game.state("vi").damage).toBe(0);
    expect(game.state("vi").isExhausted).toBe(true);
    expect(game.locationOf("sp")).toBe("bfA");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  // ── (d) the step-3d recall of surviving attackers is not a move ──────────────────────────────

  test("(d) Vi + Pursuer attack a stunned 8-Might Wall (survives, deals no damage): both attackers are RECALLED to base (466.1.a.2) and no Pursuer trigger is offered for that recall", async () => {
    const game = await scenario()
      .battlefield("bfB", { controller: P2 })
      .unit(P2, "bfB", { might: 8, name: "Wall" }, "wall", { stunned: true })
      .unit(P1, "base", VI, "vi")
      .unit(P1, "base", PURSUER, "sp")
      .build();
    await game.p1.move("vi", "bfB");
    expectPursuerPrompt(game); // the genuine move trigger (Vi left base)
    await game.p1.yes();
    const r = await game.settle(); // trigger resolves, combat runs, attackers recalled
    expect(r.reason).toBe("open"); // no second yes/no from the recall
    expect(game.zoneOf("wall")).toBe("battlefield-bfB");
    expect(game.state("wall").damage).toBe(0); // 7 < 8, damage cleared after combat
    expect(game.locationOf("vi")).toBe("base");
    expect(game.locationOf("sp")).toBe("base");
    expect(game.gameState.battlefields.bfB?.controller).toBe(P2);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (e) Mageseeker Investigator does not tax the follow ──────────────────────────────────────

  test("(e) with an Investigator at bfB and P1 holding NO power: moving two units there in one action is illegal (204.4), but Vi alone is fine and the Pursuer's later trigger-move owes nothing — both arrive, pool untouched, Investigator (4) dies to 7", async () => {
    const game = await scenario()
      .battlefield("bfB", { controller: P2 })
      .unit(P2, "bfB", INVESTIGATOR, "inv")
      .unit(P1, "base", VI, "vi")
      .unit(P1, "base", PURSUER, "sp")
      .unit(P1, "base", { might: 1, name: "Buddy" }, "buddy")
      .build();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    // control: the applied cost bites on a genuine two-unit Standard Move
    expect((await game.p1.try((p) => p.move(["vi", "buddy"], "bfB"))).ok).toBe(false);
    expect(game.locationOf("vi")).toBe("base");
    // the real line: Vi alone, then the Pursuer via its own trigger
    await game.p1.move("vi", "bfB");
    expectPursuerPrompt(game);
    expect(game.decision()).toMatchObject({ canAccept: true });
    await game.p1.yes();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("sp")).toBe("bfB");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("inv")).toBe("trash");
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
