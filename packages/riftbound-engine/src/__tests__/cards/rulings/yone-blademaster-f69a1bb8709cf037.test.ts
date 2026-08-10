/**
 * Ruling f69a1bb8709cf037 — Yone, Blademaster (SFD-116 → sfd-116-221) · Unit · Body · 5 · 5 Might
 *   "[Weaponmaster] When I conquer a battlefield that was uncontrolled, deal damage equal to my Might to an enemy unit in a base."
 *   × Void Assault (UNL-202 → unl-202-219) · 2+[rainbow] "Move a friendly unit, then move an enemy unit. (If they both move
 *     to a battlefield you don't control, you're the attacker.)"
 *
 * Q: Void Assault moves Yone INTO an enemy battlefield while moving its only enemy unit OUT. Does Yone's ability trigger?
 * A: Yes. Void Assault resolves (Yone in, enemy out); bf contested; in the Cleanup — before any showdown has begun — the
 *    opponent loses control (no units, no ongoing showdown) → uncontrolled; the non-combat showdown then opens and Yone
 *    conquers a battlefield that WAS uncontrolled → trigger. Same logic if Yone is sent to an already-uncontrolled
 *    battlefield while an enemy is pulled there (he must then win the combat).
 * Rules: 187.4.c / 323.6 (control lapses at Cleanup with no unit and no ongoing showdown), 190.4, 344/348 (non-combat
 *        showdown → control), 464–467.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YONE = "sfd-116-221";
const VOID_ASSAULT = "unl-202-219";

/** P1's turn, 2+[rainbow]. bf1: P2's, held only by a 3-Might Sentinel. bf2 uncontrolled. P2's 6-Might Sleeper in base. Yone in P1's base. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Sentinel" }, "sentinel")
    .unit(P2, "base", { might: 6, name: "Sleeper" }, "sleeper")
    .unit(P1, "base", YONE, "yone")
    .hand(P1, VOID_ASSAULT, "va");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Cast Void Assault choosing Yone → yoneTo, then `enemy` → enemyTo (destinations are asked at play, 355.4). */
async function castVoidAssault(game: Game, yoneTo: string, enemy: string, enemyTo: string): Promise<void> {
  await game.p1.cast("va", { targets: ["yone", enemy] });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", source: { cardId: "yone" } });
  await game.p1.pick(yoneTo);
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", source: { cardId: enemy } });
  await game.p1.pick(enemyTo);
  expect(game.chain().map((c) => c.cardId)).toEqual(["va"]);
}

/** Drive to the open main phase, answering Yone's damage prompt (if asked) with the Sleeper. Returns whether Yone's trigger was seen. */
async function drain(game: Game): Promise<boolean> {
  let yoneTriggered = false;
  for (let i = 0; i < 24; i++) {
    yoneTriggered ||= game.chain().some((c) => c.cardId === "yone" && c.triggered && c.controller === P1);
    const d: Decision | null = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "sleeper")) {
      expect(d.source?.cardId).toBe("yone");
      yoneTriggered = true;
      await game.p1.pick("sleeper");
    } else {
      const r = await game.settle({ maxSteps: 1 });
      if (r.reason === "unanswered") {
        break;
      }
    }
  }
  await game.settle();
  return yoneTriggered;
}

describe("Ruling f69a1bb8709cf037 — Void Assault swaps Yone in and the lone defender out: the battlefield goes uncontrolled first, so Yone's trigger fires", () => {
  test("Void Assault resolves: Yone is at bf1, the Sentinel (P2's only unit there) is in P2's base; bf1 is contested by P1 and NO combat exists (nobody to fight)", async () => {
    const game = await board().build();
    await castVoidAssault(game, "battlefield-bf1", "sentinel", "base");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("va")).toBe("trash");
    expect(game.locationOf("yone")).toBe("bf1");
    expect(game.locationOf("sentinel")).toBe("base");
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
    expect(showdown(game)?.isCombatShowdown ?? false).toBe(false);
  });

  test("in the Cleanup BEFORE the showdown begins P2 loses control (187.4.c): when the (non-combat) showdown opens, bf1 is uncontrolled — not P2's", async () => {
    const game = await board().build();
    await castVoidAssault(game, "battlefield-bf1", "sentinel", "base");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(0); // nothing conquered yet
  });

  test("the showdown closes with Yone conquering a battlefield that WAS uncontrolled → his trigger fires: 5 (his Might) to an enemy unit in a base — P1 picks the Sleeper (Sentinel is the other option); P1 scores bf1", async () => {
    const game = await board().build();
    await castVoidAssault(game, "battlefield-bf1", "sentinel", "base");
    const fired = await drain(game);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(fired).toBe(true);
    expect(game.state("sleeper")).toMatchObject({ damage: 5, zone: "base" });
    expect(game.state("sentinel")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("nuance — same logic the other way round: Yone → the already-uncontrolled bf2 while the Sentinel is pulled there: a combat with Yone attacking at a battlefield nobody controls; Yone (5) kills the Sentinel (3), conquers the uncontrolled bf2 → trigger hits the Sleeper", async () => {
    const game = await board().build();
    await castVoidAssault(game, "battlefield-bf2", "sentinel", "battlefield-bf2");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf2", isCombatShowdown: true });
    expect(game.state("yone").combatRole).toBe("attacker");
    expect(game.state("sentinel").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf2?.controller ?? null).toBeNull();
    const fired = await drain(game);
    expect(game.zoneOf("sentinel")).toBe("trash");
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
    expect(fired).toBe(true);
    expect(game.state("sleeper")).toMatchObject({ damage: 5, zone: "base" });
    expect(game.violations()).toEqual([]);
  });
});
