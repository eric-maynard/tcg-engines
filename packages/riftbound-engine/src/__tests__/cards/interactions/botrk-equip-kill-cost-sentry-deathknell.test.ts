/**
 * Interaction: Blade of the Ruined King (sfd-178-221) · Gear — Equipment · Order · 3 + [order] · +4
 *     "[Equip] — [order], Kill a friendly unit (Pay the cost: Attach this to a unit you control.)"
 *   × Watchful Sentry (ogn-096-298) · Unit · Mind · 2 · 1 Might — "[Deathknell] — Draw 1."
 *   with a plain 3-Might unit "Anchor" (A) of P1's and Gust (ogn-169-298, Reaction — "Return a unit at a
 *   battlefield with 3 [Might] or less to its owner's hand") in P2's hand.
 *
 * Rules: 818.1.b.1 + 355.5 (the unit to attach to is Equip's TARGET, chosen while the ability is put on
 * the chain), 818.1.c.3 (an Equip cost may mix a resource part — [order] — and a non-resource part —
 * "Kill a friendly unit"), 404.1 (both are PAID during activation), 355.10.c (the killed unit is a cost
 * object, never a target — nobody has priority while costs are paid), 428.1.a.1.b / 808.1.d.2 / 818.1.c.1
 * (a Deathknell triggered by paying the cost is put on the chain ABOVE the Equip ability as a Pending
 * item before the unit reaches the trash), 406.2 → 406.3 / 337.3 (Equip is finalized, then the pending
 * Deathknell), 406.4 (only then may P2 react — seeing both items), 340.1 (LIFO: the Deathknell draw
 * resolves first, then the attach), 718.4 (Equipped: 3 + 4 = 7). 357.3 (a cost may not be paid in a way
 * that deterministically makes the chosen target illegal when an alternative exists → the bearer can
 * never be the fodder), 358.1 / 358.5 / 402.3 (with a single friendly unit the only payment kills the
 * mandatory target → the activation is not legal at all; likewise with no [order]), 718.2 (an attached
 * Equipment's printed [Equip] is Inactive).
 *
 * Q: BotRK loose in P1's base; P1 controls Watchful Sentry (1) and Anchor (3); pool {order: 1}; P1's turn,
 *    Open state.
 *  (a) P1 Equips choosing Anchor: Anchor is the target; the [order] is paid and the Sentry is killed NOW —
 *      P2 cannot save it; the Sentry's Deathknell sits above the Equip item and resolves first (draw 1),
 *      then BotRK attaches → Anchor 7. If P2 Gusts Anchor in response, Equip mistargets: BotRK stays loose,
 *      the Sentry stays dead, the card stays drawn, the [order] is gone.
 *  (b) P1 may NOT name Anchor as both bearer and fodder — the kill must be the Sentry.
 *  (c) Anchor is P1's only unit → Equip is not enumerated at all; nothing dies, no [order] spent.
 *  (d) No [order] in pool, or BotRK already attached → not enumerated.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BOTRK = "sfd-178-221";
const WATCHFUL_SENTRY = "ogn-096-298";
const GUST = "ogn-169-298";

/**
 * P1's turn 2, main phase. bf1 is P1's, holding Anchor (3) and Watchful Sentry (1) — both Gust-able if
 * alive. BotRK lies unattached in P1's base. P1: {order: 1}, empty hand. P2: 1 energy + Gust in hand and
 * a bystander in base.
 */
