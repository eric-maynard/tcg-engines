/**
 * Interaction: Determined Sentry (unl-111-219) · Unit · Body · 1 · 1 Might · "I can't move to base."
 *   × Corrupted Dragon (ven-091-166) · Unit · Body · 10 + 2 power · 10 Might
 *     "If your score is not within 3 points of the Victory Score, I enter ready.
 *      When I attack, you may move any number of enemy units here each with 5 [Might] or less to their base."
 *   × Zhonya's Hourglass (ogn-077-298) · Gear · Calm · 2
 *     "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it.
 *      (Send it to base. This isn't a move.)"
 *   × Flash (ogs-011-024) · Spell · Chaos · 2 · "[Reaction] Move up to 2 friendly units to base."
 *
 * Rules: 054.1 (can't beats can), 144.4.b (battlefield → base is a Standard-Move destination), 355.4.a (a
 * Move effect's valid location = one where the unit may be present), 358.3.a (a prevented game action does
 * not make the card/choice illegal — it is skipped on resolution), 359.3.e.6 (impossible instruction is
 * ignored — the Ride-the-Wind-at-Vilemaw's-Lair example), 455 / 456.1 / 456.3 (a Recall is not a Move,
 * fires no move triggers, and cannot be prevented by movement restrictions), 466.1.a.2 (combat cleanup),
 * 370.1.a.1 (Zhonya's replaces the death: the kill never happened).
 *
 * Board: P2 controls bfA with Determined Sentry (1) and vanilla V (3); P2 has a face-up Zhonya's Hourglass
 * in base. P1 has a READY Corrupted Dragon (10) in base.
 *
 * Q / Expected:
 *   (a) P2's turn: the ready Sentry is offered NO Standard Move to base (option absent, not offered-then-
 *       rejected); V is. Flash choosing Sentry + V is LEGAL (358.3.a); on resolution V moves home, the
 *       Sentry's move is ignored (359.3.e.6), Flash is spent.
 *   (b) P1's turn: Dragon moves base → A; its attack trigger offers BOTH Sentry (1) and V (3) ("enemy unit
 *       here with ≤5 Might"); P1 picks both → V to P2's base, Sentry stays at A as the lone defender.
 *   (c) Combat 10 vs 1: Sentry would die → Zhonya's is killed instead, Sentry healed, exhausted and
 *       RECALLED to P2's base — "can't move to base" does not stop a recall (456.3). Dragon alone at A →
 *       P1 conquers A, +1 point; Dragon healed (0 damage). No move trigger fires off the recall (456.1).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SENTRY = "unl-111-219";
const DRAGON = "ven-091-166";
const ZHONYAS = "ogn-077-298";
const FLASH = "ogs-011-024";

type Pick = Extract<Decision, { kind: "pick" }>;

/** P2 holds bfA with Sentry + V and owns a face-up Zhonya's; P1's ready Dragon waits in base. `active` = whose turn. */
function board(active: typeof P1 | typeof P2 = P1) {
  return scenario()
    .active(active)
    .resources(P2, { energy: 2 })
    .battlefield("bfA", { controller: P2 })
    .unit(P2, "bfA", SENTRY, "sentry")
    .unit(P2, "bfA", { might: 3, name: "Vanilla V" }, "v")
    .gear(P2, ZHONYAS, "zhonyas")
    .hand(P2, FLASH, "flash")
    .unit(P1, "base", DRAGON, "dragon");
}

