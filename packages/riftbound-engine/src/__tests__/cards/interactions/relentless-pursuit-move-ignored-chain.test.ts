/**
 * Interaction: Relentless Pursuit (sfd-184-221) · Spell · Fury/Body · 2 + [rainbow] · [Action]
 *     "Move a friendly unit. You may attach an Equipment with the same controller to it. This turn, that
 *      unit has 'When I conquer, you may move me to my base.'"
 *   × Determined Sentry (unl-111-219) · Unit · Body · 1 · 1 [Might] · "I can't move to base." (no Ganking)
 *   × Long Sword (sfd-022-221) · Equipment · Fury · 2 · +2 [Might] — unattached, P1's
 *
 * Question: P1 Pursuits the Sentry and names the Sentry's BASE as the destination.
 *   (a) the Sentry is AT a battlefield, so base is the only place it could go — and it can't go there. Is
 *       the destination even offered at finalization? Does the Sentry get pulled anywhere (base? hand?)?
 *       May P1 still attach the Long Sword? Does the Sentry still gain the conquer-move grant?
 *   (b) the Sentry is in BASE and P1 moves it to a battlefield — the yes-side of every clause.
 *
 * Expected: (a) the destination IS offered at finalization — move destinations are play-time choices whose
 *   legality is re-checked at resolution (355.4 / 355.4.a: a valid location is one other than the unit's
 *   current one where it is ALLOWED TO BE PRESENT, and the Sentry may certainly be present in its base) —
 *   so the spell is legally cast and its costs are paid. At resolution the move is impossible ("can't"
 *   beats "can", 054.1) so the move instruction is IGNORED (359.3.e.6 — the Ride-the-Wind-at-Vilemaw's-Lair
 *   example): the Sentry stays exactly where it is. It is NOT recalled and above all NOT returned to its
 *   owner's hand — 447.2.c's Recall fallback covers a destination the unit may not be PRESENT at, not a
 *   mover forbidden from moving, and even a Recall would land it in its base (455), never in hand. Both
 *   later instructions reference the moved unit ("to it", "that unit"), so they are linked instructions;
 *   the earlier linked instruction was ignored, so neither executes (359.3.e.14 / 359.3.e.14.a): P1 is NOT
 *   prompted to attach the Long Sword and the Sentry does NOT gain "When I conquer, you may move me to my
 *   base" this turn. Relentless Pursuit still counts as played and is trashed with no effect (359.3.e.10);
 *   no move trigger fires and no showdown is created.
 *   (b) base → battlefield is legal (144.4.c.1 is about Ganking between battlefields and is not needed
 *   here), the Sentry moves, P1 may then attach the Long Sword to it, and the delayed grant applies for the
 *   turn — when the Sentry conquers, P1 is offered the move home (a prevented action does not suppress the
 *   offer) and that move is in turn ignored.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RELENTLESS_PURSUIT = "sfd-184-221";
const SENTRY = "unl-111-219";
const LONG_SWORD = "sfd-022-221";

/**
 * (a) P1's turn 2. The Sentry holds bfA for P1; bfC is P2's, garrisoned, so it is a real second destination.
 * P1 has an unattached Long Sword and exactly 2 energy + 1 [rainbow] — the whole cost of the spell.
 */
function atBattlefield() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfC", { controller: P2 })
    .unit(P2, "bfC", { might: 4, name: "Faraway" }, "far")
    .unit(P1, "bfA", SENTRY, "sentry")
    .gear(P1, LONG_SWORD, "sword")
    .hand(P1, RELENTLESS_PURSUIT, "rp");
}

/** (b) The same pieces with the Sentry at home and bfB empty and uncontrolled — its only destination. */
function inBase() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bfB", { controller: null })
    .unit(P1, "base", SENTRY, "sentry")
    .gear(P1, LONG_SWORD, "sword")
    .hand(P1, RELENTLESS_PURSUIT, "rp");
}

