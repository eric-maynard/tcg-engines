/**
 * Interaction: Lotus Trap (unl-013-219) · Reaction spell · Fury · 2
 *     "Choose a unit. Double all damage that would be dealt to it this turn."            — played by P1
 *   × Ki Barrier (ven-126-166) · Reaction spell · Order · 2 + [order]
 *     "Choose a unit. Prevent the next 7 damage that would be dealt to it this turn."     — played by P2
 *   on P2's Playful Phantom (ogn-049-298, 5 Might, vanilla) alone at bf1, then hit by
 *   × Void Seeker (ogn-024-298) "Deal 4 to a unit at a battlefield. Draw 1."   or attacked by
 *   × Mega-Mech (ogn-088-298, 8 Might, vanilla).
 *
 * Rules: 372 (two replacement effects on one event → the controller of the AFFECTED OBJECT orders them —
 * P2 here, not the caster of either spell, not the turn player), 437.2 / 437.2.a / 437.4 (prevented to 0 =
 * not dealt), 437.3 / 437.3.a (Prevent Value counts down and expires at 0), 437.7 (Prevent is a delayed
 * replacement), 465.2.c.5 (in combat the replacements apply to the ASSIGNMENT — its third example is
 * literally Lotus Trap + a prevent), 465.2.d (the assigned amount is then dealt, not doubled again), 367.
 *
 * Expected:
 *   (a) Void Seeker 4 — P2 orders. Prevent first: 4−4=0 (PV 7→3), 0×2=0 → nothing dealt, shield stays at 3.
 *       Double first: 8, −7 → 1 dealt, shield spent. P1 draws 1 either way.
 *   (b) Mega-Mech 8 into the lone Phantom — P2 orders before damage is assigned. Prevent first: (8−7)×2 = 2
 *       dealt → Phantom (5) lives, hits back for 5, Mega-Mech (8) lives → attacker recalled, P2 keeps bf1.
 *       Double first: 16−7 = 9 dealt → Phantom dies, Mega-Mech conquers. Never doubled twice.
 *   Contrast — Lotus Trap alone: one replacement, no ordering prompt; Void Seeker deals 8 (dies), combat 16.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LOTUS_TRAP = "unl-013-219";
const KI_BARRIER = "ven-126-166";
const VOID_SEEKER = "ogn-024-298";
const PLAYFUL_PHANTOM = "ogn-049-298";
const MEGA_MECH = "ogn-088-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn. P2 holds bf1 with a lone Playful Phantom (5) and has Ki Barrier + exactly 2 + [order].
 * P1 has Mega-Mech (8) in base, Lotus Trap + Void Seeker in hand and plenty of fury/energy.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 10, power: { fury: 3 } })
    .resources(P2, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", PLAYFUL_PHANTOM, "phantom")
    .unit(P1, "base", MEGA_MECH, "mech")
    .hand(P1, LOTUS_TRAP, "lotus")
    .hand(P1, VOID_SEEKER, "seeker")
    .hand(P2, KI_BARRIER, "ki");
}

/** P1 Lotus-Traps the Phantom, P2 answers with Ki Barrier on it; both resolve (Ki Barrier first, LIFO). */
async function applyBoth(game: Game): Promise<void> {
  await game.p1.cast("lotus", { targets: "phantom" });
  await game.p1.passPriority();
  await game.p2.cast("ki", { targets: "phantom" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["lotus", "ki"]);
  await game.settle();
  expect(game.chain()).toEqual([]);
}

/** Only Lotus Trap on the Phantom (Ki Barrier stays in P2's hand). */
async function applyLotusOnly(game: Game): Promise<void> {
  await game.p1.cast("lotus", { targets: "phantom" });
  await game.settle();
  expect(game.chain()).toEqual([]);
}

/** The dealt-damage records for one unit (public state, newest last). */
function damageTo(game: Game, unit: string) {
  return (game.gameState.damageLog ?? []).filter((r) => r.target === unit);
}

describe("Lotus Trap × Ki Barrier on one unit — the affected unit's controller orders them (372) and the order flips lethal", () => {
  test("premise: after both resolve the Phantom carries Double-incoming-damage (this turn) AND a Prevent Value of 7; it is undamaged at bf1", async () => {
    const game = await board().build();
    await applyBoth(game);
    expect(game.state("phantom").grantedKeywords).toEqual([expect.objectContaining({ duration: "turn", keyword: "DoubleIncomingDamage" })]);
    expect(game.state("phantom").meta.damagePreventionShield).toBe(7);
    expect(game.state("phantom")).toMatchObject({ damage: 0, might: 5, zone: "battlefield-bf1" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("lotus")).toBe("trash");
    expect(game.zoneOf("ki")).toBe("trash");
  });

  // ── (a) spell damage: Void Seeker 4 ────────────────────────────────────────────────────────

  test("(a) Void Seeker resolving into both effects asks P2 — the Phantom's controller, not the caster/turn player P1 — to order exactly the two replacements; nothing is dealt until P2 answers (372)", async () => {
    const game = await board().build();
    await applyBoth(game);
    await game.p1.cast("seeker", { targets: "phantom" });
    const settled = await game.settle();
    expect(settled.reason).toBe("unanswered");
    const d = game.decision();
    expect(game.actingSeat()).toBe(P2);
    expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "replacement-order", allowDecline: false });
    expect(d?.kind === "pick" ? d.source?.cardId : undefined).toBe("phantom");
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key).sort() : [];
    expect(keys).toEqual(["double", "prevent-shield"]);
    expect(d?.kind === "pick" ? d.options.find((o) => o.key === "prevent-shield")?.card : undefined).toBe("ki");
    expect(game.state("phantom").damage).toBe(0);
    expect(damageTo(game, "phantom")).toEqual([]);
  });

  test("(a) P2 orders Prevent first: 4 prevented (PV 7→3), the 0 remainder doubles to 0 → no damage dealt at all (437.2.a, 437.4); Ki Barrier persists at 3; P1 still draws 1", async () => {
    const game = await board().build();
    await applyBoth(game);
    const hand = game.p1.hand().length; // includes seeker
    await game.p1.cast("seeker", { targets: "phantom" });
    await game.settle();
    await game.p2.pick("prevent-shield");
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.state("phantom").damage).toBe(0);
    expect(game.zoneOf("phantom")).toBe("battlefield-bf1");
    expect(game.state("phantom").meta.damagePreventionShield).toBe(3);
    expect(damageTo(game, "phantom").every((r) => r.amount === 0)).toBe(true); // 437.4 — nothing was dealt
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(a) P2 orders Double first: 4→8, prevent 7 → exactly 1 damage marked; the Prevent Value hits 0 and Ki Barrier's shield expires (437.3.a); P1 draws 1", async () => {
    const game = await board().build();
    await applyBoth(game);
    const hand = game.p1.hand().length;
    await game.p1.cast("seeker", { targets: "phantom" });
    await game.settle();
    await game.p2.pick("double");
    await game.settle();
    expect(game.state("phantom").damage).toBe(1);
    expect(game.zoneOf("phantom")).toBe("battlefield-bf1");
    expect(game.state("phantom").meta.damagePreventionShield).toBeUndefined();
    expect(damageTo(game, "phantom").at(-1)).toMatchObject({ amount: 1, combat: false, original: 4 });
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    // The doubling itself is still live for the rest of the turn — only the shield is gone.
    expect(game.state("phantom").keywords).toContain("DoubleIncomingDamage");
  });

  // ── (b) combat damage: Mega-Mech 8 into the lone Phantom ───────────────────────────────────

  test("(b) Mega-Mech attacks: before any combat damage is assigned P2 is asked to order the two replacements on its Phantom (372, 465.2.c.5)", async () => {
    const game = await board().build();
    await applyBoth(game);
    await game.p1.move("mech", "bf1");
    const settled = await game.settle(); // both pass focus → combat damage step
    expect(settled.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "replacement-order" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["double", "prevent-shield"]);
    expect(game.zoneOf("phantom")).toBe("battlefield-bf1");
    expect(game.locationOf("mech")).toBe("bf1");
    expect(damageTo(game, "phantom")).toEqual([]);
  });

  test("(b) Prevent first: 8−7 = 1, doubled → exactly 2 assigned and dealt (not re-doubled at 465.2.d); Phantom (5) survives, Mega-Mech takes 5 and survives → attacker recalled, P2 keeps bf1, no point for P1", async () => {
    const game = await board().build();
    await applyBoth(game);
    await game.p1.move("mech", "bf1");
    await game.settle();
    await game.p2.pick("prevent-shield");
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    const hit = damageTo(game, "phantom");
    expect(hit).toHaveLength(1);
    expect(hit[0]).toMatchObject({ amount: 2, combat: true, original: 8 });
    expect(damageTo(game, "mech").at(-1)).toMatchObject({ amount: 5, combat: true });
    expect(game.zoneOf("phantom")).toBe("battlefield-bf1");
    expect(game.locationOf("mech")).toBe("base"); // 466.1.a.2 — recalled while a defender remains
    expect(game.zoneOf("mech")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.state("phantom").meta.damagePreventionShield).toBeUndefined(); // all 7 used up at assignment
  });

  test("(b) Double first: 16−7 = exactly 9 assigned and dealt (not 18); Phantom dies, Mega-Mech survives the 5 back and conquers bf1 for 1 point", async () => {
    const game = await board().build();
    await applyBoth(game);
    await game.p1.move("mech", "bf1");
    await game.settle();
    await game.p2.pick("double");
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    const hit = damageTo(game, "phantom");
    expect(hit).toHaveLength(1);
    expect(hit[0]).toMatchObject({ amount: 9, combat: true, original: 8 });
    expect(game.zoneOf("phantom")).toBe("trash");
    expect(game.locationOf("mech")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("(b) the order is the whole difference: same board, same attack — Prevent-first keeps the Phantom and bf1 for P2, Double-first loses both", async () => {
    const outcomes: Record<string, { phantom: string; bf1: string | null }> = {};
    for (const first of ["prevent-shield", "double"]) {
      const game = await board().build();
      await applyBoth(game);
      await game.p1.move("mech", "bf1");
      await game.settle();
      await game.p2.pick(first);
      await game.settle();
      outcomes[first] = { bf1: game.gameState.battlefields.bf1?.controller ?? null, phantom: game.zoneOf("phantom") };
      expect(game.violations()).toEqual([]);
    }
    expect(outcomes).toEqual({
      double: { bf1: P1, phantom: "trash" },
      "prevent-shield": { bf1: P2, phantom: "battlefield-bf1" },
    });
  });

  // ── contrast: Lotus Trap alone — a single replacement, nothing to order ────────────────────

  test("contrast: with ONLY Lotus Trap there is no ordering prompt — Void Seeker's 4 doubles to 8 and kills the 5-Might Phantom outright", async () => {
    const game = await board().build();
    await applyLotusOnly(game);
    await game.p1.cast("seeker", { targets: "phantom" });
    const settled = await game.settle();
    expect(settled.reason).toBe("open"); // never stopped on a P2 prompt
    expect(game.zoneOf("phantom")).toBe("trash");
    expect(damageTo(game, "phantom").at(-1)).toMatchObject({ amount: 8, original: 4 });
    expect(game.zoneOf("ki")).toBe("hand");
  });

  test("contrast: with ONLY Lotus Trap, Mega-Mech's 8 is assigned as 16 with no prompt for anyone; Phantom dies and P1 conquers", async () => {
    const game = await board().build();
    await applyLotusOnly(game);
    await game.p1.move("mech", "bf1");
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(damageTo(game, "phantom").at(-1)).toMatchObject({ amount: 16, combat: true, original: 8 });
    expect(game.zoneOf("phantom")).toBe("trash");
    expect(game.locationOf("mech")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
