/**
 * Interaction: a STUNNED defender that has been BUFFED past the attacker — does the buff still matter?
 *   × Rune Prison   (ogn-050-298) · Spell · Calm · 2 + [calm] · [Action]  "Stun a unit."                     — P2's
 *   × Heroic Charge (unl-155-219) · Spell · Order · 3 · [Action]
 *       "Give a friendly unit +1 [Might] this turn and [Stun] an enemy unit at its location."                    — P2's
 *   × Discipline    (ogn-058-298) · Spell · Calm · 2 · [Reaction]  "Give a unit +2 [Might] this turn. Draw 1." — P1's
 *   + a vanilla 3-Might defender D (P1, holding bf1) and a vanilla 4-Might attacker A (P2).
 *
 * Question. P2's turn. P1 controls bf1 with D (3). P2 attacks with A (4); the combat showdown opens with P2
 * holding Focus.
 *   (a) P2 plays Rune Prison on D; P1 reacts with Discipline on D (→ 5). Everyone passes. Damage each way?
 *       Does D die? Who holds bf1? Where is A afterwards?
 *   (b) Same board, but P2 plays Heroic Charge instead (+1 A → 5, stun D at A's location); P1 again Disciplines
 *       D to 5. Outcome?
 *   (c) Control: no stun, only Discipline — D (5) vs A (4).
 *   And: D's Stunned flag and the +2 both drop at step 3d of P2's end-of-turn Expiration Step.
 *
 * Rules: 423.1.b (a Stunned unit contributes no Might to the damage sums), 423.1.c (a Stunned unit still needs
 * damage ≥ its FULL current Might to be killed), 465.2.a/b/c (sum attackers, sum defenders, assign), 466.1.a.2
 * (3d: recall attackers if defenders remain), 466.3 (combat result — a/d), 423.1.a.2 + 317.2.c (stun and every
 * "this turn" effect lapse together at 3d of the Expiration Step).
 *
 * Expected: (a) attackers 4, defenders 0 (stunned); A assigns 4 to D whose lethal threshold is 5 → D survives
 * (healed in cleanup), A takes 0, attackers recalled to P2's base, No Result, bf1 stays P1's; D stays stunned and
 * 5 until 3d, then is an unstunned 3. (b) A = 5, D = 5 but stunned: 5 assigned ≥ 5 → D dies, A unhurt, P2 wins
 * and conquers bf1. (c) unstunned D 5 vs A 4: A dies, D survives, P1 keeps bf1. Stun never lowers the kill
 * threshold; it only zeroes the unit's contribution.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUNE_PRISON = "ogn-050-298";
const HEROIC_CHARGE = "unl-155-219";
const DISCIPLINE = "ogn-058-298";

/** P2's turn. P1: D (3) holding bf1, Discipline + 2 energy. P2: A (4) in base, Rune Prison + Heroic Charge, 5 energy + 1 calm. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Defender D" }, "d")
    .unit(P2, "base", { might: 4, name: "Attacker A" }, "a")
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 5, power: { calm: 1 } })
    .hand(P1, DISCIPLINE, "discipline")
    .hand(P2, RUNE_PRISON, "prison")
    .hand(P2, HEROIC_CHARGE, "charge");
}

function showdown(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).at(-1);
}

/** Combat damage dealt to `target` (public damageLog). */
function combatDamageTo(game: Game, target: string): number {
  return (game.gameState.damageLog ?? []).filter((r) => r.combat && r.target === target).reduce((s, r) => s + r.amount, 0);
}

/** A attacks bf1 (P2 has Focus); P2 casts `stun` at D; P1 answers on the chain with Discipline on D; both pass until the chain is empty. */
async function stunThenDiscipline(stun: "prison" | "charge"): Promise<Game> {
  const game = await board().build();
  await game.p2.move("a", "bf1");
  expect(showdown(game)).toMatchObject({ attackingPlayer: P2, defendingPlayer: P1, focusPlayer: P2, isCombatShowdown: true });
  if (stun === "prison") {
    await game.p2.cast("prison", { targets: "d" });
  } else {
    await game.p2.cast("charge", { targets: ["a", "d"] });
  }
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.cast("discipline", { targets: "d" });
  expect(game.chain().map((c) => c.cardId)).toEqual([stun, "discipline"]);
  // Discipline (top) resolves first, then the stun spell.
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
  return game;
}

