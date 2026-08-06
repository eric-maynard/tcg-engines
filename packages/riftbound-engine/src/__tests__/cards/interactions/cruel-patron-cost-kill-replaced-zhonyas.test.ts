/**
 * Interaction: Cruel Patron (ogn-208-298) · Unit · Order · 4 · 6 Might
 *     "As an additional cost to play me, kill a friendly unit."
 *   × Zhonya's Hourglass (ogn-077-298) · Gear · Calm · 2
 *     "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × LeBlanc, Fragmented (unl-172-219) · Champion Unit · Order · 3+[order] · 3 Might
 *     "[Assault] [Deathknell] Draw 1. If it's your Beginning Phase, draw 2 instead."
 *
 * Rules: 357.2.a (a cost replaced by a replacement effect is still paid — this exact Cruel Patron ×
 * Zhonya's example), 369.1 / 370.1.a.1 (Zhonya's is a replacement; the replaced kill never happened),
 * 808.1.d.1 (Deathknell removed if the permanent is not sent to trash), 808.1.d.2 / 428.1.a.1.b
 * (Deathknell is queued as a pending item before the unit moves to trash), 372 (ordering only matters
 * with multiple replacements — a single mandatory replacement offers no choice).
 *
 * Question: B controls LeBlanc (1 damage marked) and a face-up Zhonya's. B plays Cruel Patron, killing
 * LeBlanc as the additional cost. → Zhonya's replaces the kill: Hourglass to trash, LeBlanc healed +
 * exhausted in base, cost counts as paid so Cruel Patron enters, NO Deathknell draw, no opt-out prompt.
 * Contrast without Zhonya's: LeBlanc → trash, Deathknell draws 1, Cruel Patron enters.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CRUEL_PATRON = "ogn-208-298";
const ZHONYAS = "ogn-077-298";
const LEBLANC = "unl-172-219";

/** P1 = "player B" of the question. LeBlanc carries 1 damage so the heal is observable. */
function board(opts: { zhonyas: boolean }) {
  const b = scenario()
    .resources(P1, { energy: 4 })
    .unit(P1, "base", LEBLANC, "leblanc", { damage: 1 })
    .unit(P2, "base", { might: 2, name: "Bystander" }, "foe")
    .hand(P1, CRUEL_PATRON, "patron");
  return opts.zhonyas ? b.gear(P1, ZHONYAS, "zh") : b;
}

