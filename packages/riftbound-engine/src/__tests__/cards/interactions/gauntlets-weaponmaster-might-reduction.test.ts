/**
 * Interaction: Hextech Gauntlets (unl-188-219) × Sentinel Adept (sfd-008-221) / Veteran Poro (sfd-099-221)
 *
 *   Hextech Gauntlets — Equipment · Fury/Order · +3 Might
 *     "[Equip] [3][C]. This ability's Energy cost is reduced by the Might of the unit you choose."
 *   Sentinel Adept — Unit · Fury · 3 energy · 3 Might · [Weaponmaster]
 *   Veteran Poro   — Unit · Body · 2 energy · 2 Might · [Weaponmaster]
 *
 * Rules:
 *   821.1.c    Weaponmaster = "When you play me, you may choose an Equipment you control … Pay the
 *              cost of its Equip ability, reduced by [A], to attach it to this unit."
 *   821.1.c.2  that Equip cost is computed AS THOUGH Equip were activated choosing the Weaponmaster
 *              unit, including abilities that alter Equip costs (206.1's own example).
 *   821.1.c.5  if the cost can't be paid the Equipment stays where it is.
 *   383.3.a    the leading "you may" is decided at finalization; 383.3.b / 204.3.b: a cost within
 *              instructions LATER in the effect ("Pay … to attach") is paid on RESOLUTION.
 *   444.2      a player instructed to Pay may decline.
 *   356.6      costs floor at 0.
 *   135.2.e.6.c  [C] on a two-domain card = one power of EITHER of its domains (fury | order);
 *   135.2.e.5.b  only [A] that was ADDED to the pool is universal — plain calm power is not.
 *
 * Question: (a) Adept (3 Might) with an empty pool after paying for itself — does Weaponmaster
 * attach the Gauntlets, for how much, and when is that paid? (b) Poro (2 Might) with 0 / 1 energy
 * left? (c) Plain Equip onto a 4-Might and a 1-Might non-Weaponmaster unit — totals, and can calm
 * power pay the pip?
 *
 * Expected: (a) [3][C] − 3 Might → [0][C]; Weaponmaster's −[A] eats the pip → free; paid on
 * resolution after P2's priority window; attaches. (b) [3]−2 → [1] (pip waived): unpayable with 0
 * energy → stays; with 1 energy → may pay 1 and attach, or decline. (c) 4-Might → [0]+[fury|order];
 * 1-Might → [2]+[fury|order]; calm can never pay the pip.
 *
 * NOTE: the engine's card data encodes the Gauntlets' pip as `rainbow` (so any power pays it), the
 * Weaponmaster path does not apply the per-target Might reduction, and Weaponmaster is an immediate
 * pendingChoice rather than a chain item. The BUG tests below record what the rules demand.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GAUNTLETS = "unl-188-219";
const ADEPT = "sfd-008-221";
const PORO = "sfd-099-221";

/** Gauntlets unattached in P1's base + the Weaponmaster unit in hand. */
function wmBoard(unit: string, pool: { energy: number; power?: Record<string, number> }) {
  return scenario()
    .resources(P1, pool)
    .gear(P1, GAUNTLETS, "hg")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, unit, "wm");
}

/** Gauntlets unattached + two plain units (4 Might / 1 Might) for the ordinary Equip path. */
function equipBoard(pool: { energy: number; power?: Record<string, number> }) {
  return scenario()
    .resources(P1, pool)
    .gear(P1, GAUNTLETS, "hg")
    .unit(P1, "base", { might: 4, name: "Bruiser" }, "big")
    .unit(P1, "base", { might: 1, name: "Squire" }, "small");
}

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Unit ids the `equipCard` activation is currently offered for (Gauntlets as the equipment). */
function equipTargetsOffered(game: G): string[] {
  const opt = game.p1.legal().find((o) => o.moveId === "equipCard");
  return (opt?.variants ?? [])
    .filter((v) => v.params.equipmentId === "hg")
    .map((v) => String(v.params.unitId));
}

function weaponmasterOffered(game: G): string[] {
  const d = game.decision();
  return d?.kind === "pick" && d.semantics === "equip" ? d.options.map((o) => String(o.card)) : [];
}

