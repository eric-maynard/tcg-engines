/**
 * Ruling 7aba54359cb79c1f — Blast Cone (UNL-133 → unl-133-219) · Gear · Chaos · 4+[chaos]
 *   "When you play this, you may move an enemy unit. When you move an enemy unit, you may exhaust this to [Stun] it."
 *
 * Q: If I move an enemy unit to an OPEN battlefield with Blast Cone, does the opponent conquer it?
 * A: Yes. The moved unit applies Contested; with no opposing units there no combat is staged, and at the end of the
 *    resolution/showdown the player with units remaining establishes control — that need not be the player who caused
 *    the contest. Gaining control of a battlefield they haven't scored this turn is a Conquer: the opponent scores.
 * Rules: 445/450 (Contested on arrival), 461.5 / 461.5.d / 461.5.e (player with units remaining establishes control;
 *        = Conquer if not yet scored; needn't be the contesting player), 464.1, 348.2.a (non-combat showdown close).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLAST_CONE = "unl-133-219";

/** P1's turn with 4+[chaos]. P1 holds bf1 (Holder); bf2 is open and empty. P2's Victim (2) and Other (3) sit in P2's base. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 2, name: "Victim" }, "victim")
    .unit(P2, "base", { might: 3, name: "Other" }, "other")
    .hand(P1, BLAST_CONE, "cone");
}

/** P1 plays Blast Cone, opts in, targets Victim, destination bf2; the move resolves (the follow-up "exhaust to stun" is declined). Stops at the first showdown/main decision. */
async function coneVictimToBf2(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("cone");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "cone" }, timing: "FIN" });
  await game.p1.yes();
  let d: Decision | null = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
  expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["other", "victim"]);
  await game.p1.pick("victim");
  d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toContain("battlefield-bf2");
  await game.p1.pick("battlefield-bf2");
  for (let i = 0; i < 12; i++) {
    d = game.decision();
    if (!d || (d.kind === "action" && d.context !== "chain")) {
      break;
    }
    if (d.kind === "yes-no" && d.seat === P1) {
      await game.p1.no(); // "you may exhaust this to [Stun] it" — not relevant here
    } else if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  return game;
}

describe("Ruling 7aba54359cb79c1f — Blast-Coning an enemy unit onto an open battlefield hands the opponent a conquer", () => {
  test("the move: Victim lands at the empty bf2, which becomes Contested BY P2 (its controller) though P1 staged it; no combat (only P2 has units there); nothing scored yet", async () => {
    const game = await coneVictimToBf2();
    expect(game.zoneOf("cone")).toBe("base");
    expect(game.zoneOf("victim")).toBe("battlefield-bf2");
    expect(game.state("victim").isStunned).toBe(false);
    const bf2 = game.gameState.battlefields.bf2!;
    expect(bf2).toMatchObject({ contested: true, contestedBy: P2, controller: null });
    expect(game.state("victim").combatRole ?? null).toBeNull();
    expect(game.p2.points()).toBe(0);
    // A (non-combat) showdown opens at bf2 with Focus to P2, the contesting player.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("everyone passes: the player with units remaining there — P2, not the P1 who caused it — establishes control of bf2; not yet scored by P2 this turn ⇒ a Conquer: P2 +1 point (on P1's turn), P1 nothing", async () => {
    const game = await coneVictimToBf2();
    for (let i = 0; i < 4 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "showdown"; i++) {
      await game.acting().passFocus();
    }
    await game.settle();
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
