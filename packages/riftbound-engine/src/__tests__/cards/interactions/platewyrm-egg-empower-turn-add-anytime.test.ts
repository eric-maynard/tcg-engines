/**
 * Interaction: Platewyrm Egg (ven-075-166) × Defender of Tomorrow (ven-194-166) × Discipline (ogn-058-298)
 *
 *   Platewyrm Egg — Gear · Body · 3
 *     "This enters exhausted.
 *      [Empower] — [1], [Exhaust] (Pay the cost: Empower this. Use only if not Empowered.)
 *      [Reaction][>] [Exhaust]: [Add] [1]. If this is [Empowered], [Add] [2] instead."
 *   Defender of Tomorrow — Legend · Mind/Body
 *     "[Empower] [2][rainbow][rainbow]
 *      [1], [Exhaust]: Ready a gear.
 *      [Empowered][>] [1], [Exhaust]: Ready 2 gear."
 *   Discipline — Spell · Calm · 2 · [Reaction] "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Rules: 381 (activated abilities: controller's turn + Open State only), 813.1.c.2 / 813.2 ([Reaction]
 * on an activated ability = ALSO Closed States on any player's turn — inclusive), 429.2 / 429.2.a /
 * 429.3 / 429.3.a (Add abilities finalize+resolve at once, no priority passes; Reaction Adds may be
 * used whenever a cost is being paid), 357.1.a (Add during Pay Costs), 402.2 → 404.1 (choose targets
 * BEFORE paying costs), 406.4 (opponents get a Reaction window before an ability resolves), 827.1 /
 * 827.2 (Empower keyword = "[Cost]: Empower this"), 828.1.b.1 ([Empowered][>] text exists only while
 * Empowered), 414.4 (an [Exhaust] cost needs a ready object).
 *
 * Question: the Egg (played last turn, entered exhausted) is READY at the start of P1's turn; P1 has
 * exactly 2 energy.
 *  (a) Neutral Open on P1's turn — which Egg / legend abilities are listed for P1? Both Egg abilities
 *      cost [Exhaust]: can P1 use both this turn unaided?
 *  (b) P1 activates Egg [Empower] ([1] + exhaust) — a chain item P2 may react to? Then the legend's
 *      "[1],[Exhaust]: Ready a gear" on the Egg — choose-vs-pay order, P2 window, result.
 *  (c) Pool 0, Egg ready + Empowered: is Discipline enumerated? Can the Egg's Add [2] fund it, and does
 *      that Add pass priority / create a chain item?
 *  (d) P2's turn, Egg ready + Empowered, 0 energy: (i) P2's Neutral Open — anything listed for P1?
 *      (ii) P2 plays a spell → Closed, P1 priority: what is listed, and can the Egg fund Discipline?
 *      (iii) is any Egg / legend ability ever listed for P2?
 *  (e) A NON-Empowered ready Egg on P2's turn: can P1 Empower it in the Closed-state window first?
 *
 * Expected: (a) Egg [Empower], Egg Add, legend Ready-a-gear listed; legend [Empower] absent (unaffordable),
 * "Ready 2 gear" absent (828.1.b.1); one [Exhaust] per ready state (414.4). (b) both are ordinary chain
 * items with a P2 window; the legend's gear is chosen at activation before the [1]+exhaust is paid; end:
 * P1 0 energy, Egg ready + Empowered, legend exhausted. (c) the Egg's Add resolves at once, chain-less,
 * P1 keeps the initiative and Discipline is then cast off those 2 — P2's first window is against
 * Discipline. (d)(i) nothing for P1; (ii) Egg Add (+ Discipline once funded) yes, Egg [Empower] / legend
 * abilities no; (iii) never. (e) No — [Empower] has no permissive keyword (381); the Egg Adds only [1].
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EGG = "ven-075-166";
const DEFENDER = "ven-194-166";
const DISCIPLINE = "ogn-058-298";

// Ability indices as the engine enumerates them (printed order).
const EGG_EMPOWER = 1; // #0 is the "enters exhausted" static
const EGG_ADD = 2;
const LEGEND_EMPOWER = 0;
const LEGEND_READY_GEAR = 1;
const LEGEND_READY_2_GEAR = 2;

/** A pip-less 0-cost Action spell for P2 — only its existence as "a spell P2 plays on its turn" matters. */
const POKE = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 0,
  name: "Poke",
  rulesText: "[Action]\nDraw 1.",
  timing: "action",
};