/** Control: A attacks; P2 passes Focus; P1 (Focus) Disciplines D; chain resolves. No stun anywhere. */
async function disciplineOnly(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("a", "bf1");
  await game.p2.passFocus();
  expect(showdown(game)?.focusPlayer).toBe(P1);
  await game.p1.cast("discipline", { targets: "d" });
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
  return game;
}

/** Pass Focus/priority until a non-pass decision (distribute) or the open main phase; returns every decision seen. */
async function closeShowdownWatching(game: Game) {
  const seen: NonNullable<ReturnType<Game["decision"]>>[] = [];
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    seen.push(d);
    if (d.kind !== "action" || d.context === "main" || !d.passKey) {
      break;
    }
    await game.acting().pass();
  }
  return seen;
}

describe("(a) Rune Prison stuns D, Discipline pumps D to 5 — A's 4 is NOT lethal against a stunned 5", () => {
  test("after both spells resolve (Discipline first, LIFO): D is Stunned AND 5 Might, P1 drew 1; A is 4; still the same combat showdown", async () => {
    const game = await stunThenDiscipline("prison");
    expect(game.state("d")).toMatchObject({ baseMight: 3, isStunned: true, might: 5, zone: "battlefield-bf1" });
    expect(game.state("a")).toMatchObject({ isStunned: false, might: 4, zone: "battlefield-bf1" });
    expect(game.zoneOf("prison")).toBe("trash");
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(1); // Discipline spent, drew 1
    expect(game.p2.resources()).toEqual({ energy: 3, power: { calm: 0 } });
    expect(game.p1.energy()).toBe(0);
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: true });
  });

  test("damage step: defenders sum 0 (423.1.b) → P1 is never asked to assign; P2's 4 all go to D whose lethal threshold is its FULL 5 (423.1.c), not 3 and not 0", async () => {
    const game = await stunThenDiscipline("prison");
    const seen = await closeShowdownWatching(game);
    expect(seen.some((d) => d.kind === "distribute" && d.seat === P1)).toBe(false);
    const p2Assign = seen.find((d) => d.kind === "distribute" && d.seat === P2);
    if (p2Assign?.kind === "distribute") {
      expect(p2Assign.total).toBe(4);
      expect(p2Assign.buckets.map((b) => [b.card ?? b.key, b.lethal])).toEqual([["d", 5]]);
      await game.p2.distribute({ [p2Assign.buckets[0]?.key as string]: 4 });
    }
    await game.settle();
    expect(combatDamageTo(game, "d")).toBe(4);
    expect(combatDamageTo(game, "a")).toBe(0);
  });

  test("outcome: 4 < 5 → D SURVIVES (healed to 0 in cleanup, still stunned, still 5); A took 0 and is RECALLED to P2's base (466.1.a.2); No Result — bf1 stays P1's, nobody scores", async () => {
    const game = await stunThenDiscipline("prison");
    await game.settle();
    expect(game.state("d")).toMatchObject({ combatRole: null, damage: 0, isStunned: true, might: 5, zone: "battlefield-bf1" });
    expect(game.state("a")).toMatchObject({ combatRole: null, damage: 0, might: 4, zone: "base" });
    expect(game.p2.base()).toContain("a");
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(showdown(game)).toBeUndefined();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("D keeps the stun and the +2 for the rest of P2's turn; at 3d of P2's Expiration Step BOTH lapse together (423.1.a.2, 317.2.c) → on P1's turn D is an unstunned 3", async () => {
    const game = await stunThenDiscipline("prison");
    await game.settle();
    expect(game.state("d")).toMatchObject({ isStunned: true, might: 5 });
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("d")).toMatchObject({ isStunned: false, might: 3, mightModifier: 0, zone: "battlefield-bf1" });
    const passes = game.trace().expiration;
    expect(passes.length).toBeGreaterThanOrEqual(1);
    const expired = passes.flatMap((p) => p.expired);
    expect(expired).toContain("stun:d");
    expect(expired).toContain("mightModifier:d");
    // both in the SAME pass (simultaneous, 317.2.c)
    const pass = passes.find((p) => p.expired.includes("stun:d"));
    expect(pass?.expired).toContain("mightModifier:d");
  });
});

