/**
 * Interaction: Temporal Portal (sfd-078-221) · Gear · Mind · 3
 *     "[rainbow], [Exhaust]: Give the next spell you play this turn [Repeat] equal to its cost."
 *   × Sacrifice (unl-173-219) · Spell · Order · 1 · Reaction
 *     "As an additional cost to play this, kill a friendly [Mighty] unit. Draw 2 and channel 1 rune
 *      exhausted."
 *   × Dunebreaker (sfd-027-221) · Unit · Fury · 7 + [fury] · 7 might (the only Mighty unit)
 *
 * Question: activate Temporal Portal, then play Sacrifice while controlling a single Mighty unit.
 * What Repeat cost does Sacrifice get — does "its cost" include the mandatory kill? If you pay the
 * Repeat, must you kill a second Mighty unit? What resolves? Contrast: Sacrifice without the Portal;
 * and if the repeated Sacrifice is countered, is anything refunded?
 *
 * Rules: 206 ("its cost" = printed cost → Repeat [1]); 204.2 / 356.2.a.1 / 356.7 (the kill is a
 * mandatory ADDITIONAL, non-standard cost, not part of the card's cost); 357.2 (all costs paid once
 * in the pay step); 820.1.d / 820.1.d.1 (Repeat re-executes only the resolution instructions),
 * 135.2.b.3 ("as an additional cost" instructions are not re-run), 820.3.a (played only once);
 * 425.1.c / 425.1.c.1 (countering refunds nothing, additional costs included).
 *
 * Expected: Sacrifice gains Repeat [1]. With Repeat paid: [1]+[1] = [2] energy and exactly ONE
 * Dunebreaker killed; resolution runs twice → draw 4, channel 2 runes exhausted. Without the
 * Portal: pay [1], kill Dunebreaker, draw 2, channel 1 exhausted. Countered: nothing resolves,
 * Dunebreaker stays dead, the [2] is not refunded.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TEMPORAL_PORTAL = "sfd-078-221";
const SACRIFICE = "unl-173-219";
const DUNEBREAKER = "sfd-027-221";
/** P2's plain inline counterspell (1 energy Reaction, "Counter a spell.") — keeps the countered contrast independent of any real counter's targeting filter. */
const NULLIFY = {
  abilities: [{ effect: { type: "counter" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  name: "Nullify",
  rulesText: "[Reaction] Counter a spell.",
  timing: "reaction",
};

function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 1 } }) // [rainbow] for the Portal, [1]+[1] for Sacrifice+Repeat, 1 spare
    .resources(P2, { energy: 1 }) // exactly Nullify
    .gear(P1, TEMPORAL_PORTAL, "portal")
    .unit(P1, "base", DUNEBREAKER, "dune") // 7 might — the ONLY friendly Mighty unit
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire") // not Mighty: never a legal kill
    .hand(P1, SACRIFICE, "sacrifice")
    .hand(P2, NULLIFY, "nullify");
}

type G = Awaited<ReturnType<ReturnType<typeof board>["build"]>>;

function repeatOptions(game: G): number[] {
  const field = game.p1.option("cast", "sacrifice")?.fields.find((f) => f.name === "repeatCount");
  return ((field?.options ?? []) as number[]).map(Number);
}

