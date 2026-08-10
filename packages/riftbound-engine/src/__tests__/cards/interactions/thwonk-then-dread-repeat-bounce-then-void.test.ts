/**
 * Interaction: Thwonk! (sfd-040-221) · Spell · Calm · 2 · Action · [Repeat] [2] — "Stun an attacking unit."
 *   × Existential Dread (unl-134-219) · Spell · Chaos · 1 + [chaos] · Action · [Repeat] [2]
 *     "[Stun] an attacking enemy unit. If it's already stunned, return it to its owner's hand instead."
 *   (+ inline vanilla: P1's lone 5-Might attacker A (cost 2, so it can be replayed) and P2's 3-Might defender.)
 *
 * Question: P1's turn; P1 attacks P2's bf1 with A alone; P2 defends with a 3 and holds both spells with
 * ample energy + chaos.
 *   Line 1: P2 Thwonks A (no repeat) → resolves, A stunned. Then P2 plays Dread paying Repeat with BOTH
 *           executions on A. Exec 1 sees A already stunned → bounce. Exec 2's target is now in a hand —
 *           does it do anything? Is any of the Repeat refunded? What happens to the combat?
 *   Line 2: no Thwonk; Dread with Repeat, both on the unstunned A → ?
 *   Line 3: Thwonk WITH Repeat, both on A — is stunning a stunned unit an error / no-op? Then a plain
 *           Dread on A → ?
 *
 * Rules: 820.1.c.1 (Repeat is an additional COST paid while playing — never refunded), 820.1.d /
 * 820.1.d.2 (execute the instructions one more time; instructions not performed are ignored), 820.2 /
 * 820.2.a (all choices fixed at play), 359.3.e.2 / .5 / .7 (a target that went to a non-board zone is
 * illegal → that execution's instructions are ignored, no retarget), 423.1 / 423.1.a.1 (Stunned is
 * binary; stunning a stunned unit is legal and changes nothing), 423.1.b/.c, 355.5.
 *
 * Expected: Line 1 — A ends in P1's hand (exec 2 is void: no stun-in-hand, no second bounce, no new
 * target); P2 paid 2 + (1+[chaos]+2) with nothing returned; Dread → trash; no attacker left → combat ends
 * with no damage step, P2 keeps bf1, defender untouched; A is a fresh card in hand (replayable, enters
 * exhausted, unstunned). Line 2 — exec 1 stuns, exec 2 reads the NOW-stunned state → bounce: same end
 * state for 3 + [chaos]. Line 3 — double Thwonk: stunned once, second stun a harmless no-op, A still an
 * attacker at bf1 (would deal 0 and take 3 if fought); then a single Dread bounces it.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THWONK = "sfd-040-221";
const EXISTENTIAL_DREAD = "unl-134-219";

const P2_POOL = { energy: 10, power: { chaos: 2 } };

/** P1's turn. P2 holds bf1 with a 3-Might defender and both spells; P1's 5-Might A (cost 2) is ready in base with 2 energy to replay it. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, P2_POOL)
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { energyCost: 2, might: 5, name: "Attacker A" }, "a")
    .unit(P2, "bf1", { might: 3, name: "Defender" }, "def")
    .hand(P2, THWONK, "thwonk")
    .hand(P2, EXISTENTIAL_DREAD, "dread");
}

/** A attacks bf1 alone; P1 (attacker, on Focus) passes Focus to P2. */
async function aAttacksAndP2HasFocus(game: Game): Promise<void> {
  await game.p1.move("a", "bf1");
  expect(game.state("a")).toMatchObject({ combatRole: "attacker", isStunned: false, zone: "battlefield-bf1" });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
}

/** Everyone passes priority until the chain is empty. */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
}

/** After a chain P2 opened closes, Focus is P1's (347.1.b); P1 hands it straight back. */
async function focusBackToP2(game: Game): Promise<void> {
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.actingSeat()).toBe(P2);
}

const spentByP2 = (game: Game) => ({ chaos: P2_POOL.power.chaos - game.p2.power("chaos"), energy: P2_POOL.energy - game.p2.energy() });