function board(opts: { sentry?: boolean; order?: number } = {}) {
  const b = scenario()
    .resources(P1, { energy: 0, power: { order: opts.order ?? 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Anchor" }, "anchor")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .gear(P1, BOTRK, "botrk")
    .hand(P2, GUST, "gust");
  if (opts.sentry ?? true) {
    b.unit(P1, "bf1", WATCHFUL_SENTRY, "sentry");
  }
  return b;
}

/** Every {unitId, sacrificeId} pairing the engine offers P1 for equipping `equipment`. */
const equipVariants = (game: Game, equipment = "botrk") =>
  game.p1
    .legal()
    .filter((o) => o.moveId === "equipCard")
    .flatMap((o) => o.variants)
    .filter((v) => v.params.equipmentId === equipment)
    .map((v) => ({ sacrificeId: v.params.sacrificeId as string | undefined, unitId: v.params.unitId as string }));

/** Activate BotRK's [Equip] targeting Anchor, feeding the Sentry to the cost. Leaves the item(s) on the chain. */
async function equipAnchor(game: Game): Promise<void> {
  await game.p1.choose("equipCard", { params: { equipmentId: "botrk", unitId: "anchor" }, sacrifice: "sentry" });
}

const chainIds = (game: Game): string[] => game.chain().map((c) => c.cardId);

function gustTargets(game: Game): string[] {
  const field = game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** Step (passes / forced answers only) until `pred` holds. */
async function until(game: Game, pred: (d: Decision | null) => boolean, max = 30): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (pred(game.decision())) {
      return;
    }
    const r = await game.settle({ maxSteps: 1 });
    if (r.reason !== "max-steps" && !pred(game.decision())) {
      break;
    }
  }
  expect(pred(game.decision())).toBe(true);
}

describe("Blade of the Ruined King × Watchful Sentry — the Equip kill-cost, its Deathknell, and the chain", () => {
  // ── (a) Equip choosing Anchor, Sentry pays ─────────────────────────────────────────────────────

  test("(a) enumeration: Equip is offered as {bearer Anchor, kill Sentry} and {bearer Sentry, kill Anchor} — target and cost object are distinct slots (818.1.b.1, 355.10.c)", async () => {
    const game = await board().build();
    const variants = equipVariants(game);
    expect(variants).toContainEqual({ sacrificeId: "sentry", unitId: "anchor" });
    expect(variants).toContainEqual({ sacrificeId: "anchor", unitId: "sentry" });
    expect(variants.every((v) => v.sacrificeId !== undefined)).toBe(true); // the kill is mandatory
    expect(variants.map((v) => v.unitId)).not.toContain("bystander"); // enemy units are never bearers
    expect(variants.map((v) => v.sacrificeId)).not.toContain("bystander"); // …nor fodder
  });

  test("(a) activating pays the WHOLE cost at once: the [order] is spent and the Sentry is already in the trash while P1 still holds the first priority; Anchor untouched, nothing drawn yet (404.1, 818.1.c.3, 355.10.c)", async () => {
    const game = await board().build();
    await equipAnchor(game);
    expect(game.p1.power("order")).toBe(0);
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.state("anchor")).toMatchObject({ attachments: [], might: 3, zone: "battlefield-bf1" });
    expect(game.state("botrk").attachedTo).toBeUndefined();
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    // Both items are on the chain before anyone acts (406.3 / 337.3): the Equip ability and the Deathknell.
    expect([...chainIds(game)].sort()).toEqual(["botrk", "sentry"]);
    expect(game.chain()).toContainEqual(expect.objectContaining({ cardId: "botrk", controller: P1, triggered: false }));
    expect(game.chain()).toContainEqual(expect.objectContaining({ cardId: "sentry", controller: P1, triggered: true }));
  });

  // Expected (428.1.a.1.b, 808.1.d.2, 818.1.c.1): the Deathknell triggered by paying the cost is placed
  // ABOVE the Equip ability — chain bottom→top = [botrk, sentry]. Actual: the engine kills the Sentry (and
  // chains its Deathknell) before it adds the Equip item, so the order comes out [sentry, botrk].
  test("(a) the Sentry's Deathknell sits ABOVE the Equip ability on the chain (428.1.a.1.b, 808.1.d.2, 818.1.c.1)", async () => {
    const game = await board().build();
    await equipAnchor(game);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "botrk", controller: P1, triggered: false }),
      expect.objectContaining({ cardId: "sentry", controller: P1, triggered: true }),
    ]);
  });

  test("(a) P2 cannot save the Sentry: when P2 first holds priority it is already dead — Gust (affordable) is offered Anchor only (355.10.c, 406.4)", async () => {
    const game = await board().build();
    await equipAnchor(game);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p2.energy()).toBe(1);
    expect(game.p2.can("cast", "gust")).toBe(true);
    expect(gustTargets(game)).toEqual(["anchor"]);
    expect((await game.p2.try((p) => p.cast("gust", { targets: "sentry" }))).ok).toBe(false);
    expect([...chainIds(game)].sort()).toEqual(["botrk", "sentry"]); // P2 sees both items
  });

  // Expected (340.1 LIFO over the correct order): the Deathknell resolves FIRST — P1's card arrives while
  // the Equip item is still waiting and Anchor is still a bare 3. Actual: Equip resolves first (Anchor is
  // already 7 with the Blade on) and the draw comes second.
  test("(a) resolution is LIFO — P1 draws 1 off the Deathknell while the Equip item is still on the chain and Anchor is still 3 (340.1)", async () => {
    const game = await board().build();
    await equipAnchor(game);
    await until(game, () => game.p1.hand().length >= 1 || game.chain().length <= 1);
    expect(game.p1.hand()).toHaveLength(1);
    expect(chainIds(game)).toEqual(["botrk"]);
    expect(game.state("anchor").might).toBe(3);
    expect(game.state("botrk").attachedTo).toBeUndefined();
  });

  test("(a) nobody responds: Sentry in the trash, P1 drew exactly 1, BotRK attached to Anchor at bf1 → Anchor is 3 + 4 = 7; chain empty, back to P1's open main phase (718.4)", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    await equipAnchor(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
    expect(game.state("botrk")).toMatchObject({ attachedTo: "anchor", controller: P1, location: "bf1" });
    expect(game.state("anchor")).toMatchObject({ attachments: ["botrk"], baseMight: 3, might: 7, zone: "battlefield-bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.p1.units("bf1")).toEqual(["anchor"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("gust")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });

  test("(a) P2 Gusts Anchor in response: Equip mistargets — BotRK stays loose in base, the Sentry stays dead, the Deathknell card is still drawn, the [order] is not refunded; Anchor is back in P1's hand", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    await equipAnchor(game);
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "anchor" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("anchor")).toBe("hand");
    expect(game.p1.hand()).toContain("anchor");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.deck()).toHaveLength(deck0 - 1); // the Deathknell draw happened regardless
    expect(game.p1.hand()).toHaveLength(2); // drawn card + bounced Anchor
    expect(game.state("botrk")).toMatchObject({ attachedTo: undefined, controller: P1, zone: "base" });
    expect(game.p1.power("order")).toBe(0);
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.p2.energy()).toBe(0);
    // bf1 is now empty of P1 units → control lapses at the Open-state cleanup (190.4.c / 323.6).
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.violations()).toEqual([]);
  });

  // ── (b) the bearer can never be its own fodder ─────────────────────────────────────────────────

  test("(b) with both units present the engine never offers, and rejects, killing the chosen bearer for the cost — {Anchor, kill Anchor} / {Sentry, kill Sentry} (357.3, 358.1)", async () => {
    const game = await board().build();
    const variants = equipVariants(game);
    expect(variants.some((v) => v.sacrificeId === v.unitId)).toBe(false);
    expect(variants.filter((v) => v.unitId === "anchor")).toEqual([{ sacrificeId: "sentry", unitId: "anchor" }]);
    expect((await game.p1.try((p) => p.do("equipCard", { equipmentId: "botrk", sacrificeId: "anchor", unitId: "anchor" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.do("equipCard", { equipmentId: "botrk", sacrificeId: "sentry", unitId: "sentry" }))).ok).toBe(false);
    // …and omitting the fodder is not a way around the mandatory kill either.
    expect((await game.p1.try((p) => p.do("equipCard", { equipmentId: "botrk", unitId: "anchor" }))).ok).toBe(false);
    expect(game.zoneOf("anchor")).toBe("battlefield-bf1");
    expect(game.zoneOf("sentry")).toBe("battlefield-bf1");
    expect(game.p1.power("order")).toBe(1);
    expect(game.chain()).toEqual([]);
  });

  // ── (c) a single friendly unit ─────────────────────────────────────────────────────────────────

  test("(c) Anchor is P1's ONLY unit: Equip is not enumerated at all and forcing it is rejected — nothing dies, no [order] is spent, Anchor stays a bare 3 (358.1, 358.5, 402.3)", async () => {
    const game = await board({ sentry: false }).build();
    expect(equipVariants(game)).toEqual([]);
    expect(game.p1.legal().some((o) => o.moveId === "equipCard")).toBe(false);
    expect((await game.p1.try((p) => p.do("equipCard", { equipmentId: "botrk", sacrificeId: "anchor", unitId: "anchor" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.do("equipCard", { equipmentId: "botrk", unitId: "anchor" }))).ok).toBe(false);
    // An enemy unit cannot pay a "friendly unit" cost either.
    expect((await game.p1.try((p) => p.do("equipCard", { equipmentId: "botrk", sacrificeId: "bystander", unitId: "anchor" }))).ok).toBe(false);
    expect(game.zoneOf("anchor")).toBe("battlefield-bf1");
    expect(game.zoneOf("bystander")).toBe("base");
    expect(game.state("anchor")).toMatchObject({ attachments: [], might: 3 });
    expect(game.state("botrk").attachedTo).toBeUndefined();
    expect(game.p1.power("order")).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (d) unpayable resource half / already attached ─────────────────────────────────────────────

  test("(d) no [order] in the pool (or only off-domain power): the cost is unpayable → Equip is not enumerated and forcing it is rejected; the Sentry lives (402.3)", async () => {
    const none = await board({ order: 0 }).build();
    expect(equipVariants(none)).toEqual([]);
    expect((await none.p1.try((p) => p.do("equipCard", { equipmentId: "botrk", sacrificeId: "sentry", unitId: "anchor" }))).ok).toBe(false);
    expect(none.zoneOf("sentry")).toBe("battlefield-bf1");
    expect(none.chain()).toEqual([]);

    const offDomain = await board({ order: 0 }).resources(P1, { energy: 5, power: { fury: 2 } }).build();
    expect(equipVariants(offDomain)).toEqual([]);
    expect((await offDomain.p1.try((p) => p.do("equipCard", { equipmentId: "botrk", sacrificeId: "sentry", unitId: "anchor" }))).ok).toBe(false);
    expect(offDomain.zoneOf("sentry")).toBe("battlefield-bf1");
  });

  test("(d) BotRK already attached to a third unit: its printed [Equip] is Inactive while Attached (718.2) → no Equip is enumerated for it even with [order] + Sentry available; forcing it is rejected and the Holder keeps it (1 + 4 = 5)", async () => {
    const game = await scenario()
      .resources(P1, { power: { order: 1 } })
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Anchor" }, "anchor")
      .unit(P1, "bf1", WATCHFUL_SENTRY, "sentry")
      .unit(P1, "base", { might: 1, name: "Holder" }, "holder", { equippedWith: ["botrk"] })
      .gear(P1, BOTRK, "botrk", { attachedTo: "holder" })
      .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
      .hand(P2, GUST, "gust")
      .build();
    expect(game.state("holder")).toMatchObject({ attachments: ["botrk"], might: 5 });
    expect(equipVariants(game)).toEqual([]);
    expect(game.p1.legal().some((o) => o.moveId === "equipCard")).toBe(false);
    expect((await game.p1.try((p) => p.do("equipCard", { equipmentId: "botrk", sacrificeId: "sentry", unitId: "anchor" }))).ok).toBe(false);
    expect(game.state("botrk").attachedTo).toBe("holder");
    expect(game.zoneOf("sentry")).toBe("battlefield-bf1");
    expect(game.state("anchor").might).toBe(3);
    expect(game.p1.power("order")).toBe(1);
  });
});
