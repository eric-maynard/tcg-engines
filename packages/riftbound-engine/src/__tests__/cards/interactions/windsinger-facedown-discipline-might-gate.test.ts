/**
 * Interaction: Windsinger (sfd-138-221) · Unit · Chaos · 2 · 1 Might
 *     "[Hidden] (Hide now for [rainbow] to react with later for [0].)
 *      When you play me, you may return another unit at a battlefield with 3 [Might] or less to its
 *      owner's hand."
 *   × Discipline (ogn-058-298) · Spell · Calm · 2 · Reaction
 *     "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Rules: 811.1.d.1 (a hidden permanent is played TO the battlefield it was hidden at), 811.1.d.2 (the
 * play effect of a hidden permanent must pick its target at that battlefield if possible), 811.3 (played
 * from hand: no such restriction), 355.5.b (a permanent's "When you play me" trigger chooses NO target
 * while the unit is being played), 402.1 / 402.2 ("you may" is decided, then targets are chosen, while
 * FINALIZING the trigger on the chain — before anyone gets priority), 355.15 (choices are locked),
 * 359.3.e.2 / 359.3.e.4 / 359.3.e.5 / 359.3.e.10 (a target whose Might rose above 3 is illegal on
 * resolution → unaffected; the ability just does nothing), 323.2.a (a unit arriving mid-combat takes its
 * controller's designation at the next cleanup).
 *
 * Question: P2's turn. P1 controls bf1 with defender D (4) and a facedown Windsinger; P2 controls bf2
 * with a 2-Might unit S. P2 attacks bf1 with A (3) and B (5); in the combat showdown P1 flips Windsinger.
 *   (a) Windsinger enters bf1 (exhausted, becomes a Defender); the "you may"/target are decided as the
 *       TRIGGER finalizes (not while playing the unit) and before P2 gets priority; eligible = A only
 *       (B 5 / D 4 fail the filter, itself excluded, S at bf2 barred from hidden).
 *   (b) P1 picks A; P2 Disciplines A (5, draw 1) → on resolution A is illegal → stays; no re-pick;
 *       combat A5+B5 vs D4+W1 → P2 conquers bf1.
 *   (c) Discipline on B instead / no response → A is returned to P2's hand.
 *   (d) Played from hand on P1's turn: S at bf2 (and any ≤3 unit at any battlefield) is a legal pick.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WINDSINGER = "sfd-138-221";
const DISCIPLINE = "ogn-058-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * Turn 3, P2 active (Windsinger was hidden on an earlier P1 turn). P2 has exactly Discipline's cost.
 *   bf1 (P1): D (4) + facedown Windsinger      bf2 (P2): S (2)      P2 base: A (3), B (5) [+ C (2) if wide]
 */
function board(opts: { wide?: boolean } = {}) {
  const s = scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 4, name: "Defender D" }, "D")
    .unit(P2, "base", { might: 3, name: "Attacker A" }, "A")
    .unit(P2, "base", { might: 5, name: "Attacker B" }, "B")
    .unit(P2, "bf2", { might: 2, name: "Small S" }, "S")
    .facedown(P1, "bf1", WINDSINGER, "ws")
    .hand(P2, DISCIPLINE, "disc");
  return opts.wide ? s.unit(P2, "base", { might: 2, name: "Attacker C" }, "C") : s;
}

/** P1's own turn 3 with Windsinger in HAND (2 energy): bf1 (P1) D 4; bf2 (P2) A 3, B 5, S 2; P2 base G 1. */
function handBoard() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 4, name: "Defender D" }, "D")
    .unit(P2, "bf2", { might: 3, name: "A at bf2" }, "A")
    .unit(P2, "bf2", { might: 5, name: "B at bf2" }, "B")
    .unit(P2, "bf2", { might: 2, name: "Small S" }, "S")
    .unit(P2, "base", { might: 1, name: "Base Guy" }, "G")
    .hand(P1, WINDSINGER, "ws");
}

/** P2 attacks bf1 with the given units and passes Focus; P1 (defender) flips Windsinger for 0. */
async function attackAndFlip(game: Game, attackers: string[] = ["A", "B"]): Promise<void> {
  await game.p2.move(attackers, "bf1");
  expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P2 });
  await game.p2.passFocus();
  expect(game.p1.can("reveal", "ws")).toBe(true);
  await game.p1.reveal("ws");
}

/** Flip, accept the "you may" (A is auto-locked as the only legal target), P1 passes → P2 has priority with the trigger on the chain. */
async function flipChoosingA(game: Game): Promise<void> {
  await attackAndFlip(game);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick("A");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ws", triggered: true, controller: P1, targets: ["A"] })]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
}