describe("Hextech Gauntlets × Weaponmaster — Might-based Equip reduction (821.1.c.2)", () => {
  // ── (a) Sentinel Adept, empty pool ──────────────────────────────────────────────────────────

  // Expected: [3][C] − 3 (Adept's Might) − [A] = nothing to pay → Gauntlets offered and attached
  // with an empty pool. Actual: the engine prices Weaponmaster off the PRINTED [3] (ignores the
  // Might reduction), so with 0 energy the Gauntlets are not even offered.
  test.failing("BUG: (a) Adept with 0 energy/0 power left — Weaponmaster offers the Gauntlets and attaches them for free (821.1.c.2, 206.1, 356.6)", async () => {
    const game = await wmBoard(ADEPT, { energy: 3 }).build();
    await game.p1.play("wm");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // all 3 went on the Adept
    expect(weaponmasterOffered(game)).toContain("hg");
    await game.p1.pick("hg");
    await game.settle();
    expect(game.state("hg").attachedTo).toBe("wm");
    expect(game.state("wm").attachments).toEqual(["hg"]);
    expect(game.state("wm").might).toBe(6); // 3 + 3
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  // Expected: opting in / choosing the Equipment happens at finalization (383.3.a) but "Pay … to
  // attach" is a cost-within-instructions later in the effect → paid on RESOLUTION (383.3.b,
  // 204.3.b): the trigger sits on the chain, P2 gets priority, and only then does it attach.
  // Actual: Weaponmaster is an off-chain prompt that pays and attaches the instant it is answered.
  test.failing("BUG: (a) Weaponmaster's pay-and-attach happens on resolution — after the pick the trigger is on the chain, P2 has priority, Gauntlets not yet attached (383.3.a/383.3.b/204.3.b)", async () => {
    const game = await wmBoard(ADEPT, { energy: 6, power: { fury: 1 } }).build(); // rich enough for any pricing
    await game.p1.play("wm");
    expect(weaponmasterOffered(game)).toContain("hg");
    await game.p1.pick("hg");
    expect(game.chain().some((i) => i.triggered && i.cardId === "wm")).toBe(true);
    expect(game.state("hg").attachedTo).toBeUndefined();
    expect(game.actingSeat()).toBe(P1); // 312.2.c: the trigger's controller holds priority first …
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // … then P2's reaction window, still before any payment
    expect(game.state("hg").attachedTo).toBeUndefined();
    await game.settle();
    expect(game.state("hg").attachedTo).toBe("wm");
  });

  test("(a) declining Weaponmaster is always allowed: Adept enters at 3 Might, Gauntlets stay unattached in base", async () => {
    const game = await wmBoard(ADEPT, { energy: 6, power: { fury: 1 } }).build();
    await game.p1.play("wm");
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    await game.p1.decline();
    await game.settle();
    expect(game.zoneOf("wm")).toBe("base");
    expect(game.state("wm").might).toBe(3);
    expect(game.state("hg")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } });
  });

  // ── (b) Veteran Poro ────────────────────────────────────────────────────────────────────────

  test("(b) Poro with 0 energy left: the reduced cost [1] can't be paid → Gauntlets stay unattached, Poro stays 2 Might, nothing else happens (821.1.c.5)", async () => {
    const game = await wmBoard(PORO, { energy: 2 }).build();
    await game.p1.play("wm");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle(); // an unpayable/empty optional prompt is declined
    expect(game.zoneOf("wm")).toBe("base");
    expect(game.state("wm")).toMatchObject({ attachments: [], might: 2 });
    expect(game.state("hg")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // Expected: [3] − 2 (Poro's Might) = [1], pip waived by −[A] → with exactly 1 energy left the
  // Gauntlets are offered, P1 pays 1 and they attach (Poro 2+3 = 5). Actual: engine demands the
  // printed [3] → not offered with 1 energy.
  test.failing("BUG: (b) Poro with 1 energy left — Weaponmaster costs exactly [1]: offered, paid, attached, Poro is 5 Might (821.1.c.2)", async () => {
    const game = await wmBoard(PORO, { energy: 3 }).build();
    await game.p1.play("wm");
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(weaponmasterOffered(game)).toContain("hg");
    await game.p1.pick("hg");
    await game.settle();
    expect(game.state("hg").attachedTo).toBe("wm");
    expect(game.state("wm").might).toBe(5);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("(b) Poro with 1 energy left may simply decline (444.2): keeps the 1 energy, nothing attached", async () => {
    const game = await wmBoard(PORO, { energy: 3 }).build();
    await game.p1.play("wm");
    await game.settle(); // passive: declines the optional Weaponmaster prompt
    expect(game.state("hg").attachedTo).toBeUndefined();
    expect(game.state("wm")).toMatchObject({ attachments: [], might: 2 });
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
  });

  // ── (c) Ordinary Equip activation (no Weaponmaster) ─────────────────────────────────────────

  test("(c) Equip is an activated ability: it goes on the chain, P2 gets priority, and the Gauntlets attach (+3 Might) only on resolution", async () => {
    const game = await equipBoard({ energy: 3, power: { fury: 1 } }).build();
    expect(equipTargetsOffered(game).sort()).toEqual(["big", "small"]);
    await game.p1.do("equipCard", { equipmentId: "hg", unitId: "big" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["hg"]);
    expect(game.state("hg").attachedTo).toBeUndefined();
    expect(game.p1.power("fury")).toBe(0); // the [C] pip was paid with fury on activation
    expect(game.actingSeat()).toBe(P1); // 312.2.c: activator holds priority first
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // P2 may react before it resolves
    expect(game.state("hg").attachedTo).toBeUndefined();
    await game.settle();
    expect(game.state("hg").attachedTo).toBe("big");
    expect(game.state("big").might).toBe(7);
    expect(game.chain()).toEqual([]);
  });

  // Onto a 4-Might unit the energy part is 3 − 4 → floors at 0 (356.6); only the pip is paid, so
  // the 3 energy remain.
  test("(c) Equip onto a 4-Might unit costs [0]+[fury|order] — the 3 energy are untouched (821.1.c.2 pricing, 356.6)", async () => {
    const game = await equipBoard({ energy: 3, power: { fury: 1 } }).build();
    await game.p1.do("equipCard", { equipmentId: "hg", unitId: "big" });
    await game.settle();
    expect(game.state("hg").attachedTo).toBe("big");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 0 } });
  });

  // With 0 energy + 1 order power the 4-Might target is affordable ([0]+[order]) but the 1-Might
  // target is not ([2]+[order]) → legal() enumerates Equip per target, for "big" only.
  test("(c) with 0 energy + 1 order: Equip is offered onto the 4-Might unit only, not the 1-Might one — per-target totals differ", async () => {
    const game = await equipBoard({ energy: 0, power: { order: 1 } }).build();
    expect(equipTargetsOffered(game)).toEqual(["big"]);
    await game.p1.do("equipCard", { equipmentId: "hg", unitId: "big" });
    await game.settle();
    expect(game.state("hg").attachedTo).toBe("big");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  });

  // 1-Might target → [3]−1 = [2] + the pip: exactly affordable with 2 energy + 1 fury, leaving an
  // empty pool.
  test("(c) Equip onto a 1-Might unit costs [2]+[fury|order] — legal with exactly 2 energy + 1 fury and empties the pool", async () => {
    const game = await equipBoard({ energy: 2, power: { fury: 1 } }).build();
    expect(equipTargetsOffered(game)).toContain("small");
    await game.p1.do("equipCard", { equipmentId: "hg", unitId: "small" });
    await game.settle();
    expect(game.state("hg").attachedTo).toBe("small");
    expect(game.state("small").might).toBe(4);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  // Expected: [C] on a Fury/Order card is one FURY or ORDER power (135.2.e.6.c); ordinary calm
  // power cannot stand in for it (only ADDED [A] is universal, 135.2.e.5.b) → no Equip offered and
  // a forced attempt is rejected. Actual: the card data spells the pip `rainbow`, so calm pays it.
  test.failing("BUG: (c) calm power cannot pay the Gauntlets' [C] pip — with 3 energy + 1 calm no Equip activation is legal (135.2.e.6.c / 135.2.e.5.b)", async () => {
    const game = await equipBoard({ energy: 3, power: { calm: 1 } }).build();
    expect(equipTargetsOffered(game)).toEqual([]);
    const r = await game.p1.try((p) => p.do("equipCard", { equipmentId: "hg", unitId: "big" }));
    expect(r.ok).toBe(false);
    expect(game.state("hg").attachedTo).toBeUndefined();
    expect(game.p1.resources()).toEqual({ energy: 3, power: { calm: 1 } });
  });

  test("(c) either of the card's own domains pays the pip: order power works exactly like fury", async () => {
    const game = await equipBoard({ energy: 3, power: { order: 1 } }).build();
    expect(equipTargetsOffered(game)).toContain("big");
    await game.p1.do("equipCard", { equipmentId: "hg", unitId: "big" });
    await game.settle();
    expect(game.state("hg").attachedTo).toBe("big");
    expect(game.p1.power("order")).toBe(0);
  });

  test("(c) with no power at all the pip is unpayable → Equip is not offered onto any unit, even with plenty of energy", async () => {
    const game = await equipBoard({ energy: 5 }).build();
    expect(equipTargetsOffered(game)).toEqual([]);
    const r = await game.p1.try((p) => p.do("equipCard", { equipmentId: "hg", unitId: "big" }));
    expect(r.ok).toBe(false);
    expect(game.state("hg").attachedTo).toBeUndefined();
  });
});
