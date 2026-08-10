/**
 * Interaction: Dune Surfer (ven-004-166) × Kinkou Temple (ven-159-166) × Sunlit Guardian (ogn-054-298)
 *
 *   Dune Surfer — Unit · Fury · 3 · 3 Might        "You ignore [Tank] while assigning combat damage here."
 *   Kinkou Temple — Battlefield                     "Units here with [Tank] have +1 [Might]."
 *   Sunlit Guardian — Unit · Calm · 3 · 3 Might     "[Shield] (+1 [Might] while I'm a defender.) [Tank] (I must be
 *                                                    assigned combat damage first.)"
 *   Towering Combatant (unl-099-219) — Unit · Body · 4 · 3 Might  "[Shield 2] [Tank]"
 *   Shipyard Skulker (ogn-175-298) — vanilla 3. "Sand Strider" is an inline vanilla 3 standing in for the Surfer.
 *
 * Rules: 765 / 766 (an "ignore" makes the keyword INACTIVE for that procedure only), 767 (…and only for the
 * player the ability directs — the second example is this card verbatim with Backline), 815.1.b (Tank = lethal
 * first among same-controller units), 815.3 / 722.1 ("has Tank" stays a checkable characteristic even while the
 * text is inactive/ignored — Kinkou Temple keeps seeing it), 814 (Shield is defender-only, values are Might
 * arithmetic), 465.2.c.3 (full lethal before moving on), 465.2.c.4 (no over-assignment while another unit
 * remains), 465.2.c.6 (must obey Tank if able), 465.2.c.7 (same tier → any order), 466.5 (a defender remains →
 * no conquer).
 *
 * Question: Kinkou Temple (bf1) is held by P2 with Sunlit Guardian + Shipyard Skulker. P1 attacks with Dune
 * Surfer + Towering Combatant. (a) Might of each unit in the damage step — does the Guardian keep Kinkou's +1
 * while P1 "ignores" its Tank, does P1's own Tank attacker get +1? (b) P1's assignment — a real choice? what
 * dies under each line? (c) P2's assignment onto P1's units — may P2 ignore Tank on the Combatant because the
 * Surfer is "here"? (d) NO sides: plain battlefield; Kinkou with the Surfer swapped for a vanilla 3.
 *
 * Expected: (a) Guardian 3 +1 Shield +1 Kinkou = 5 (Tank is ignored only inside P1's 465.2.c procedure; it is
 * still a characteristic Kinkou reads), Skulker 3 → defenders deal 8; Combatant 3 +1 Kinkou = 4 (Shield 2 is
 * defender-only), Surfer 3 → attackers deal 7. (b) A genuine P1 distribute prompt of 7 with lethal minima
 * {guardian 5, skulker 3}: {skulker 3, guardian 4} → Skulker dies, Guardian lives; {guardian 5, skulker 2} →
 * Guardian dies, Skulker lives; 465.2.c.3/4 still police the split. (c) P2 is not "directed by the ability":
 * Tank on the Combatant binds P2 → forced Combatant-lethal-first, no P2 prompt; with 8 both attackers die
 * anyway (probe: when the defenders deal only 6 the forced line {combatant 4, surfer 2} lets the Surfer LIVE
 * and conquer). Either P1 line: both attackers dead, one defender dead, P2 keeps bf1. (d) Plain field:
 * Guardian 4, Combatant 3, prompt of 6 {guardian 4 | skulker 3}. Kinkou without the Surfer: P1 is FORCED
 * {guardian 5, skulker 2} — Skulker-first is never accepted. Text-state: every printed keyword reads present
 * before, during and after; nothing was removed so nothing "comes back".
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DUNE_SURFER = "ven-004-166";
const KINKOU_TEMPLE = "ven-159-166";
const SUNLIT_GUARDIAN = "ogn-054-298";
const TOWERING_COMBATANT = "unl-099-219";
const SHIPYARD_SKULKER = "ogn-175-298";

interface BoardOpts {
  /** bf1 is Kinkou Temple (live text) vs an inert plain battlefield. */
  readonly temple: boolean;
  /** P1's first attacker is Dune Surfer vs a vanilla 3 ("Sand Strider", same alias `surfer`). */
  readonly surfer: boolean;
  /** P2's second defender: Shipyard Skulker (3) by default, or a 1-Might Deckhand so the defenders deal only 6. */
  readonly partner?: "skulker" | "deckhand";
}

