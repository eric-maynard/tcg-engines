/**
 * Interaction: Riptide Rex (ogn-092-298) · Unit · Mind · [6]+[mind]×2 · 6 Might
 *     "When you play me, deal 6 to an enemy unit at a battlefield."
 *   × Pouty Poro (ogn-013-298) · Unit · Fury · 2 Might
 *     "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)"
 *   × Daughter of the Void (ogn-247-298) · Legend · Kai'Sa
 *     "[Exhaust]: [Reaction] — [Add] [rainbow]. Use only to play spells."
 *
 * Question. P1's legend is Daughter of the Void. P1 plays Riptide Rex; its play-trigger must choose,
 * and P2's only unit at a battlefield is Pouty Poro. P1's pool is empty and Daughter is the only
 * resource left. Is the mandatory [rainbow] Deflect surcharge on the TRIGGER surfaced as a payment
 * the player can decline — and is Daughter offered as an Add source for it? Contrast with the same
 * Deflect surcharge arising while P1 plays a SPELL that chooses Pouty Poro.
 *
 * Expected. The trigger is a pending chain item that must choose a target if a legal one exists, so
 * P1 is forced to choose Pouty Poro (355.10.d.2 — a sole legal choice is still a choice). Choosing
 * it imposes a MANDATORY additional cost of [rainbow] on the trigger (809.1.c, 809.1.d, 356.2.a.2).
 * The engine must surface a Decision (chooser = P1) offering {pay [rainbow], decline} — it must not
 * waive Deflect and deal the 6 for free, and it must not auto-pay from a source P1 may not use.
 * During that pay step, activated Add abilities with the Reaction tag are legal (357.1.a, 429.3) and
 * the prompt stays open across them; each Add finalizes and resolves immediately, priority never
 * passes, and it cannot be reacted to (429.2.a, 429.3.a). Daughter of the Void is a Reaction Add,
 * but her own restriction is "use only to play spells" — Riptide Rex's trigger is an ABILITY, so she
 * must NOT appear among the offered Add sources and her power must not be spendable here (429.4,
 * 404.1). With no other source P1's only real option is to decline: the trigger then fails to
 * finalize and is removed from the chain as a pending item without resolving — no 6 damage, and this
 * is not a counter (382; nothing that keys on "countered" fires). Riptide Rex itself is already on
 * the board and stays. Contrast: when the Deflect [rainbow] rides on a SPELL, Daughter's restriction
 * is satisfied and exhausting her legally pays the surcharge (809.1.c.1 — any Domain).
 *
 * DESIGN (DESIGN.md "Paying costs", `moves/play/cost-model.ts`): the play-time Add sub-step of rules
 * 357.1.a / 429.3 / 204.4.b.1 is deliberately not implemented. Paying is MANUAL and affordability —
 * including which Deflect targets are offered at all — is POOL-ONLY, so the Add must happen before
 * the play/trigger rather than inside its payment. The facets below assert the engine's behaviour
 * with a `// DESIGN:` note wherever that timing is the only difference.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIPTIDE_REX = "ogn-092-298";
const POUTY_PORO = "ogn-013-298";
const DAUGHTER_OF_THE_VOID = "ogn-247-298";
const DISCIPLINE = "ogn-058-298"; // [2] Reaction spell, "Give a unit +2 [Might] this turn. Draw 1."

/**
 * P1's turn with Daughter of the Void as legend and Riptide Rex in hand priced to the pip
 * ([6] + [mind]×2), so the pool is empty the moment Rex is played. P2 holds bf1 with Pouty Poro
 * (its only unit AT a battlefield) plus a homebody in base the trigger may never reach.
 */
function rexBoard(power: Record<string, number> = {}) {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 2, ...power } })
    .legend(P1, DAUGHTER_OF_THE_VOID, "kaisa")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", POUTY_PORO, "poro")
    .unit(P2, "base", { might: 4, name: "Homebody" }, "home")
    .hand(P1, RIPTIDE_REX, "rex");
}

/** Same seats, but P1 is casting a spell at Pouty Poro instead of playing Rex. */
function spellBoard() {
  return scenario()
    .resources(P1, { energy: 2, power: {} })
    .legend(P1, DAUGHTER_OF_THE_VOID, "kaisa")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", POUTY_PORO, "poro")
    .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
    .hand(P1, DISCIPLINE, "disc");
}

