/**
 * Interaction: Syndra, Transcendent (unl-146-219) · Champion Unit · Chaos · 6 · 6 Might
 *     "While I'm in a showdown, your spells have [Repeat] [2][chaos]."
 *   × Hidden Blade (ogn-213-298) · Spell · Order · 2 + [order] · [Hidden] [Action]
 *     "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Position: P2's turn. P1 controls bf1 with Syndra + a vanilla 2-Might Ally; Hidden Blade has been facedown at
 * bf1 since P1's last turn (a second copy is in P1's hand). P2 attacks bf1 with X (3) and Y (4); P2's Z (2) sits
 * at bf2. P2 (attacker, Focus) passes; P1 flips Hidden Blade.
 *
 * Question / expected ruling:
 *   (a) The flip is legal on P2's turn inside the combat showdown — a Hidden card played from facedown has
 *       [Reaction] (811.6, 813.1.c.1, 358.4) — and its base cost is ignored → [0] (811.1.b, 356.1.b).
 *   (b) Syndra is in this showdown, so P1's spells (from any origin) have Repeat [2][chaos]; Repeat is an optional
 *       additional cost elected in Make Choices (355.1.a, 820.1.c.1) added on top of the zeroed base (356.1.b.3)
 *       → total exactly [2]+[chaos]. Declined → free, one execution. (357.1.a Add-during-pay: see DESIGN note.)
 *   (c) 811.1.d.2 restricts EVERY target choice of a spell played from facedown to bf1, and the Repeat execution
 *       chooses at the same step under the same restriction (820.2) → exec-1, exec-2 ∈ {X, Y, Ally, Syndra}; Z is
 *       never legal. X twice is legal (820.2.a) but exec-2 mistargets (359.3.e.2) and its linked draw is skipped
 *       (359.3.e.14.a).
 *   (d) X then Y: both die, P2 draws 2 + 2; Hidden Blade → trash; one spell played (820.3.a); no attackers remain
 *       → combat ends without damage, P1 keeps bf1.
 *   (e) NO sides: (i) Syndra at bf2 (not in this showdown) → no Repeat on P1's spells at all. (ii) the HAND copy
 *       during the showdown: [Action] permits it once P1 holds Focus (806.1.c.1); full 2+[order] (+ optional
 *       Repeat → 4 energy + [order] + [chaos]); no facedown restriction (811.3) → Z at bf2 is legal for either
 *       execution.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SYNDRA = "unl-146-219";
const HIDDEN_BLADE = "ogn-213-298";

/**
 * P2's turn. bf1 (P1): Syndra (or at bf2 for the control case) + Ally (2) + facedown Hidden Blade.
 * bf2 (P2): Z (2). P2's base: X (3), Y (4), ready. P1 holds a second Hidden Blade and exactly
 * 2+[order] + 2+[chaos] + 2 spare energy.
 */
function board(syndraAt: "bf1" | "bf2" = "bf1") {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 6, power: { chaos: 1, order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, syndraAt, SYNDRA, "syndra")
    .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "base", { might: 3, name: "Attacker X" }, "xx")
    .unit(P2, "base", { might: 4, name: "Attacker Y" }, "yy")
    .unit(P2, "bf2", { might: 2, name: "Bystander Z" }, "zz")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .hand(P1, HIDDEN_BLADE, "bladeHand");
}

