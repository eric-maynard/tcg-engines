/**
 * Interaction: Tactical Retreat (unl-175-219) · Spell · Order · 2 · [Reaction]
 *     "Choose a friendly unit. The next time it would die this turn, heal it, exhaust it, and recall
 *      it instead. (Send it to base. This isn't a move.)"
 *   × Flash (ogs-011-024) · Spell · Chaos · 2 · [Reaction] "Move up to 2 friendly units to base."
 *   × Shipyard Skulker (ogn-175-298) · vanilla 3-Might unit — P2's lone defender at bf1
 *   × a vanilla 3-Might (or 4-Might) attacker for P1
 *
 * Question (P1's turn; P2 controls bf1 with a lone Skulker and holds both Reactions; P1 attacks
 * bf1 with a lone vanilla unit, no triggers anywhere):
 *   (i)   P2 waits: both pass Focus, damage is assigned 3 → Skulker / 3 → attacker. Is P2 offered
 *         priority to Tactical Retreat the Skulker after seeing the assignment but before it dies?
 *   (ii)  P2 instead casts Tactical Retreat on Skulker during the showdown, then all pass: does the
 *         damage step still run, what is dealt, where does Skulker end up, who wins / controls bf1,
 *         does P1 score?
 *   (iii) P2 instead Flashes Skulker to base during the showdown: is there a damage step at all,
 *         does the attacker take damage, who controls bf1, does P1 score?
 *   (iv)  As (ii) but the attacker is 4 Might.
 *
 * Rules:
 *   465.1 / 465.2       Step 2 runs only if BOTH an attacking and a defending unit remain; sums,
 *                       attacker assigns, defender assigns, all dealt simultaneously (465.2.c/.d).
 *   465.3               "Skip the FEPR process … proceed to the Resolution Step" — no priority
 *                       window between assignment and the 466.1 Combat Cleanup.
 *   466.1 / 466.1.a.1   Combat Cleanup kills lethally-damaged units, heals the rest (3c).
 *   466.3.a / 466.3.d   sole player with units here won / neither has units → No Result.
 *   466.5.b / 466.5.d   nobody left → Uncontrolled; a winner who did not control it Conquers (+1).
 *   323.2.c             a designated unit no longer at the combat battlefield loses its designation.
 *   323.6               losing an empty battlefield needs an Open State with no showdown ongoing.
 *   347.2               a showdown ends only when all players pass in sequence.
 *   454                 a recall is not a move.   813  Reactions may be played in Closed States —
 *                       but there must BE a state in which a player may act.
 *
 * Expected:
 *   (i)   No window. Both 3-Might units die; No Result; bf1 Uncontrolled; no point; Retreat unspent.
 *   (ii)  Retreat resolves in the showdown; damage step runs 3↔3; attacker dies; Skulker would die →
 *         healed, exhausted, recalled to P2's base; nobody at bf1 → No Result, bf1 Uncontrolled, P1
 *         does NOT score.
 *   (iii) Flash resolves; Skulker in base loses Defender; showdown continues (P2 still controls bf1
 *         meanwhile); all pass → 465.1 fails → no damage to anyone; P1 alone remains → P1 wins,
 *         Conquers bf1, +1 point; Skulker undamaged and READY in base (Flash does not exhaust).
 *   (iv)  4-Might attacker + Retreat: attacker takes 3, survives, healed; Skulker recalled exhausted;
 *         P1 alone remains → Conquer, +1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TACTICAL_RETREAT = "unl-175-219";
const FLASH = "ogs-011-024";
const SHIPYARD_SKULKER = "ogn-175-298";

/** P1's turn. P2: lone Skulker at bf1 (controls it), 4 energy, Retreat + Flash in hand. P1: one vanilla attacker in base. */
function board(attackerMight = 3) {
  return scenario()
    .resources(P2, { energy: 4 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", SHIPYARD_SKULKER, "skulker")
    .unit(P1, "base", { might: attackerMight, name: "Vanilla Attacker" }, "atk")
    .hand(P2, TACTICAL_RETREAT, "retreat")
    .hand(P2, FLASH, "flash");
}

const bf1 = (game: Game) => game.gameState.battlefields.bf1;
const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};
const combatDamageTo = (game: Game, target: string) =>
  (game.gameState.damageLog ?? []).filter((r) => r.combat && r.target === target);

/** P1 attacks bf1 and passes Focus → P2 holds Focus in the combat showdown. */
async function p2HasFocus(attackerMight = 3): Promise<Game> {
  const game = await board(attackerMight).build();
  await game.p1.move("atk", "bf1");
  expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, isCombatShowdown: true });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  return game;
}

/** …P2 casts `spell` on Skulker; both pass priority so it resolves inside the showdown (Focus → P1). */
async function p2Reacts(spell: "retreat" | "flash", attackerMight = 3): Promise<Game> {
  const game = await p2HasFocus(attackerMight);
  await game.p2.cast(spell, { targets: "skulker" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: spell, controller: P2, targets: ["skulker"], triggered: false })]);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf(spell)).toBe("trash");
  expect(game.chain()).toEqual([]);
  return game;
}

