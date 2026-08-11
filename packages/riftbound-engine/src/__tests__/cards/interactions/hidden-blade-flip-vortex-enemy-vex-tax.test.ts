/**
 * Interaction: Hidden Blade (ogn-213-298) flipped from FACEDOWN at Mystic Vortex (ven-160-166) while an
 *              enemy — or friendly — Vex, Cheerless (sfd-146-221) is in the combat there.
 *
 *   Hidden Blade — Spell · Order · 2 + [order]
 *     "[Hidden] (Hide now for [rainbow] to react with later for [0].) [Action] Kill a unit at a battlefield.
 *      Its controller draws 2."
 *   Mystic Vortex — Battlefield
 *     "During showdowns here, cards with [Reaction] cost [rainbow] more to play. (Hidden cards have [Reaction].)"
 *   Vex, Cheerless — Unit · Chaos · 5 · 5 Might · Champion
 *     "While I'm in combat, friendly spells cost [1][rainbow] less to a minimum of [1], and enemy spells cost
 *      [1][rainbow] more."
 *
 * Board. Turn 3, P2's turn. mv = Mystic Vortex (live text) controlled by P1 with a 3-Might defender D and a
 * Hidden Blade facedown there since an earlier turn; a second Hidden Blade is in P1's hand. P2 attacks mv.
 *
 * Question / expected:
 *  (a) P2 attacks with Vex; in the combat showdown P1 flips Hidden Blade choosing Vex. Played from facedown =
 *      "ignoring its base cost" (811.1.b → 356.1.b): 0 energy / 0 power. Increases still apply (356.3,
 *      356.1.b.3): the facedown card has [Reaction] (811.6) during a showdown at the Vortex → +[rainbow]; Vex is
 *      an attacker in this combat → +[1][rainbow]. Total = 1 energy + 2 power of ANY domain (135.2.e.5.a) — no
 *      [order] needed. The cost is fixed at finalization (358.2, 425.1.c): Hidden Blade resolves LIFO before
 *      combat damage, Vex dies, P2 draws 2, nothing is refunded; with no attacker left the combat ends without
 *      damage and P1 keeps the Vortex. Targets are restricted to units AT the Vortex (811.1.d.2).
 *  (b) The hand copy cast as an Action in the same showdown at Vex: printed 2+[order] applies (811.3), a hand
 *      cast has no [Reaction] → no Vortex surcharge, Vex +[1][rainbow] → 3 energy + [order] + 1 any: the [order]
 *      pip is domain-locked, the extra pip is free-domain.
 *  (c) Vex sits in P2's base while a vanilla P2 unit attacks: only the Vortex applies → 0 energy + 1 any.
 *  (d) Mirror: P1's OWN Vex defends the Vortex, P2 attacks with a vanilla unit, P1 flips at the attacker: base 0,
 *      Vortex +[rainbow], own Vex −[1][rainbow] "to a minimum of [1]" — a floor never RAISES a cost (356.4.e) so
 *      energy stays 0, and her [rainbow] discount removes the Vortex pip (356.4.f) → free flip; attacker dies,
 *      P2 draws 2.
 *  (e) Parity in (a): {1, order:1} NOT offered (needs two power); {1, calm:1, mind:1} offered and drained to 0;
 *      {0, calm:2} NOT offered (needs 1 energy). Enumerated == accepted (357.3, 355.16).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const MYSTIC_VORTEX = "ven-160-166";
const VEX = "sfd-146-221";

interface BoardOpts {
  readonly energy?: number;
  readonly power?: Record<string, number>;
  /** Where P2's Vex is: attacking (default), idle in P2's base next to a vanilla attacker A, or absent (vanilla A only). */
  readonly enemyVex?: "attacker" | "base" | "none";
  /** P1's defender at the Vortex is P1's own Vex instead of vanilla D. */
  readonly ownVexDefends?: boolean;
}