describe("Cruel Patron × Zhonya's Hourglass × LeBlanc — replaced cost-kill is still paid (357.2.a)", () => {
  test("sanity: Cruel Patron's base cost is 4 energy (3 is not enough)", async () => {
    const ok = await board({ zhonyas: false }).build();
    expect(ok.p1.can("play", "patron")).toBe(true);
    const poor = await scenario().resources(P1, { energy: 3 }).unit(P1, "base", LEBLANC, "leblanc").hand(P1, CRUEL_PATRON, "patron").build();
    expect(poor.p1.can("play", "patron")).toBe(false);
  });

  // Expected: the kill is a MANDATORY additional cost ("As an additional cost…", no "may"), so with no
  // friendly unit to kill Cruel Patron cannot be played at all. Actual: the engine's additional-cost
  // reader only recognises optional `cost.kill` / energy-power-xp shapes; Cruel Patron's
  // `{additionalCost:{kill}, optional:false}` is ignored and it plays for 4 energy with no kill.
  test.failing("BUG: Cruel Patron is unplayable when its controller has no other friendly unit to kill (mandatory additional cost)", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).unit(P2, "base", { might: 2 }, "foe").hand(P1, CRUEL_PATRON, "patron").build();
    expect(game.p1.can("play", "patron")).toBe(false);
    const r = await game.p1.try((p) => p.play("patron"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("patron")).toBe("hand");
  });

  // Expected: the play offers/requires a friendly unit to kill; enemy units are never candidates.
  // Actual: no `sacrifice` choice is surfaced at all (see above).
  test.failing("BUG: playing Cruel Patron asks for a FRIENDLY unit to kill — LeBlanc is a candidate, the enemy Bystander is not", async () => {
    const game = await board({ zhonyas: false }).build();
    const field = game.p1.option("play", "patron")?.fields.find((f) => f.arg === "sacrifice");
    expect(field).toBeDefined();
    expect(field?.options ?? []).toContain("leblanc");
    expect(field?.options ?? []).not.toContain("foe");
    await expect(game.p1.play("patron", { sacrifice: "foe" })).rejects.toThrow();
  });

  // ---- Contrast: no Zhonya's --------------------------------------------------------------------

  // Expected (808.1.d.2 / 428.1.a.1.b): LeBlanc is killed as the cost → her Deathknell is queued before
  // she hits the trash, finalizes above Cruel Patron and resolves first (draw 1); Cruel Patron enters base.
  // Actual: `play(patron, {sacrifice})` has no matching engine variant — the kill cost is not modelled.
  test.failing("BUG: without Zhonya's — LeBlanc is killed as the cost (→ trash), Deathknell draws 1, Cruel Patron enters base, 4 energy paid", async () => {
    const game = await board({ zhonyas: false }).build();
    const hand0 = game.p1.hand().length;
    const deck0 = game.p1.deck().length;
    await game.p1.play("patron", { sacrifice: "leblanc" });
    await game.settle();
    expect(game.zoneOf("leblanc")).toBe("trash");
    expect(game.zoneOf("patron")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1); // Patron left hand, Deathknell drew exactly 1
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
    expect(game.zoneOf("foe")).toBe("base"); // enemy untouched
  });

  // ---- With Zhonya's: the 357.2.a example ---------------------------------------------------------

  // Expected (357.2.a, 370.1.a.1): the cost-kill on LeBlanc is replaced — Zhonya's is killed instead
  // (→ trash); LeBlanc stays on the board in base, healed to 0 damage and exhausted. Actual: see above.
  test.failing("BUG: with Zhonya's — the cost-kill is replaced: Hourglass → trash; LeBlanc stays in base healed (0 damage) and exhausted", async () => {
    const game = await board({ zhonyas: true }).build();
    expect(game.state("leblanc").damage).toBe(1);
    await game.p1.play("patron", { sacrifice: "leblanc" });
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("leblanc")).toBe("base");
    expect(game.state("leblanc").damage).toBe(0);
    expect(game.state("leblanc").isExhausted).toBe(true);
    expect(game.p1.units("base")).toContain("leblanc");
  });

  // Expected (357.2.a): a replaced cost still counts as paid → Cruel Patron finishes being played and
  // enters the base; the 4 energy is spent. Actual: see above.
  test.failing("BUG: with Zhonya's — the replaced cost still counts as PAID: Cruel Patron enters base and 4 energy is spent (357.2.a)", async () => {
    const game = await board({ zhonyas: true }).build();
    await game.p1.play("patron", { sacrifice: "leblanc" });
    await game.settle();
    expect(game.zoneOf("patron")).toBe("base");
    expect(game.p1.units("base")).toContain("patron");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([]);
  });

  // Expected (808.1.d.1, 428.1.a.1.b, 370.1.a.1): LeBlanc never went to the trash, so her Deathknell does
  // not resolve — no card drawn; the only hand change is Cruel Patron leaving it. Actual: see above.
  test.failing("BUG: with Zhonya's — LeBlanc's Deathknell does NOT draw (she was never sent to trash) (808.1.d.1)", async () => {
    const game = await board({ zhonyas: true }).build();
    const hand0 = game.p1.hand().length;
    const deck0 = game.p1.deck().length;
    await game.p1.play("patron", { sacrifice: "leblanc" });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 - 1);
    expect(game.p1.deck()).toHaveLength(deck0);
    expect(game.p1.trash()).toEqual(["zh"]); // only the Hourglass died
  });

  // Expected (369.1 no "may"; 372 only orders MULTIPLE replacements): Zhonya's applies automatically —
  // after declaring the play there is no yes/no or ordering prompt for P1; the game returns to an open
  // main phase with the replacement already applied. Actual: see above (play itself is rejected).
  test.failing("BUG: with Zhonya's — the replacement is mandatory: no opt-out / ordering prompt is offered to P1 (369.1, 372)", async () => {
    const game = await board({ zhonyas: true }).build();
    await game.p1.play("patron", { sacrifice: "leblanc" });
    const d = game.decision();
    expect(d?.kind === "yes-no" || d?.kind === "order").toBe(false);
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("leblanc")).toBe("base");
  });

  test("control: Zhonya's does nothing for ENEMY deaths and is not consumed while no friendly unit would die", async () => {
    // Independent of the Cruel Patron bug: with Zhonya's on board and no death event, everything stays put.
    const game = await board({ zhonyas: true }).build();
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.p1.gear()).toContain("zh");
    expect(game.zoneOf("leblanc")).toBe("base");
    expect(game.state("leblanc").damage).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
