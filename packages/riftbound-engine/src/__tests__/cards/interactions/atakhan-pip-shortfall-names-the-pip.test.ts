/**
 * Interaction: Atakhan (unl-170-219) · Unit · Order · [10] + [order][order][order] · 7 Might
 *     "You may kill a friendly unit as an additional cost to play me. If you do, I cost [1] less for
 *      each Energy it costs and [order] less for each Power it costs. [Ganking] When I attack, …"
 *   × Magma Wurm (ogn-011-298) · Unit · Fury · [8] + [fury] · 8 Might · "Other friendly units enter ready."
 *
 * Rules: 355.1.a (the optional additional cost is declared during finalization of the play, before any
 * payment check completes), 204.2.a / 206 (a cost lookup reads the PRINTED cost — the CR names Atakhan),
 * 356.6 (a cost never goes below 0), 357.1 (the total owed is Energy AND Power), 163.2 (Power pays Domain
 * pips), 477.3.a (a play whose cost cannot be paid is not a legal play).
 *
 * Question: P1 holds Atakhan and controls Magma Wurm, with 6 Energy floated from NON-order runes and zero
 * [order] Power in the pool. Taking the optional kill (Magma Wurm: 8 Energy, 1 Power) drops Atakhan to
 * [2][order][order]: the Energy is now MORE than sufficient and only the two pips are missing.
 *   NO side  — does the client (a) say WHY it cannot be paid, naming the missing [order] pips rather than
 *   reporting "not enough energy"; (b) name the fix (recycle an order rune); (c) let the player back out
 *   with Magma Wurm alive and Atakhan in hand?
 *   YES side — with two [order] Power pooled, does the menu QUOTE the reduced [2][order][order] and charge
 *   exactly that, killing Magma Wurm exactly once?
 *
 * Expected: killing Magma Wurm reduces Atakhan by [1] per Energy (8) and [order] per Power pip (1) →
 * [2][order][order] (356.6 floors at 0). Six colourless Energy leaves both pips unpaid (357.1 / 163.2), so
 * the play is NOT offered at all (477.3.a) — nothing is charged, nothing dies, and the seat still has a
 * menu. The pay line the client shows must price the tuple the enumerator offered (the KILL variant), i.e.
 * "recycle a rune for [order][order]" — see the BUG facet: today it prices Atakhan's undiscounted cost and
 * so also claims 4 Energy are missing, which is exactly the "not enough energy" misreport.
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";
import type { Game } from "../../../harness";

const ATAKHAN = "unl-170-219";
const WURM = "ogn-011-298";

/** The seat's own account of a play it cannot afford: card + what is still owed + how to fix it. */
function payLine(game: Game, card: string) {
  const d = game.decision();
  if (!d || d.kind !== "action") {
    return undefined;
  }
  return d.reachablePlays?.find((r) => r.card === game.card(card));
}

/** NO side: 6 Energy floated, no [order] Power pooled, two [order] runes still un-recycled. */
function shortOnPips(energy = 6) {
  return scenario()
    .resources(P1, { energy })
    .runes(P1, "order", 2)
    .unit(P1, "base", WURM, "wurm")
    .hand(P1, ATAKHAN, "ata");
}

/** YES side: the same board with the two pips already in the pool. */
function pipsPooled(order = 2) {
  return scenario()
    .resources(P1, { energy: 6, power: { order } })
    .unit(P1, "base", WURM, "wurm")
    .hand(P1, ATAKHAN, "ata");
}