/** X and Y attack bf1 together; P2 (attacker, Focus) passes → P1 holds Focus in the combat showdown. */
async function p1HasFocus(syndraAt: "bf1" | "bf2" = "bf1"): Promise<Game> {
  const game = await board(syndraAt).build();
  await game.p2.move(["xx", "yy"], "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** Card ids offered by the current pick prompt (empty if the decision is not a pick). */
function pickOffered(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
}

/** Every card id appearing in any offered `targets` variant of the hand copy's cast option. */
function handTargetsOffered(game: Game): string[] {
  const field = game.p1.option("cast", "bladeHand")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

const handTargetVariants = (game: Game) =>
  (game.p1.option("cast", "bladeHand")?.fields.find((f) => f.name === "targets")?.options ?? []) as string[][];
const repeatField = (game: Game, verb: "cast" | "revealHidden", card: string) =>
  game.p1.option(verb, card)?.fields.find((f) => f.arg === "repeat");

describe("(a) flipping Hidden Blade on P2's turn inside the combat showdown", () => {
  test("the flip is NOT available while P2 still holds Focus, and IS on P1's menu once Focus passes (811.6 Reaction + 358.4)", async () => {
    const game = await board().build();
    await game.p2.move(["xx", "yy"], "bf1");
    expect(game.p1.can("reveal", "blade")).toBe(false);
    await game.p2.passFocus();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("reveal", "blade")).toBe(true);
    expect(game.p1.legal().map((o) => o.key)).toContain("revealHidden:blade");
  });

  test("base cost ignored → the flip costs [0]: P1's pool (6, order 1, chaos 1) is untouched and Hidden Blade is the only chain item (811.1.b, 356.1.b)", async () => {
    const game = await p1HasFocus();
    await game.p1.reveal("blade");
    expect(game.p1.resources()).toEqual({ energy: 6, power: { chaos: 1, order: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, triggered: false, type: "spell" })]);
    expect(game.state("blade").isHidden).toBe(false);
  });
});

describe("(b) Syndra's granted Repeat [2][chaos] on the facedown play", () => {
  test("the flip should OFFER Repeat 0..1 — Syndra is in this showdown so P1's spells from ANY origin have Repeat (820.1.c.1, 355.1.a); the engine's revealHidden has no Repeat election at all", async () => {
    // Expected: the revealHidden option carries a `repeat` field (max 1), exactly like the hand copy's cast
    // option does in the same position. Actual: revealHidden exposes no fields; Repeat cannot be elected.
    const game = await p1HasFocus();
    expect(repeatField(game, "cast", "bladeHand")).toMatchObject({ max: 1, options: [1] }); // sanity: the grant is live
    expect(repeatField(game, "revealHidden", "blade")).toMatchObject({ max: 1, options: [1] });
  });

  test("electing Repeat on the flip should cost EXACTLY [2]+[chaos] on top of the zeroed base (356.1.b.3): 6/chaos1/order1 → 4/chaos0/order1, two targets bound on one chain item", async () => {
    // Expected: reveal with Repeat naming X then Y is accepted, charges 2 energy + 1 chaos (order untouched —
    // the base [2][order] is ignored) and puts ONE item with targets [X, Y] on the chain. Actual: rejected.
    const game = await p1HasFocus();
    await game.p1.reveal("blade", { params: { repeatCount: 1 }, targets: ["xx", "yy"] });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { chaos: 0, order: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", targets: ["xx", "yy"] })]);
  });

  test("Repeat declined (plain flip): costs 0 and executes ONCE — X is killed, P2 (X's controller) draws 2, Hidden Blade → P1's trash", async () => {
    const game = await p1HasFocus();
    const p1Hand = game.p1.hand().length;
    await game.p1.reveal("blade");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" }); // target chosen as it is played (355.5)
    await game.p1.pick("xx");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", targets: ["xx"] })]);
    const p2Hand = game.p2.hand().length;
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("xx")).toBe("trash");
    expect(game.zoneOf("yy")).toBe("battlefield-bf1");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 6, power: { chaos: 1, order: 1 } });
  });

  test("DESIGN: paying is manual — no Add-during-pay sub-step (deviation from 357.1.a): with the extra [2][chaos] available only as READY runes the hand copy offers no Repeat; tap 2 runes + recycle a chaos rune first and Repeat 1 appears", async () => {
    // DESIGN: DESIGN.md § Paying costs — the engine offers only what the CURRENT pool covers; runes are never
    // credited or auto-exhausted during the Pay Costs step. (Shown on the hand copy; the flip has no Repeat, above.)
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { order: 1 } })
      .runes(P1, "chaos", 3)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", SYNDRA, "syndra")
      .unit(P2, "base", { might: 3, name: "Attacker X" }, "xx")
      .hand(P1, HIDDEN_BLADE, "bladeHand")
      .build();
    await game.p2.move("xx", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "bladeHand")).toBe(true);
    expect(repeatField(game, "cast", "bladeHand")?.max ?? 0).toBe(0);
    await game.p1.tapRune();
    await game.p1.tapRune();
    await game.p1.recycleRune({ domain: "chaos" }, "chaos");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { chaos: 1, order: 1 } });
    expect(repeatField(game, "cast", "bladeHand")).toMatchObject({ max: 1, options: [1] });
  });
});

