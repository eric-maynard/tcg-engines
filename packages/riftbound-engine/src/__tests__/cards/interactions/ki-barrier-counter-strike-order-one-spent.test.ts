/**
 * Interaction: Ki Barrier (ven-126-166) · Reaction spell · Order · 2 + [order]
 *     "Choose a unit. Prevent the next 7 damage that would be dealt to it this turn."
 *   × Counter Strike (sfd-194-221) · Reaction spell · Calm/Body · 2 + [rainbow]
 *     "Choose a unit. The next time that unit would be dealt damage this turn, prevent it. Draw 1."
 *   both from P2 on P2's Playful Phantom (ogn-049-298, vanilla 5 Might) alone at bf1, then on P1's turn:
 *   × Void Seeker (ogn-024-298) "Deal 4 to a unit at a battlefield. Draw 1."      — P1
 *   × Mega-Mech (ogn-088-298, vanilla 8 Might) attacks the Phantom              — P1
 *
 * Question: (a) Two replacement effects want the same damage event — who orders them: P1 (caster / turn
 * player) or P2? (b) Are BOTH shields used up by the 4, or only one — and does the order decide WHICH one
 * survives? (c) Does the Phantom "take damage" from Void Seeker; does P1 still draw? (d) In the following
 * combat, what is dealt to the Phantom under each earlier ordering, and what is the combat result?
 *
 * Rules: 372 (the controller of the AFFECTED object orders replacements — P2), 437.2 / 437.2.a (prevented →
 * "deal 0" ≡ not dealing damage), 437.3 / 437.3.a / 437.3.b (Prevent Value counts down; expires at 0),
 * 437.4 + 417.1.e.1 (fully prevented damage was never dealt), 437.5 + 465.2.c.5 (in combat replacements
 * apply at assignment), 437.7 (Prevent is a delayed replacement), 370.2 (each replacement applies at most
 * once per event chain — it is not FORCED to apply), 371.2.b (an unapplied replacement is not used up),
 * 466.1.a.2 (attackers recalled while a defender remains).
 *
 * Expected:
 *   (a) P2 — the Phantom's controller — is asked to order the two effects (a replacement-order Decision).
 *   (b) Only ONE shield is consumed and P2's order picks which. Order A (Ki first): 4 prevented → deal 0,
 *       PV 7→3; Counter Strike no longer sees a "would be dealt damage" event → NOT applied, stays armed.
 *       Order B (Counter Strike first): 4 prevented → deal 0, Counter Strike expires; Ki has nothing left to
 *       prevent → not applied, PV stays 7.
 *   (c) Either way 0 is dealt: no damage marked, the Phantom was not dealt damage; P1 still draws 1.
 *   (d) Mega-Mech assigns all 8 to the lone Phantom. After Order B only Ki(7) is live: 8−7 = 1 dealt, Ki
 *       expires, Phantom (5) survives with 1 (healed at cleanup), hits back for 5, Mega-Mech (8) survives →
 *       recalled, P2 keeps bf1; the Phantom WAS dealt damage this turn. After Order A both shields are
 *       live → P2 orders again; CS first ⇒ 0 dealt and Ki PV 3 remains; Phantom undamaged, same recall.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const KI_BARRIER = "ven-126-166";
const COUNTER_STRIKE = "sfd-194-221";
const VOID_SEEKER = "ogn-024-298";
const PLAYFUL_PHANTOM = "ogn-049-298";
const MEGA_MECH = "ogn-088-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn. P2 holds bf1 with a lone Playful Phantom (5) and holds Ki Barrier + Counter Strike with
 * exactly 4 energy, 1 order, 1 rainbow. P1 has Mega-Mech (8) in base, Void Seeker in hand and exactly 3 + [fury].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .resources(P2, { energy: 4, power: { order: 1, rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", PLAYFUL_PHANTOM, "phantom")
    .unit(P1, "base", MEGA_MECH, "mech")
    .hand(P1, VOID_SEEKER, "seeker")
    .hand(P2, KI_BARRIER, "ki")
    .hand(P2, COUNTER_STRIKE, "cs");
}

/**
 * P1 casts Void Seeker at the Phantom and passes; P2 responds with Ki Barrier then Counter Strike on it.
 * Both reactions resolve (LIFO: Counter Strike, then Ki Barrier) and Void Seeker is left alone on the chain
 * with P1 holding priority.
 */
