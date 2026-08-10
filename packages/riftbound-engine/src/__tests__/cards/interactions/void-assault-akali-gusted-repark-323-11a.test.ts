/**
 * Interaction: who "owns" Contested at an open battlefield when the unit that applied it is bounced
 * before the staged combat opens — and does the stranded enemy re-apply it (323.11.a)?
 *
 *   × Void Assault         (unl-202-219, Spell, body/chaos, 2 + 1 power) "Move a friendly unit, then
 *                           move an enemy unit. (If they both move to a battlefield you don't control,
 *                           you're the attacker.)"
 *   × Akali, Deadly Weapon (ven-021-166, Champion Unit, fury, 3 Might) "[Empower] [2][fury] … When I
 *                           move, you may deal 1 to a unit at a battlefield I moved to or from. If I'm
 *                           [Empowered], deal 2 instead. [Empowered][>] I have +1 [Might]."
 *   × Gust                 (ogn-169-298, Spell, chaos, 1, Reaction) "Return a unit at a battlefield
 *                           with 3 [Might] or less to its owner's hand."
 *   (enemy body: Chemtech Enforcer ogn-003-298, 2 Might, [Assault 2] — Assault only matters if it
 *    were ever the attacker, which is exactly what must NOT happen in the no-Gust line.)
 *
 * Rules: 190.3.a.1 (a unit arriving at an uncontested battlefield its controller doesn't control
 * applies Contested; a later arrival at an already-Contested battlefield does not), 323.8/.8.a
 * (Showdown staged while Contested + applier has units there), 323.9/.10 (Combat staged only while
 * two opposing players have units there), 323.11 (remove Contested when the applier has no units
 * there and nothing is ONGOING — staged ≠ ongoing), 323.11.a (units left at a now-uncontested
 * battlefield they don't control: THEIR controller applies Contested), 322 (follow-up Cleanup),
 * 323.12/.13 (staged Showdown / Combat only BEGINS in a Neutral Open state — 310.1: no chain),
 * 345 (the applier of Contested gains Focus), 348.2.a/.a.1 (Non-Combat Showdown ends with one
 * player's units → they establish control = Conquer, even on the opponent's turn).
 *
 * Question. P1's turn; bfC open and empty. P1: Akali (3) in base. P2: Chemtech Enforcer (2) in base,
 * Gust in hand. P1 plays Void Assault: Akali → C, then Enforcer → C. With Akali's move trigger on the
 * chain P2 Gusts Akali. Who applied Contested, what happens to it and to the staged combat once
 * Akali is gone, does the Enforcer re-contest, and who controls/scores C? Contrast: no Gust.
 *
 * Expected. Akali arrives first → P1 applies Contested; the Enforcer arrives at an already-Contested
 * battlefield. Akali's trigger keeps the state Closed, so Showdown+Combat are merely STAGED. Gust
 * resolves first (LIFO): Akali → hand. Cleanup: combat un-staged (323.10), P1's showdown lapses
 * (323.8.a), Contested removed (323.11) and immediately re-applied BY P2 for the stranded Enforcer
 * (323.11.a) → Showdown staged for P2. Akali's trigger still resolves (independent of its source):
 * Enforcer takes 1, survives. Chain empty → 323.12: a NON-combat Showdown begins at C on P1's turn
 * with P2 holding Focus; both pass → P2 establishes control and Conquers C for 1 point.
 * No Gust: trigger resolves (1 to Enforcer), then 323.13 Combat begins with P1 as attacker; Akali 3
 * kills the (1-damage, 2-Might, non-Assault) defender, survives its 2, and P1 conquers C.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VOID_ASSAULT = "unl-202-219";
const AKALI = "ven-021-166";
const GUST = "ogn-169-298";
const CHEMTECH_ENFORCER = "ogn-003-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } }) // Void Assault: 2 + [body/chaos]
    .resources(P2, { energy: 2, power: { chaos: 1 } }) // Gust: 1 (chaos)
    .battlefield("bf1", { controller: P1 }) // P1's home battlefield — only so "a battlefield you don't control" is meaningful
    .battlefield("bfC", { controller: null })
    .unit(P1, "base", AKALI, "akali")
    .unit(P2, "base", CHEMTECH_ENFORCER, "enforcer")
    .hand(P1, VOID_ASSAULT, "voidAssault")
    .hand(P2, GUST, "gust");
}

const bfC = (game: Game) => game.gameState.battlefields.bfC!;
const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Cast Void Assault (Akali → C, then Enforcer → C) and let it resolve (both pass). Stops at Akali's opt-in. */
async function resolveVoidAssault(game: Game): Promise<void> {
  await game.p1.cast("voidAssault", { targets: ["akali", "enforcer"] });
  await game.p1.pick("battlefield-bfC"); // Akali's destination
  await game.p1.pick("battlefield-bfC"); // Enforcer's destination
  await game.p1.passPriority();
  await game.p2.passPriority();
}