describe("(c) which units each execution may name from facedown (811.1.d.2 × 820.2)", () => {
  test("execution 1: exactly the units AT bf1 are offered — X, Y, P1's Ally and Syndra herself; Z at bf2 is not, and naming Z is refused", async () => {
    const game = await p1HasFocus();
    await game.p1.reveal("blade");
    expect(new Set(pickOffered(game))).toEqual(new Set(["xx", "yy", "ally", "syndra"]));
    expect(pickOffered(game)).not.toContain("zz");
    const r = await game.p1.try((p) => p.pick("zz"));
    expect(r.ok).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // still waiting for a legal choice
    await game.p1.pick("yy");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", targets: ["yy"] })]);
  });

  test("execution 2 is chosen at the same Make-Choices step under the same 'here' lock (820.2): [X, Y] should be a legal Repeat flip while [X, Z] is refused — the engine cannot Repeat a flip at all", async () => {
    // Expected: {repeat 1, targets [X, Z]} rejected (Z is at bf2), {repeat 1, targets [X, Y]} accepted.
    // Actual: both are rejected because revealHidden has no Repeat election.
    const game = await p1HasFocus();
    const withZ = await game.p1.try((p) => p.reveal("blade", { params: { repeatCount: 1 }, targets: ["xx", "zz"] }));
    expect(withZ.ok).toBe(false);
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
    await game.p1.reveal("blade", { params: { repeatCount: 1 }, targets: ["xx", "yy"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", targets: ["xx", "yy"] })]);
  });

  test("naming X for BOTH executions is legal (820.2.a); exec-1 kills X, exec-2 mistargets (X is in the trash, 359.3.e.2) and its linked 'draws 2' is skipped (359.3.e.14.a) → P2 draws exactly 2", async () => {
    // Expected: accepted; after resolution X dead, P2 +2 cards (not +4), Y untouched. Actual: the Repeat flip is rejected.
    const game = await p1HasFocus();
    await game.p1.reveal("blade", { params: { repeatCount: 1 }, targets: ["xx", "xx"] });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { chaos: 0, order: 1 } });
    const p2Hand = game.p2.hand().length;
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("xx")).toBe("trash");
    expect(game.zoneOf("yy")).toBe("battlefield-bf1");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.zoneOf("blade")).toBe("trash");
  });
});