/** Flatten the `targets` field of a cast option into the set of card ids offered. */
function targetsOffered(game: Game, alias: string): string[] {
  const field = game.p1.option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

describe("Riptide Rex's Deflect surcharge × Daughter of the Void — a spell-only Add against an ability's tax", () => {
  // ── Daughter's Add itself (429.2.a, 429.3.a, 429.4) ───────────────────────────────────────────

  test("Daughter's [Add] finalizes and resolves immediately: nothing goes on the chain, priority never passes, and P1 is still holding its own main-phase action", async () => {
    const game = await rexBoard().build();
    await game.p1.activate("kaisa");
    expect(game.chain()).toEqual([]);
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.state("kaisa").isExhausted).toBe(true);
  });

  test("the added [rainbow] is earmarked 'use only to play spells' (429.4): it cannot cover a unit play's Domain pip", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { mind: 1 } }) // one [mind] short for Rex
      .legend(P1, DAUGHTER_OF_THE_VOID, "kaisa")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", POUTY_PORO, "poro")
      .hand(P1, RIPTIDE_REX, "rex")
      .build();
    expect(game.p1.can("play", "rex")).toBe(false);
    await game.p1.activate("kaisa");
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.p1.can("play", "rex")).toBe(false); // still short — her power is not spendable here
  });

  // ── the trigger's surcharge is a real, declinable payment ─────────────────────────────────────

  test("Deflect is NOT waived on the trigger: with the [rainbow] in the pool the trigger sits on the chain and P1 is asked to pay it (809.1.c, 809.1.d, 356.2.a.2)", async () => {
    const game = await rexBoard({ rainbow: 1 }).build();
    await game.p1.play("rex");
    expect(game.zoneOf("rex")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rex", controller: P1, triggered: true })]);
    const decision = game.decision();
    expect(decision).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(decision?.prompt).toMatch(/Deflect/);
    expect(game.state("poro").damage).toBe(0); // nothing dealt before the tax is settled
  });

  test("P1 declines: the trigger leaves the chain without resolving — no 6 damage, the [rainbow] is kept, and Riptide Rex itself stays on the board (this is not a counter, 382)", async () => {
    const game = await rexBoard({ rainbow: 1 }).build();
    await game.p1.play("rex");
    await game.p1.no();
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.state("poro").damage).toBe(0);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.zoneOf("rex")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("P1 pays from an UNRESTRICTED [rainbow]: the surcharge is spent and the forced sole legal choice — Pouty Poro at bf1, never the homebody in base — takes 6 and dies", async () => {
    const game = await rexBoard({ rainbow: 1 }).build();
    await game.p1.play("rex");
    await game.p1.yes();
    await game.settle();
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.state("home").damage).toBe(0);
    expect(game.zoneOf("home")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("Daughter's Add is OFFERED while the trigger's pay prompt is open (429.3 — any Reaction [Add] may be activated whenever a cost must be paid) but never counts as funding for it: her [rainbow] is earmarked 'use only to play spells' (429.4, 404.1)", async () => {
    const game = await rexBoard({ rainbow: 1 }).build();
    await game.p1.play("rex");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    // 429.3 — the activation itself is a legal Reaction [Add] in this window …
    expect(game.p1.can("activate", "kaisa")).toBe(true);
    // … but 429.4 keeps her Power out of the reachability maths, so the prompt never advertises
    // "yes" as fundable from her: the shortfall is quoted only off Adds that could actually pay it.
    expect((game.decision() as { needsAdd?: unknown }).needsAdd).toBeUndefined();
  });

  // Expected (429.4 / 404.1): the [rainbow] Daughter adds may pay only to PLAY A SPELL. Riptide
  // Rex's play-trigger is an ability, so the surcharge stays unpayable and the trigger must not be
  // acceptable — P1 can only decline. Actual: the engine treats her earmarked power as ordinary
  // pool for the trigger's opt-in cost, reports canAccept:true, and lets P1 accept.
  test("Daughter's spell-only [rainbow] is NOT an acceptable payment for the trigger's Deflect surcharge (429.4, 404.1)", async () => {
    const game = await rexBoard().build();
    await game.p1.activate("kaisa");
    await game.p1.play("rex");
    expect(game.decision()).toMatchObject({ canAccept: false, kind: "yes-no", seat: P1 });
    const accepted = await game.p1.try((p) => p.yes());
    expect(accepted.ok).toBe(false);
  });

  // Expected: with her power unusable here, Pouty Poro survives at bf1 and the [rainbow] is still in
  // P1's pool. Actual: accepting spends her [rainbow] and kills Poro.
  test("the trigger's surcharge cannot be paid out of Daughter's earmarked power — Pouty Poro survives and the [rainbow] is unspent (429.4)", async () => {
    const game = await rexBoard().build();
    await game.p1.activate("kaisa");
    await game.p1.play("rex");
    const accepted = await game.p1.try((p) => p.yes());
    if (accepted.ok) {
      await game.settle();
    }
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.p1.power("rainbow")).toBe(1);
  });

  // DESIGN (DESIGN.md "Paying costs" — the 357.1.a Add sub-step is intentionally not implemented,
  // and Deflect target legality is pool-only): the rules want the trigger to be FORCED onto its sole
  // legal choice and then surface a {pay | decline} Decision even with an empty pool. The engine
  // instead never admits Pouty Poro as a candidate, so the trigger finds no legal target and is
  // dropped before it is ever finalized. The end state is the one declining produces.
  test("empty pool, Daughter untapped: no 6 damage, Riptide Rex stays on the board and the chain is empty — but the engine drops the trigger silently instead of asking (DESIGN)", async () => {
    const game = await rexBoard().build();
    await game.p1.play("rex");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.state("poro").damage).toBe(0);
    expect(game.zoneOf("rex")).toBe("base");
    expect(game.state("kaisa").isExhausted).toBe(false); // nothing was auto-paid out of her
    expect(game.violations()).toEqual([]);
  });

  // ── contrast: the same surcharge riding on a SPELL ────────────────────────────────────────────

  test("contrast: on a spell the surcharge is equally real — with no Power at all Pouty Poro is not among Discipline's legal choices, only the friendly Ally is", async () => {
    const game = await spellBoard().build();
    expect(targetsOffered(game, "disc")).toEqual(["ally"]);
    const attempt = await game.p1.try((p) => p.cast("disc", { targets: "poro" }));
    expect(attempt.ok).toBe(false);
    // The refused attempt changes nothing: the spell is still in hand and the pool is untouched.
    expect(game.zoneOf("disc")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 2, power: {} });
  });

  test("contrast: Daughter's restriction is SATISFIED by a spell — after her Add, Pouty Poro becomes a legal choice for Discipline and the [rainbow] pays the surcharge (809.1.c.1, any Domain)", async () => {
    const game = await spellBoard().build();
    await game.p1.activate("kaisa");
    expect(game.p1.power("rainbow")).toBe(1);
    expect(targetsOffered(game, "disc").sort()).toEqual(["ally", "poro"]);
    await game.p1.cast("disc", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // [2] base + [rainbow] Deflect
    await game.settle();
    expect(game.state("poro").might).toBe(4); // 2 printed + 2
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // DESIGN: rules 357.1.a / 429.3 put the Add INSIDE the spell's payment — P1 should be able to
  // start the cast at Pouty Poro with an empty pool and be offered Daughter mid-payment, declining
  // to restore the pre-attempt state. The engine's manual-payment model requires the Add first, so
  // the very same cast is simply not offered until the [rainbow] is already in the pool.
  test("contrast (DESIGN): the Add must happen BEFORE the cast — Daughter is never surfaced mid-payment, and the un-added cast is refused rather than opening a payment prompt", async () => {
    const game = await spellBoard().build();
    expect(game.p1.can("activate", "kaisa")).toBe(true); // legal as a standalone action, not as a payment step
    const attempt = await game.p1.try((p) => p.cast("disc", { targets: "poro" }));
    expect(attempt.ok).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("kaisa").isExhausted).toBe(false);
    expect(game.p1.power("rainbow")).toBe(0);
  });
});