const delayedTriggers = (game: Game, card: string): unknown[] =>
  ((game.state(card).meta as { delayedTriggers?: unknown[] }).delayedTriggers ?? []).slice();

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Cast Relentless Pursuit on the Sentry, naming its base as the destination, and let it resolve. */
async function pursuedToBase(): Promise<Game> {
  const game = await atBattlefield().build();
  await game.p1.cast("rp", { targets: ["sentry", "sword"] });
  await game.p1.pick("base");
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

/** Step with passes / forced answers only until `pred` holds (bounded). */
async function until(game: Game, pred: (d: Decision | null) => boolean, max = 20): Promise<void> {
  for (let i = 0; i < max && !pred(game.decision()); i++) {
    await game.settle({ maxSteps: 1 });
  }
  expect(pred(game.decision())).toBe(true);
}

const isOpenMain = (d: Decision | null): boolean => d?.kind === "action" && d.context === "main";
const isMoveHomeOffer = (d: Decision | null): boolean => d?.kind === "yes-no" && d.seat === P1;

describe("Relentless Pursuit × Determined Sentry — an ignored move takes its linked instructions with it", () => {
  // ── (a) the impossible move ────────────────────────────────────────────────────────────────────

  test("(a) premise: the Sentry carries the 'can't move to base' restriction and is offered no Standard Move home; the Long Sword sits unattached", async () => {
    const game = await atBattlefield().build();
    expect(game.state("sentry").keywords).toContain("NoMoveToBase");
    expect(game.state("sentry")).toMatchObject({ isReady: true, location: "bfA" });
    expect((await game.p1.try((p) => p.move("sentry", "base"))).ok).toBe(false);
    expect(game.state("sword").attachedTo).toBeUndefined();
  });

  test("(a) the spell targets friendly units only, and BASE is offered as a move destination at finalization alongside bfC (355.4 / 355.4.a — the Sentry is allowed to be PRESENT in its base; the restriction bites on the move, not on presence)", async () => {
    const game = await atBattlefield().build();
    // rule 355.5 / 355.12 — the option is the pair (unit, Equipment).
    const tuples = (game.p1.option("cast", "rp")?.fields.find((f) => f.name === "targets")?.options ?? []) as string[][];
    expect([...new Set(tuples.map((t) => t[0]))]).toEqual(["sentry"]);
    expect([...new Set(tuples.map((t) => t[1]))]).toEqual(["sword"]);
    await game.p1.cast("rp", { targets: ["sentry", "sword"] });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).toSorted() : []).toEqual(["base", "battlefield-bfC"]);
  });

  test("(a) naming base is accepted and paid for: the spell goes on the chain with its costs spent and nothing has moved yet (355.4 — legality is re-checked on resolution)", async () => {
    const game = await atBattlefield().build();
    await game.p1.cast("rp", { targets: ["sentry", "sword"] });
    await game.p1.pick("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "rp", controller: P1, triggered: false }),
    ]);
    expect(game.locationOf("sentry")).toBe("bfA");
  });

  test("(a) on resolution the move is impossible ('can't' beats 'can', 054.1) so the instruction is IGNORED (359.3.e.6): the Sentry stays at bfA — not recalled to base (455), not in hand (447.2.c is not a bounce) — no move trigger, no showdown, and the spell is still played and trashed (359.3.e.10)", async () => {
    const game = await pursuedToBase();
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("battlefield-bfA");
    expect(game.locationOf("sentry")).toBe("bfA");
    expect(game.p1.base()).not.toContain("sentry");
    expect(game.p1.hand()).toEqual([]);
    expect(game.state("sentry")).toMatchObject({ combatRole: null, controller: P1, isReady: true });
    expect(game.zoneOf("rp")).toBe("trash");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test('P1 is not prompted to attach the Long Sword. "You may attach an Equipment … to it" references the unit moved by the earlier instruction, so the two are linked instructions and the later one must not execute once the earlier was ignored (359.3.e.14 / 359.3.e.14.a). The spell resolves into P1\'s open main phase with the Sword still unattached.', async () => {
    const game = await pursuedToBase();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("sword").attachedTo).toBeUndefined();
  });

  test('the Sentry does not gain "When I conquer, you may move me to my base". That clause references the moved unit ("that unit"), so it is linked to the ignored move and must not execute either (359.3.e.14.a). No delayed trigger is installed on the Sentry.', async () => {
    const game = await pursuedToBase();
    await game.settle();
    expect(delayedTriggers(game, "sentry")).toEqual([]);
  });

  // ── (b) the yes-side: base → battlefield ───────────────────────────────────────────────────────

  test("(b) base → the empty bfB is a legal move: the Sentry arrives Contested by P1 and P1 is then offered the optional attach (355.13 / 434 — no Equip cost), which equips the Long Sword", async () => {
    const game = await inBase().build();
    await game.p1.cast("rp", { targets: ["sentry", "sword"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("sentry")).toBe("bfB");
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, timing: "RES" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toEqual(["sword"]);
    await game.p1.pick("sword");
    expect(game.state("sword")).toMatchObject({ attachedTo: "sentry", location: "bfB" });
    expect(game.state("sentry").attachments).toContain("sword");
  });

  test("(b) the third clause installs the turn-scoped grant on the moved unit (364.3), and declining the attach does not stop it", async () => {
    const game = await inBase().build();
    await game.p1.cast("rp", { targets: ["sentry", "sword"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.decline();
    expect(game.state("sword").attachedTo).toBeUndefined();
    expect(delayedTriggers(game, "sentry")).toEqual([
      expect.objectContaining({
        controllerId: P1,
        duration: "turn",
        effect: { target: "self", to: "base", type: "move" },
        optional: true,
        trigger: expect.objectContaining({ event: "conquer", on: "self" }),
      }),
    ]);
  });

  test("(b) the arrival stages a Non-Combat Showdown at bfB with P1 holding Focus; both pass → P1 establishes control = Conquer, +1 point (348.2.a / 469.1)", async () => {
    const game = await inBase().build();
    await game.p1.cast("rp", { targets: ["sentry", "sword"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("sword");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfB", focusPlayer: P1, isCombatShowdown: false });
    expect(game.p1.points()).toBe(0);
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
  });

  test("(b) the conquer fires the granted trigger: P1 IS offered the move home even though the Sentry can never take it (358.3.a), and accepting simply ignores the move (054.1 / 359.3.e.6) — the Sentry stays at bfB, keeps the battlefield and the point", async () => {
    const game = await inBase().build();
    await game.p1.cast("rp", { targets: ["sentry", "sword"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("sword");
    await until(game, isMoveHomeOffer);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await until(game, isOpenMain);
    expect(game.locationOf("sentry")).toBe("bfB");
    expect(game.p1.base()).not.toContain("sentry");
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