/** P1's turn. P2 holds bf1 with Guardian + partner; P1's two attackers wait in base. Combat resolution is a surfaced step. */
function board(o: BoardOpts) {
  const s = scenario().autoProcedures(false);
  if (o.temple) {
    s.battlefield("bf1", { controller: P2, def: KINKOU_TEMPLE, inert: false });
  } else {
    s.battlefield("bf1", { controller: P2 });
  }
  s.unit(P2, "bf1", SUNLIT_GUARDIAN, "guardian");
  if ((o.partner ?? "skulker") === "skulker") {
    s.unit(P2, "bf1", SHIPYARD_SKULKER, "skulker");
  } else {
    s.unit(P2, "bf1", { might: 1, name: "Deckhand" }, "deckhand");
  }
  s.unit(P1, "base", o.surfer ? DUNE_SURFER : { might: 3, name: "Sand Strider" }, "surfer");
  s.unit(P1, "base", TOWERING_COMBATANT, "combatant");
  return s;
}

/** Both attackers walk into bf1; the showdown is passed through; the combat-resolution step is now P1's to take. */
async function attack(o: BoardOpts): Promise<Game> {
  const game = await board(o).build();
  await game.p1.move(["surfer", "combatant"], "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  const s = await game.settle();
  expect(s.reason).toBe("open");
  expect(game.p1.can("resolveFullCombat:bf1")).toBe(true);
  return game;
}

/** Take the combat step; return the first non-action Decision it raises (an assignment prompt) or the open menu. */
async function toAssignment(game: Game): Promise<Decision | null> {
  await game.p1.choose("resolveFullCombat:bf1");
  return game.decision();
}

/**
 * Drive the rest of the combat: P1 answers its own prompt with `p1Line` (if asked), every P2 distribute
 * prompt is counted and answered with the engine's forced/default line. Returns how often P2 was asked.
 */
async function finishCombat(game: Game, p1Line?: Record<string, number>): Promise<number> {
  let p2Asked = 0;
  for (let i = 0; i < 6; i++) {
    for (let d = game.decision(); d?.kind === "distribute"; d = game.decision()) {
      if (d.seat === P1) {
        await game.p1.distribute(p1Line ?? { ...(d.defaultAllocation as Record<string, number>) });
      } else {
        p2Asked++;
        await game.p2.distribute({ ...(d.defaultAllocation as Record<string, number>) });
      }
    }
    const s = await game.settle();
    expect(s.reason).toBe("open");
    if (!game.p1.can("resolveFullCombat:bf1")) {
      break;
    }
    await game.p1.choose("resolveFullCombat:bf1");
  }
  expect(game.p1.can("resolveFullCombat:bf1")).toBe(false);
  return p2Asked;
}

/** Total combat damage dealt to `target` (public damageLog). */
function dealt(game: Game, target: string): number {
  return (game.gameState.damageLog ?? []).filter((r) => r.combat && r.target === target).reduce((n, r) => n + r.amount, 0);
}

const FULL: BoardOpts = { surfer: true, temple: true };

describe("(a) Might in the combat damage step at Kinkou Temple — ignoring Tank does not remove it", () => {
  test("Guardian defends at 5 (3 +1 Shield +1 Kinkou: it still HAS Tank, 815.3/722.1), Skulker 3; Combatant attacks at 4 (3 +1 Kinkou, Shield 2 off as attacker), Surfer 3", async () => {
    const game = await attack(FULL);
    expect(game.state("guardian")).toMatchObject({ baseMight: 3, combatRole: "defender", might: 5, staticMightBonus: 1 });
    expect(game.state("skulker")).toMatchObject({ combatRole: "defender", might: 3 });
    expect(game.state("combatant")).toMatchObject({ baseMight: 3, combatRole: "attacker", might: 4, staticMightBonus: 1 });
    expect(game.state("surfer")).toMatchObject({ combatRole: "attacker", might: 3 });
  });

  test("text-state map at P1's assignment step: Guardian.Tank / Guardian.Shield / Combatant.Tank / Combatant.Shield2 all read as present keywords (nothing granted, nothing stripped) and the sums are 7 → / ← 8", async () => {
    const game = await attack(FULL);
    const d = await toAssignment(game);
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 7 });
    expect(game.state("guardian").keywords).toEqual(["Shield", "Tank"]);
    expect(game.state("guardian").grantedKeywords).toEqual([]);
    expect(game.state("combatant").keywords).toEqual(["Shield", "Tank"]);
    expect(game.state("combatant").grantedKeywords).toEqual([]);
    // Kinkou still counts the Guardian's Tank mid-procedure: lethal is computed WITH the +1.
    expect(game.state("guardian").might).toBe(5);
    expect(game.state("guardian").might + game.state("skulker").might).toBe(8);
    expect(game.state("surfer").might + game.state("combatant").might).toBe(7);
  });
});