describe("Thwonk! then Existential Dread [Repeat] — bounce on exec 1, exec 2 into the void", () => {
  // ── Line 1 ────────────────────────────────────────────────────────────────────────────────────
  test("Line 1 setup: P2 Thwonks A (no repeat) for 2 → A is a STUNNED attacker still at bf1; Focus passes to P1", async () => {
    const game = await board().build();
    await aAttacksAndP2HasFocus(game);
    await game.p2.cast("thwonk", { targets: "a" });
    expect(spentByP2(game)).toEqual({ chaos: 0, energy: 2 });
    await resolveChain(game);
    expect(game.zoneOf("thwonk")).toBe("trash");
    expect(game.state("a")).toMatchObject({ combatRole: "attacker", isStunned: true, zone: "battlefield-bf1" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("Line 1: a stunned A is still a legal 'attacking enemy unit' for BOTH of Dread's play-time choices; Repeat is offered (max 1) and the cast is one chain item costing 1 + [chaos] + 2", async () => {
    const game = await board().build();
    await aAttacksAndP2HasFocus(game);
    await game.p2.cast("thwonk", { targets: "a" });
    await resolveChain(game);
    await focusBackToP2(game);
    const opt = game.p2.option("cast", "dread");
    expect(opt?.fields.find((f) => f.arg === "targets")?.options).toEqual([["a"]]);
    expect(opt?.fields.find((f) => f.arg === "repeat")?.max).toBe(1);
    await game.p2.cast("dread", { repeat: 1, targets: "a" });
    expect(spentByP2(game)).toEqual({ chaos: 1, energy: 2 + 1 + 2 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dread", controller: P2, triggered: false })]);
  });

  test("Line 1: on resolution exec 1 sees A ALREADY stunned → returns A to its owner P1's hand; exec 2's target is in a non-board zone → ignored: A stays in hand exactly once, nobody else is touched, Dread → P2's trash", async () => {
    const game = await board().build();
    await aAttacksAndP2HasFocus(game);
    await game.p2.cast("thwonk", { targets: "a" });
    await resolveChain(game);
    await focusBackToP2(game);
    const p1Hand = game.p1.hand().length;
    await game.p2.cast("dread", { repeat: 1, targets: "a" });
    await resolveChain(game);
    expect(game.zoneOf("a")).toBe("hand");
    expect(game.state("a").owner).toBe(P1);
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    expect(game.p1.hand().filter((c) => c === "a")).toHaveLength(1);
    expect(game.zoneOf("dread")).toBe("trash");
    expect(game.p2.trash().sort()).toEqual(["dread", "thwonk"]);
    expect(game.state("def")).toMatchObject({ damage: 0, isStunned: false, zone: "battlefield-bf1" }); // no retarget
    expect(game.violations()).toEqual([]);
  });

  // BUG — Expected: exec 2's only target changed to a non-board zone (hand) → illegal (359.3.e.2), so the
  // whole execution is ignored (359.3.e.5/.7, 820.1.d.2): the card in hand carries no status at all.
  // Actual: exec 2 evaluates "already stunned?" on the hand card (false — the bounce wiped it), takes the
  // Stun branch and marks the card in P1's HAND as stunned (meta.stunned / __flags.stunned = true).
  test("Line 1 — exec 2 must be ignored entirely: the bounced A is NOT 'stunned in hand' (359.3.e.2/.5/.7, 820.1.d.2)", async () => {
    const game = await board().build();
    await aAttacksAndP2HasFocus(game);
    await game.p2.cast("thwonk", { targets: "a" });
    await resolveChain(game);
    await focusBackToP2(game);
    await game.p2.cast("dread", { repeat: 1, targets: "a" });
    await resolveChain(game);
    expect(game.zoneOf("a")).toBe("hand");
    expect(game.state("a").isStunned).toBe(false);
    expect((game.state("a").meta.__flags as Record<string, boolean> | undefined)?.stunned).not.toBe(true);
  });

  test("Line 1: nothing is refunded — the Repeat [2] was a cost of playing (820.1.c.1): P2 is still down 2 + 3 energy and 1 chaos after the void exec 2", async () => {
    const game = await board().build();
    await aAttacksAndP2HasFocus(game);
    await game.p2.cast("thwonk", { targets: "a" });
    await resolveChain(game);
    await focusBackToP2(game);
    await game.p2.cast("dread", { repeat: 1, targets: "a" });
    await resolveChain(game);
    expect(spentByP2(game)).toEqual({ chaos: 1, energy: 5 });
  });

  test("Line 1: with no attacker left at bf1 the combat ends without a damage step — P2 keeps bf1, the defender is untouched, no points, and P1 is back in an open Main Phase", async () => {
    const game = await board().build();
    await aAttacksAndP2HasFocus(game);
    await game.p2.cast("thwonk", { targets: "a" });
    await resolveChain(game);
    await focusBackToP2(game);
    await game.p2.cast("dread", { repeat: 1, targets: "a" });
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.state("def")).toMatchObject({ combatRole: null, damage: 0, zone: "battlefield-bf1" });
    expect([game.p1.points(), game.p2.points()]).toEqual([0, 0]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.interaction?.showdownStack?.filter((s) => s.active) ?? []).toHaveLength(0);
  });

  test("Line 1 aftermath: A in hand is a fresh card — P1 may replay it later this Main Phase for its 2 energy and it enters the base EXHAUSTED", async () => {
    const game = await board().build();
    await aAttacksAndP2HasFocus(game);
    await game.p2.cast("thwonk", { targets: "a" });
    await resolveChain(game);
    await focusBackToP2(game);
    await game.p2.cast("dread", { repeat: 1, targets: "a" });
    await game.settle();
    expect(game.p1.can("play", "a")).toBe(true);
    await game.p1.play("a");
    await game.settle();
    expect(game.state("a")).toMatchObject({ combatRole: null, damage: 0, isExhausted: true, zone: "base" });
    expect(game.p1.energy()).toBe(0);
  });

  // BUG — Expected: the replayed A is a NEW object with no memory of the stun. Actual: the stray "stun in
  // hand" from the void exec 2 (see BUG above) rides along and the unit re-enters the base already stunned.
  test("Line 1 aftermath — the replayed A is a new object and enters NOT stunned", async () => {
    const game = await board().build();
    await aAttacksAndP2HasFocus(game);
    await game.p2.cast("thwonk", { targets: "a" });
    await resolveChain(game);
    await focusBackToP2(game);
    await game.p2.cast("dread", { repeat: 1, targets: "a" });
    await game.settle();
    await game.p1.play("a");
    await game.settle();
    expect(game.zoneOf("a")).toBe("base");
    expect(game.state("a").isStunned).toBe(false);
  });

  test("Line 2 aftermath (control): bounced by Dread alone (stun → bounce), the replayed A enters exhausted and NOT stunned", async () => {
    const game = await board().build();
    await aAttacksAndP2HasFocus(game);
    await game.p2.cast("dread", { repeat: 1, targets: "a" });
    await game.settle();
    expect(game.zoneOf("a")).toBe("hand");
    expect(game.state("a").isStunned).toBe(false);
    await game.p1.play("a");
    await game.settle();
    expect(game.state("a")).toMatchObject({ isExhausted: true, isStunned: false, zone: "base" });
  });

  // ── Line 2 ────────────────────────────────────────────────────────────────────────────────────
  test("Line 2 (no Thwonk): Dread with Repeat, both on the UNSTUNNED A — exec 1 stuns, exec 2 reads the state at execution time ('already stunned') → bounce: A in P1's hand for 3 + [chaos]; same end state by Dread alone", async () => {
    const game = await board().build();
    await aAttacksAndP2HasFocus(game);
    await game.p2.cast("dread", { repeat: 1, targets: "a" });
    expect(spentByP2(game)).toEqual({ chaos: 1, energy: 3 });
    await resolveChain(game);
    expect(game.zoneOf("a")).toBe("hand");
    expect(game.zoneOf("dread")).toBe("trash");
    expect(game.zoneOf("thwonk")).toBe("hand");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.state("def").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("Line 2 control: a single (non-repeat) Dread on the unstunned A only stuns it — A stays at bf1 as a stunned attacker", async () => {
    const game = await board().build();
    await aAttacksAndP2HasFocus(game);
    await game.p2.cast("dread", { targets: "a" });
    expect(spentByP2(game)).toEqual({ chaos: 1, energy: 1 });
    await resolveChain(game);
    expect(game.state("a")).toMatchObject({ combatRole: "attacker", isStunned: true, zone: "battlefield-bf1" });
  });

  // ── Line 3 ────────────────────────────────────────────────────────────────────────────────────
  test("Line 3: Thwonk WITH Repeat, both on A (4 energy) — exec 1 stuns, exec 2 stuns an already-stunned unit: legal, no error, no 'unstun', no other change; A remains a stunned attacker at bf1", async () => {
    const game = await board().build();
    await aAttacksAndP2HasFocus(game);
    await game.p2.cast("thwonk", { repeat: 1, targets: "a" });
    expect(spentByP2(game)).toEqual({ chaos: 0, energy: 4 });
    expect(game.chain()).toHaveLength(1);
    await resolveChain(game);
    expect(game.zoneOf("thwonk")).toBe("trash");
    expect(game.state("a")).toMatchObject({ combatRole: "attacker", damage: 0, isStunned: true, zone: "battlefield-bf1" });
    expect(game.state("def")).toMatchObject({ isStunned: false, zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("Line 3: …then a plain Dread on A (1 + [chaos]) — A is already stunned → its single execution bounces A to P1's hand; combat ends, P2 keeps bf1", async () => {
    const game = await board().build();
    await aAttacksAndP2HasFocus(game);
    await game.p2.cast("thwonk", { repeat: 1, targets: "a" });
    await resolveChain(game);
    await focusBackToP2(game);
    await game.p2.cast("dread", { targets: "a" });
    expect(spentByP2(game)).toEqual({ chaos: 1, energy: 4 + 1 });
    await resolveChain(game);
    expect(game.zoneOf("a")).toBe("hand");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("Line 3 side-line: if instead everyone passes after the double Thwonk, the stunned A deals NO combat damage (423.1.b) but still takes the defender's 3 (< 5) — survives, is recalled to base still stunned; bf1 stays P2's", async () => {
    const game = await board().build();
    await aAttacksAndP2HasFocus(game);
    await game.p2.cast("thwonk", { repeat: 1, targets: "a" });
    await game.settle();
    expect(game.state("def")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("a")).toMatchObject({ isStunned: true, zone: "base" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });
});
