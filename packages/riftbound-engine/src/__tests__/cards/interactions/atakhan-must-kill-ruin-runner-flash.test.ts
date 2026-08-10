/**
 * Interaction: Atakhan (unl-170-219) · Unit · Order · 10 + [order]×3 · 7 Might
 *     "You may kill a friendly unit as an additional cost to play me. … [Ganking] (I can move from
 *      battlefield to battlefield.) When I attack, the defender must kill one of their units here."
 *                                                                                       — P1's, at bf2
 *   × Ruin Runner (sfd-105-221) · Unit · Body · 6 · 5 Might · "I can't be chosen by enemy spells and
 *     abilities."                                                                       — P2's, at bf1
 *   × Flash (ogs-011-024) · Spell · Chaos · 2 · [Reaction] "Move up to 2 friendly units to base."
 *                                                                                       — in P2's hand
 *   (+ a vanilla 2-Might "Recruit" of P2's at bf1.)
 *
 * Question. P1's turn; P2 controls bf1 with Ruin Runner and the Recruit; P2 holds Flash. P1 ganks Atakhan
 * from bf2 into bf1; "When I attack, the defender must kill one of their units here" triggers.
 *   (a) Does P1 choose a unit (and is Ruin Runner filtered out) when the trigger is put on the chain?
 *   (b) P2 reacts with Flash moving ONLY the Recruit to base — on resolution, must P2 now kill Ruin Runner?
 *   (c) Contrast: no Flash — who is prompted, and what is offered?
 *   (d) Contrast: Ruin Runner alone at bf1 from the start.
 *
 * Rules: 355.10.f / 355.10.e (a "must" instruction completed by another player has NO targets — nothing
 * is chosen at finalization, 355.5.b, and the choice is made on resolution, 355.17), 757/758 ("can't be
 * chosen by ENEMY spells and abilities" — P2 selecting its own unit is not the enemy ability choosing it),
 * 355.10.d.2 (a lone candidate binding automatically is still not targeting), 465.1 (no defenders → no
 * damage step), 466.5.d (Conquer).
 *
 * Expected: (a) no — P1 is never shown a unit list; the trigger goes on the initial Combat Chain with no
 * targets and P1 merely holds priority. (b) Flash resolves first (LIFO); "their units here" is read as
 * the trigger RESOLVES → only Ruin Runner remains → P2 must kill it (no decline; its protection does not
 * apply); Runner to P2's trash; no defenders left → no damage; Atakhan conquers bf1, P1 scores 1; the
 * Recruit sits safely in P2's base. (c) At resolution P2 — the defender, not P1 — is prompted with exactly
 * {Ruin Runner, Recruit}, may kill the Recruit; then Atakhan 7 vs Runner 5 → Runner dies, Atakhan takes 5,
 * survives (healed), conquers, +1. (d) Runner alone: it binds automatically at resolution and dies before
 * any combat damage; Atakhan conquers the empty battlefield, +1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ATAKHAN = "unl-170-219";
const RUIN_RUNNER = "sfd-105-221";
const FLASH = "ogs-011-024";

/**
 * P1's turn (turn 2, main). P1 controls bf2 with Atakhan (ready); P2 controls bf1 with Ruin Runner and —
 * unless `runnerAlone` — a vanilla 2-Might Recruit; P2 has exactly Flash's 2 energy and Flash in hand.
 */
function board(opts: { runnerAlone?: boolean } = {}) {
  let b = scenario()
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf2", ATAKHAN, "atakhan")
    .unit(P2, "bf1", RUIN_RUNNER, "runner")
    .hand(P2, FLASH, "flash");
  if (!opts.runnerAlone) {
    b = b.unit(P2, "bf1", { might: 2, name: "Recruit" }, "recruit");
  }
  return b;
}

function showdown(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).at(-1);
}

function combatDamageTo(game: Game, target: string): number {
  return (game.gameState.damageLog ?? []).filter((r) => r.combat && r.target === target).reduce((s, r) => s + r.amount, 0);
}