describe("(b) P1's assignment with Dune Surfer here — a genuine choice, Tank ordering waived for P1 only", () => {
  test("the Decision is a P1 distribute prompt of 7 offering BOTH recipients first, lethal minima guardian 5 (Kinkou-inclusive) / skulker 3 (465.2.c.7)", async () => {
    const game = await attack(FULL);
    const d = await toAssignment(game);
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 7 });
    const lethal = d?.kind === "distribute" ? Object.fromEntries(d.buckets.map((b) => [b.key, b.lethal])) : {};
    expect(lethal).toEqual({ guardian: 5, skulker: 3 });
  });

  test("465.2.c.3 / 465.2.c.4 still apply with Tank ignored: {skulker 4, guardian 3} (no lethal anywhere), {guardian 7} / {skulker 7} (over-assign while the other remains) and {guardian 6, skulker 1} are all refused", async () => {
    const game = await attack(FULL);
    await toAssignment(game);
    const badLines: Record<string, number>[] = [{ guardian: 3, skulker: 4 }, { guardian: 7 }, { skulker: 7 }, { guardian: 6, skulker: 1 }, { guardian: 4, skulker: 2 }];
    for (const bad of badLines) {
      expect((await game.p1.try((p) => p.distribute(bad))).ok).toBe(false);
    }
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1 });
    expect((await game.p1.try((p) => p.distribute({ guardian: 5, skulker: 2 }))).ok).toBe(true);
  });

  test("option 1 — {skulker 3 first, then guardian 4}: Skulker dies, Guardian (4 < 5) survives healed and reads 4 at rest (3 +1 Kinkou, Shield off); both attackers die to 8; P2 keeps bf1, no conquer", async () => {
    const game = await attack(FULL);
    await toAssignment(game);
    await finishCombat(game, { guardian: 4, skulker: 3 });
    expect(dealt(game, "skulker")).toBe(3);
    expect(dealt(game, "guardian")).toBe(4);
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.state("guardian")).toMatchObject({ combatRole: null, damage: 0, might: 4, zone: "battlefield-bf1" });
    expect(game.zoneOf("surfer")).toBe("trash");
    expect(game.zoneOf("combatant")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("option 2 — {guardian 5 first, then skulker 2}: Guardian dies (lethal computed WITH Kinkou's +1), Skulker (2 < 3) survives healed; both attackers die; P2 keeps bf1", async () => {
    const game = await attack(FULL);
    await toAssignment(game);
    await finishCombat(game, { guardian: 5, skulker: 2 });
    expect(dealt(game, "guardian")).toBe(5);
    expect(dealt(game, "skulker")).toBe(2);
    expect(game.zoneOf("guardian")).toBe("trash");
    expect(game.state("skulker")).toMatchObject({ damage: 0, might: 3, zone: "battlefield-bf1" });
    expect(game.zoneOf("surfer")).toBe("trash");
    expect(game.zoneOf("combatant")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) P2's assignment onto P1's units — P2 is NOT directed by Dune Surfer (767): Tank on Towering Combatant binds P2", () => {
  test("P2 is never offered a choice: its 8 is a forced line (Combatant lethal 4 first, the rest to the Surfer) — no P2 distribute prompt, Combatant ≥ 4, Surfer ≥ 3, both attackers die", async () => {
    const game = await attack(FULL);
    await toAssignment(game);
    const p2Asked = await finishCombat(game, { guardian: 5, skulker: 2 });
    expect(p2Asked).toBe(0);
    expect(dealt(game, "combatant") + dealt(game, "surfer")).toBe(8);
    expect(dealt(game, "combatant")).toBeGreaterThanOrEqual(4);
    expect(dealt(game, "surfer")).toBeGreaterThanOrEqual(3);
    expect(game.p1.trash().sort()).toEqual(["combatant", "surfer"]);
  });

  test("discriminating probe — defenders deal only 6 (Guardian 5 + a 1-Might Deckhand): P2's forced line is {combatant 4, surfer 2}, so Dune Surfer SURVIVES and conquers; a Tank-ignoring P2 could have killed the Surfer instead — it is not even asked", async () => {
    const game = await attack({ ...FULL, partner: "deckhand" });
    expect(game.state("guardian").might + game.state("deckhand").might).toBe(6);
    await game.p1.choose("resolveFullCombat:bf1");
    const p2Asked = await finishCombat(game);
    expect(p2Asked).toBe(0);
    expect(dealt(game, "combatant")).toBe(4);
    expect(dealt(game, "surfer")).toBe(2);
    expect(game.zoneOf("combatant")).toBe("trash");
    expect(game.state("surfer")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("guardian")).toBe("trash");
    expect(game.zoneOf("deckhand")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});

describe("(d) NO sides", () => {
  test("plain battlefield (no Kinkou): Guardian defends at 4 (3 + Shield), Combatant attacks at printed 3; P1's prompt is 6 with lethal minima {guardian 4, skulker 3} — same shape, numbers one lower", async () => {
    const game = await attack({ surfer: true, temple: false });
    expect(game.state("guardian")).toMatchObject({ might: 4, staticMightBonus: 0 });
    expect(game.state("combatant")).toMatchObject({ might: 3, staticMightBonus: 0 });
    expect(game.state("skulker").might).toBe(3);
    expect(game.state("surfer").might).toBe(3);
    const d = await toAssignment(game);
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 6 });
    const lethal = d?.kind === "distribute" ? Object.fromEntries(d.buckets.map((b) => [b.key, b.lethal])) : {};
    expect(lethal).toEqual({ guardian: 4, skulker: 3 });
    // 6 cannot make both lethal (4 + 3 = 7): {skulker 3, guardian 3} → Skulker dies; {guardian 4, skulker 2} → Guardian dies.
    expect((await game.p1.try((p) => p.distribute({ guardian: 3, skulker: 3 }))).ok).toBe(true);
    await finishCombat(game);
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.state("guardian")).toMatchObject({ damage: 0, might: 3, zone: "battlefield-bf1" });
    expect(game.p1.trash().sort()).toEqual(["combatant", "surfer"]); // defenders' 7: Combatant lethal 3 first, Surfer the remaining 4
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("Kinkou WITHOUT Dune Surfer (vanilla 3 in its place): P1 is FORCED {guardian 5 first, then skulker 2} — either no prompt at all or Skulker-first is refused (815.1.b, 465.2.c.6); Guardian dies, Skulker lives", async () => {
    const game = await attack({ surfer: false, temple: true });
    expect(game.state("guardian").might).toBe(5);
    expect(game.state("combatant").might).toBe(4);
    const d = await toAssignment(game);
    if (d?.kind === "distribute" && d.seat === P1) {
      expect((await game.p1.try((p) => p.distribute({ guardian: 4, skulker: 3 }))).ok).toBe(false);
      expect((await game.p1.try((p) => p.distribute({ guardian: 2, skulker: 3 }))).ok).toBe(false);
      await game.p1.distribute({ guardian: 5, skulker: 2 });
    } else {
      expect(d?.kind === "distribute" && d.seat === P1).toBe(false);
    }
    await finishCombat(game);
    expect(dealt(game, "guardian")).toBe(5);
    expect(dealt(game, "skulker")).toBe(2);
    expect(game.zoneOf("guardian")).toBe("trash");
    expect(game.state("skulker")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.p1.trash().sort()).toEqual(["combatant", "surfer"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});

describe("after combat — nothing was removed, so nothing 'comes back'", () => {
  test("text-state map after combat (option 1 line): surviving Guardian reads printed [Shield, Tank], no grants, 4 Might at Kinkou; the dead Combatant in the trash reads printed [Shield, Tank], 3 Might; no lingering modifier on anyone; chain empty, P1's open main phase", async () => {
    const game = await attack(FULL);
    await toAssignment(game);
    await finishCombat(game, { guardian: 4, skulker: 3 });
    expect(game.state("guardian")).toMatchObject({ grantedKeywords: [], keywords: ["Shield", "Tank"], might: 4, mightModifier: 0, zone: "battlefield-bf1" });
    expect(game.state("combatant")).toMatchObject({ grantedKeywords: [], keywords: ["Shield", "Tank"], might: 3, mightModifier: 0, zone: "trash" });
    expect(game.state("surfer")).toMatchObject({ grantedKeywords: [], keywords: [], might: 3, zone: "trash" });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("no retroactive re-assignment: the damage log holds exactly the four combat entries of the chosen line and P2's forced line, nothing more", async () => {
    const game = await attack(FULL);
    await toAssignment(game);
    await finishCombat(game, { guardian: 4, skulker: 3 });
    const combat = (game.gameState.damageLog ?? []).filter((r) => r.combat);
    expect(combat).toHaveLength(4);
    expect(combat.filter((r) => r.source.player === P1).map((r) => [r.target, r.amount]).sort()).toEqual([
      ["guardian", 4],
      ["skulker", 3],
    ]);
    expect(combat.filter((r) => r.source.player === P2).reduce((n, r) => n + r.amount, 0)).toBe(8);
  });
});