const keys = (game: Game, seat: "p1" | "p2"): string[] => game[seat].legal().map((o) => o.key);
const eggKey = (i: number) => `activateAbility:egg#${i}`;
const legendKey = (i: number) => `activateAbility:legend#${i}`;

/** P1's turn, Neutral Open. Egg READY (not Empowered), legend ready, exactly 2 energy, Discipline in hand. */
function p1Turn() {
  return scenario()
    .resources(P1, { energy: 2 })
    .gear(P1, EGG, "egg")
    .legend(P1, DEFENDER, "legend")
    .unit(P1, "base", { might: 2, name: "Hatchling" }, "ally")
    .hand(P1, DISCIPLINE, "discipline");
}

/** P2's turn, Neutral Open. P1: Egg READY (+ Empowered unless told otherwise), legend ready, Discipline in hand. */
function p2Turn(opts: { empowered?: boolean; p1Energy?: number } = {}) {
  return scenario()
    .active(P2)
    .resources(P1, { energy: opts.p1Energy ?? 0 })
    .gear(P1, EGG, "egg", opts.empowered === false ? undefined : { empowered: true })
    .legend(P1, DEFENDER, "legend")
    .unit(P1, "base", { might: 2, name: "Hatchling" }, "ally")
    .hand(P1, DISCIPLINE, "discipline")
    .hand(P2, POKE, "poke");
}