describe("Atakhan × Magma Wurm — a pip-only shortfall must be named as pips, not as energy", () => {
  // ---- premise: the arithmetic the whole question rests on ------------------------------------------

  test("premise: printed costs are Atakhan [10]+[order]×3 and Magma Wurm [8]+[fury] → the paid kill leaves [2][order][order] (206, 356.6)", async () => {
    const game = await pipsPooled().build();
    expect(game.state("ata").energyCost).toBe(10);
    expect(game.state("ata").powerCost).toEqual(["order", "order", "order"]);
    expect(game.state("wurm").energyCost).toBe(8);
    expect(game.state("wurm").powerCost).toEqual(["fury"]);
    const quote = game.p1.option("playUnit", "ata")?.variants[0]?.params.quote as {
      energy: number;
      power: Record<string, number>;
    };
    expect(quote.energy).toBe(10 - 8);
    expect(quote.power).toEqual({ order: 3 - 1 });
  });

  // ---- NO side -------------------------------------------------------------------------------------

  test("NO: two pips short → Atakhan is not a legal play and is absent from the menu (477.3.a, 357.1)", async () => {
    const game = await shortOnPips().build();
    expect(game.p1.power("order")).toBe(0);
    expect(game.p1.can("play", "ata")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "ata")).toBe(false);
  });

  test("NO: Energy cannot stand in for a Domain pip — even 20 floating Energy leaves the play illegal (163.2, 357.1)", async () => {
    const game = await shortOnPips(20).build();
    expect(game.p1.energy()).toBe(20);
    expect(game.p1.can("play", "ata")).toBe(false);
  });

  test("NO: (c) backing out costs nothing — the refused play leaves Magma Wurm alive, Atakhan in hand, the pool untouched, and a live menu (358.5)", async () => {
    const game = await shortOnPips().build();
    const r = await game.p1.try((p) => p.play("ata", { payOptional: true, sacrifice: "wurm" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("wurm")).toBe("base");
    expect(game.zoneOf("ata")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 6, power: {} });
    expect(game.p1.trash()).toEqual([]);
    expect(game.chain()).toEqual([]);
    // Nothing hangs: the seat is still on its own open main-phase decision.
    expect(game.decision()?.kind).toBe("action");
    expect(game.actingSeat()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("NO: (a)+(b) the card is still explained rather than silently inert — a pay line names the missing [order] pips and the recycle that fixes them", async () => {
    const game = await shortOnPips().build();
    const line = payLine(game, "ata");
    expect(line).toBeDefined();
    expect(line?.needsAdd.power?.order).toBeGreaterThan(0);
    expect(line?.needsAdd.reason).toContain("[order]");
    expect(line?.needsAdd.reason).toContain("recycle");
  });

  test.failing("BUG: the pay line prices Atakhan's UNDISCOUNTED cost, so a pip-only shortfall is reported as 4 missing Energy (355.1.a, 356.6, 357.1)", async () => {
    // Expected: the enumerated variant pays the kill, so what is owed is [2][order][order] − pool {6, 0}
    //   = exactly [order][order] and NO Energy ("recycle a rune for [order][order] first").
    // Actual:   needsAdd = { energy: 4, power: { order: 3 } }, reason "tap 4 runes and recycle a rune for
    //   [order][order][order] first" — the card's printed 10/[order]×3 minus the pool, i.e. the shortfall
    //   of a variant the enumerator never offered. That is the "not enough energy" misreport.
    const game = await shortOnPips().build();
    const line = payLine(game, "ata");
    expect(line?.needsAdd.energy).toBeUndefined();
    expect(line?.needsAdd.power).toEqual({ order: 2 });
    expect(line?.needsAdd.reason).toBe("recycle a rune for [order][order] first");
  });

  test("NO: the named fix really is the fix — recycling the two [order] runes makes the play legal and quotes [2][order][order]", async () => {
    const game = await shortOnPips().build();
    const [r1, r2] = game.p1.runes();
    await game.p1.recycleRune(r1, "order");
    expect(game.p1.can("play", "ata")).toBe(false); // one pip is still missing
    await game.p1.recycleRune(r2, "order");
    expect(game.p1.power("order")).toBe(2);
    expect(game.p1.can("play", "ata")).toBe(true);
    const quote = game.p1.option("playUnit", "ata")?.variants[0]?.params.quote as {
      energy: number;
      power: Record<string, number>;
    };
    expect(quote).toEqual(expect.objectContaining({ energy: 2, power: { order: 2 } }));
  });

  test("NO: one pip is not two — with a single [order] pooled the play is still absent (357.1)", async () => {
    const game = await pipsPooled(1).build();
    expect(game.p1.can("play", "ata")).toBe(false);
    expect(game.zoneOf("wurm")).toBe("base");
  });

  // ---- YES side ------------------------------------------------------------------------------------

  test("YES: the menu offers only the kill variant and quotes the REDUCED [2][order][order] (355.1.a, 356.6)", async () => {
    const game = await pipsPooled().build();
    expect(game.p1.can("play", "ata")).toBe(true);
    const opt = game.p1.option("playUnit", "ata");
    expect(opt?.fields.find((f) => f.arg === "sacrifice")?.options).toEqual(["wurm"]);
    expect(opt?.fields.find((f) => f.arg === "payOptional")?.options).toEqual([true]);
    for (const v of opt?.variants ?? []) {
      expect(v.params.sacrificeId).toBe("wurm");
      expect(v.params.quote).toEqual(expect.objectContaining({ energy: 2, power: { order: 2 } }));
    }
  });

  test("YES: the quoted cost is the charged cost — 6→4 Energy, [order]×2 → 0, and nothing else moves", async () => {
    const game = await pipsPooled().build();
    await game.p1.play("ata", { payOptional: true, sacrifice: "wurm" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 4, power: { order: 0 } });
    expect(game.chain()).toEqual([]);
  });

  test.failing("BUG: the costPaid oracle reads Atakhan's PRINTED [10] and flags the correctly-charged discounted play as a violation (356.4, 206)", async () => {
    // Expected: paying [2][order][order] after the declared kill is the whole cost (357.1), so no
    // invariant fires. Actual: violations() carries
    //   costPaid "playUnit Atakhan: energy cost 10 but pool 6→4"
    // — the checker exempts costModifier / viaFlow / self-scaling statics but not the optional
    // additional-cost discount, so every legal Atakhan play trips its own oracle.
    const game = await pipsPooled().build();
    await game.p1.play("ata", { payOptional: true, sacrifice: "wurm" });
    await game.settle();
    expect(game.violations()).toEqual([]);
  });

  test("YES: Magma Wurm is killed exactly once as the additional cost, and Atakhan enters base with [Ganking] (357.2, 143.4)", async () => {
    const game = await pipsPooled().build();
    await game.p1.play("ata", { payOptional: true, sacrifice: "wurm" });
    await game.settle();
    expect(game.zoneOf("wurm")).toBe("trash");
    expect(game.p1.trash()).toEqual(["wurm"]); // exactly one copy, killed once
    expect(game.zoneOf("ata")).toBe("base");
    expect(game.p1.units("base")).toEqual(["ata"]);
    expect(game.state("ata").keywords).toContain("Ganking");
    expect(game.state("ata").might).toBe(7);
    expect(game.state("ata").isExhausted).toBe(true);
  });
});