describe("Temporal Portal × Sacrifice (Repeat equal to its cost) × Dunebreaker", () => {
  // ---- Baseline: Sacrifice without the Portal ------------------------------------------------

  test("without the Portal: Sacrifice costs [1], has no Repeat option, draws 2 and channels 1 rune exhausted", async () => {
    const game = await board().build();
    expect(repeatOptions(game)).toEqual([]);
    const handBefore = game.p1.hand().length; // 1 (Sacrifice)
    const runeDeckBefore = game.p1.runeDeck().length;
    expect(game.p1.runes()).toEqual([]);
    await game.p1.cast("sacrifice");
    expect(game.p1.energy()).toBe(2); // paid [1]
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sacrifice", controller: P1, type: "spell" })]);
    await game.settle();
    expect(game.zoneOf("sacrifice")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 2);
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1); // channeled exhausted
    expect(game.p1.runeDeck()).toHaveLength(runeDeckBefore - 1);
    expect(game.zoneOf("squire")).toBe("base"); // the non-Mighty unit is never touched
  });

  test.failing("BUG: without the Portal: playing Sacrifice kills the (only) friendly Mighty unit as a mandatory additional cost (204.2, 356.2.a.1, 357.2)", async () => {
    // Expected: Dunebreaker is killed while paying costs — it is already in the trash while
    // Sacrifice is still on the chain. Actual: playSpell ignores the parsed `additionalCost.kill`;
    // Dunebreaker stays in the base.
    const game = await board().build();
    await game.p1.cast("sacrifice");
    expect(game.zoneOf("sacrifice")).toBe("chain");
    expect(game.zoneOf("dune")).toBe("trash"); // cost paid before anything resolves
    await game.settle();
    expect(game.zoneOf("dune")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("base");
  });

  test.failing("BUG: Sacrifice cannot be played at all with no friendly Mighty unit to kill (356.2.a.1 — mandatory cost)", async () => {
    // Expected: no legal way to pay the additional cost → not castable. Actual: offered and castable.
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .unit(P2, "base", { might: 7, name: "Enemy Giant" }, "enemyGiant") // Mighty but not friendly
      .hand(P1, SACRIFICE, "sacrifice")
      .build();
    expect(game.p1.can("cast", "sacrifice")).toBe(false);
    const r = await game.p1.try((p) => p.cast("sacrifice"));
    expect(r.ok).toBe(false);
  });

  // ---- Temporal Portal ------------------------------------------------------------------------

  test("Temporal Portal: '[rainbow], Exhaust' — activating spends 1 power and exhausts the Portal", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "portal")).toBe(true);
    await game.p1.activate("portal");
    expect(game.state("portal").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { rainbow: 0 } });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("activate", "portal")).toBe(false); // already exhausted
  });

  test.failing("BUG: after the Portal resolves, Sacrifice (printed cost [1]) is offered with exactly one Repeat instance costing [1] (206, 820.3)", async () => {
    // Expected: the cast option for Sacrifice now carries repeatCount ∈ {1} (one granted instance,
    // priced at the printed cost [1] — the kill is an additional cost and is not folded in).
    // Actual: the Portal's `NextSpellRepeat` grant is never read by playSpell; no Repeat variant.
    const game = await board().build();
    await game.p1.activate("portal");
    await game.settle();
    expect(repeatOptions(game)).toEqual([1]);
  });

  test.failing("BUG: Portal + Sacrifice with Repeat paid: [2] energy total, ONE Dunebreaker killed, effect runs twice → draw 4, channel 2 runes exhausted (357.2, 820.1.d, 135.2.b.3, 820.3.a)", async () => {
    // Expected as titled. Actual: no Repeat variant exists, so the cast with repeat=1 is rejected.
    const game = await board().build();
    await game.p1.activate("portal");
    await game.settle();
    const handBefore = game.p1.hand().length;
    const runeDeckBefore = game.p1.runeDeck().length;
    await game.p1.cast("sacrifice", { repeat: 1 });
    expect(game.p1.energy()).toBe(1); // 3 - ([1] base + [1] Repeat)
    expect(game.zoneOf("dune")).toBe("trash"); // the single mandatory kill
    expect(game.zoneOf("squire")).toBe("base"); // no second kill demanded
    expect(game.chain()).toHaveLength(1); // played once (820.3.a)
    await game.settle();
    expect(game.zoneOf("sacrifice")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 4);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runes({ ready: false })).toHaveLength(2);
    expect(game.p1.runeDeck()).toHaveLength(runeDeckBefore - 2);
    expect(game.p1.trash().filter((c) => game.state(c).cardType === "unit")).toEqual(["dune"]);
  });

  test.failing("BUG: the Portal's grant applies only to the NEXT spell — a second Sacrifice played the same turn has no Repeat", async () => {
    // Expected: first Sacrifice consumes the grant; the second copy is offered without Repeat.
    // Actual: fails earlier — the first Sacrifice never gets a Repeat variant.
    const game = await board()
      .resources(P1, { energy: 5, power: { rainbow: 1 } })
      .unit(P1, "base", { might: 6, name: "Second Giant" }, "giant2")
      .hand(P1, SACRIFICE, "sacrifice2")
      .build();
    await game.p1.activate("portal");
    await game.settle();
    expect(repeatOptions(game)).toEqual([1]);
    await game.p1.cast("sacrifice", { repeat: 1 });
    await game.settle();
    const field = game.p1.option("cast", "sacrifice2")?.fields.find((f) => f.name === "repeatCount");
    expect(field?.options ?? []).toEqual([]);
  });

  // ---- Countered ------------------------------------------------------------------------------

  test("countered (no Portal): a counterspell counters Sacrifice — no draw, no rune channeled, the [1] is not refunded (425.1.c)", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    const runeDeckBefore = game.p1.runeDeck().length;
    await game.p1.cast("sacrifice");
    await game.p1.passPriority();
    expect(game.p2.can("cast", "nullify")).toBe(true);
    await game.p2.cast("nullify", { targets: "sacrifice" });
    await game.settle();
    expect(game.zoneOf("sacrifice")).toBe("trash");
    expect(game.zoneOf("nullify")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore - 1); // nothing drawn
    expect(game.p1.runes()).toEqual([]);
    expect(game.p1.runeDeck()).toHaveLength(runeDeckBefore);
    expect(game.p1.energy()).toBe(2); // [1] stays spent
  });

  test.failing("BUG: countered WITH Repeat paid: nothing resolves, Dunebreaker stays dead, and the [2] (base + Repeat) is not refunded (425.1.c, 425.1.c.1)", async () => {
    // Expected as titled. Actual: no Repeat variant is offered after the Portal, so the repeated
    // cast cannot even be made (and the kill cost is never paid).
    const game = await board().build();
    await game.p1.activate("portal");
    await game.settle();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("sacrifice", { repeat: 1 });
    expect(game.p1.energy()).toBe(1);
    expect(game.zoneOf("dune")).toBe("trash");
    await game.p1.passPriority();
    await game.p2.cast("nullify", { targets: "sacrifice" });
    await game.settle();
    expect(game.zoneOf("sacrifice")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore - 1);
    expect(game.p1.runes()).toEqual([]);
    expect(game.p1.energy()).toBe(1); // no refund
    expect(game.zoneOf("dune")).toBe("trash"); // the kill is not undone
  });
});
