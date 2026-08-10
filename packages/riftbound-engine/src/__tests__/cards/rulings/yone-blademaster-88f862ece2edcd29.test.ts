/**
 * Ruling 88f862ece2edcd29 — Yone, Blademaster (SFD-116 → sfd-116-221) · 5 Might
 *     "When I conquer a battlefield that was uncontrolled, deal damage equal to my Might to an enemy unit in a base."
 *   × Void Assault (UNL-202 → unl-202-219) · 2 + [rainbow] "Move a friendly unit, then move an enemy unit. (If they
 *     both move to a battlefield you don't control, you're the attacker.)"
 *
 * Q: Does Yone's conquer ability trigger when Void Assault gets him onto a battlefield that is/becomes uncontrolled?
 * A: Yes, in both versions. V1: Yone → enemy-held bf, its last enemy unit is moved out; at the cleanup (no showdown
 *    in progress yet) the opponent loses control → uncontrolled → the (non-combat) showdown ends with Yone taking
 *    control → trigger. V2: Yone → an uncontrolled bf, then an enemy is pulled there → combat with Yone attacking;
 *    the bf stays uncontrolled throughout; if Yone wins he conquers an uncontrolled bf → trigger.
 * Rules: 187.4.c (control lost at cleanup when no unit/showdown holds it), 464–467 (combat/conquer), 188.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YONE = "sfd-116-221";
const VOID_ASSAULT = "unl-202-219";

/** P1's turn with 2 + [rainbow]. bf1: P2's, held by a lone Guard (2). bf2: uncontrolled. P2's Sleeper (6) + Brute (2) in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 6, name: "Sleeper" }, "sleeper")
    .unit(P2, "base", { might: 2, name: "Brute" }, "brute")
    .unit(P1, "base", YONE, "yone")
    .hand(P1, VOID_ASSAULT, "va");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Cast Void Assault: Yone → yoneTo, then `enemy` → enemyTo; leaves the spell on the chain with P1's priority. */
async function castVoidAssault(game: Game, yoneTo: string, enemy: string, enemyTo: string): Promise<void> {
  await game.p1.cast("va", { targets: ["yone", enemy] });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", source: { cardId: "yone" } });
  await game.p1.pick(yoneTo);
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", source: { cardId: enemy } });
  await game.p1.pick(enemyTo);
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["va"]);
}

/**
 * Drive to the open main phase; whenever Yone's damage prompt appears, hit the Sleeper (a lone legal unit is
 * locked without asking). Returns whether Yone's triggered ability was ever seen on the chain.
 */
async function drainChoosingSleeper(game: Game): Promise<boolean> {
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

describe("Ruling 88f862ece2edcd29 — Yone's 'conquer an uncontrolled battlefield' trigger fires in both Void Assault lines", () => {
  // ── Version 1: clear the enemy-held battlefield ────────────────────────────────────────────

  test("V1: Void Assault resolves — Yone arrives at P2's bf1 and the Guard (its last unit there) is moved to P2's base; no combat (no defenders)", async () => {
    const game = await board().build();
    await castVoidAssault(game, "battlefield-bf1", "guard", "base");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("va")).toBe("trash");
    expect(game.zoneOf("yone")).toBe("battlefield-bf1");
    expect(game.zoneOf("guard")).toBe("base");
    expect(game.p2.units("bf1")).toEqual([]);
    expect(showdown(game)?.isCombatShowdown ?? false).toBe(false);
  });

  test("V1: with the chain empty and no showdown yet, P2 loses control of the emptied bf1 — it is UNCONTROLLED (and contested by P1) when the showdown opens", async () => {
    const game = await board().build();
    await castVoidAssault(game, "battlefield-bf1", "guard", "base");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller ?? null).not.toBe(P2);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("ruling 88f862ece2edcd29 — V1: the showdown ends with Yone conquering a battlefield that WAS uncontrolled → his trigger fires: P1 picks an enemy unit in a base — Sleeper takes 5; P1 scores bf1", async () => {
    const game = await board().build();
    await castVoidAssault(game, "battlefield-bf1", "guard", "base");
    const fired = await drainChoosingSleeper(game);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(fired).toBe(true);
    expect(game.state("sleeper")).toMatchObject({ damage: 5, zone: "base" });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── Version 2: into an uncontrolled battlefield with a pulled-in defender ───────────────────

  test("V2: Yone → uncontrolled bf2, then Brute pulled to bf2: a COMBAT opens with P1/Yone attacking and Brute defending; bf2 is still controlled by nobody", async () => {
    const game = await board().build();
    await castVoidAssault(game, "battlefield-bf2", "brute", "battlefield-bf2");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("yone")).toBe("battlefield-bf2");
    expect(game.zoneOf("brute")).toBe("battlefield-bf2");
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf2", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("yone").combatRole).toBe("attacker");
    expect(game.state("brute").combatRole).toBe("defender");
    // The surprise defender does not make bf2 P2's.
    expect(game.gameState.battlefields.bf2?.controller ?? null).toBeNull();
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P1 });
  });

  test("ruling 88f862ece2edcd29 — V2: Yone wins (5 vs 2, Brute dies) and conquers the uncontrolled bf2 → trigger fires — the lone enemy unit in a base, Sleeper, takes 5; P1 scores", async () => {
    const game = await board().build();
    await castVoidAssault(game, "battlefield-bf2", "brute", "battlefield-bf2");
    const fired = await drainChoosingSleeper(game);
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("yone")).toBe("battlefield-bf2");
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(fired).toBe(true);
    expect(game.state("sleeper")).toMatchObject({ damage: 5, zone: "base" });
    expect(game.violations()).toEqual([]);
  });
});