async function shieldsUp(game: Game): Promise<void> {
  await game.p1.cast("seeker", { targets: "phantom" });
  await game.p1.passPriority();
  await game.p2.cast("ki", { targets: "phantom" });
  await game.p2.cast("cs", { targets: "phantom" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["seeker", "ki", "cs"]);
  while (game.chain().length > 1 && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["seeker"]);
}

/** Let Void Seeker resolve; if the engine asks P2 to order the two prevents, answer with `first`. Returns whether it asked. */
async function resolveSeeker(game: Game, first: "prevent-shield" | "prevent-next"): Promise<boolean> {
  const stop = await game.settle();
  const d = game.decision();
  if (stop.reason === "unanswered" && d?.kind === "pick" && d.semantics === "replacement-order") {
    await game.p2.pick(first);
    await game.settle();
    return true;
  }
  return false;
}

const csArmed = (game: Game) => game.state("phantom").meta.preventNextDamageInstance === true;
const kiValue = (game: Game) => game.state("phantom").meta.damagePreventionShield as number | undefined;
const damageTo = (game: Game, unit: string) => (game.gameState.damageLog ?? []).filter((r) => r.target === unit);

describe("Ki Barrier + Counter Strike on one unit × Void Seeker, then Mega-Mech — P2 orders, only one shield is spent", () => {
  test("premise: both P2 reactions resolve — Counter Strike first (P2 draws 1), then Ki Barrier; the Phantom tracks a one-shot prevent AND a Prevent Value of 7; P2 paid 4 / [order] / [rainbow]", async () => {
    const game = await board().build();
    const p2Deck = game.p2.deck().length;
    await shieldsUp(game);
    expect(csArmed(game)).toBe(true);
    expect(kiValue(game)).toBe(7);
    expect(game.state("phantom")).toMatchObject({ damage: 0, might: 5, zone: "battlefield-bf1" });
    expect(game.p2.hand()).toHaveLength(1); // both spells left, Counter Strike drew 1
    expect(game.p2.deck()).toHaveLength(p2Deck - 1);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0, rainbow: 0 } });
    expect(game.zoneOf("ki")).toBe("trash");
    expect(game.zoneOf("cs")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  // ── (a) who orders ─────────────────────────────────────────────────────────────────────────

  // Expected (372): two replacement effects qualify for the one "deal 4" event, so the controller of the
  // affected Phantom — P2 — is asked which applies first (the answer decides which shield survives).
  // Actual: the engine treats two Prevents as commuting (same 0 dealt), never asks, and always spends
  // Counter Strike first.
  test("(a) Void Seeker resolving into both shields surfaces a replacement-order Decision for P2 (the Phantom's controller, not caster/turn player P1) listing exactly the two prevents (372)", async () => {
    const game = await board().build();
    await shieldsUp(game);
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    expect(game.actingSeat()).toBe(P2);
    expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "replacement-order", allowDecline: false });
    const items = d?.kind === "pick" ? d.options.map((o) => `${o.key}:${o.card}`).sort() : [];
    expect(items).toEqual(["prevent-next:cs", "prevent-shield:ki"]);
    expect(damageTo(game, "phantom")).toEqual([]);
  });

  // ── (c) nothing is dealt either way; P1 still draws ────────────────────────────────────────

  test("(c) whichever order: the 4 becomes 'deal 0' — no damage marked, nothing recorded as dealt to the Phantom (437.2.a, 437.4, 417.1.e.1); Void Seeker's independent 'Draw 1' still happens for P1", async () => {
    for (const first of ["prevent-next", "prevent-shield"] as const) {
      const game = await board().build();
      await shieldsUp(game);
      const p1Hand = game.p1.hand().length; // seeker already on the chain
      const p1Deck = game.p1.deck().length;
      await resolveSeeker(game, first);
      expect(game.chain()).toEqual([]);
      expect(game.zoneOf("seeker")).toBe("trash");
      expect(game.state("phantom").damage).toBe(0);
      expect(game.zoneOf("phantom")).toBe("battlefield-bf1");
      expect(damageTo(game, "phantom").filter((r) => r.amount > 0)).toEqual([]);
      expect(game.state("phantom").meta.dealtDamageThisTurn).not.toBe(true);
      expect(game.p1.hand()).toHaveLength(p1Hand + 1);
      expect(game.p1.deck()).toHaveLength(p1Deck - 1);
      expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
      expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    }
  });

  // ── (b) only ONE shield is consumed ────────────────────────────────────────────────────────

  test("(b) exactly ONE shield is spent by the 4 — never both: either Counter Strike expired with Ki still at 7, or Ki dropped to 3 with Counter Strike still armed (370.2, 371.2.b)", async () => {
    const game = await board().build();
    await shieldsUp(game);
    await resolveSeeker(game, "prevent-next");
    const orderB = !csArmed(game) && kiValue(game) === 7;
    const orderA = csArmed(game) && kiValue(game) === 3;
    expect(orderA || orderB).toBe(true);
    expect(orderA && orderB).toBe(false);
  });

  test("(b) Order B — Counter Strike first: all 4 prevented, Counter Strike expires; Ki Barrier then has nothing to prevent, is NOT applied and keeps its full Prevent Value 7", async () => {
    const game = await board().build();
    await shieldsUp(game);
    await resolveSeeker(game, "prevent-next");
    expect(csArmed(game)).toBe(false);
    expect(kiValue(game)).toBe(7);
    expect(game.state("phantom").meta.damagePreventionSource).toBe("ki");
  });

  // Expected: P2 orders Ki Barrier first → 4 prevented, PV 7→3 (437.3.b); the replaced event is "deal 0",
  // which is not "would be dealt damage", so Counter Strike is not applied and stays armed (371.2.b).
  // Actual: no ordering prompt exists, Counter Strike is always consumed first (see (a)).
  test("(b) Order A — Ki Barrier first: PV 7→3 and Counter Strike stays armed for a later event (437.3.b, 371.2.b)", async () => {
    const game = await board().build();
    await shieldsUp(game);
    const asked = await resolveSeeker(game, "prevent-shield");
    expect(asked).toBe(true);
    expect(kiValue(game)).toBe(3);
    expect(csArmed(game)).toBe(true);
    expect(game.state("phantom").damage).toBe(0);
  });

  // ── (d) the following combat ───────────────────────────────────────────────────────────────

  test("(d) after Order B only Ki (7) is live: Mega-Mech's 8 is assigned to the lone Phantom with NO ordering prompt (one replacement); 8−7 = exactly 1 dealt (valid damage) and Ki expires (437.3.a, 437.5, 465.2.c.5)", async () => {
    const game = await board().build();
    await shieldsUp(game);
    await resolveSeeker(game, "prevent-next");
    expect(kiValue(game)).toBe(7);
    await game.p1.move("mech", "bf1");
    const stop = await game.settle(); // both pass focus → damage step → resolution
    expect(stop.reason).toBe("open"); // never parked on a P2 ordering prompt
    const hit = damageTo(game, "phantom");
    expect(hit).toHaveLength(1);
    expect(hit[0]).toMatchObject({ amount: 1, combat: true, original: 8 });
    expect(hit[0]?.modifiedBy).toEqual([expect.objectContaining({ after: 1, before: 8, key: "prevent-shield", sourceCardId: "ki" })]);
    expect(kiValue(game)).toBeUndefined();
    expect(game.state("phantom").meta.dealtDamageThisTurn).toBe(true); // here the Phantom WAS dealt damage this turn
  });

  test("(d) after Order B: Phantom (5) survives the 1 and is healed at combat cleanup; Mega-Mech takes 5 of 8 and survives → attacker recalled to base (466.1.a.2), P2 keeps bf1, no point for P1", async () => {
    const game = await board().build();
    await shieldsUp(game);
    await resolveSeeker(game, "prevent-next");
    await game.p1.move("mech", "bf1");
    await game.settle();
    expect(game.zoneOf("phantom")).toBe("battlefield-bf1");
    expect(game.state("phantom").damage).toBe(0); // healed in cleanup
    expect(damageTo(game, "mech").at(-1)).toMatchObject({ amount: 5, combat: true });
    expect(game.zoneOf("mech")).toBe("base");
    expect(game.state("mech").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // Expected: after Order A both shields are still live when Mega-Mech's 8 is assigned → P2 is asked to
  // order them again (372 / 465.2.c.5); Counter Strike first ⇒ 0 dealt, Ki PV 3 remains; the Phantom is
  // undamaged, deals 5 back, Mega-Mech survives and is recalled, P2 keeps bf1.
  // Actual: Order A is unreachable (no prompt at the Void Seeker step; Counter Strike already spent).
  test("(d) after Order A both shields are live in combat: P2 orders again, Counter Strike first ⇒ 0 dealt to the Phantom and Ki keeps PV 3; Mega-Mech recalled, P2 keeps bf1", async () => {
    const game = await board().build();
    await shieldsUp(game);
    expect(await resolveSeeker(game, "prevent-shield")).toBe(true);
    expect(csArmed(game)).toBe(true);
    expect(kiValue(game)).toBe(3);
    await game.p1.move("mech", "bf1");
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, semantics: "replacement-order" });
    await game.p2.pick("prevent-next");
    await game.settle();
    expect(damageTo(game, "phantom").filter((r) => r.amount > 0)).toEqual([]);
    expect(game.state("phantom").meta.dealtDamageThisTurn).not.toBe(true);
    expect(csArmed(game)).toBe(false);
    expect(kiValue(game)).toBe(3);
    expect(game.zoneOf("phantom")).toBe("battlefield-bf1");
    expect(game.zoneOf("mech")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("contrast: with ONLY Counter Strike (no Ki Barrier) there is nothing to order — Void Seeker's 4 is wholly prevented, the shield is spent, and Mega-Mech's unmodified 8 then kills the Phantom and conquers bf1", async () => {
    const game = await board().build();
    await game.p1.cast("seeker", { targets: "phantom" });
    await game.p1.passPriority();
    await game.p2.cast("cs", { targets: "phantom" });
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.zoneOf("ki")).toBe("hand");
    expect(csArmed(game)).toBe(false);
    expect(game.state("phantom").damage).toBe(0);
    await game.p1.move("mech", "bf1");
    await game.settle();
    expect(damageTo(game, "phantom").at(-1)).toMatchObject({ amount: 8, combat: true, original: 8 });
    expect(game.zoneOf("phantom")).toBe("trash");
    expect(game.locationOf("mech")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