/** P2 plays Poke and passes → Closed State, P1 holds priority. */
async function toClosedStateWithP1Priority(game: Game): Promise<void> {
  await game.p2.cast("poke");
  await game.p2.passPriority();
  expect(game.chain().map((c) => c.cardId)).toEqual(["poke"]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
}

describe("Platewyrm Egg × Defender of Tomorrow × Discipline — Empower on your turn, Add any time", () => {
  // ── (a) what is listed in P1's Neutral Open ────────────────────────────────────────────────

  test("(a) P1's Neutral Open with 2 energy: Egg [Empower], Egg [Reaction] Add and the legend's 'Ready a gear' are listed; legend [Empower] ([2][rainbow][rainbow] unaffordable) and the [Empowered]-tier 'Ready 2 gear' are ABSENT (827.1, 813.2, 828.1.b.1)", async () => {
    const game = await p1Turn().build();
    expect(game.state("egg")).toMatchObject({ isEmpowered: false, isReady: true });
    const listed = keys(game, "p1");
    expect(listed).toContain(eggKey(EGG_EMPOWER));
    expect(listed).toContain(eggKey(EGG_ADD)); // 813.2 — the Reaction permission is inclusive of your own Open State
    expect(listed).toContain(legendKey(LEGEND_READY_GEAR)); // a gear (the Egg) exists to choose
    expect(listed).not.toContain(legendKey(LEGEND_EMPOWER));
    expect(listed).not.toContain(legendKey(LEGEND_READY_2_GEAR));
  });

  test("(a) control: with [2] + two Power in the pool the legend's [Empower] IS listed — its absence above is purely affordability", async () => {
    const game = await p1Turn().resources(P1, { energy: 2, power: { body: 1, mind: 1 } }).build();
    expect(keys(game, "p1")).toContain(legendKey(LEGEND_EMPOWER));
    expect(keys(game, "p1")).not.toContain(legendKey(LEGEND_READY_2_GEAR)); // still not Empowered
  });

  test("(a) both Egg abilities cost [Exhaust]: once the Add has exhausted the Egg, [Empower] is no longer listed and is rejected (414.4)", async () => {
    const game = await p1Turn().build();
    await game.p1.activate("egg", EGG_ADD);
    expect(game.state("egg").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(3); // 2 + Add [1] (not Empowered)
    expect(keys(game, "p1")).not.toContain(eggKey(EGG_EMPOWER));
    expect(keys(game, "p1")).not.toContain(eggKey(EGG_ADD));
    await expect(game.p1.activate("egg", EGG_EMPOWER)).rejects.toThrow();
    expect(game.state("egg").isEmpowered).toBe(false);
  });

  // ── (b) Egg [Empower], then the legend readies it ──────────────────────────────────────────

  test("(b) Egg [Empower]: [1] + exhaust are paid on activation (404.1), it is a chain item, P2 gets a Reaction window (406.4), and only on resolution does the Egg become Empowered (827.2)", async () => {
    const game = await p1Turn().build();
    await game.p1.activate("egg", EGG_EMPOWER);
    expect(game.p1.energy()).toBe(1);
    expect(game.state("egg")).toMatchObject({ isEmpowered: false, isExhausted: true }); // cost paid, effect pending
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "egg", controller: P1, triggered: false, type: "ability" })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2's window
    expect(game.p2.legal().some((o) => o.verb === "passPriority")).toBe(true);
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("egg")).toMatchObject({ isEmpowered: true, isExhausted: true });
    expect(game.p1.energy()).toBe(1);
  });

  test("(b) legend 'Ready a gear': the gear is CHOSEN as part of activating (402.2 — offered: Egg | other gear) before [1] + exhaust-legend are paid (404.1); chain item names the Egg; P2 window; resolves → Egg READY and still Empowered; P1 at 0 energy, legend exhausted", async () => {
    const game = await p1Turn().gear(P1, { cardType: "gear", name: "Trinket" }, "trinket", { exhausted: true }).build();
    await game.p1.activate("egg", EGG_EMPOWER);
    await game.settle();
    expect(game.state("egg")).toMatchObject({ isEmpowered: true, isExhausted: true });

    // The target is a field of the activation itself — i.e. chosen at step 2, not asked at resolution.
    const field = game.p1.option("activate", "legend")?.fields.find((f) => f.name === "targets");
    expect(field).toMatchObject({ max: 1, min: 1, required: true });
    expect(new Set((field?.options ?? []).flat() as string[])).toEqual(new Set(["egg", "trinket"]));
    expect(game.p1.energy()).toBe(1); // nothing paid while merely looking at the choice
    expect(game.state("legend").isExhausted).toBe(false);

    await game.p1.activate("legend", LEGEND_READY_GEAR, { targets: "egg" });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("legend").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "legend", controller: P1, targets: ["egg"], type: "ability" })]);
    expect(game.state("egg").isExhausted).toBe(true); // not readied until it resolves
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("egg")).toMatchObject({ isEmpowered: true, isReady: true });
    expect(game.state("trinket").isExhausted).toBe(true);
    expect(game.state("legend").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (c) funding Discipline from the Empowered Egg on P1's turn ─────────────────────────────

  test("(c) DESIGN: with pool 0 Discipline is NOT enumerated even though the ready Empowered Egg could Add [2] mid-payment (357.1.a / 429.3) — paying is manual, the Add sub-step is deliberately not modelled (DESIGN.md §Paying costs)", async () => {
    // DESIGN: rules 357.1.a / 429.3 let P1 announce Discipline first and tap the Egg inside Pay Costs;
    // the engine only offers a play the CURRENT pool covers, so P1 taps first, then plays (next test).
    const game = await scenario()
      .resources(P1, { energy: 0 })
      .gear(P1, EGG, "egg", { empowered: true })
      .legend(P1, DEFENDER, "legend")
      .unit(P1, "base", { might: 2, name: "Hatchling" }, "ally")
      .hand(P1, DISCIPLINE, "discipline")
      .build();
    expect(game.state("egg")).toMatchObject({ isEmpowered: true, isReady: true });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("cast", "discipline")).toBe(false);
    await expect(game.p1.cast("discipline", { targets: "ally" })).rejects.toThrow();
    expect(game.zoneOf("discipline")).toBe("hand");
    expect(keys(game, "p1")).toContain(eggKey(EGG_ADD)); // …but the Add that would fund it is right there
  });

  test("(c) the equivalent line: P1 exhausts the Empowered Egg → [Add] [2] lands at once with NO chain item and NO priority change (429.2.a / 429.3.a), Discipline becomes castable and is cast off exactly those 2; P2's first decision of the sequence is the window against DISCIPLINE", async () => {
    // (b)'s end state, seeded: Egg ready + Empowered, pool 0.
    const seeded = await scenario()
      .resources(P1, { energy: 0 })
      .gear(P1, EGG, "egg", { empowered: true })
      .legend(P1, DEFENDER, "legend")
      .unit(P1, "base", { might: 2, name: "Hatchling" }, "ally")
      .hand(P1, DISCIPLINE, "discipline")
      .build();
    const seqBefore = seeded.seq;
    await seeded.p1.activate("egg", EGG_ADD);
    expect(seeded.chain()).toEqual([]);
    expect(seeded.p1.energy()).toBe(2);
    expect(seeded.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // still P1's Neutral Open
    expect(seeded.p2.legal()).toEqual([]); // P2 was never asked anything
    expect(seeded.seq).toBeGreaterThan(seqBefore);
    expect(seeded.p1.can("cast", "discipline")).toBe(true);
    await seeded.p1.cast("discipline", { targets: "ally" });
    expect(seeded.p1.energy()).toBe(0);
    expect(seeded.chain().map((c) => c.cardId)).toEqual(["discipline"]);
    await seeded.p1.passPriority();
    expect(seeded.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(seeded.decision()?.prompt).toContain("Discipline");
    await seeded.p2.passPriority();
    expect(seeded.state("ally").might).toBe(4);
    expect(seeded.zoneOf("discipline")).toBe("trash");
    expect(seeded.violations()).toEqual([]);
  });

  // ── (d) P2's turn ──────────────────────────────────────────────────────────────────────────

  test("(d) Empowered persists across the turn boundary: after P1 ends the turn the Egg is still ready + Empowered on P2's turn and P1's pool is empty", async () => {
    const game = await scenario()
      .gear(P1, EGG, "egg", { empowered: true })
      .legend(P1, DEFENDER, "legend")
      .hand(P1, DISCIPLINE, "discipline")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("egg")).toMatchObject({ isEmpowered: true, isReady: true });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.hand()).toContain("discipline");
  });

  test("(d)(i) P2's Neutral Open: P1 holds no priority — nothing at all is actionable for P1 (no Egg [Empower], no Egg Add, no legend ability, no Discipline)", async () => {
    const game = await p2Turn().build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.decision()).toBeNull();
    expect(game.p1.legal()).toEqual([]);
    expect(game.p1.can("activate", "egg")).toBe(false);
    expect(game.p1.can("cast", "discipline")).toBe(false);
  });

  test("(d)(ii) P2 plays a spell → Closed State, P1 priority: the Egg's [Reaction] Add IS listed (813.1.c.2); Egg [Empower], legend 'Ready a gear' and legend [Empower] are ABSENT for the whole of P2's turn (381)", async () => {
    const game = await p2Turn({ p1Energy: 1 }).build(); // 1 energy so the [1]-cost abilities are not merely unaffordable
    await toClosedStateWithP1Priority(game);
    const listed = keys(game, "p1");
    expect(listed).toContain(eggKey(EGG_ADD));
    expect(listed).not.toContain(eggKey(EGG_EMPOWER)); // already Empowered AND wrong turn
    expect(listed).not.toContain(legendKey(LEGEND_READY_GEAR));
    expect(listed).not.toContain(legendKey(LEGEND_EMPOWER));
    expect(listed).not.toContain(legendKey(LEGEND_READY_2_GEAR));
    await expect(game.p1.activate("legend", LEGEND_READY_GEAR, { targets: "egg" })).rejects.toThrow();
  });

  test("(d)(ii) funding Discipline on P2's turn: at pool 0 Discipline is not yet offered (DESIGN: manual pay); P1 taps the Empowered Egg mid-window → +2 at once, no chain item, P1 STILL holds priority (429.3.a) → Discipline is cast entirely off the Egg; P2's next decision is only in response to Discipline", async () => {
    const game = await p2Turn().build();
    await toClosedStateWithP1Priority(game);
    expect(game.p1.energy()).toBe(0);
    // DESIGN: per 357.1.a P1 could announce Discipline first and tap inside Pay Costs; the engine wants the tap first.
    expect(game.p1.can("cast", "discipline")).toBe(false);
    await game.p1.activate("egg", EGG_ADD);
    expect(game.p1.energy()).toBe(2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["poke"]); // the Add never touched the chain
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // priority did not move
    expect(game.p1.can("cast", "discipline")).toBe(true);
    await game.p1.cast("discipline", { targets: "ally" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["poke", "discipline"]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.decision()?.prompt).toContain("Discipline");
    const p1Hand = game.p1.hand().length;
    await game.settle();
    expect(game.state("ally").might).toBe(4);
    expect(game.p1.hand()).toHaveLength(p1Hand + 1); // Discipline's draw
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.state("egg")).toMatchObject({ isEmpowered: true, isExhausted: true });
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("(d)(iii) no Egg / legend ability is EVER listed for P2 — not in P2's Neutral Open, not while P2 holds chain priority (P2 controls none of them)", async () => {
    const game = await p2Turn().resources(P2, { energy: 5, power: { body: 2, mind: 2 } }).build();
    const p1Stuff = (k: string) => k.startsWith("activateAbility:egg") || k.startsWith("activateAbility:legend");
    expect(keys(game, "p2").filter(p1Stuff)).toEqual([]);
    await game.p2.cast("poke");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(keys(game, "p2").filter(p1Stuff)).toEqual([]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(keys(game, "p2").filter(p1Stuff)).toEqual([]);
    await expect(game.p2.activate("egg", EGG_ADD)).rejects.toThrow();
  });

  // ── (e) negative: no Empower on the opponent's turn ─────────────────────────────────────────

  test("(e) a NON-Empowered ready Egg on P2's turn: in P1's Closed-state window the [Reaction] Add is listed but [Empower] is NOT (381 — no permissive keyword), activating it is rejected, and the Add therefore yields only [1]", async () => {
    const game = await p2Turn({ empowered: false, p1Energy: 1 }).build();
    expect(game.state("egg")).toMatchObject({ isEmpowered: false, isReady: true });
    await toClosedStateWithP1Priority(game);
    const listed = keys(game, "p1");
    expect(listed).toContain(eggKey(EGG_ADD));
    expect(listed).not.toContain(eggKey(EGG_EMPOWER)); // affordable ([1] in pool, Egg ready) — absent purely on timing
    await expect(game.p1.activate("egg", EGG_EMPOWER)).rejects.toThrow();
    expect(game.p1.energy()).toBe(1);
    expect(game.state("egg")).toMatchObject({ isEmpowered: false, isReady: true });
    await game.p1.activate("egg", EGG_ADD);
    expect(game.p1.energy()).toBe(2); // 1 + Add [1], not [2]
    expect(game.state("egg").isEmpowered).toBe(false);
    expect(game.p1.can("cast", "discipline")).toBe(true); // 1 floating + 1 from the Egg happens to cover it here
  });
});
