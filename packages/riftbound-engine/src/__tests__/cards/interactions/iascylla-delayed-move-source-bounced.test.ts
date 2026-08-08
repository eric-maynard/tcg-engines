/**
 * Interaction: Iascylla (unl-050-219) × Star-Crossed (unl-128-219)
 *
 *   Iascylla — Unit · Calm · 7 + [calm] · 6 Might
 *     "When I hold, at the start of your next Main Phase, you may move an enemy unit to this battlefield."
 *   Star-Crossed — Spell (Reaction) · Chaos · 3 + [chaos]
 *     "Return a friendly unit and an enemy unit to their owners' hands."
 *
 * Rules: 390.2 (an ability that resolves and sets up a later "at the start of …" effect creates a DELAYED
 * triggered ability); 392 (delayed abilities are independent of their source — they execute at their
 * time whether or not the source is still around); 355.5.b + 383.3.a (the "you may" and the enemy-unit
 * choice belong to the DELAYED trigger's own finalization, when it goes on the chain); 316.4 (start-of-
 * Main-Phase effects: after channel + draw); 359.3.f.3.a/b ("this battlefield" is a referent fixed by
 * the original trigger — the battlefield she held — regardless of later control); 383.4.d (hold trigger).
 * Also 336 (LIFO), 323.6 (a battlefield emptied of its controller's units is lost at the next Cleanup),
 * 190.3.a.1 / 344.2 / 348.2.a (an arriving unit contests; lone side conquers after a non-combat showdown).
 *
 * Question: P1's Iascylla holds bf1; the hold trigger goes on the chain in P1's Beginning Phase. In
 * response P2 plays Star-Crossed returning Iascylla (and a P2 unit) to hand. (a) Does the hold trigger
 * still resolve and create the delayed trigger? (b) At the start of P1's Main Phase — Iascylla gone, bf1
 * even uncontrolled by then — does the delayed trigger fire, when is the enemy unit chosen, and where
 * does it move?
 *
 * Expected: (a) yes — bouncing the source doesn't counter a trigger already on the chain; it resolves and
 * installs the delayed ability. (b) yes (392) — at the start of the Main Phase the delayed trigger goes on
 * the chain; P1 decides "you may" and picks any enemy unit legal NOW (355.5.b/383.3.a); P2 may respond;
 * on resolution the unit moves to BF1 (359.3.f.3.b) whoever controls it — here bf1 is uncontrolled, so
 * the arriving P2 unit contests it and, alone there, conquers it for P2.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IASCYLLA = "unl-050-219";
const STAR_CROSSED = "unl-128-219";

/**
 * P2 is about to end turn 2. bf1: P1 + Iascylla. bf2: P2 + Far (2). P1 base: Friend (2).
 * P2 base: Pawn (1) — Star-Crossed's friendly pick — and Home (3). P2 holds Star-Crossed.
 */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", IASCYLLA, "ias")
    .unit(P1, "base", { might: 2, name: "Friend" }, "friend")
    .unit(P2, "base", { might: 1, name: "Pawn" }, "pawn")
    .unit(P2, "base", { might: 3, name: "Home" }, "home")
    .unit(P2, "bf2", { might: 2, name: "Far" }, "far")
    .hand(P2, STAR_CROSSED, "sc");
}

/** P2 ends the turn → P1's Beginning Phase with the hold trigger on the chain; P1 passes; P2 (funded now — pools emptied at turn end) answers with Star-Crossed on (Pawn, Iascylla). */
async function bouncedInResponse(): Promise<Game> {
  const game = await board().build();
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ias", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  await game.p2.do("addResources", { energy: 3, power: { chaos: 1 } }); // 3 + [chaos] in P2's reaction window
  await game.p2.cast("sc", { targets: ["pawn", "ias"] });
  return game;
}

/** Pass priority until Star-Crossed has resolved (the hold trigger is then alone on the chain again). */
async function resolveStarCrossed(game: Game): Promise<void> {
  while (game.decision()?.kind === "action" && game.chain().some((c) => c.cardId === "sc")) {
    await game.acting().passPriority();
  }
}