describe("(d) outcome of the Repeat flip naming X then Y", () => {
  test("X dies → P2 draws 2, Y dies → P2 draws 2 (4 total); Hidden Blade → trash, ONE card played (820.3.a); no attackers remain → combat ends with no damage and P1 keeps bf1", async () => {
    // Expected as stated. Actual: the Repeat flip is rejected by the engine (no Repeat on revealHidden).
    const game = await p1HasFocus();
    await game.p1.reveal("blade", { params: { repeatCount: 1 }, targets: ["xx", "yy"] });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    const p2Hand = game.p2.hand().length;
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("xx")).toBe("trash");
    expect(game.zoneOf("yy")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 4);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p1.trash()).toEqual(["blade"]);
    expect(game.state("syndra").damage).toBe(0);
    expect(game.state("ally").damage).toBe(0);
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("contrast — single execution on X, then everyone passes: Y (4) fights Syndra 6 + Ally 2 alone and dies; P1 keeps bf1 uncontested, P2 scores nothing, back to P2's main phase", async () => {
    const game = await p1HasFocus();
    await game.p1.reveal("blade");
    await game.p1.pick("xx");
    const p2Hand = game.p2.hand().length;
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("xx")).toBe("trash");
    expect(game.zoneOf("yy")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2); // only X's controller drew (Y died in combat, no draw)
    expect(game.zoneOf("syndra")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(e)(i) NO side — Syndra at bf2 is not in THIS showdown: P1's spells have no Repeat", () => {
  test("the hand copy has no Repeat election and 'repeat 1' is refused; the flip likewise offers none and still resolves once for free", async () => {
    const game = await p1HasFocus("bf2");
    expect(game.locationOf("syndra")).toBe("bf2");
    expect(game.p1.can("cast", "bladeHand")).toBe(true);
    expect(repeatField(game, "cast", "bladeHand")).toBeUndefined();
    const r = await game.p1.try((p) => p.cast("bladeHand", { repeat: 1, targets: ["xx", "yy"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("bladeHand")).toBe("hand");
    expect(repeatField(game, "revealHidden", "blade")).toBeUndefined();
    await game.p1.reveal("blade");
    expect(new Set(pickOffered(game))).toEqual(new Set(["xx", "yy", "ally"])); // Syndra is not at bf1 now
    await game.p1.pick("xx");
    const p2Hand = game.p2.hand().length;
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("xx")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.p1.resources()).toEqual({ energy: 6, power: { chaos: 1, order: 1 } });
  });
});

describe("(e)(ii) NO side — the HAND copy hard-cast during the same showdown", () => {
  test("[Action] timing: castable only once P1 holds Focus in the showdown on P2's turn (806.1.c.1); Repeat 0..1 is offered because Syndra is in this showdown", async () => {
    const game = await board().build();
    await game.p2.move(["xx", "yy"], "bf1");
    expect(game.p1.can("cast", "bladeHand")).toBe(false);
    await game.p2.passFocus();
    expect(game.p1.can("cast", "bladeHand")).toBe(true);
    expect(repeatField(game, "cast", "bladeHand")).toMatchObject({ max: 1, min: 0, options: [1] });
  });

  test("no facedown restriction (811.3): Z at bf2 is offered for a single execution AND for either Repeat execution ([Z,Z], [X,Z], [Z,X] all listed); base units never are ('at a battlefield')", async () => {
    const game = await p1HasFocus();
    expect(new Set(handTargetsOffered(game))).toEqual(new Set(["xx", "yy", "zz", "ally", "syndra"]));
    const variants = handTargetVariants(game).map((v) => v.join(","));
    expect(variants).toContain("zz");
    expect(variants).toContain("xx,zz");
    expect(variants).toContain("zz,xx");
    expect(variants).toContain("zz,zz");
  });

  test("without Repeat it costs the full 2 + [order]: 6/chaos1/order1 → 4/chaos1/order0; Z dies and P2 draws 2", async () => {
    const game = await p1HasFocus();
    await game.p1.cast("bladeHand", { targets: "zz" });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { chaos: 1, order: 0 } });
    const p2Hand = game.p2.hand().length;
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("zz")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.zoneOf("bladeHand")).toBe("trash");
  });

  test("with Repeat naming X then Z: total 4 energy + [order] + [chaos] (pool → 2/0/0), ONE chain item / one card played; X and Z both die and P2 draws 4", async () => {
    const game = await p1HasFocus();
    await game.p1.cast("bladeHand", { repeat: 1, targets: ["xx", "zz"] });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0, order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bladeHand", targets: ["xx", "zz"], triggered: false })]);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    const p2Hand = game.p2.hand().length;
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("xx")).toBe("trash");
    expect(game.zoneOf("zz")).toBe("trash");
    expect(game.zoneOf("yy")).toBe("battlefield-bf1");
    expect(game.p2.hand()).toHaveLength(p2Hand + 4);
    expect(game.zoneOf("bladeHand")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" }); // Y still attacking → showdown goes on
    expect(game.violations()).toEqual([]);
  });
});
