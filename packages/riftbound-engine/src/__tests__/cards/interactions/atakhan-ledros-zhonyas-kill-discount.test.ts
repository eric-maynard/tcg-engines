/**
 * Interaction: Atakhan (unl-170-219) · Unit · Order · 10 + [order]×3 · 7 Might
 *     "You may kill a friendly unit as an additional cost to play me. If you do, I cost [1] less for each
 *      Energy it costs and [order] less for each Power it costs. [Ganking] When I attack, …"
 *   × Commander Ledros (ogn-231-298) · Unit · Order · printed 6 + [order]×4 · 8 Might · [Deflect] [Ganking]
 *   × Zhonya's Hourglass (ogn-077-298) · Gear · Calm · 2
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Rules: 355.1.a (optional additional cost declared in step 2), 356.2.b / 356.2.b.1 (added in 356.2, its
 * linked discount applied in 356.4), 356.4.f, 356.6 (Energy/Power can't go below 0), 357.2 (non-standard
 * costs paid in step 4), 357.2.a (a cost replaced by a replacement effect is still PAID — the CR's own
 * Cruel Patron × Zhonya's example), 370.1.a.1 (Zhonya's replacement), 355.10.c (a unit referenced only as
 * a cost is not targeted → Deflect never applies), 206 (cost lookups read the PRINTED cost; the CR example
 * is Atakhan), 143.4 (units enter exhausted), 358.2.
 *
 * Question: P1's turn. Base: Ledros + face-up Zhonya's. Hand: Atakhan. Pool {energy 4, order 0}.
 *   (a) Is Atakhan legal, and via which variant?  (b) Kill Ledros → Zhonya's replaces the death: is the
 *   cost paid / discount kept, and what is the board?  (c) Same without Zhonya's.  (d) Only friendly unit
 *   is a 2-cost/0-power vanilla — legal at 4 energy?  (e) Does Deflect / Ledros's own discount matter?
 *
 * Expected: (a) yes, ONLY the kill-Ledros variant (10−6 = 4 energy, 3−4 → 0 order); the full-price
 * variant is unaffordable and must not be enumerated. (b) Zhonya's → trash, Ledros alive + exhausted in
 * base (healed), cost counts as paid so the discount stands: energy 4→0, order stays 0, Atakhan enters
 * base exhausted. (c) Ledros → trash, same [4] paid, Atakhan enters. (d) 10−2 = 8 > 4 → not legal.
 * (e) No: no [rainbow] is needed (cost, not a target), and the discount reads Ledros's printed 6/[order]×4.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ATAKHAN = "unl-170-219";
const LEDROS = "ogn-231-298";
const ZHONYAS = "ogn-077-298";

function board(opts: { zhonyas: boolean; order?: number; ledrosDamage?: number }) {
  const b = scenario()
    .resources(P1, { energy: 4, power: { order: opts.order ?? 0 } })
    .unit(P1, "base", LEDROS, "ledros", opts.ledrosDamage ? { damage: opts.ledrosDamage } : undefined)
    .unit(P2, "base", { might: 2, name: "Bystander" }, "foe")
    .hand(P1, ATAKHAN, "ata");
  return opts.zhonyas ? b.gear(P1, ZHONYAS, "zh") : b;
}

describe("Atakhan × Commander Ledros × Zhonya's — replaced cost-kill still pays for the discount", () => {
  // ---- (a) legality / variant enumeration -----------------------------------------------------------

  test("(a) premise: Ledros's printed cost is 6 energy + [order]×4 (what Atakhan's discount reads, rule 206)", async () => {
    const game = await board({ zhonyas: true }).build();
    const s = game.state("ledros");
    expect(s.energyCost).toBe(6);
    expect(s.powerCost).toEqual(["order", "order", "order", "order"]);
    expect(s.keywords).toContain("Deflect");
    expect(game.state("ata").energyCost).toBe(10);
    expect(game.state("ata").powerCost).toEqual(["order", "order", "order"]);
  });

  test("(a) with {energy 4, order 0} Atakhan IS in p1.legal() — but only via the 'kill Ledros' variant; no full-price / no-kill variant is enumerated (356.2.b.1, 356.4, 356.6)", async () => {
    const game = await board({ zhonyas: true }).build();
    expect(game.p1.can("play", "ata")).toBe(true);
    const opt = game.p1.option("playUnit", "ata");
    expect(opt).toBeDefined();
    // Every variant pays the optional cost and names Ledros as the kill.
    expect(opt?.variants.length).toBeGreaterThan(0);
    for (const v of opt?.variants ?? []) {
      expect(v.params.paidAdditionalCost).toBe(true);
      expect(v.params.sacrificeId).toBe("ledros");
    }
    const pay = opt?.fields.find((f) => f.arg === "payOptional");
    expect(pay?.options).toEqual([true]);
    const sac = opt?.fields.find((f) => f.arg === "sacrifice");
    expect(sac?.options).toEqual(["ledros"]); // the enemy Bystander is never a candidate
  });

  test("(a) the no-kill play (10 + [order]×3) is rejected at 4 energy", async () => {
    const game = await board({ zhonyas: true }).build();
    const r = await game.p1.try((p) => p.play("ata", { payOptional: false }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("ata")).toBe("hand");
    expect(game.p1.energy()).toBe(4);
  });

  // ---- (b) with Zhonya's: the 357.2.a case ----------------------------------------------------------

  test("(b) kill Ledros with Zhonya's out: the Hourglass is killed instead (→ trash); Ledros stays in base, exhausted, healed (370.1.a.1)", async () => {
    const game = await board({ zhonyas: true, ledrosDamage: 2 }).build();
    expect(game.state("ledros").damage).toBe(2);
    await game.p1.play("ata", { payOptional: true, sacrifice: "ledros" });
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("ledros")).toBe("base");
    expect(game.p1.units("base")).toContain("ledros");
    expect(game.state("ledros").isExhausted).toBe(true);
    expect(game.state("ledros").damage).toBe(0);
    expect(game.p1.trash()).toEqual(["zh"]);
  });

  test("(b) the replaced kill still counts as PAID → 'if you do' discount stands: energy 4→0, order stays 0, Atakhan enters base exhausted (357.2.a, 356.4.f, 143.4)", async () => {
    const game = await board({ zhonyas: true }).build();
    await game.p1.play("ata", { payOptional: true, sacrifice: "ledros" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("ata")).toBe("base");
    expect(game.p1.units("base")).toEqual(expect.arrayContaining(["ata", "ledros"]));
    expect(game.state("ata").isExhausted).toBe(true);
    expect(game.state("ata").might).toBe(7);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("foe")).toBe("base");
  });

  test("(b) Power can't go below 0 (356.6): with 1 spare [order] in the pool, [order]×3 − [order]×4 charges 0 — the spare order is untouched", async () => {
    const game = await board({ zhonyas: true, order: 1 }).build();
    await game.p1.play("ata", { payOptional: true, sacrifice: "ledros" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 1 } });
    expect(game.zoneOf("ata")).toBe("base");
  });

  test("(b) Zhonya's is mandatory — no yes/no or ordering prompt; the play settles straight back to an open main phase", async () => {
    const game = await board({ zhonyas: true }).build();
    await game.p1.play("ata", { payOptional: true, sacrifice: "ledros" });
    const d = game.decision();
    expect(d?.kind === "yes-no" || d?.kind === "order").toBe(false);
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.actingSeat()).toBe(P1);
  });

  // ---- (c) contrast: no Zhonya's --------------------------------------------------------------------

  test("(c) without Zhonya's: Ledros is killed as the cost (→ trash), the same [4] is paid, Atakhan enters base exhausted", async () => {
    const game = await board({ zhonyas: false }).build();
    expect(game.p1.can("play", "ata")).toBe(true);
    await game.p1.play("ata", { payOptional: true, sacrifice: "ledros" });
    await game.settle();
    expect(game.zoneOf("ledros")).toBe("trash");
    expect(game.p1.trash()).toEqual(["ledros"]);
    expect(game.zoneOf("ata")).toBe("base");
    expect(game.state("ata").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.p1.units("base")).toEqual(["ata"]);
  });

  // ---- (d) contrast: a cheap sacrifice is not enough ------------------------------------------------

  test("(d) only friendly unit is a 2-cost/0-power vanilla: 10−2 = 8 + [order]×3 is not payable at {4, 0} → Atakhan absent from legal()", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { order: 0 } })
      .unit(P1, "base", { energyCost: 2, might: 2, name: "Squire" }, "squire")
      .gear(P1, ZHONYAS, "zh")
      .hand(P1, ATAKHAN, "ata")
      .build();
    expect(game.p1.can("play", "ata")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "ata")).toBe(false);
    const r = await game.p1.try((p) => p.play("ata", { payOptional: true, sacrifice: "squire" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("squire")).toBe("base");
    expect(game.zoneOf("zh")).toBe("base");
  });

  test("(d) control: the same Squire DOES enable him at {8, order 3} (discount −2 energy, −0 order)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { order: 3 } })
      .unit(P1, "base", { energyCost: 2, might: 2, name: "Squire" }, "squire")
      .hand(P1, ATAKHAN, "ata")
      .build();
    expect(game.p1.can("play", "ata")).toBe(true);
    await game.p1.play("ata", { payOptional: true, sacrifice: "squire" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.zoneOf("ata")).toBe("base");
  });

  // ---- (e) Deflect / Ledros's own discount are irrelevant -------------------------------------------

  test("(e) Deflect never applies: Ledros is a COST, not a target (355.10.c) — the play needs no [rainbow] and P1 has none", async () => {
    const game = await board({ zhonyas: false }).build();
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.state("ledros").keywords).toContain("Deflect");
    await game.p1.play("ata", { payOptional: true, sacrifice: "ledros" });
    await game.settle();
    expect(game.zoneOf("ata")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  });

  test("(e) the discount reads Ledros's PRINTED cost (206): a Ledros that was himself played at a discount (kill 2 → paid [6]+[order]×2) still discounts Atakhan by 6 / [order]×4", async () => {
    // Play Ledros for real first, killing two pawns (−[order]×2), then play Atakhan killing that Ledros.
    const game = await scenario()
      .resources(P1, { energy: 6 + 4, power: { order: 2 } })
      .unit(P1, "base", { energyCost: 1, might: 1, name: "PawnA" }, "pawnA")
      .unit(P1, "base", { energyCost: 1, might: 1, name: "PawnB" }, "pawnB")
      .hand(P1, LEDROS, "ledros")
      .hand(P1, ATAKHAN, "ata")
      .build();
    await game.p1.play("ledros", { costs: { paid: { "kill-any": ["pawnA", "pawnB"] } } });
    await game.settle();
    expect(game.zoneOf("ledros")).toBe("base");
    expect(game.zoneOf("pawnA")).toBe("trash");
    expect(game.zoneOf("pawnB")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { order: 0 } }); // paid 6 + [order]×2
    // Now Atakhan: printed Ledros = 6 + [order]×4 → 4 energy, 0 order.
    expect(game.p1.can("play", "ata")).toBe(true);
    await game.p1.play("ata", { payOptional: true, sacrifice: "ledros" });
    await game.settle();
    expect(game.zoneOf("ledros")).toBe("trash");
    expect(game.zoneOf("ata")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  });
});