describe("(i) P2 holds Tactical Retreat and waits — there is no window after damage assignment", () => {
  test("during the showdown P2 (with Focus) COULD cast Tactical Retreat or Flash — that is the last chance", async () => {
    const game = await p2HasFocus();
    expect(game.p2.can("cast", "retreat")).toBe(true);
    expect(game.p2.can("cast", "flash")).toBe(true);
  });

  test("P2 passes Focus too → the damage step and Resolution Step run back-to-back: P2 is never handed an action decision offering Tactical Retreat before both units are dead (465.3)", async () => {
    const game = await p2HasFocus();
    await game.p2.passFocus();
    // Walk whatever the engine surfaces (forced 1-vs-1 assignments may or may not be asked) and
    // check that no step is a P2 action menu containing the Reaction while Skulker is still alive.
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action") {
        expect(d.seat === P2 && d.options.some((o) => o.card === "retreat")).toBe(false);
        expect(d.passKey).toBeDefined();
        await game.acting().pass();
      } else if (d.kind === "distribute") {
        expect(game.p2.can("cast", "retreat")).toBe(false);
        await game.seat(d.seat).distribute({ ...(d.defaultAllocation ?? {}) });
      } else {
        break;
      }
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.p2.hand()).toContain("retreat");
    expect(game.p2.energy()).toBe(4);
  });

  test("with auto-procedures off, the only thing anyone may do after the last pass is run the combat — P2's menu has no playSpell (no FEPR between 465.2 and 466.1)", async () => {
    const game = await board().autoProcedures(false).build();
    await game.p1.move("atk", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.p2.can("cast", "retreat")).toBe(false);
    expect(game.p2.can("cast", "flash")).toBe(false);
    expect(game.p2.legal().map((o) => o.moveId)).not.toContain("playSpell");
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1"); // not dead yet — and still nothing to do about it
  });

  test("outcome: 3 ↔ 3 dealt simultaneously, both die (466.1); No Result (466.3.d); bf1 becomes Uncontrolled (466.5.b); nobody scores", async () => {
    const game = await p2HasFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(combatDamageTo(game, "skulker")).toEqual([expect.objectContaining({ amount: 3 })]);
    expect(combatDamageTo(game, "atk")).toEqual([expect.objectContaining({ amount: 3 })]);
    expect(game.p2.trash()).toContain("skulker");
    expect(game.p1.trash()).toContain("atk");
    expect(game.cardsAt("battlefield-bf1")).toEqual([]);
    expect(bf1(game)).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(showdown(game)).toBeUndefined();
    expect(game.violations()).toEqual([]);
  });
});

