/**
 * Interaction: Sky Cruiser (ven-060-166) · Unit · Mind · 4 · 3 Might
 *     "Discard a gear, [1], [Exhaust]: Deal 4 to a unit at a battlefield."
 *   × Jhin, Murderous Artist (unl-022-219) · Champion Unit · Fury · 4 Might
 *     "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.) [Ganking] When I move, [Add] [1][rainbow]."
 *   × Gust (ogn-169-298) · Spell · [Reaction] "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   (+ Treasure Trove ogn-186-298 as the discarded gear: "When this leaves the board, draw 1 and channel 1 rune exhausted.")
 *
 * Rules: 380/381 (activated abilities: source on the board, controller's turn, Open State), 191.4.a
 * (the source's controller controls the ability), 402.2 (choose targets) → 402.3 (no legal option ⇒ not
 * legal to activate) → 403.2/403.3 + 809.1.c (Deflect adds a mandatory [rainbow] when an OPPONENT's
 * ability chooses him) → 404.1 (pay everything — resource AND non-resource costs — at finalization) →
 * 406.4 (only then do other players get priority). 414.4 by analogy: a cost that cannot be completed
 * ("discard a gear" with no gear in hand) is not payable. Costs are never refunded when the effect
 * later fizzles. DESIGN (DESIGN.md §Paying costs): affordability and the legal-target set are POOL-only.
 *
 * Question / expected — P1's turn, Neutral Open, Sky Cruiser READY in P1's BASE:
 *   (a) gear in hand, pool 1 energy + 1 power, Jhin (Deflect) at bf1 + plain 3-Might W at bf2 ⇒ listed,
 *       both selectable; picking Jhin pays gear→trash, 1 energy + 1 power, exhausts Sky Cruiser BEFORE
 *       P2 gets priority; resolves: 4 ≥ 4 ⇒ Jhin dies.
 *   (b) pool 1 energy / 0 power ⇒ listed, only W selectable (Jhin's total [1]+[rainbow] unpayable).
 *   (c) as (b) but W gone ⇒ ability ABSENT (402.3).
 *   (d) no gear in hand ⇒ ABSENT, and no dead-end target prompt opens.
 *   (e) no unit at any battlefield ⇒ ABSENT.
 *   (f) P1 targets W, P2 Gusts W ⇒ gear stays in trash, energy spent, Sky Cruiser stays exhausted, the
 *       ability fizzles; the discarded Treasure Trove did NOT "leave the board" ⇒ no draw / channel.
 *   (g) being in base is fine (only the TARGET must be at a battlefield); never listed for P2, nor for
 *       P1 on P2's turn, nor during a showdown.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SKY_CRUISER = "ven-060-166";
const JHIN = "unl-022-219";
const GUST = "ogn-169-298";
const TREASURE_TROVE = "ogn-186-298";

const ABILITY_KEY = "activateAbility:sky#0";

interface BoardOpts {
  /** P1's [mind] power in the pool (default 1). */
  power?: number;
  /** P2's plain 3-Might W at bf2 (default true). */
  withW?: boolean;
  /** P1 holds a gear (Treasure Trove) in hand (default true). */
  gearInHand?: boolean;
  /** Jhin at bf1 (default true). */
  withJhin?: boolean;
}

/**
 * P1's turn-2 main phase. Sky Cruiser ready in P1's base; P1 pool = 1 energy + `power` mind; P1's hand =
 * a vanilla unit, a vanilla spell and (optionally) Treasure Trove. P2: Jhin at bf1, W (3 Might) at bf2,
 * Gust in hand with 1 energy.
 */
function board(opts: BoardOpts = {}) {
  const { power = 1, withW = true, gearInHand = true, withJhin = true } = opts;
  let s = scenario()
    .resources(P1, { energy: 1, power: power > 0 ? { mind: power } : {} })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", SKY_CRUISER, "sky")
    .hand(P1, { might: 2, name: "Grunt" }, "grunt")
    .hand(P1, { cardType: "spell", energyCost: 9, name: "Big Spell" }, "bigSpell")
    .hand(P2, GUST, "gust");
  if (withJhin) {
    s = s.unit(P2, "bf1", JHIN, "jhin");
  }
  if (withW) {
    s = s.unit(P2, "bf2", { might: 3, name: "W" }, "w");
  }
  if (gearInHand) {
    s = s.hand(P1, TREASURE_TROVE, "trove");
  }
  return s;
}

