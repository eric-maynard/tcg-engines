/**
 * Ruling bcd3c193e39cdab3 — Darius, Executioner (OGN-243 → ogn-243-298) · 6 Might · "… Other friendly units have +1 [Might] here."
 *   × Smoke Screen (OGN-093 → ogn-093-298) · [Reaction] 2+[mind] "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *   (+ a Buff as the second +1 source; Albus Ferros ogn-230-298 "spend any number of buffs" removes it; inline Recall/Buff spells.)
 *
 * Q: A 1-Might unit has +1 from a Buff and +1 from Darius (3 total). Smoke Screen takes it to 1. What happens as the two +1
 *    sources are removed one at a time?
 * A: Smoke Screen's reduction is locked in when it resolves (3 → 1, i.e. -2). Removing the first +1 → 0 Might; removing the
 *    second → -1, which is treated as 0 for gameplay but still tracked; buffing it again then gives 0 (‑1 + 1), not 1.
 *    The unit does not die at 0 or below.
 * Rules: 477.3.b (a spell's Might change is fixed on resolution), 477.3.e (increase/decrease arithmetic), 140.x (Might below
 *        0 is treated as 0), 703 (Buff = +1 Might object).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DARIUS_EXECUTIONER = "ogn-243-298";
const SMOKE_SCREEN = "ogn-093-298";
const ALBUS_FERROS = "ogn-230-298"; // 4 · "When you play me, spend any number of buffs. For each buff spent, channel 1 rune exhausted."
/** Inline [Action] "Recall a friendly unit." — takes Darius (and his aura) away from bf1 without a Move. */
const RECALL = {
  abilities: [{ effect: { target: { controller: "friendly", type: "unit" }, type: "recall" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Recall",
  timing: "action",
} as const;
/** Inline [Action] "Buff a friendly unit." */
const BUFF = {
  abilities: [{ effect: { target: { controller: "friendly", type: "unit" }, type: "buff" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 1,
  name: "Test Buff",
  timing: "action",
} as const;

/** P1's turn. bf1 (P1): a BUFFED 1-Might Pawn next to Darius, Executioner → 1 + 1 (Buff) + 1 (Darius) = 3. Hand: Smoke Screen, Recall, Albus Ferros, Buff; [8]+[mind]. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 1, name: "Pawn" }, "pawn", { buffed: true })
    .unit(P1, "bf1", DARIUS_EXECUTIONER, "darius")
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
    .hand(P1, SMOKE_SCREEN, "smoke")
    .hand(P1, RECALL, "rc")
    .hand(P1, ALBUS_FERROS, "albus")
    .hand(P1, BUFF, "buff");
}

/** The tracked arithmetic: printed + Buff + this-turn modifiers + passive bonuses (may be negative). */
function rawMight(game: Game, card: string): number {
  const s = game.state(card);
  return s.baseMight + (s.isBuffed ? 1 : 0) + s.mightModifier + s.staticMightBonus;
}

async function smoke(game: Game): Promise<void> {
  await game.p1.cast("smoke", { targets: "pawn" });
  await game.settle();
}
async function recallDarius(game: Game): Promise<void> {
  await game.p1.cast("rc", { targets: "darius" });
  await game.settle();
  expect(game.locationOf("darius")).toBe("base");
}
async function spendPawnsBuff(game: Game): Promise<void> {
  await game.p1.play("albus", { to: "base" });
  for (let i = 0; i < 8; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || d?.kind !== "pick" || d.seat !== P1) {
      break;
    }
    expect(d.options.map((o) => o.card ?? o.key)).toContain("pawn");
    await game.p1.pick("pawn");
  }
  expect(game.state("pawn").isBuffed).toBe(false);
}

describe("Ruling bcd3c193e39cdab3 — Smoke Screen locks in -2 on a 3-Might unit; peeling the +1s afterwards goes 0, then -1 (treated as 0)", () => {
  test("premise: Pawn is 3 (1 printed + Buff + Darius here); Smoke Screen '-4 to a minimum of 1' takes it to exactly 1 — a fixed -2", async () => {
    const game = await board().build();
    expect(game.state("pawn")).toMatchObject({ isBuffed: true, might: 3 });
    await smoke(game);
    expect(game.zoneOf("smoke")).toBe("trash");
    expect(game.state("pawn")).toMatchObject({ might: 1, mightModifier: -2 });
  });

  test("first +1 removed (Darius recalled to base, his 'here' aura no longer applies): Pawn drops to 0 Might — the -2 does not re-float to keep it at 1 — and it does NOT die", async () => {
    const game = await board().build();
    await smoke(game);
    await recallDarius(game);
    expect(game.state("pawn")).toMatchObject({ might: 0, mightModifier: -2, staticMightBonus: 0 });
    expect(game.zoneOf("pawn")).toBe("battlefield-bf1");
  });

  test("second +1 removed (Albus Ferros spends the Pawn's Buff): the tracked value is -1 (1 - 2), read as 0 for gameplay; the Pawn is still alive on bf1", async () => {
    const game = await board().build();
    await smoke(game);
    await recallDarius(game);
    await spendPawnsBuff(game);
    expect(rawMight(game, "pawn")).toBe(-1);
    expect(game.state("pawn").might).toBeLessThanOrEqual(0);
    expect(Math.max(0, game.state("pawn").might)).toBe(0);
    expect(game.zoneOf("pawn")).toBe("battlefield-bf1");
    expect(game.p1.units("bf1")).toContain("pawn");
  });

  test("'treated as 0' is not 'becomes 0': buffing the Pawn again from -1 yields 0 Might (-1 + 1), NOT 1", async () => {
    const game = await board().build();
    await smoke(game);
    await recallDarius(game);
    await spendPawnsBuff(game);
    await game.p1.cast("buff", { targets: "pawn" });
    await game.settle();
    expect(game.state("pawn").isBuffed).toBe(true);
    expect(rawMight(game, "pawn")).toBe(0);
    expect(game.state("pawn").might).toBe(0);
    expect(game.zoneOf("pawn")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("everything is 'this turn': next turn the Smoke Screen wears off and the re-buffed Pawn (Darius still in base) is 1 + 1 = 2", async () => {
    const game = await board().build();
    await smoke(game);
    await recallDarius(game);
    await spendPawnsBuff(game);
    await game.p1.cast("buff", { targets: "pawn" });
    await game.settle();
    await game.advanceTurn();
    expect(game.state("pawn")).toMatchObject({ isBuffed: true, might: 2, mightModifier: 0 });
  });
});