describe("(ii) P2 pre-casts Tactical Retreat on Skulker during the showdown (3 vs 3)", () => {
  test("Retreat resolves inside the showdown: Skulker untouched and still the Defender at bf1; the combat showdown is still open with Focus back on P1", async () => {
    const game = await p2Reacts("retreat");
    expect(game.p2.energy()).toBe(2);
    expect(game.state("skulker")).toMatchObject({ combatRole: "defender", damage: 0, zone: "battlefield-bf1" });
    expect(game.state("atk")).toMatchObject({ combatRole: "attacker", zone: "battlefield-bf1" });
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1", focusPlayer: P1, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("P1 pass, P2 pass → the damage step DOES run (both sides still present, 465.1): 3 dealt to Skulker and 3 to the attacker", async () => {
    const game = await p2Reacts("retreat");
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(combatDamageTo(game, "skulker")).toEqual([expect.objectContaining({ amount: 3, original: 3 })]);
    expect(combatDamageTo(game, "atk")).toEqual([expect.objectContaining({ amount: 3, original: 3 })]);
  });

  test("Combat Cleanup: the attacker dies; Skulker 'would die' → instead healed (0 damage), EXHAUSTED and recalled to P2's base — alive, not in the trash (466.1, 454)", async () => {
    const game = await p2Reacts("retreat");
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.state("skulker")).toMatchObject({ combatRole: null, damage: 0, isExhausted: true, zone: "base" });
    expect(game.p2.base()).toContain("skulker");
    expect(game.p2.trash()).not.toContain("skulker");
    expect(game.cardsAt("battlefield-bf1")).toEqual([]);
  });

  test("result: neither player has units at bf1 → No Result (466.3.d); bf1 becomes UNCONTROLLED (466.5.b) — P2 loses it but P1 does NOT conquer or score", async () => {
    const game = await p2Reacts("retreat");
    await game.p1.passFocus();
    await game.p2.passFocus();
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(showdown(game)).toBeUndefined();
    expect(bf1(game)).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(iii) P2 Flashes Skulker to base during the showdown", () => {
  test("Flash offers only P2's FRIENDLY units (Skulker), never P1's attacker", async () => {
    const game = await p2HasFocus();
    const offered = (game.p2.option("cast", "flash")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("skulker");
    expect(offered).not.toContain("atk");
  });

  test("Flash resolves inside the showdown: Skulker is in P2's base, READY and undamaged, and has lost its Defender designation (323.2.c); the attacker keeps its", async () => {
    const game = await p2Reacts("flash");
    expect(game.p2.energy()).toBe(2);
    expect(game.state("skulker")).toMatchObject({ combatRole: null, damage: 0, isExhausted: false, zone: "base" });
    expect(game.state("atk")).toMatchObject({ combatRole: "attacker", zone: "battlefield-bf1" });
  });

  test("the combat showdown does NOT end when the defender leaves — it is still open at bf1 with Focus on P1, and P2 STILL controls bf1 meanwhile (347.2, 323.6)", async () => {
    const game = await p2Reacts("flash");
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1", focusPlayer: P1, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(bf1(game)).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.p1.points()).toBe(0);
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 }); // P2 still gets its Focus turn
    expect(bf1(game)?.controller).toBe(P2);
  });

  test("P1 pass, P2 pass → NO damage step (no defending unit remains, 465.1): no assignment decision is ever raised and the attacker is dealt nothing", async () => {
    const game = await p2Reacts("flash");
    await game.p1.passFocus();
    await game.p2.passFocus();
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      expect(d.kind).not.toBe("distribute");
      if (d.kind !== "action" || !d.passKey) {
        break;
      }
      await game.acting().pass();
    }
    await game.settle();
    expect(combatDamageTo(game, "atk")).toEqual([]);
    expect(combatDamageTo(game, "skulker")).toEqual([]);
    expect(game.gameState.damageLog ?? []).toEqual([]);
    expect(game.state("atk")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("skulker")).toMatchObject({ damage: 0, zone: "base" });
  });

  test("result: P1 is the only player with units at bf1 → P1 WON (466.3.a) → establishes control = Conquer, +1 point (466.5, 466.5.d); Skulker safe (ready, undamaged) in base", async () => {
    const game = await p2Reacts("flash");
    await game.p1.passFocus();
    await game.p2.passFocus();
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(showdown(game)).toBeUndefined();
    expect(bf1(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.state("atk")).toMatchObject({ combatRole: null, damage: 0, zone: "battlefield-bf1" });
    expect(game.state("skulker")).toMatchObject({ combatRole: null, damage: 0, isExhausted: false, zone: "base" });
    expect(game.p2.hand()).toContain("retreat");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast summary — Flash: Skulker undamaged but P1 +1 and owns bf1; Retreat (3v3): attacker traded, bf1 neutral, no point", async () => {
    const flashed = await p2Reacts("flash");
    await flashed.settle();
    const retreated = await p2Reacts("retreat");
    await retreated.settle();
    expect([flashed.p1.points(), bf1(flashed)?.controller ?? null, flashed.zoneOf("atk")]).toEqual([1, P1, "battlefield-bf1"]);
    expect([retreated.p1.points(), bf1(retreated)?.controller ?? null, retreated.zoneOf("atk")]).toEqual([0, null, "trash"]);
    expect(flashed.zoneOf("skulker")).toBe("base");
    expect(retreated.zoneOf("skulker")).toBe("base");
  });
});

describe("(iv) 4-Might attacker, P2 pre-casts Tactical Retreat", () => {
  test("damage step: 4 → Skulker, 3 → attacker; the attacker SURVIVES (3 < 4) and is healed to 0 at the Combat Cleanup (466.1.a.1)", async () => {
    const game = await p2Reacts("retreat", 4);
    await game.settle();
    expect(combatDamageTo(game, "skulker")).toEqual([expect.objectContaining({ amount: 4 })]);
    expect(combatDamageTo(game, "atk")).toEqual([expect.objectContaining({ amount: 3 })]);
    expect(game.state("atk")).toMatchObject({ damage: 0, might: 4, zone: "battlefield-bf1" });
  });

  test("Skulker would die → recalled to base exhausted and healed instead; the attacker alone remains → P1 WON → Conquers bf1, +1 point (466.3.a, 466.5.d)", async () => {
    const game = await p2Reacts("retreat", 4);
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.state("skulker")).toMatchObject({ combatRole: null, damage: 0, isExhausted: true, zone: "base" });
    expect(game.p2.trash()).not.toContain("skulker");
    expect(bf1(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.state("atk").combatRole).toBeNull();
    expect(showdown(game)).toBeUndefined();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control without Retreat (4 vs 3): Skulker simply dies, attacker survives healed, P1 conquers +1 — Retreat changed only Skulker's fate, not the result", async () => {
    const game = await p2HasFocus(4);
    await game.p2.passFocus();
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.state("atk")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(bf1(game)?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