/** Both players pass until the chain is empty. */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
}

describe("Windsinger flipped mid-combat × Discipline — hidden targeting + Might gate on resolution", () => {
  // ── (a) where / when / who ─────────────────────────────────────────────────────────────────

  test("(a) flipped for 0, Windsinger is played TO bf1 (811.1.d.1): on the battlefield, exhausted, P1-controlled, 1 Might — and already designated a Defender (323.2.a)", async () => {
    const game = await board().build();
    await attackAndFlip(game);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    const s = game.state("ws");
    expect(s.zone).toBe("battlefield-bf1");
    expect(s.controller).toBe(P1);
    expect(s.isExhausted).toBe(true);
    expect(s.might).toBe(1);
    expect(s.isHidden).toBe(false);
    expect(s.combatRole).toBe("defender");
    expect(game.state("D").combatRole).toBe("defender");
    expect(game.state("A").combatRole).toBe("attacker");
    expect(game.state("B").combatRole).toBe("attacker");
  });

  test("(a) no target is asked while PLAYING the unit (355.5.b): the first prompt after the flip is the trigger's 'you may' (402.1), with the trigger already on the chain and the unit already on the board", async () => {
    const game = await board().build();
    await attackAndFlip(game);
    expect(game.zoneOf("ws")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ws", triggered: true, controller: P1 })]);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    expect(d?.source?.cardId).toBe("ws");
  });

  test("(a) the target is chosen while FINALIZING the trigger (402.2), before P2 gets priority: after 'yes' the chain item already names A, and only then does P2 receive priority — seeing the target", async () => {
    const game = await board().build();
    await attackAndFlip(game);
    await game.p1.yes();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.timing).toBe("FIN");
      await game.p1.pick("A");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ws", targets: ["A"] })]);
    // P1 (controller of the newest item) acts first, then P2 — P2's first look at the chain includes the target.
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P2 });
    expect(game.p2.view().chain).toEqual([expect.objectContaining({ cardId: "ws", targets: ["A"] })]);
  });

  test("(a) eligibility from hidden (811.1.d.2 + Might filter + 'another'): with attackers A 3 / B 5 / C 2 the pick offers exactly {A, C} — not B (5), not D (4), not Windsinger itself, not S at bf2", async () => {
    const game = await board({ wide: true }).build();
    await attackAndFlip(game, ["A", "B", "C"]);
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target" });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(new Set(offered)).toEqual(new Set(["A", "C"]));
    expect(offered).not.toContain("B");
    expect(offered).not.toContain("D");
    expect(offered).not.toContain("ws");
    expect(offered).not.toContain("S");
    await expect(game.p1.pick("S")).rejects.toThrow();
    await expect(game.p1.pick("B")).rejects.toThrow();
  });

  test("(a) on the two-attacker board A is the ONLY legal object, so it is bound without a menu and the chain item targets A", async () => {
    const game = await board().build();
    await attackAndFlip(game);
    await game.p1.yes();
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["A"]);
      await game.p1.pick("A");
    }
    expect(game.chain()[0]?.targets).toEqual(["A"]);
  });

  test("(a) 'you may' declined (402.1.a): the trigger leaves the chain, nothing is returned, Windsinger stays at bf1 as a defender", async () => {
    const game = await board().build();
    await attackAndFlip(game);
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("A")).toBe("battlefield-bf1");
    expect(game.zoneOf("B")).toBe("battlefield-bf1");
    expect(game.zoneOf("ws")).toBe("battlefield-bf1");
  });

  // ── (b) Discipline on the chosen target ────────────────────────────────────────────────────

  test("(b) P2 may respond with Discipline on A; it resolves first (LIFO): A is 5 Might, P2 drew 1, Windsinger's trigger still waits targeting A", async () => {
    const game = await board().build();
    await flipChoosingA(game);
    expect(game.p2.can("cast", "disc")).toBe(true);
    const hand0 = game.p2.hand().length;
    await game.p2.cast("disc", { targets: "A" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ws", "disc"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("A").might).toBe(5);
    expect(game.p2.hand()).toHaveLength(hand0 - 1 + 1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ws", targets: ["A"] })]);
  });

  test("(b) when the trigger resolves A (now 5) no longer meets 'with 3 Might or less' → unaffected: A stays at bf1; P1 is NOT offered a re-pick; the ability does nothing (359.3.e.2/4/5/10, 355.15)", async () => {
    const game = await board().build();
    await flipChoosingA(game);
    await game.p2.cast("disc", { targets: "A" });
    await drainChain(game);
    expect(game.zoneOf("A")).toBe("battlefield-bf1");
    expect(game.p2.hand()).not.toContain("A");
    expect(game.zoneOf("B")).toBe("battlefield-bf1");
    expect(game.zoneOf("D")).toBe("battlefield-bf1");
    expect(game.zoneOf("ws")).toBe("battlefield-bf1");
    // Back in the showdown — no target prompt of any kind is pending for P1.
    const d = game.decision();
    expect(d?.kind).toBe("action");
    expect(d && d.kind === "action" ? d.context : undefined).toBe("showdown");
  });

  test("(b) combat then proceeds A5 + B5 = 10 vs D4 + Windsinger1 = 5: both defenders die, P2 wins and conquers bf1 (+1)", async () => {
    const game = await board().build();
    await flipChoosingA(game);
    await game.p2.cast("disc", { targets: "A" });
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.zoneOf("ws")).toBe("trash");
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["D", "ws"]));
    // 5 defender damage is assigned among A (5) and B (5): at most one of them dies, at least one remains.
    const remaining = game.p2.units("bf1");
    expect(remaining.length).toBeGreaterThanOrEqual(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p2.points()).toBe(1);
  });

  // ── (c) contrasts ──────────────────────────────────────────────────────────────────────────

  test("(c) Discipline on B instead is irrelevant to the target: A (still 3) is returned to its owner P2's hand when the trigger resolves", async () => {
    const game = await board().build();
    await flipChoosingA(game);
    await game.p2.cast("disc", { targets: "B" });
    await drainChain(game);
    expect(game.state("B").might).toBe(7);
    expect(game.zoneOf("A")).toBe("hand");
    expect(game.p2.hand()).toContain("A");
    expect(game.state("A").owner).toBe(P2);
    expect(game.cardsAt("bf1")).not.toContain("A");
  });

  test("(c) …combat continues with B alone: B7 vs D4 + W1 → defenders die, B survives (5 damage < 7, healed after), P2 conquers bf1", async () => {
    const game = await board().build();
    await flipChoosingA(game);
    await game.p2.cast("disc", { targets: "B" });
    await game.settle();
    expect(game.zoneOf("A")).toBe("hand");
    expect(game.zoneOf("B")).toBe("battlefield-bf1");
    expect(game.state("B").damage).toBe(0);
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.zoneOf("ws")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  test("(c) no response at all: A is bounced to P2's hand; then B5 vs D4 + W1 = 5 trade evenly — everything dies, no winner, bf1 becomes uncontrolled, nobody scores (466.3.d, 466.5.b)", async () => {
    const game = await board().build();
    await flipChoosingA(game);
    await game.p2.passPriority(); // last pass → trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("A")).toBe("hand");
    expect(game.p2.hand()).toEqual(expect.arrayContaining(["A", "disc"]));
    await game.settle();
    expect(game.zoneOf("B")).toBe("trash");
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.zoneOf("ws")).toBe("trash");
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.points()).toBe(0);
  });

  // ── (d) from hand: no hidden restriction ───────────────────────────────────────────────────

  test("(d) played from hand for 2 on P1's turn (811.3): the play offers only a location (no target field, 355.5.b); Windsinger enters base and the trigger asks 'you may' then a target", async () => {
    const game = await handBoard().build();
    const opt = game.p1.option("playUnit", "ws");
    expect(opt).toBeDefined();
    expect(opt?.fields.map((f) => f.name)).toEqual(["location"]);
    await game.p1.play("ws", { to: "base" });
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("ws")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ws", triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  });

  test("(d) from hand the pick spans EVERY battlefield: offers A (3) and S (2) at enemy bf2; excludes B (5), D (4), the base unit G and Windsinger itself", async () => {
    const game = await handBoard().build();
    await game.p1.play("ws", { to: "base" });
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target" });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(new Set(offered)).toEqual(new Set(["A", "S"]));
    expect(offered).not.toContain("B");
    expect(offered).not.toContain("D");
    expect(offered).not.toContain("G");
    expect(offered).not.toContain("ws");
  });

  test("(d) choosing S at bf2: it returns to its owner P2's hand when the trigger resolves", async () => {
    const game = await handBoard().build();
    await game.p1.play("ws", { to: "base" });
    await game.p1.yes();
    await game.p1.pick("S");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ws", targets: ["S"] })]);
    await game.settle();
    expect(game.zoneOf("S")).toBe("hand");
    expect(game.p2.hand()).toContain("S");
    expect(game.zoneOf("ws")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