/** …then P1 finalizes Akali's "When I move" trigger choosing the Enforcer, and passes priority to P2. */
async function triggerOnChainP2ToAct(game: Game): Promise<void> {
  await resolveVoidAssault(game);
  await game.p1.yes();
  await game.p1.pick("enforcer");
  await game.p1.passPriority();
}

/** …then P2 responds with Gust on Akali and Gust resolves (both pass). Akali's trigger is still pending. */
async function gustResolves(game: Game): Promise<void> {
  await triggerOnChainP2ToAct(game);
  await game.p2.cast("gust", { targets: "akali" });
  await game.p2.passPriority();
  await game.p1.passPriority();
}

describe("Void Assault resolves as one item: Akali (first mover) is the one who applies Contested to C", () => {
  test("both destinations are chosen as the spell is played (friendly first, then enemy), each offering bfC; nothing moves until it resolves", async () => {
    const game = await board().build();
    await game.p1.cast("voidAssault", { targets: ["akali", "enforcer"] });
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(game.decision()?.prompt).toContain("[akali]");
    await game.p1.pick("battlefield-bfC");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(game.decision()?.prompt).toContain("[enforcer]");
    const keys = game.decision()?.kind === "pick" ? (game.decision() as { options: { key: string }[] }).options.map((o) => o.key) : [];
    expect(keys).toContain("battlefield-bfC");
    await game.p1.pick("battlefield-bfC");
    expect(game.chain().map((c) => c.cardId)).toEqual(["voidAssault"]);
    expect(game.locationOf("akali")).toBe("base");
    expect(game.locationOf("enforcer")).toBe("base");
    expect(bfC(game).contested).toBe(false);
  });

  test("after resolution both units are at C; C is Contested BY P1 (Akali arrived first at an uncontested battlefield P1 doesn't control — 190.3.a.1), still uncontrolled", async () => {
    const game = await board().build();
    await resolveVoidAssault(game);
    expect(game.zoneOf("voidAssault")).toBe("trash");
    expect(game.locationOf("akali")).toBe("bfC");
    expect(game.locationOf("enforcer")).toBe("bfC");
    expect(bfC(game)).toMatchObject({ contested: true, contestedBy: P1, controller: null });
  });

  test("Akali's 'When I move' trigger is Pending → the state is Closed: no Showdown/Combat has BEGUN at C (only staged — 323.12/.13 need Neutral Open); P1 is asked the 'you may' and offered the units at C (Akali, Enforcer)", async () => {
    const game = await board().build();
    await resolveVoidAssault(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "akali", controller: P1, triggered: true })]);
    expect(showdown(game)).toBeUndefined();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["akali", "enforcer"]);
    await game.p1.pick("enforcer");
    expect(game.chain()[0]?.targets).toEqual(["enforcer"]);
    expect(game.state("enforcer").damage).toBe(0); // finalized, not resolved
  });

  test("with the trigger on the chain and P1 having passed, P2 holds priority and Gust is legal on Akali (3 Might, at a battlefield) — and on its own Enforcer", async () => {
    const game = await board().build();
    await triggerOnChainP2ToAct(game);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    const field = game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
    expect(offered).toEqual(["akali", "enforcer"]);
  });
});