/** …and then until the hold trigger itself has resolved (chain empty) — stops at any real prompt. */
async function resolveHoldTrigger(game: Game): Promise<void> {
  await resolveStarCrossed(game);
  while (game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "chain" && game.chain().length > 0) {
    await game.acting().passPriority();
  }
}

/** The first non-action prompt P1 faces once the Main Phase has started (the delayed trigger's finalization), or null. */
async function mainPhasePrompt(game: Game): Promise<Decision | null> {
  await resolveHoldTrigger(game);
  const r = await game.settle();
  return r.reason === "unanswered" && r.decision?.seat === P1 ? r.decision : null;
}

const delayedOn = (game: Game, card: string) => ((game.state(card).meta.delayedTriggers as unknown[] | undefined) ?? []).length;

describe("Iascylla's hold trigger × Star-Crossed bouncing her in response", () => {
  // ── (a) the hold trigger survives its source leaving ───────────────────────────────────────

  test("(a) Star-Crossed is a legal response in P1's Beginning Phase: Iascylla is an ENEMY pick for P2; it lands above the hold trigger (LIFO)", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.p1.passPriority();
    await game.p2.do("addResources", { energy: 3, power: { chaos: 1 } });
    const pairs = game.p2.option("cast", "sc")?.fields.find((f) => f.name === "targets")?.options as string[][];
    expect(pairs).toEqual(expect.arrayContaining([["pawn", "ias"], ["home", "ias"], ["far", "ias"]]));
    expect(pairs.every(([friendly]) => ["pawn", "home", "far"].includes(friendly!))).toBe(true); // P2's units are the friendly role
    await game.p2.cast("sc", { targets: ["pawn", "ias"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ias", "sc"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  test("(a) Star-Crossed resolves first: Iascylla → her OWNER P1's hand, Pawn → P2's hand; the hold trigger is still on the chain, not countered", async () => {
    const game = await bouncedInResponse();
    await resolveStarCrossed(game);
    expect(game.zoneOf("ias")).toBe("hand");
    expect(game.p1.hand()).toContain("ias");
    expect(game.p2.hand()).toContain("pawn");
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ias", controller: P1, countered: false, triggered: true })]);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.units("bf1")).toEqual([]);
  });

  test("(a) with its source in hand the hold trigger still RESOLVES (no 'if I'm here' clause): nothing is asked in the Beginning Phase, the delayed ability is recorded, P1 keeps the hold point (390.2)", async () => {
    const game = await bouncedInResponse();
    await resolveStarCrossed(game);
    expect(delayedOn(game, "ias")).toBe(0);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // no choice is made now (355.5.b)
    await game.p2.passPriority(); // → the hold trigger resolves
    expect(game.phase()).toBe("main"); // the Beginning-Phase chain emptied and the turn moved on
    expect(delayedOn(game, "ias")).toBe(1); // engine bookkeeping: the delayed "start of Main Phase" move exists
    expect(game.p1.points()).toBe(1); // the Hold itself scored in the Beginning Phase regardless
    expect(game.zoneOf("ias")).toBe("hand");
  });

  test("(a→b) by the Main Phase bf1 — with no P1 unit left on it — has become UNCONTROLLED (323.6); P1 channeled 2 and drew 1 as usual", async () => {
    const game = await bouncedInResponse();
    const handBefore = game.p1.hand().length; // before Iascylla returns
    await mainPhasePrompt(game);
    expect(game.phase()).toBe("main");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.hand()).toHaveLength(handBefore + 1 + 1); // + Iascylla bounced + 1 drawn
  });

  // ── (b) the delayed trigger at the start of the Main Phase ────────────────────────────────

  // Expected (392): the delayed ability is not tied to Iascylla being on the board — at the start of
  // P1's Main Phase it goes on the chain and P1 is asked the "you may" (383.3.a) exactly as in the
  // un-bounced control below. Actual: the engine stores the delayed trigger on Iascylla's card and only
  // scans permanents on the board when the Main Phase starts, so with her in hand nothing fires and P1
  // drops straight into an open main phase.
  test("(b) the delayed trigger fires at the start of P1's Main Phase even though Iascylla is in hand — P1 is prompted 'you may' with the trigger on the chain (392, 316.4)", async () => {
    const game = await bouncedInResponse();
    const d = await mainPhasePrompt(game);
    expect(game.phase()).toBe("main");
    expect(d).not.toBeNull();
    expect(["yes-no", "pick"]).toContain(d!.kind);
    expect(game.chain()).toEqual([expect.objectContaining({ controller: P1, triggered: true })]);
    expect(game.zoneOf("ias")).toBe("hand");
  });

  // Expected (355.5.b / 383.3.a): the enemy unit is chosen only NOW, at the delayed trigger's
  // finalization, from the enemy units legal now — Home and Far; Pawn (bounced to hand) is not a unit
  // on the board any more. Then P2 gets a priority window before it resolves. Actual: no trigger.
  test("(b) the target is chosen at the delayed trigger's finalization from enemy units legal NOW (Home, Far — not the bounced Pawn), then P2 may respond (355.5.b, 383.3.a)", async () => {
    const game = await bouncedInResponse();
    const d = await mainPhasePrompt(game);
    expect(d).not.toBeNull();
    if (d?.kind === "yes-no") {
      await game.p1.yes();
    }
    const pick = game.decision();
    expect(pick).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    const offered = pick?.kind === "pick" ? pick.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["far", "home"]);
    await game.p1.pick("home");
    expect(game.chain().at(-1)).toMatchObject({ controller: P1, targets: ["home"], triggered: true });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2's response window
    expect(game.zoneOf("home")).toBe("base"); // nothing moved before resolution
  });

  // Expected (359.3.f.3.b): "this battlefield" = bf1, the battlefield she held — fixed by the original
  // trigger, independent of who controls bf1 now (nobody). Home moves there; arriving at an uncontrolled
  // battlefield P2 doesn't control, it applies Contested (190.3.a.1) → non-combat showdown → P2, alone
  // there, conquers bf1 (+1). Iascylla never leaves P1's hand. Actual: no trigger, Home never moves.
  test("(b) on resolution Home moves to BF1 regardless of bf1's current controller; alone at the now-uncontrolled bf1 it contests and conquers it for P2 (359.3.f.3.b, 348.2.a)", async () => {
    const game = await bouncedInResponse();
    const d = await mainPhasePrompt(game);
    expect(d).not.toBeNull();
    if (d?.kind === "yes-no") {
      await game.p1.yes();
    }
    await game.p1.pick("home");
    await game.p1.passPriority();
    await game.p2.passPriority(); // resolves: the move happens now
    expect(game.state("home")).toMatchObject({ controller: P2, owner: P2, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2 });
    expect(game.zoneOf("ias")).toBe("hand");
    await game.settle(); // hand-back of the auto-begun showdown, if any
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(1); // just the earlier hold
    expect(game.zoneOf("far")).toBe("battlefield-bf2");
  });

  // ── control: the same line without Star-Crossed ────────────────────────────────────────

  test("control (no Star-Crossed): the hold trigger resolves silently in the Beginning Phase; at the start of the Main Phase (after channel 2 + draw 1) the delayed trigger is on the chain and P1 is asked 'you may' at finalization", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p2.endTurn();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // nothing chosen in the Beginning Phase
    await game.p2.passPriority();
    expect(game.phase()).toBe("main");
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ias", controller: P1, triggered: true })]);
    expect(game.p1.points()).toBe(1);
  });

  test("control: 'yes' → the enemy unit is picked NOW from all enemy units (Pawn, Home, Far); the pick rides on the chain item, P2 gets priority, and only on resolution does Home arrive at bf1 — contesting it as the attacker against Iascylla", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.yes();
    const pick = game.decision();
    expect(pick).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(pick?.kind === "pick" ? pick.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["far", "home", "pawn"]);
    await game.p1.pick("home");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ias", targets: ["home"], triggered: true })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.zoneOf("home")).toBe("base");
    await game.p2.passPriority();
    expect(game.state("home")).toMatchObject({ controller: P2, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    await game.settle();
    expect(game.zoneOf("home")).toBe("trash"); // 3 into Iascylla's 6
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("control: 'no' at finalization removes the trigger — nobody moves, ordinary open main phase (383.3.a.2)", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.no();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("home")).toBe("base");
    expect(game.zoneOf("far")).toBe("battlefield-bf2");
    expect(game.zoneOf("pawn")).toBe("base");
  });
});