/** Atakhan ganks bf2 → bf1: combat opens, the attack trigger is the only Combat Chain item, P1 holds priority. */
async function ganked(opts: { runnerAlone?: boolean } = {}): Promise<Game> {
  const game = await board(opts).build();
  await game.p1.gank("atakhan", "bf1");
  return game;
}

/** …P1 passes priority; P2 responds with Flash on the Recruit only; P2 pass, P1 pass → Flash resolves (Recruit home). */
async function flashedRecruit(): Promise<Game> {
  const game = await ganked();
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.cast("flash", { targets: ["recruit"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["atakhan", "flash"]);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.chain().map((c) => c.cardId)).toEqual(["atakhan"]);
  return game;
}

/** From a position where only Atakhan's trigger is on the chain: both pass priority so it resolves. */
async function resolveTrigger(game: Game): Promise<void> {
  expect(game.chain().map((c) => c.cardId)).toEqual(["atakhan"]);
  await game.acting().passPriority();
  if (game.chain().length > 0 && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
}

describe("(a) the 'must kill' trigger has no targets: P1 chooses nothing as it goes on the chain", () => {
  test("the gank opens combat at bf1 (Atakhan attacker; Runner + Recruit defenders) and puts Atakhan's attack trigger on the initial Combat Chain WITHOUT any target — P1 is handed priority, not a unit list (355.10.f, 355.5.b)", async () => {
    const game = await ganked();
    expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("atakhan")).toMatchObject({ combatRole: "attacker", zone: "battlefield-bf1" });
    expect(game.state("runner").combatRole).toBe("defender");
    expect(game.state("recruit").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "atakhan", controller: P1, triggered: true })]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.decision()?.kind).not.toBe("pick");
  });

  test("nobody has died and nothing was 'chosen' yet: both P2 units are still at bf1 while the trigger waits; bf2 (vacated by the gank) is already uncontrolled", async () => {
    const game = await ganked();
    expect(game.p2.units("bf1").sort()).toEqual(["recruit", "runner"]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.gameState.battlefields.bf2?.controller).toBeNull();
  });
});