describe("Gust resolves first (LIFO): Akali leaves — Contested by P1 is removed and re-applied BY P2 for the stranded Enforcer (323.11 → 323.11.a)", () => {
  test("Gust goes on top of Akali's trigger; after both pass it returns Akali to P1's HAND while Akali's trigger is still on the chain", async () => {
    const game = await board().build();
    await triggerOnChainP2ToAct(game);
    await game.p2.cast("gust", { targets: "akali" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["akali", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("akali")).toBe("hand");
    expect(game.p1.hand()).toContain("akali");
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "akali", controller: P1, triggered: true })]);
  });

  test("the Cleanup after Gust: C is STILL contested but now contestedBy P2 (the Enforcer's controller re-parked it, 323.11.a); still uncontrolled; the Enforcer did not go anywhere; no showdown has begun (chain not empty)", async () => {
    const game = await board().build();
    await gustResolves(game);
    expect(bfC(game)).toMatchObject({ contested: true, contestedBy: P2, controller: null });
    expect(game.locationOf("enforcer")).toBe("bfC");
    expect(game.p2.units("bfC")).toEqual(["enforcer"]);
    expect(game.p1.units("bfC")).toEqual([]);
    expect(showdown(game)).toBeUndefined();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("Akali's trigger resolves independently of its (bounced) source: the chosen Enforcer takes 1 and survives (2 Might, 1 damage)", async () => {
    const game = await board().build();
    await gustResolves(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("enforcer")).toMatchObject({ damage: 1, might: 2, zone: "battlefield-bfC" });
    expect(game.zoneOf("akali")).toBe("hand");
  });

  test("chain empty → Neutral Open → 323.12: a NON-combat Showdown begins at C on P1's turn, and P2 — the player who (re-)applied Contested — holds Focus (345); no combat (only one side has units)", async () => {
    const game = await board().build();
    await gustResolves(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.turnPlayer()).toBe(P1);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfC", focusPlayer: P2, isCombatShowdown: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.actingSeat()).toBe(P2);
    expect(bfC(game)).toMatchObject({ contested: true, contestedBy: P2, controller: null });
  });

  test("both pass Focus → 348.2.a: P2 (only player with units at C) establishes control = Conquer on P1's turn: P2 scores 1, C uncontested under P2, Enforcer keeps its 1 damage, P1 back in an open main phase with Akali in hand", async () => {
    const game = await board().build();
    await gustResolves(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(bfC(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.conqueredThisTurn[P2] ?? []).toContain("bfC");
    expect(game.state("enforcer")).toMatchObject({ damage: 1, zone: "battlefield-bfC" });
    expect(game.zoneOf("akali")).toBe("hand");
    expect(game.zoneOf("enforcer")).not.toBe("trash"); // there never was a combat
    expect(showdown(game)).toBeUndefined();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("contrast — P2 does not Gust: the staged COMBAT opens with P1 (who applied Contested) as the attacker", () => {
  test("P2 passes → Akali's trigger resolves (Enforcer takes 1) → chain empty → 323.13 Combat begins at C: a COMBAT showdown, P1 attacking with Focus, Akali attacker / Enforcer defender", async () => {
    const game = await board().build();
    await triggerOnChainP2ToAct(game);
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("enforcer").damage).toBe(1);
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bfC", defendingPlayer: P2, focusPlayer: P1, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("akali").combatRole).toBe("attacker");
    expect(game.state("enforcer").combatRole).toBe("defender");
    expect(game.state("enforcer").might).toBe(2); // [Assault 2] is off — it is defending
    expect(bfC(game)).toMatchObject({ contested: true, contestedBy: P1, controller: null });
  });

  test("combat: Akali 3 into the 2-Might (already 1-damage) defender kills it; Akali takes 2 < 3, survives healed; P1 establishes control and Conquers C for 1 point — matching Void Assault's reminder text", async () => {
    const game = await board().build();
    await triggerOnChainP2ToAct(game);
    await game.p2.passPriority();
    await game.settle();
    expect(game.zoneOf("enforcer")).toBe("trash");
    expect(game.p2.trash()).toContain("enforcer");
    expect(game.state("akali")).toMatchObject({ damage: 0, zone: "battlefield-bfC" });
    expect(bfC(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("gust")).toBe("hand");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