function board(opts: BoardOpts = {}) {
  const b = scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: opts.energy ?? 1, power: opts.power ?? { calm: 1, mind: 1 } })
    .battlefield("mv", { controller: P1, def: MYSTIC_VORTEX, inert: false, owner: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 1, name: "Holder H" }, "H")
    .facedown(P1, "mv", HIDDEN_BLADE, "blade")
    .hand(P1, HIDDEN_BLADE, "bladeHand");
  if (opts.ownVexDefends) {
    b.unit(P1, "mv", VEX, "myVex");
  } else {
    b.unit(P1, "mv", { might: 3, name: "Defender D" }, "D");
  }
  const where = opts.enemyVex ?? "attacker";
  if (where === "attacker") {
    b.unit(P2, "base", VEX, "vex");
  } else if (where === "base") {
    b.unit(P2, "base", VEX, "vex");
    b.unit(P2, "base", { might: 2, name: "Vanilla A" }, "A");
  } else {
    b.unit(P2, "base", { might: 2, name: "Vanilla A" }, "A");
  }
  return b;
}

/** P2 attacks the Vortex with `attacker` and passes Focus → P1 holds Focus in the combat showdown there. */
async function showdown(opts: BoardOpts = {}, attacker = "vex"): Promise<Game> {
  const game = await board(opts).build();
  await game.p2.move(attacker, "mv");
  expect(game.state(attacker).combatRole).toBe("attacker");
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

/** Flatten the `targets` field of P1's cast option into the set of card ids offered. */
function targetsOffered(game: Game, alias: string): string[] {
  const opt = game.p1.option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

describe("Hidden Blade flipped at Mystic Vortex × enemy / own Vex, Cheerless in combat", () => {
  // ── (a) enemy Vex attacks; flip at Vex with {1, calm:1, mind:1} ─────────────────────────────

  test("(a) the flip is offered in the combat showdown with {1, calm:1, mind:1} — both surcharges stack on the zeroed base and neither pip needs [order] (811.1.b, 356.3, 135.2.e.5.a)", async () => {
    const game = await showdown();
    expect(game.p1.can("reveal", "blade")).toBe(true);
  });

  test("(a) the flip's target choice is restricted to units AT the Vortex: D and Vex offered, the bf2 holder is not (811.1.d.2)", async () => {
    const game = await showdown();
    await game.p1.reveal("blade");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const offered = pickOffered(game);
    expect(offered).toContain("vex");
    expect(offered).toContain("D");
    expect(offered).not.toContain("H");
  });

  test("(a) flipping at Vex charges exactly 1 energy + 2 power of any domain: {1, calm:1, mind:1} → all zero; Blade on the chain targeting Vex", async () => {
    const game = await showdown();
    await game.p1.reveal("blade", { answers: ["vex"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, targets: ["vex"], triggered: false })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("(a) Blade resolves before combat damage: Vex dies, P2 (her controller) draws 2, nothing is refunded or re-priced (358.2, 425.1.c)", async () => {
    const game = await showdown();
    const p1Hand = game.p1.hand().length;
    await game.p1.reveal("blade", { answers: ["vex"] });
    const p2Hand = game.p2.hand().length;
    await game.settle();
    expect(game.zoneOf("vex")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, mind: 0 } });
  });

  test("(a) with no attacker left the combat ends without damage: D unhurt at the Vortex, P1 still controls it, P2 back in an open main phase", async () => {
    const game = await showdown();
    await game.p1.reveal("blade", { answers: ["vex"] });
    await game.settle();
    expect(game.zoneOf("D")).toBe("battlefield-mv");
    expect(game.state("D").damage).toBe(0);
    expect(game.gameState.battlefields.mv?.controller).toBe(P1);
    expect(game.gameState.battlefields.mv?.contested).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  // ── (e) parity of the (a) price across pools ────────────────────────────────────────────────

  test("(e) {1, order:1} is NOT offered — one power cannot pay two any-domain pips (357.3, 355.16)", async () => {
    const game = await showdown({ energy: 1, power: { order: 1 } });
    expect(game.p1.can("reveal", "blade")).toBe(false);
    const r = await game.p1.try((p) => p.reveal("blade", { answers: ["vex"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("blade")).toBe("facedown-mv");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 1 } });
  });

  test("(e) {0, calm:2} is NOT offered — Vex's +[1] energy is unpayable even though both pips are (356.3)", async () => {
    const game = await showdown({ energy: 0, power: { calm: 2 } });
    expect(game.p1.can("reveal", "blade")).toBe(false);
    const r = await game.p1.try((p) => p.reveal("blade", { answers: ["vex"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("blade")).toBe("facedown-mv");
  });

  test("(e) {1, calm:1, mind:1} is offered AND accepted, draining the pool to zero (enumerated == accepted)", async () => {
    const game = await showdown({ energy: 1, power: { calm: 1, mind: 1 } });
    expect(game.p1.can("reveal", "blade")).toBe(true);
    await game.p1.reveal("blade", { answers: ["vex"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    expect(game.zoneOf("blade")).toBe("chain");
  });

  // ── (b) hand copy cast in the same showdown ─────────────────────────────────────────────────

  test("(b) from HAND at Vex: printed 2+[order] + Vex's [1][rainbow], no Vortex pip → {3, order:1, calm:1} drains to zero (811.3, 356.3)", async () => {
    const game = await showdown({ energy: 3, power: { calm: 1, order: 1 } });
    expect(game.p1.can("cast", "bladeHand")).toBe(true);
    // From hand there is no battlefield-of-origin restriction: the bf2 holder is a legal target too.
    expect(targetsOffered(game, "bladeHand").sort()).toEqual(["D", "H", "vex"].sort());
    await game.p1.cast("bladeHand", { targets: "vex" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bladeHand", targets: ["vex"] })]);
  });

  test("(b) the [order] pip is domain-locked: {3, calm:2} cannot cast the hand copy (135.2.e.5.a)", async () => {
    const game = await showdown({ energy: 3, power: { calm: 2 } });
    expect(game.p1.can("cast", "bladeHand")).toBe(false);
    await expect(game.p1.cast("bladeHand", { targets: "vex" })).rejects.toThrow();
    expect(game.zoneOf("bladeHand")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { calm: 2 } });
  });

  test("(b) control — the (a) pool {1, calm:1, mind:1} that pays the FLIP cannot pay the hand cast (3 energy + [order] + 1 any)", async () => {
    const game = await showdown();
    expect(game.p1.can("reveal", "blade")).toBe(true);
    expect(game.p1.can("cast", "bladeHand")).toBe(false);
  });

  // ── (c) enemy Vex NOT in combat ─────────────────────────────────────────────────────────────

  test("(c) Vex idle in P2's base, vanilla A attacks: the flip costs only the Vortex pip — {0, fury:1} pays it, fury 1 → 0, energy untouched", async () => {
    const game = await showdown({ enemyVex: "base", energy: 0, power: { fury: 1 } }, "A");
    expect(game.state("vex").combatRole).toBeNull();
    expect(game.p1.can("reveal", "blade")).toBe(true);
    await game.p1.reveal("blade", { answers: ["A"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    const p2Hand = game.p2.hand().length;
    await game.settle();
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
  });

  test("(c) control — with an EMPTY pool the flip is not offered while Vex is out of combat: the Vortex pip alone is still owed", async () => {
    const game = await showdown({ enemyVex: "base", energy: 0, power: {} }, "A");
    expect(game.p1.can("reveal", "blade")).toBe(false);
  });

  // ── (d) P1's OWN Vex defends ────────────────────────────────────────────────────────────────

  test("(d) own Vex defending: her 'minimum of [1]' does not RAISE the 0-energy flip and her [rainbow] discount cancels the Vortex pip → offered with an EMPTY pool (356.4.e, 356.4.f)", async () => {
    const game = await showdown({ energy: 0, enemyVex: "none", ownVexDefends: true, power: {} }, "A");
    expect(game.state("myVex").combatRole).toBe("defender");
    expect(game.p1.can("reveal", "blade")).toBe(true);
    await game.p1.reveal("blade", { answers: ["A"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", targets: ["A"] })]);
  });

  test("(d) the free flip resolves: attacker A dies, P2 draws 2, own Vex keeps the Vortex undamaged", async () => {
    const game = await showdown({ energy: 0, enemyVex: "none", ownVexDefends: true, power: {} }, "A");
    await game.p1.reveal("blade", { answers: ["A"] });
    const p2Hand = game.p2.hand().length;
    await game.settle();
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.zoneOf("myVex")).toBe("battlefield-mv");
    expect(game.state("myVex").damage).toBe(0);
    expect(game.gameState.battlefields.mv?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