/** Unit ids appearing in P2's "Standard Move → base" option ([] when the option is absent). */
function p2UnitsOfferedToBase(game: Game): string[] {
  const field = game.p2.option("standardMove:to:base")?.fields.find((f) => f.name === "unitIds");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

/** Card ids appearing anywhere in Flash's offered target tuples for P2. */
function flashTargetsOffered(game: Game): string[] {
  const field = game.p2.option("cast", "flash")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

/** Dragon attacks bfA; P1 opts into the trigger and is shown the "any number of enemy units here ≤5" set. */
async function dragonAttacks(game: Game): Promise<Pick> {
  await game.p1.move("dragon", "bfA");
  expect(game.state("dragon").combatRole).toBe("attacker");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
  await game.p1.yes();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
  return d as Pick;
}

/** Everyone passes priority until the chain is empty. */
async function passOutChain(game: Game): Promise<void> {
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      break;
    }
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
}

describe("Determined Sentry × Corrupted Dragon × Zhonya's Hourglass — 'can't move to base' vs move effects vs recall", () => {
  // ── (a) P2's own turn: Standard Move and Flash ─────────────────────────────────────────────────
  test("(a) the ready Sentry is NOT offered a Standard Move bfA → base (the option lists only V); forcing it is rejected and exhausts nothing (144.4.b vs 054.1)", async () => {
    const game = await board(P2).build();
    expect(game.state("sentry")).toMatchObject({ isReady: true, location: "bfA" });
    expect(game.state("sentry").keywords).toContain("NoMoveToBase");
    expect(p2UnitsOfferedToBase(game)).toEqual(["v"]);
    expect(game.p2.can("gank", "sentry")).toBe(false); // no Ganking → no legal Standard Move at all
    const r = await game.p2.try((p) => p.move("sentry", "base"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("sentry")).toBe("bfA");
    expect(game.state("sentry").isReady).toBe(true);
    // …and a bundle that includes the Sentry is refused as a whole.
    expect((await game.p2.try((p) => p.move(["sentry", "v"], "base"))).ok).toBe(false);
    expect(game.locationOf("v")).toBe("bfA");
  });

  test("(a) Flash: the Sentry IS a legal choice alongside V (355.4.a, 358.3.a) — casting it with [sentry, v] is accepted and paid", async () => {
    const game = await board(P2).build();
    expect(flashTargetsOffered(game)).toEqual(["sentry", "v"]);
    await game.p2.cast("flash", { targets: ["sentry", "v"] });
    expect(game.p2.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "flash", controller: P2 })]);
  });

  test("(a) on resolution V moves to base but the Sentry's move instruction is impossible and IGNORED (359.3.e.6): Sentry stays at bfA, P2 keeps bfA, Flash → trash", async () => {
    const game = await board(P2).build();
    await game.p2.cast("flash", { targets: ["sentry", "v"] });
    await game.settle();
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.locationOf("v")).toBe("base");
    expect(game.locationOf("sentry")).toBe("bfA");
    expect(game.state("sentry").isReady).toBe(true);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P2 });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) P1's turn: the Dragon attacks ──────────────────────────────────────────────────────────
  test("(b) the Dragon's attack trigger offers BOTH enemy units here with ≤5 Might — Sentry (1) and V (3) — as an 'any number' set at finalization; the restriction does not remove Sentry from the offer (358.3.a)", async () => {
    const game = await board(P1).build();
    const d = await dragonAttacks(game);
    expect(d.options.map((o) => o.key).sort()).toEqual(["sentry", "v"]);
  });

  test("(b) P1 picks both: on resolution V is moved to P2's base, the Sentry's move is ignored (054.1 + 359.3.e.6) — it remains at bfA as the lone Defender; the Dragon stays", async () => {
    const game = await board(P1).build();
    await dragonAttacks(game);
    await game.p1.pick("sentry", "v");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dragon", triggered: true })]);
    expect(game.locationOf("v")).toBe("bfA"); // nothing moves before resolution
    await passOutChain(game);
    expect(game.locationOf("v")).toBe("base");
    expect(game.state("v")).toMatchObject({ combatRole: null, controller: P2 });
    expect(game.locationOf("sentry")).toBe("bfA");
    expect(game.state("sentry").combatRole).toBe("defender");
    expect(game.locationOf("dragon")).toBe("bfA");
    expect(game.p2.units("bfA")).toEqual(["sentry"]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // P1 still has Focus
  });

  // ── (c) combat: Zhonya's recalls the Sentry home despite "can't move to base" ──────────────────
  test("(c) combat 10 vs 1: the Sentry would die → Zhonya's Hourglass is killed INSTEAD (→ P2's trash) and the Sentry is healed, exhausted and RECALLED to P2's base — a recall is not a move (455, 456.3)", async () => {
    const game = await board(P1).build();
    await dragonAttacks(game);
    await game.p1.pick("sentry", "v");
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.p2.trash()).toContain("zhonyas");
    expect(game.zoneOf("sentry")).toBe("base");
    expect(game.state("sentry")).toMatchObject({ combatRole: null, controller: P2, damage: 0, isExhausted: true, location: "base" });
    expect(game.p2.trash()).not.toContain("sentry");
  });

  test("(c) the Dragon is then alone at bfA → P1 CONQUERS bfA and scores 1; the Dragon is healed at combat cleanup (took 1 from the Sentry); V sits in P2's base", async () => {
    const game = await board(P1).build();
    await dragonAttacks(game);
    await game.p1.pick("sentry", "v");
    await game.settle();
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.state("dragon")).toMatchObject({ damage: 0, location: "bfA" });
    expect(game.locationOf("v")).toBe("base");
    expect(game.p2.units("base").sort()).toEqual(["sentry", "v"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) no 'When I move'-style trigger fires off the recall (456.1): with a move-probe Sentry stand-in nothing is drawn — contrast V, which WAS moved by the Dragon", async () => {
    // A 1-Might "can't move to base" unit that also says "When I move, draw 1." — the recall must not fire it.
    const PROBE = {
      abilities: [
        { effect: { keyword: "NoMoveToBase", target: "self", type: "grant-keyword" }, type: "static" },
        { effect: { amount: 1, type: "draw" }, trigger: { event: "move", on: "self" }, type: "triggered" },
      ],
      cardType: "unit",
      might: 1,
      name: "Probe Sentry",
    };
    const MOVER = {
      abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "move", on: "self" }, type: "triggered" }],
      cardType: "unit",
      might: 3,
      name: "Probe V",
    };
    const game = await scenario()
      .battlefield("bfA", { controller: P2 })
      .unit(P2, "bfA", PROBE, "sentry")
      .unit(P2, "bfA", MOVER, "v")
      .gear(P2, ZHONYAS, "zhonyas")
      .unit(P1, "base", DRAGON, "dragon")
      .build();
    const hand0 = game.p2.hand().length;
    await dragonAttacks(game);
    await game.p1.pick("sentry", "v");
    await passOutChain(game);
    // V really moved → its move trigger drew 1 (after its own chain item resolved).
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("base"); // recalled by Zhonya's
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(hand0 + 1); // exactly one draw: V's move; none for the Sentry's recall
    expect(game.p1.points()).toBe(1);
  });
});