describe("(b) Heroic Charge: A → 5 and D stunned; Discipline → D 5 — now 5 assigned IS lethal (≥ full Might)", () => {
  test("Heroic Charge offers exactly [A, D] as its (friendly, enemy-at-its-location) pair once A is at bf1", async () => {
    const game = await board().build();
    await game.p2.move("a", "bf1");
    const field = game.p2.option("cast", "charge")?.fields.find((f) => f.name === "targets");
    expect(field?.options ?? []).toEqual([["a", "d"]]);
  });

  test("after both resolve: A is 5 (4 + 1), D is 5 (3 + 2) and Stunned", async () => {
    const game = await stunThenDiscipline("charge");
    expect(game.state("a")).toMatchObject({ isStunned: false, might: 5, zone: "battlefield-bf1" });
    expect(game.state("d")).toMatchObject({ isStunned: true, might: 5, zone: "battlefield-bf1" });
    expect(game.zoneOf("charge")).toBe("trash");
    expect(game.p2.energy()).toBe(2);
  });

  test("damage step: defenders 0; P2 assigns 5 to D — lethal threshold 5 is met exactly (423.1.c); A is dealt 0", async () => {
    const game = await stunThenDiscipline("charge");
    const seen = await closeShowdownWatching(game);
    expect(seen.some((d) => d.kind === "distribute" && d.seat === P1)).toBe(false);
    const p2Assign = seen.find((d) => d.kind === "distribute" && d.seat === P2);
    if (p2Assign?.kind === "distribute") {
      expect(p2Assign.total).toBe(5);
      expect(p2Assign.buckets.map((b) => [b.card ?? b.key, b.lethal])).toEqual([["d", 5]]);
      await game.p2.distribute({ [p2Assign.buckets[0]?.key as string]: 5 });
    }
    await game.settle();
    expect(combatDamageTo(game, "d")).toBe(5);
    expect(combatDamageTo(game, "a")).toBe(0);
  });

  test("outcome: D DIES → P1's trash; A survives undamaged and stays at bf1; P2 WINS the combat and CONQUERS bf1 (+1 point)", async () => {
    const game = await stunThenDiscipline("charge");
    await game.settle();
    expect(game.zoneOf("d")).toBe("trash");
    expect(game.p1.trash()).toContain("d");
    expect(game.state("a")).toMatchObject({ combatRole: null, damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(showdown(game)).toBeUndefined();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("A's +1 lapses at end of turn too: on P1's turn A is a 4 at bf1", async () => {
    const game = await stunThenDiscipline("charge");
    await game.settle();
    await game.advanceTurn();
    expect(game.state("a")).toMatchObject({ might: 4, zone: "battlefield-bf1" });
  });
});

describe("(c) control — no stun, Discipline only: an unstunned 5 beats a 4", () => {
  test("D is 5 and NOT stunned; A is 4", async () => {
    const game = await disciplineOnly();
    expect(game.state("d")).toMatchObject({ isStunned: false, might: 5 });
    expect(game.state("a")).toMatchObject({ isStunned: false, might: 4 });
  });

  test("damage step: A assigns 4 to D (not lethal vs 5), D assigns 5 to A (lethal vs 4)", async () => {
    const game = await disciplineOnly();
    const seen = await closeShowdownWatching(game);
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind !== "distribute") {
        break;
      }
      seen.push(d);
      if (d.seat === P2) {
        expect(d.total).toBe(4);
        expect(d.buckets.map((b) => [b.card ?? b.key, b.lethal])).toEqual([["d", 5]]);
      } else {
        expect(d.total).toBe(5);
        expect(d.buckets.map((b) => [b.card ?? b.key, b.lethal])).toEqual([["a", 4]]);
      }
      await game.seat(d.seat).distribute({ [d.buckets[0]?.key as string]: d.total });
    }
    await game.settle();
    expect(combatDamageTo(game, "d")).toBe(4);
    expect(combatDamageTo(game, "a")).toBe(5);
  });

  test("outcome: A DIES → P2's trash; D survives (healed) at bf1 back to… still 5 this turn; P1 keeps bf1; P2 scores nothing", async () => {
    const game = await disciplineOnly();
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.p2.trash()).toContain("a");
    expect(game.state("d")).toMatchObject({ combatRole: null, damage: 0, isStunned: false, might: 5, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("the stun is the ONLY difference between (a) and (c): same D = 5 vs A = 4, yet in (a) A lives and in (c) A dies — stun zeroes contribution, never the kill threshold", async () => {
    const stunned = await stunThenDiscipline("prison");
    await stunned.settle();
    const clean = await disciplineOnly();
    await clean.settle();
    expect([stunned.zoneOf("a"), clean.zoneOf("a")]).toEqual(["base", "trash"]);
    expect([stunned.zoneOf("d"), clean.zoneOf("d")]).toEqual(["battlefield-bf1", "battlefield-bf1"]);
  });
});
