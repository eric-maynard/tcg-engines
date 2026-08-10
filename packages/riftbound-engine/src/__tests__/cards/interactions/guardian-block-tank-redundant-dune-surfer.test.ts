/**
 * Interaction: Sunlit Guardian (ogn-054-298) × Block (ogn-057-298) × Dune Surfer (ven-004-166)
 *
 *   Sunlit Guardian — Unit · Calm · 3 · 3 Might   "[Shield] (+1 [Might] while I'm a defender.) [Tank] (I must
 *                                                   be assigned combat damage first.)"
 *   Block — Spell · Calm · 2 · [Hidden] [Action]  "Give a unit [Shield 3] and [Tank] this turn."
 *   Dune Surfer — Unit · Fury · 3 · 3 Might        "You ignore [Tank] while assigning combat damage here."
 *   Shipyard Skulker (ogn-175-298) — vanilla 3; attackers Vanguard Sergeant (4) / Playful Phantom (5) are
 *   inline vanilla bodies.
 *
 * Rules: 814.2 (Shield values from several sources SUM — the rule's own example is Block on a Shield unit),
 * 815.1.b / 815.2 / 815.3 (Tank must be assigned lethal first; multiple Tanks are REDUNDANT; "has Tank" is a
 * characteristic), 815.1.c.2 (can't go to a non-Tank while a Tank lacks lethal), 465.2.c.3 (lethal before
 * moving on), 465.2.c.4 (no over-assignment while other units remain), 465.2.c.6 (Tank tier), 465.2.c.7
 * (otherwise any order).
 *
 * Question: P2 defends bf1 with Sunlit Guardian + Shipyard Skulker and resolves Block on the Guardian in the
 * showdown. (a) Control attackers Sergeant 4 + Phantom 5 = 9: Guardian's Shield/Might, "two Tanks"?, shape of
 * the assignment. (b) Attackers Dune Surfer 3 + Sergeant 4 = 7: does Block's second Tank survive the Surfer's
 * "ignore", which first recipients are offered, and the outcome of each choice?
 *
 * Expected: (a) Shield 1+3 = 4 → defends at 7; Tank+Tank is one Tank; assignment is FORCED {guardian 7,
 * skulker 2} (no prompt) → Guardian dies, Skulker lives healed; defenders' 10 kill both attackers; P2 holds.
 * (b) Surfer ignores Tank entirely (redundancy leaves nothing extra to respect) → a real distribute prompt
 * offering Guardian OR Skulker first: {skulker 3, guardian 4} → Skulker dies, Guardian survives; {guardian 7}
 * → Guardian dies, Skulker lives. Either way both attackers die to 10 and P2 keeps bf1; Guardian reads
 * hasTank = true throughout.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SUNLIT_GUARDIAN = "ogn-054-298";
const BLOCK = "ogn-057-298";
const DUNE_SURFER = "ven-004-166";
const SHIPYARD_SKULKER = "ogn-175-298";

/**
 * P1's turn. P2 holds bf1 with Sunlit Guardian + Shipyard Skulker, 2 energy and Block in hand.
 * P1's attackers wait in base: Vanguard Sergeant (4) plus either Playful Phantom (5) [control] or Dune Surfer (3).
 * Combat resolution is surfaced as an explicit step so the assignment Decision can be inspected.
 */
function board(withSurfer: boolean) {
  return scenario()
    .autoProcedures(false)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", SUNLIT_GUARDIAN, "guardian")
    .unit(P2, "bf1", SHIPYARD_SKULKER, "skulker")
    .resources(P2, { energy: 2 })
    .hand(P2, BLOCK, "block")
    .unit(P1, "base", { might: 4, name: "Vanguard Sergeant" }, "sergeant")
    .unit(P1, "base", withSurfer ? DUNE_SURFER : { might: 5, name: "Playful Phantom" }, withSurfer ? "surfer" : "phantom");
}

/** P1 attacks bf1 with both units, passes Focus; P2 Blocks the Guardian; everyone passes → Block resolves, showdown closes; combat resolution is now P1's pending step. */
async function attackAndBlock(withSurfer: boolean): Promise<Game> {
  const game = await board(withSurfer).build();
  await game.p1.move(withSurfer ? ["surfer", "sergeant"] : ["sergeant", "phantom"], "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.p2.can("cast", "block")).toBe(true);
  await game.p2.cast("block", { targets: "guardian" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "block", controller: P2, targets: ["guardian"] })]);
  const s = await game.settle();
  expect(s.reason).toBe("open");
  expect(game.zoneOf("block")).toBe("trash");
  expect(game.p1.can("resolveFullCombat:bf1")).toBe(true);
  return game;
}

/** Drive the surfaced combat procedure to the end (each side's forced/default assignment is taken by settle unless answered before). */
async function finishCombat(game: Game): Promise<void> {
  for (let i = 0; i < 4 && game.p1.can("resolveFullCombat:bf1"); i++) {
    await game.p1.choose("resolveFullCombat:bf1");
    const s = await game.settle();
    expect(s.reason).toBe("open");
  }
  const s = await game.settle();
  expect(s.reason).toBe("open");
  expect(game.p1.can("resolveFullCombat:bf1")).toBe(false);
}

