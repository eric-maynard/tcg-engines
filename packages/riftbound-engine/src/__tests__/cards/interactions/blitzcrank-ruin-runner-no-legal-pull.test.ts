/**
 * Interaction: Blitzcrank, Impassive (ogn-067-298) · Champion Unit · Calm · 5 + [calm] · 5 Might · Tank
 *     "When you play me to a battlefield, you may move an enemy unit to here."
 *   × Ruin Runner (sfd-105-221) · Unit · 5 Might — "I can't be chosen by enemy spells and abilities."
 *   × Shipyard Skulker (ogn-175-298) · vanilla 3-Might unit (the legal pull).
 *
 * Rules: 383.3.a / 402.1 (leading "you may" → the controller decides during FINALIZATION whether to perform
 * the trigger; declining removes it, 383.3.a.2 / 402.1.a), 402.4 (no legal choices → removed from the chain
 * at once, not countered, 402.4.a), 402.4.b (legal options must be chosen — a lone one may auto-bind),
 * 355.4.a (a move destination must differ from the unit's current location → units already "here" are not
 * legal), 355.9.b + 757 (Untargetable by ENEMY abilities → Ruin Runner is never a legal choice for P1).
 *
 * Question — P1 plays Blitzcrank to bf1 on four boards:
 *   (a) the only enemy unit not at bf1 is P2's Ruin Runner (base)      → no legal choice: dropped silently,
 *       no Yes/No, no target prompt; Blitzcrank just sits at bf1 exhausted.
 *   (b) P2's only units (Skulker + Runner) are already AT bf1           → "to here" has no legal mover either
 *       (355.4.a): dropped silently exactly like (a).
 *   (c) Runner in base AND Skulker at bf2                               → P1 IS asked Yes/No; Runner is never
 *       offered; yes binds the lone legal Skulker, P2 sees the target with priority, Skulker moves bf2→bf1
 *       and (P1's turn, both sides present) combat is staged there.
 *   (d) as (c) but Blitzcrank played to base                            → condition unmet: nothing at all.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BLITZCRANK = "ogn-067-298";
const RUIN_RUNNER = "sfd-105-221";
const SHIPYARD_SKULKER = "ogn-175-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1's turn with exactly 5 + [calm]; P1 controls bf1 (empty), P2 controls bf2; Blitzcrank in P1's hand. */
function base() {
  return scenario()
    .resources(P1, { energy: 5, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .hand(P1, BLITZCRANK, "blitz");
}
/** (a) the only enemy unit anywhere is Ruin Runner in P2's base. */
const boardA = () => base().unit(P2, "base", RUIN_RUNNER, "runner");
/** (b) P2's only units — Skulker + Runner — already sit at bf1. */
const boardB = () => base().unit(P2, "bf1", SHIPYARD_SKULKER, "skulker").unit(P2, "bf1", RUIN_RUNNER, "runner");
/** (c)/(d) Runner in P2's base, Skulker at bf2. */
const boardC = () => base().unit(P2, "base", RUIN_RUNNER, "runner").unit(P2, "bf2", SHIPYARD_SKULKER, "skulker");

/** Cards named by the current pick prompt (empty when the decision is not a pick). */
function picksOffered(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
}

describe("Blitzcrank, Impassive × Ruin Runner — when the optional pull has no legal object (402.4, 355.4.a, 757)", () => {
  // ── (a) only candidate is Untargetable ─────────────────────────────────────────────────────

  // Expected (402.4, 757/355.9.b): the play trigger's only candidate is P2's Ruin Runner, which an ENEMY
  // ability cannot choose, so there is no legal choice and the pending trigger is removed immediately —
  // P1 is never asked Yes/No. Actual: the engine surfaces "Use Blitzcrank's optional ability?" (yes-no)
  // first and only drops the trigger after P1 answers.
  test("(a) with Ruin Runner as the only enemy elsewhere, no Yes/No is shown — the trigger leaves the chain at once and P1 is back in an open main phase (402.4)", async () => {
    const game = await boardA().build();
    await game.p1.play("blitz", { to: "bf1" });
    await game.acceptTriggerOrder();
    expect(game.decision()?.kind).not.toBe("yes-no");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(a) however it is prompted, Ruin Runner is never offered or moved: no target prompt names it, nothing is countered, the chain empties and Blitzcrank sits at bf1 exhausted with the Runner still in P2's base", async () => {
    const game = await boardA().build();
    await game.p1.play("blitz", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes(); // even opting in must find nothing to choose
    }
    expect(picksOffered(game)).not.toContain("runner");
    expect(game.decision()?.kind).not.toBe("pick");
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("blitz")).toBe("bf1");
    expect(game.state("blitz")).toMatchObject({ controller: P1, isExhausted: true, might: 5 });
    expect(game.locationOf("runner")).toBe("base");
    expect(game.state("runner").controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) every enemy unit is already "here" ─────────────────────────────────────────────────

  // Expected (355.4.a + 757 → 402.4): Skulker is already at bf1 (a move must change location) and Runner is
  // Untargetable, so there are zero legal choices → dropped silently, no Yes/No. Actual: yes-no is shown.
  test("(b) with P2's Skulker + Runner already at bf1 there is no legal unit to 'move to here' — no Yes/No prompt, trigger removed at once (355.4.a, 402.4)", async () => {
    const game = await boardB().build();
    await game.p1.play("blitz", { to: "bf1" });
    await game.acceptTriggerOrder();
    expect(game.decision()?.kind).not.toBe("yes-no");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // Expected (355.4.a): a unit AT bf1 can never be the object of "move an enemy unit to here" — if P1 opts
  // in, nothing may be bound and the trigger just leaves the chain. Actual: after "yes" the engine
  // auto-binds Shipyard Skulker (already at bf1) as the target and finalizes the ability onto the chain.
  test("(b) opting in must not bind a unit that is already at bf1 — neither Skulker nor Runner ever appears as the trigger's target (355.4.a, 757)", async () => {
    const game = await boardB().build();
    await game.p1.play("blitz", { to: "bf1" });
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
    }
    expect(picksOffered(game)).toEqual([]);
    const bound = game.chain().flatMap((c) => c.targets ?? []);
    expect(bound).not.toContain("skulker");
    expect(bound).not.toContain("runner");
    expect(game.chain()).toEqual([]);
  });

  test("(b) end state regardless: both P2 units and Blitzcrank are all at bf1, nobody changed location or controller, chain empty", async () => {
    const game = await boardB().build();
    await game.p1.play("blitz", { to: "bf1" });
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
    }
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("blitz")).toBe("bf1");
    expect(game.locationOf("skulker")).toBe("bf1");
    expect(game.locationOf("runner")).toBe("bf1");
    expect(game.state("skulker").controller).toBe(P2);
    expect(game.state("runner").controller).toBe(P2);
  });

  // ── (c) exactly one legal object: Skulker at bf2 ───────────────────────────────────────────

  test("(c) Runner in base + Skulker at bf2: the trigger goes on the chain and P1 IS asked Yes/No during finalization (383.3.a, 402.1)", async () => {
    const game = await boardC().build();
    await game.p1.play("blitz", { to: "bf1" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blitz", controller: P1, triggered: true })]);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, canAccept: true, timing: "FIN" });
    expect(d?.kind === "yes-no" ? d.source?.cardId : undefined).toBe("blitz");
    expect(game.locationOf("skulker")).toBe("bf2"); // nothing moves before resolution
  });

  test("(c) declining removes the trigger from the chain — no target was ever named, Skulker stays at bf2, Runner in base (383.3.a.2, 402.1.a)", async () => {
    const game = await boardC().build();
    await game.p1.play("blitz", { to: "bf1" });
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.locationOf("skulker")).toBe("bf2");
    expect(game.locationOf("runner")).toBe("base");
    expect(game.locationOf("blitz")).toBe("bf1");
  });

  test("(c) accepting binds the single legal object — Skulker — without ever offering Ruin Runner (402.4.b, 757); the finalized item shows its target and P2 receives priority with it visible", async () => {
    const game = await boardC().build();
    await game.p1.play("blitz", { to: "bf1" });
    await game.p1.yes();
    // Either auto-bound (lone legal choice) or a one-option pick — Runner must not be in it either way.
    if (game.decision()?.kind === "pick") {
      expect(picksOffered(game)).toEqual(["skulker"]);
      await game.p1.pick("skulker");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blitz", targets: ["skulker"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.view().chain).toEqual([expect.objectContaining({ cardId: "blitz", targets: ["skulker"] })]);
    expect(game.locationOf("skulker")).toBe("bf2"); // still only targeted
  });

  test("(c) on resolution Skulker moves bf2 → bf1; it is P1's turn and both sides now have units at bf1, so a combat showdown is staged there; the 3-Might Skulker then dies into the 5-Might Tank and P1 keeps bf1", async () => {
    const game = await boardC().build();
    await game.p1.play("blitz", { to: "bf1" });
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("skulker");
    }
    await game.p1.passPriority();
    await game.p2.passPriority(); // resolves: the move happens now
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("skulker")).toBe("bf1");
    expect(game.state("skulker").controller).toBe(P2); // moved, not stolen
    expect(game.locationOf("runner")).toBe("base");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1 });
    const showdown = game.gameState.interaction?.showdownStack?.at(-1);
    expect(showdown).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    await game.settle(); // both pass focus → combat: 3 into a 5-Might Tank
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.locationOf("blitz")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("(c′) with a SECOND legal enemy (a vanilla unit in P2's base) P1 gets a real target prompt listing exactly Skulker + that unit — Ruin Runner is filtered out at enumeration (355.9.b, 757)", async () => {
    const game = await boardC().unit(P2, "base", { might: 2, name: "Grunt" }, "grunt").build();
    await game.p1.play("blitz", { to: "bf1" });
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, min: 1 });
    expect(picksOffered(game).sort()).toEqual(["grunt", "skulker"]);
    expect(picksOffered(game)).not.toContain("runner");
    await expect(game.p1.pick("runner")).rejects.toThrow();
    await game.p1.pick("grunt");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blitz", targets: ["grunt"] })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("grunt")).toBe("bf1");
    expect(game.locationOf("skulker")).toBe("bf2");
    expect(game.locationOf("runner")).toBe("base");
  });

  // ── (d) played to base: the condition is never met ─────────────────────────────────────────

  test("(d) Blitzcrank played to P1's BASE on board (c): 'to a battlefield' is unmet — nothing goes on the chain, no Yes/No, no target prompt; Skulker and Runner stay put", async () => {
    const game = await boardC().build();
    await game.p1.play("blitz", { to: "base" });
    expect(game.chain()).toEqual([]);
    expect(game.decision()?.kind).not.toBe("yes-no");
    expect(game.decision()?.kind).not.toBe("pick");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("blitz")).toBe("base");
    expect(game.state("blitz").isExhausted).toBe(true);
    expect(game.locationOf("skulker")).toBe("bf2");
    expect(game.locationOf("runner")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });
});