/** Flatten the `targets` field of the seat's Sky Cruiser activation into the set of card ids offered. */
function targetsOffered(game: Game, seat: "p1" | "p2" = "p1"): string[] {
  const opt = game[seat].option(ABILITY_KEY);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

const listed = (game: Game, seat: "p1" | "p2" = "p1") => game[seat].legal().some((o) => o.key === ABILITY_KEY);

describe("Sky Cruiser × Jhin (Deflect) × Gust — activation pipeline 402 → 403 → 404", () => {
  // ── (a) full pool, gear in hand, Jhin + W at battlefields ───────────────────────────────────────

  test("(a) listed; BOTH Jhin (Deflect, surcharge payable) and W are selectable; the discard field offers the gear only", async () => {
    const game = await board().build();
    expect(listed(game)).toBe(true);
    expect(targetsOffered(game)).toEqual(["jhin", "w"]);
    const discardField = game.p1.option(ABILITY_KEY)?.fields.find((f) => f.arg === "discard");
    expect(discardField?.options).toEqual(["trove"]); // not the unit / spell in hand
  });

  test("(a) choosing Jhin: gear → trash, 1 energy AND the Deflect [rainbow] (1 power) leave the pool, Sky Cruiser exhausts — all BEFORE P2 gets priority (404.1, 809.1.c, 406.4)", async () => {
    const game = await board().build();
    await game.p1.activate("sky", 0, { discard: "trove", targets: "jhin" });
    // Everything is paid at finalization; the item is on the chain, nothing resolved yet.
    expect(game.zoneOf("trove")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    expect(game.state("sky").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sky", controller: P1, targets: ["jhin"], triggered: false })]);
    expect(game.state("jhin").damage).toBe(0);
    // P1 (who added the item) holds priority first; after passing, P2 may react.
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true); // a Reaction window exists (406.4)
  });

  test("(a) resolves: 4 damage ≥ Jhin's 4 Might ⇒ Jhin is killed (owner's trash); Sky Cruiser stays exhausted in base", async () => {
    const game = await board().build();
    await game.p1.activate("sky", 0, { discard: "trove", targets: "jhin" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("jhin")).toBe("trash");
    expect(game.state("sky")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("(a) choosing W instead: NO Deflect surcharge — only [1] energy is spent, the power stays; W (3 Might) dies to 4 damage", async () => {
    const game = await board().build();
    await game.p1.activate("sky", 0, { discard: "trove", targets: "w" });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("mind")).toBe(1);
    await game.settle();
    expect(game.zoneOf("w")).toBe("trash");
    expect(game.zoneOf("jhin")).toBe("battlefield-bf1");
  });

  // ── (b) 1 energy, 0 power ───────────────────────────────────────────────────────────────────────

  test("(b) pool 1 energy / 0 power: still listed, but ONLY W is a legal pick — Jhin's total [1]+[rainbow] is unpayable (402.3, 809.1.c); forcing Jhin is refused with nothing paid", async () => {
    const game = await board({ power: 0 }).build();
    expect(listed(game)).toBe(true);
    expect(targetsOffered(game)).toEqual(["w"]);
    const r = await game.p1.try((p) => p.activate("sky", 0, { discard: "trove", targets: "jhin" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("trove")).toBe("hand");
    expect(game.p1.energy()).toBe(1);
    expect(game.state("sky").isReady).toBe(true);
    expect(game.chain()).toEqual([]);
  });

  // ── (c) only Jhin at any battlefield, no power ──────────────────────────────────────────────────

  test("(c) 0 power and Jhin is the ONLY unit at a battlefield: the ability is ABSENT from P1's legal list (402.3) — not a rejected click", async () => {
    const game = await board({ power: 0, withW: false }).build();
    expect(game.p2.units("bf1")).toEqual(["jhin"]);
    expect(listed(game)).toBe(false);
    expect(targetsOffered(game)).toEqual([]);
    expect((await game.p1.try((p) => p.activate("sky", 0, { discard: "trove", targets: "jhin" }))).ok).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (d) no gear in hand ─────────────────────────────────────────────────────────────────────────

  test("(d) pool and targets fine but NO gear in hand (only a unit + a spell): ABSENT (404.1 / 414.4 analog); a forced attempt opens no target prompt and changes nothing", async () => {
    const game = await board({ gearInHand: false }).build();
    expect(game.p1.hand().sort()).toEqual(["bigSpell", "grunt"]);
    expect(listed(game)).toBe(false);
    const r = await game.p1.try((p) => p.activate("sky", 0, { targets: "jhin" }));
    expect(r.ok).toBe(false);
    // No dead-end prompt: P1 is still in the ordinary open main-phase menu.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.hand().sort()).toEqual(["bigSpell", "grunt"]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } });
    expect(game.state("sky").isReady).toBe(true);
    expect(game.chain()).toEqual([]);
  });

  test("(d) a unit or spell in hand can never be named as the 'discard a gear' cost", async () => {
    const game = await board().build();
    expect((await game.p1.try((p) => p.activate("sky", 0, { discard: "grunt", targets: "w" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.activate("sky", 0, { discard: "bigSpell", targets: "w" }))).ok).toBe(false);
    expect(game.zoneOf("grunt")).toBe("hand");
    expect(game.zoneOf("bigSpell")).toBe("hand");
    expect(game.chain()).toEqual([]);
  });

  // ── (e) no unit at any battlefield ──────────────────────────────────────────────────────────────

  test("(e) gear in hand, pool fine, but every unit is in a base: ABSENT — 'a unit at a battlefield' has no legal object (402.3)", async () => {
    const game = await board({ withJhin: false, withW: false }).unit(P2, "base", { might: 2, name: "Homebody" }, "homebody").build();
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.cardsAt("bf2")).toEqual([]);
    expect(listed(game)).toBe(false);
    expect((await game.p1.try((p) => p.activate("sky", 0, { discard: "trove", targets: "homebody" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.activate("sky", 0, { discard: "trove", targets: "sky" }))).ok).toBe(false);
    expect(game.zoneOf("trove")).toBe("hand");
  });

  // ── (f) Gust bounces the target in response ─────────────────────────────────────────────────────

  test("(f) P1 targets W, P2 responds with Gust on W: W → P2's hand first; Sky Cruiser's ability then fizzles — gear stays in trash, energy stays spent, Sky Cruiser stays exhausted, nobody is damaged", async () => {
    const game = await board().build();
    await game.p1.activate("sky", 0, { discard: "trove", targets: "w" });
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("gust", { targets: "w" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["sky", "gust"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("w")).toBe("hand");
    expect(game.zoneOf("gust")).toBe("trash");
    // Costs are never refunded.
    expect(game.zoneOf("trove")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
    expect(game.state("sky").isExhausted).toBe(true);
    // Nothing else took the 4.
    expect(game.state("jhin")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("sky").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(f) discarding Treasure Trove from HAND is not 'leaving the board': no draw, no rune channeled for P1", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    const runes = game.p1.runes().length;
    await game.p1.activate("sky", 0, { discard: "trove", targets: "w" });
    expect(game.chain()).toHaveLength(1); // just the Sky Cruiser item — no Trove trigger
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand - 1); // Trove discarded, nothing drawn
    expect(game.p1.runes()).toHaveLength(runes);
  });

  // ── (g) location of the source / who & when ─────────────────────────────────────────────────────

  test("(g) Sky Cruiser sits in BASE (not at a battlefield) and the ability is still listed — 380 only needs the source on the board; the target is what must be at a battlefield", async () => {
    const game = await board().build();
    expect(game.locationOf("sky")).toBe("base");
    expect(listed(game)).toBe(true);
    expect(targetsOffered(game)).not.toContain("sky");
  });

  test("(g) never listed for P2 (191.4.a) — not on P1's turn, not on P2's own turn", async () => {
    const onP1Turn = await board().resources(P2, { energy: 3, power: { mind: 2 } }).build();
    expect(listed(onP1Turn, "p2")).toBe(false);
    const onP2Turn = await board().active(P2).resources(P2, { energy: 3, power: { mind: 2 } }).hand(P2, TREASURE_TROVE, "p2trove").build();
    expect(onP2Turn.turnPlayer()).toBe(P2);
    expect(listed(onP2Turn, "p2")).toBe(false);
    expect(onP2Turn.p2.legal().some((o) => o.card === "sky")).toBe(false);
  });

  test("(g) not listed for P1 during P2's turn (381 — no [Reaction]/[Action] tag)", async () => {
    const game = await board().active(P2).build();
    expect(listed(game)).toBe(false);
    expect((await game.p1.try((p) => p.activate("sky", 0, { discard: "trove", targets: "w" }))).ok).toBe(false);
  });

  test("(g) not listed for P1 in a Closed state / showdown on P1's own turn: P1 moves a unit into bf2 (showdown, P1 has Focus) — Sky Cruiser is ready but its ability is not offered (381)", async () => {
    const game = await board().unit(P1, "base", { might: 2, name: "Scout" }, "scout").build();
    expect(listed(game)).toBe(true);
    await game.p1.move("scout", "bf2");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("sky").isReady).toBe(true);
    expect(listed(game)).toBe(false);
  });

  test("(g) not listed while a chain is open either (P1 holding priority over its own pending item is a Closed state)", async () => {
    const game = await board().unit(P1, "base", SKY_CRUISER, "sky2").hand(P1, TREASURE_TROVE, "trove2").resources(P1, { energy: 2, power: { mind: 2 } }).build();
    expect(game.p1.legal().some((o) => o.key === "activateAbility:sky2#0")).toBe(true);
    await game.p1.activate("sky", 0, { discard: "trove", targets: "w" });
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.p1.legal().some((o) => o.key === "activateAbility:sky2#0")).toBe(false);
  });
});
