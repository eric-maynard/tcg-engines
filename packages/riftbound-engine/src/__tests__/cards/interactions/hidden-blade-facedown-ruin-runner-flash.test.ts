/**
 * Interaction: Hidden Blade (ogn-213-298) played FROM FACEDOWN vs FROM HAND
 *   "[Hidden] [Action] Kill a unit at a battlefield. Its controller draws 2."   (2 energy + [order])
 *   × Ruin Runner (sfd-105-221) "I can't be chosen by enemy spells and abilities."
 *   × Flash (ogs-011-024) "[Reaction] Move up to 2 friendly units to base."
 *
 * Rules:
 *   811.1.d / 811.1.d.2 — a hidden spell's targets must be chosen from options at THAT battlefield;
 *                          a hidden spell with no valid target under that restriction can't be played.
 *   811.3               — played normally from hand there is no targeting restriction.
 *   757 / 758 / 355.9.b — "can't be chosen by enemy spells" removes the unit from the legal set.
 *   359.3.e.5           — a target that is no longer legal on resolution is unaffected (mistarget).
 *   359.3.e.14.a        — "Its controller draws 2" is linked to the kill; if the kill is ignored, so is
 *                          the draw (the CR example is literally Hidden Blade).
 *
 * Question: (a) from facedown, which units may P1 choose? (b) with only the enemy Ruin Runner at
 * bf1, can it be played from facedown at all? (c) from hand, which units are legal? (d) played from
 * facedown on the bf1 vanilla unit, P2 Flashes it to base in response — result, incl. the draw?
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const RUIN_RUNNER = "sfd-105-221";
const FLASH = "ogs-011-024";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Flatten the `targets` field of the cast option into the set of card ids offered. */
function targetsOffered(game: Game, alias: string): string[] {
  const opt = game.p1.option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** Card ids offered by the current pick prompt (empty if the decision is not a pick). */
function pickOffered(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
}

/**
 * Turn 3, P1 to act. P1 controls bf1 and hid Hidden Blade there on an earlier turn; a second copy
 * is in hand (with exactly its 2 energy + [order] available). P2 controls bf2 and holds Flash.
 *   bf1:  P1 myGuard (2) · P2 Ruin Runner · P2 bf1Vanilla (3)
 *   bf2:  P2 bf2Vanilla (3)
 *   base: P2 baseVanilla (3)
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "My Guard" }, "myGuard")
    .unit(P2, "bf1", RUIN_RUNNER, "runner")
    .unit(P2, "bf1", { might: 3, name: "Bf1 Vanilla" }, "bf1Vanilla")
    .unit(P2, "bf2", { might: 3, name: "Bf2 Vanilla" }, "bf2Vanilla")
    .unit(P2, "base", { might: 3, name: "Base Vanilla" }, "baseVanilla")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .hand(P1, HIDDEN_BLADE, "bladeHand")
    .hand(P2, FLASH, "flash");
}

describe("Hidden Blade from facedown × Ruin Runner × Flash", () => {
  // ── (a) from facedown: battlefield-of-origin restriction ────────────────────────────────────

  test("(a) from facedown it costs 0 and only units AT bf1 are offered — bf2 and base units are not (811.1.d.2)", async () => {
    const game = await board().build();
    expect(game.p1.can("reveal", "blade")).toBe(true);
    await game.p1.reveal("blade");
    // Played from hidden ignoring its cost: nothing spent.
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 1 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const offered = pickOffered(game);
    expect(offered).toContain("myGuard"); // own unit at bf1 is a legal (if unwise) choice
    expect(offered).toContain("bf1Vanilla");
    expect(offered).not.toContain("bf2Vanilla");
    expect(offered).not.toContain("baseVanilla");
  });

  test.failing("BUG: (a) from facedown the ENEMY Ruin Runner must not be offered — 'can't be chosen by enemy spells' (757/758, 355.9.b)", async () => {
    // Expected: the pick set at bf1 is {myGuard, bf1Vanilla}. Actual: the engine also offers the
    // enemy Ruin Runner (its Untargetable grant is not applied when enumerating choices).
    const game = await board().build();
    await game.p1.reveal("blade");
    await game.settle();
    const offered = pickOffered(game);
    expect(offered).toContain("bf1Vanilla");
    expect(offered).not.toContain("runner");
  });

  test("(a) choosing the bf1 vanilla unit: it is killed and Hidden Blade goes to trash, still having cost nothing", async () => {
    const game = await board().build();
    await game.p1.reveal("blade");
    await game.settle();
    await game.p1.pick("bf1Vanilla");
    await game.settle();
    expect(game.zoneOf("bf1Vanilla")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 1 } });
  });

  test.failing("BUG: 'Its controller draws 2' — the KILLED unit's controller (P2) draws, not the caster", async () => {
    // Expected: P2 (bf1Vanilla's controller) draws 2 and P1's hand is unchanged. Actual: the engine
    // hands the 2 cards to Hidden Blade's controller (P1) and P2 draws nothing.
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.reveal("blade");
    await game.settle();
    await game.p1.pick("bf1Vanilla");
    await game.settle();
    expect(game.zoneOf("bf1Vanilla")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.p1.hand()).toHaveLength(p1Hand);
  });

  // ── (b) no valid target at that battlefield ─────────────────────────────────────────────────

  test.failing("BUG: (b) with only the enemy Ruin Runner at bf1, Hidden Blade cannot be played from facedown at all (811.1.d)", async () => {
    // Expected: no legal target under the bf1 restriction → `reveal` is not offered and the card
    // stays facedown. Actual: the engine lets P1 reveal it and even kills the untargetable Runner.
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", RUIN_RUNNER, "runner")
      .unit(P2, "bf2", { might: 3, name: "Bf2 Vanilla" }, "bf2Vanilla")
      .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
      .build();
    expect(game.p1.can("reveal", "blade")).toBe(false);
    const r = await game.p1.try((p) => p.reveal("blade"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
    expect(game.zoneOf("runner")).toBe("battlefield-bf1");
  });

  // ── (c) from hand: no battlefield-of-origin restriction ─────────────────────────────────────

  test("(c) from hand: any unit 'at a battlefield' is legal (bf1 vanilla, bf2 vanilla, own unit) but NOT the unit in base (811.3)", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "bladeHand")).toBe(true);
    const offered = targetsOffered(game, "bladeHand");
    expect(offered).toContain("bf1Vanilla");
    expect(offered).toContain("bf2Vanilla");
    expect(offered).toContain("myGuard");
    expect(offered).not.toContain("baseVanilla");
    await expect(game.p1.cast("bladeHand", { targets: "baseVanilla" })).rejects.toThrow();
    expect(game.zoneOf("bladeHand")).toBe("hand");
  });

  test.failing("BUG: (c) from hand the ENEMY Ruin Runner is not a legal target either (757)", async () => {
    // Expected: Runner absent from the offered set and casting on it is rejected. Actual: offered.
    const game = await board().build();
    const offered = targetsOffered(game, "bladeHand");
    expect(offered).toContain("bf2Vanilla");
    expect(offered).not.toContain("runner");
    await expect(game.p1.cast("bladeHand", { targets: "runner" })).rejects.toThrow();
  });

  test("(c) from hand on the bf2 unit (a battlefield P1 does not control): pays 2 energy + [order] and kills it", async () => {
    const game = await board().build();
    await game.p1.cast("bladeHand", { targets: "bf2Vanilla" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("bf2Vanilla")).toBe("trash");
    expect(game.zoneOf("bladeHand")).toBe("trash");
  });

  // ── (d) Flash in response → mistarget ───────────────────────────────────────────────────────

  test("(d) P2 may respond to the facedown Hidden Blade with Flash; Flash resolves first (LIFO) and the unit is in base while Hidden Blade is still on the chain", async () => {
    const game = await board().build();
    await game.p1.reveal("blade");
    await game.p1.passPriority();
    expect(game.p2.can("cast", "flash")).toBe(true);
    await game.p2.cast("flash", { targets: "bf1Vanilla" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "flash"]);
    expect(game.p2.energy()).toBe(0);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.zoneOf("bf1Vanilla")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
  });

  test.failing("BUG: (d) target is locked in when played, so after Flash the Blade mistargets: unit survives in base, nobody draws, Blade → trash for 0 energy (359.3.e.5, 359.3.e.14.a)", async () => {
    // Expected: playing from facedown follows the normal play process, so P1 chooses the target
    // (bf1Vanilla) BEFORE anyone gets priority (811.1.b, 355.5). Flash then moves it to base; on
    // resolution it is no longer "a unit at a battlefield" → not killed, and the linked "its
    // controller draws 2" is skipped. Actual: the engine defers the target choice to resolution,
    // so no pick is pending right after the reveal (and the mistarget can never arise).
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    await game.p1.reveal("blade");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("bf1Vanilla");
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: "bf1Vanilla" });
    const p2Hand = game.p2.hand().length; // after Flash left the hand
    await game.settle();
    expect(game.zoneOf("bf1Vanilla")).toBe("base");
    expect(game.state("bf1Vanilla").damage).toBe(0);
    expect(game.zoneOf("myGuard")).toBe("battlefield-bf1");
    expect(game.zoneOf("runner")).toBe("battlefield-bf1");
    expect(game.p2.hand()).toHaveLength(p2Hand); // no "draws 2"
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 1 } });
    expect(game.chain()).toEqual([]);
  });
});