describe("(a) Block on Sunlit Guardian — Shield sums, Tank is redundant; control attackers 4 + 5 = 9", () => {
  test("after Block resolves the Guardian has Shield 1 + Shield 3 (814.2) → defends at 3 + 4 = 7 Might, and still simply 'has Tank' once (815.2/815.3)", async () => {
    const game = await attackAndBlock(false);
    const g = game.state("guardian");
    expect(g.combatRole).toBe("defender");
    expect(g.grantedKeywords).toEqual([
      { duration: "turn", keyword: "Shield", value: 3 },
      { duration: "turn", keyword: "Tank" },
    ]);
    expect(g.keywords.filter((k) => k === "Tank")).toEqual(["Tank"]); // one characteristic, not two
    expect(g.keywords).toContain("Shield");
    expect(g.might).toBe(7);
    expect(game.state("skulker").might).toBe(3);
  });

  test("the assignment Decision does not change shape: Guardian is the ONLY legal first recipient, so 9 is FORCED {guardian 7, skulker 2} — P1 is never asked", async () => {
    const game = await attackAndBlock(false);
    // A forced single line is auto-assigned; a P1 distribute prompt anywhere in the procedure would mean
    // Skulker-first (or a 4/5 split) was on offer. P2's own 10 → {Sergeant, Phantom} may legitimately be asked.
    let asked = 0;
    for (let i = 0; i < 4 && game.p1.can("resolveFullCombat:bf1"); i++) {
      await game.p1.choose("resolveFullCombat:bf1");
      for (let d = game.decision(); d?.kind === "distribute"; d = game.decision()) {
        expect(d.seat).toBe(P2);
        asked++;
        await game.p2.distribute({ phantom: 5, sergeant: 5 }); // Phantom 5 then Sergeant 4 (+1 excess on the last)
      }
    }
    expect(asked).toBeLessThanOrEqual(1);
    expect(game.zoneOf("guardian")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
  });

  test("outcome: Guardian (7 of 9) dies, Skulker takes 2 < 3 and survives healed; defenders' 7 + 3 = 10 kill Sergeant and Phantom; P2 holds bf1, no points for P1", async () => {
    const game = await attackAndBlock(false);
    await finishCombat(game);
    expect(game.zoneOf("guardian")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
    expect(game.state("skulker").damage).toBe(0);
    expect(game.zoneOf("sergeant")).toBe("trash");
    expect(game.zoneOf("phantom")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("pre-Block baseline for comparison: without Block the same 9 is forced {guardian 4, skulker 3(+2)} and both defenders die — Block only raised the Tank's minimum from 4 to 7", async () => {
    const game = await board(false).build();
    await game.p1.move(["sergeant", "phantom"], "bf1");
    await game.settle();
    await finishCombat(game);
    expect(game.zoneOf("guardian")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("trash");
    // defenders dealt only 4 + 3 = 7 back → at most one attacker dies, the other conquers
    expect(game.p1.units("bf1").length).toBeGreaterThanOrEqual(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});

describe("(b) Dune Surfer 3 + Sergeant 4 = 7 into the Blocked Guardian — 'ignore Tank' beats any number of Tank instances", () => {
  test("Guardian still READS as having Tank (815.3) and 7 Might — Dune Surfer changes assignment legality, not the characteristic", async () => {
    const game = await attackAndBlock(true);
    expect(game.state("guardian")).toMatchObject({ combatRole: "defender", might: 7 });
    expect(game.state("guardian").keywords).toContain("Tank");
    await game.p1.choose("resolveFullCombat:bf1");
    expect(game.state("guardian").keywords).toContain("Tank");
  });

  test("the Decision is a real P1 distribute prompt of 7 offering BOTH Guardian (lethal 7) and Skulker (lethal 3) as recipients (465.2.c.7)", async () => {
    const game = await attackAndBlock(true);
    await game.p1.choose("resolveFullCombat:bf1");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 7 });
    const buckets = d?.kind === "distribute" ? Object.fromEntries(d.buckets.map((b) => [b.key, b.lethal])) : {};
    expect(buckets).toEqual({ guardian: 7, skulker: 3 });
  });

  test("still illegal even with Tank ignored: over-assigning Skulker while Guardian remains {skulker 7} (465.2.c.4), or a non-lethal split {skulker 2, guardian 5} (465.2.c.3)", async () => {
    const game = await attackAndBlock(true);
    await game.p1.choose("resolveFullCombat:bf1");
    expect((await game.p1.try((p) => p.distribute({ skulker: 7 }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.distribute({ guardian: 5, skulker: 2 }))).ok).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1 });
  });

  test("choice 1 — {skulker 3, then guardian 4}: Skulker dies, Guardian survives (4 < 7, healed); both attackers die to 10; P2 keeps bf1", async () => {
    const game = await attackAndBlock(true);
    await game.p1.choose("resolveFullCombat:bf1");
    await game.p1.distribute({ guardian: 4, skulker: 3 });
    await finishCombat(game);
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.zoneOf("guardian")).toBe("battlefield-bf1");
    expect(game.state("guardian").damage).toBe(0);
    expect(game.zoneOf("surfer")).toBe("trash");
    expect(game.zoneOf("sergeant")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("choice 2 — {guardian 7, skulker 0}: Guardian dies, Skulker untouched; both attackers die; P2 keeps bf1", async () => {
    const game = await attackAndBlock(true);
    await game.p1.choose("resolveFullCombat:bf1");
    await game.p1.distribute({ guardian: 7 });
    await finishCombat(game);
    expect(game.zoneOf("guardian")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
    expect(game.state("skulker").damage).toBe(0);
    expect(game.zoneOf("surfer")).toBe("trash");
    expect(game.zoneOf("sergeant")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("after the turn ends Block's grants expire: a surviving Guardian is back to printed Shield 1 / Tank, 3 Might", async () => {
    const game = await attackAndBlock(true);
    await game.p1.choose("resolveFullCombat:bf1");
    await game.p1.distribute({ guardian: 4, skulker: 3 });
    await finishCombat(game);
    await game.advanceTurn();
    expect(game.state("guardian")).toMatchObject({ grantedKeywords: [], might: 3, zone: "battlefield-bf1" });
    expect(game.state("guardian").keywords).toEqual(["Shield", "Tank"]);
  });
});