describe("(b) P2 Flashes only the Recruit away — at resolution Ruin Runner is the only unit 'here' and must die", () => {
  test("P1 passes priority → P2 may respond with Flash ([Reaction]); {Recruit} alone is a legal 'up to 2' choice; it goes on top of Atakhan's trigger and costs P2's 2 energy", async () => {
    const game = await ganked();
    await game.p1.passPriority();
    expect(game.p2.can("cast", "flash")).toBe(true);
    const field = game.p2.option("cast", "flash")?.fields.find((f) => f.name === "targets");
    expect(field?.options).toContainEqual(["recruit"]);
    await game.p2.cast("flash", { targets: ["recruit"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["atakhan", "flash"]);
    expect(game.chain()[1]).toMatchObject({ cardId: "flash", controller: P2, targets: ["recruit"] });
    expect(game.p2.energy()).toBe(0);
  });

  test("LIFO: Flash resolves first — the Recruit is in P2's base (no longer a defender), Ruin Runner still defends at bf1, Atakhan's trigger is still on the chain", async () => {
    const game = await flashedRecruit();
    expect(game.state("recruit")).toMatchObject({ combatRole: null, zone: "base" });
    expect(game.state("runner")).toMatchObject({ combatRole: "defender", zone: "battlefield-bf1" });
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "atakhan", triggered: true })]);
  });

  test("the trigger resolves reading 'their units here' NOW: Ruin Runner is the lone candidate → it is killed (P2's trash) with no way to decline — 'can't be chosen by ENEMY abilities' is no shield when P2 itself must pick (757); if a prompt appears at all it is P2's, lists only the Runner, and cannot be declined", async () => {
    const game = await flashedRecruit();
    await resolveTrigger(game);
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.seat).toBe(P2);
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["runner"]);
      expect(d.allowDecline).toBe(false);
      expect((await game.p2.try((p) => p.decline())).ok).toBe(false);
      await game.p2.pick("runner");
    }
    expect(game.zoneOf("runner")).toBe("trash");
    expect(game.p2.trash()).toContain("runner");
    expect(game.zoneOf("recruit")).toBe("base");
    expect(game.chain()).toEqual([]);
    // The kill was an effect, not combat damage.
    expect(combatDamageTo(game, "runner")).toBe(0);
  });

  test("outcome: no defender remains → the showdown closes without a damage step (465.1); Atakhan (undamaged) conquers bf1 and P1 scores 1 (466.5.d); the Recruit survives in P2's base", async () => {
    const game = await flashedRecruit();
    await game.settle();
    expect(game.gameState.damageLog ?? []).toEqual([]);
    expect(game.state("atakhan")).toMatchObject({ combatRole: null, damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("runner")).toBe("trash");
    expect(game.state("recruit")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) contrast — no Flash: the DEFENDER is prompted at resolution with both units and may feed it the Recruit", () => {
  test("P1 pass, P2 pass → the trigger resolves and it is P2 (the defender, not P1) who is asked, with exactly {Ruin Runner, Recruit} — the Runner IS on the list — and no decline (a 'must')", async () => {
    const game = await ganked();
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    if (d?.kind !== "pick") {
      return;
    }
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["recruit", "runner"]);
    expect(d.min).toBe(1);
    expect(d.max).toBe(1);
    expect(d.allowDecline).toBe(false);
    expect(game.p1.decision()?.kind ?? "none").not.toBe("pick");
  });

  test("P2 kills the Recruit: Recruit → P2's trash, Runner untouched and still defending; the Combat Chain is empty and P1 (attacker) holds Focus", async () => {
    const game = await ganked();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p2.pick("recruit");
    expect(game.zoneOf("recruit")).toBe("trash");
    expect(game.state("runner")).toMatchObject({ combatRole: "defender", damage: 0, zone: "battlefield-bf1" });
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ focusPlayer: P1, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("both pass Focus → Atakhan 7 vs Ruin Runner 5: the Runner takes 7 and dies, Atakhan takes 5 and survives (healed to 0 in the Combat Cleanup); Atakhan conquers bf1, P1 +1", async () => {
    const game = await ganked();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p2.pick("recruit");
    await game.settle();
    expect(combatDamageTo(game, "runner")).toBe(7);
    expect(combatDamageTo(game, "atakhan")).toBe(5);
    expect(game.zoneOf("runner")).toBe("trash");
    expect(game.p2.trash().sort()).toEqual(expect.arrayContaining(["recruit", "runner"]));
    expect(game.state("atakhan")).toMatchObject({ combatRole: null, damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("flash")).toBe("hand"); // never used on this line
    expect(game.violations()).toEqual([]);
  });
});

describe("(d) contrast — Ruin Runner alone at bf1 from the start", () => {
  test("the trigger still goes on the chain untargeted (P1 gets priority, no pick); Runner is the lone defender", async () => {
    const game = await ganked({ runnerAlone: true });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "atakhan", controller: P1, triggered: true })]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p2.units("bf1")).toEqual(["runner"]);
    expect(game.state("runner").combatRole).toBe("defender");
  });

  test("P1 pass, P2 pass → the lone candidate binds automatically (or via a forced one-option P2 prompt): Ruin Runner is killed by the effect before any combat damage — its 'can't be chosen by enemy abilities' never enters into it", async () => {
    const game = await ganked({ runnerAlone: true });
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.seat).toBe(P2);
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["runner"]);
      expect(d.allowDecline).toBe(false);
      await game.p2.pick("runner");
    }
    expect(game.zoneOf("runner")).toBe("trash");
    expect(combatDamageTo(game, "runner")).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.state("atakhan")).toMatchObject({ combatRole: "attacker", damage: 0, zone: "battlefield-bf1" });
  });

  test("outcome: Atakhan conquers the now-empty bf1 with no damage exchanged; P1 scores 1; P2's Flash is still in hand with its 2 energy unspent", async () => {
    const game = await ganked({ runnerAlone: true });
    await game.settle();
    expect(game.gameState.damageLog ?? []).toEqual([]);
    expect(game.zoneOf("runner")).toBe("trash");
    expect(game.state("atakhan")).toMatchObject({ combatRole: null, damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("flash")).toBe("hand");
    expect(game.p2.energy()).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
