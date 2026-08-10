/**
 * Interaction: Alpha Strike (unl-192-219) · Spell · Calm/Body · 3+[rainbow] · Action
 *     "Choose a friendly unit. It deals damage equal to its Might split among enemy units at battlefields.
 *      Then for each unit this kills, do this: Gain 1 XP."
 *   × Gust (ogn-169-298) · Spell · Chaos · 1 · Reaction
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Flash (ogs-011-024) · Spell · Chaos · 2 · Reaction — "Move up to 2 friendly units to base."
 *   (+ Pouty Poro ogn-013-298 [Deflect] 2 Might and two vanilla 1-Might Recruits as the split targets)
 *
 * Question: P1 plays Alpha Strike choosing P1's 3-Might unit S (at bf1) as the source and P2's Pouty Poro
 * (Deflect, +1 power) plus two 1-Might Recruits at battlefields as the three split targets.
 *   Case A: P2 reacts with Gust returning S to P1's hand. At resolution: any damage? a split Decision at all?
 *           Deflect power refunded? XP?
 *   Case B: instead P1's own Flash puts S in base before resolution — S is still "a friendly unit". Does Alpha
 *           Strike still deal 3 split 1/1/1?
 *
 * Rules: 359.3.e.2 / 359.3.e.4 (a target that went to a non-board zone is illegal — a new object even if
 * replayed), 359.3.e.12 ("its Might" of an illegal target is null; calculations on it are ignored),
 * 359.3.e.14.a (the deal instruction is linked to the source choice → cannot execute), 359.3.e.10 (the spell
 * still counts as played), 355.14.i (costs paid for choosing split targets stay paid), 355.14.e / 355.14.f
 * (pool and division fixed at resolution; each target ≥ 1 → 3 over three targets is forced 1/1/1).
 *
 * Expected:
 *   A: nothing is dealt to Poro / R1 / R2, no split or drop prompt is shown, 0 XP; the Deflect pip stays spent;
 *      Alpha Strike goes to trash as a played spell; S is in P1's hand.
 *   B: "a friendly unit" has no location requirement → S in base is still legal; pool = 3, three targets →
 *      1 each with no choice: both Recruits die, Poro survives on 1 → P1 gains exactly 2 XP.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ALPHA_STRIKE = "unl-192-219";
const GUST = "ogn-169-298";
const FLASH = "ogs-011-024";
const POUTY_PORO = "ogn-013-298";

const SPLIT = ["poro", "r1", "r2"] as const;

/**
 * P1's turn. P1: 3-Might S at bf1 (P1's), Alpha Strike + Flash in hand, exactly 5 energy (3 + 2) and 2 rainbow
 * power (Alpha Strike's pip + the Deflect pip). P2: Pouty Poro and Recruit One at bf2 (P2's), Recruit Two at
 * bf1, a 1-Might unit at home (not "at a battlefield"), Gust in hand with exactly 1 energy.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { rainbow: 2 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Source" }, "S")
    .unit(P2, "bf2", POUTY_PORO, "poro")
    .unit(P2, "bf2", { might: 1, name: "Recruit One" }, "r1")
    .unit(P2, "bf1", { might: 1, name: "Recruit Two" }, "r2")
    .unit(P2, "base", { might: 1, name: "Home Guard" }, "home")
    .hand(P1, ALPHA_STRIKE, "alpha")
    .hand(P1, FLASH, "flash")
    .hand(P2, GUST, "gust");
}

/** P1 casts Alpha Strike: source S, split targets Poro + both Recruits. */
async function castAlpha(game: Game): Promise<void> {
  await game.p1.cast("alpha", { targets: ["S", ...SPLIT] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "alpha", controller: P1 })]);
  expect([...(game.chain()[0]?.targets ?? [])].sort()).toEqual(["S", ...SPLIT].sort());
}

/** True if `d` is any split-related prompt for P1 (damage division or dropping targets). */
function isSplitPrompt(d: Decision | null): boolean {
  return !!d && d.seat === P1 && (d.kind === "distribute" || (d.kind === "pick" && (d.semantics === "drop-target" || d.semantics === "subset")));
}

/** Pass priority around until the chain is empty or a non-priority prompt appears; reports whether P1 ever saw a split prompt. */
async function passOut(game: Game): Promise<{ sawSplitPrompt: boolean }> {
  let sawSplitPrompt = false;
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    sawSplitPrompt ||= isSplitPrompt(d);
    if (d?.kind === "action" && d.context === "chain") {
      await game.acting().passPriority();
      continue;
    }
    break;
  }
  sawSplitPrompt ||= isSplitPrompt(game.decision());
  return { sawSplitPrompt };
}

describe("setup — Alpha Strike with a [Deflect] unit among the split targets", () => {
  test("finalization offers S as the source with up to three battlefield enemies (never the unit in P2's base); choosing the Poro costs the Deflect pip on top of 3+[rainbow] — 5→2 energy, 2→0 rainbow (355.14.a/.b, 809.1.c)", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "alpha")?.fields.find((f) => f.name === "targets");
    const tuples = (field?.options ?? []) as string[][];
    expect(tuples.every((t) => t[0] === "S")).toBe(true);
    expect(tuples.flat()).not.toContain("home");
    expect(tuples.some((t) => t.length === 4 && SPLIT.every((s) => t.includes(s)))).toBe(true);
    await castAlpha(game);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 0 } });
    // Contrast: the same cast without the Poro leaves the second pip unspent.
    const noPoro = await board().build();
    await noPoro.p1.cast("alpha", { targets: ["S", "r1", "r2"] });
    expect(noPoro.p1.resources()).toEqual({ energy: 2, power: { rainbow: 1 } });
  });
});

describe("Case A — P2 Gusts the SOURCE S back to P1's hand in response", () => {
  async function gustTheSource(): Promise<Game> {
    const game = await board().build();
    await castAlpha(game);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "S" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["alpha", "gust"]);
    expect(game.p2.energy()).toBe(0);
    return game;
  }

  test("Gust (LIFO) resolves first: S — 3 Might, at a battlefield — goes to its owner P1's HAND, a non-board zone; Alpha Strike is still on the chain (359.3.e.2)", async () => {
    const game = await gustTheSource();
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("S")).toBe("hand");
    expect(game.p1.hand()).toContain("S");
    expect(game.chain().map((c) => c.cardId)).toEqual(["alpha"]);
    for (const t of SPLIT) {
      expect(game.state(t).damage).toBe(0);
    }
  });

  test("Alpha Strike then resolves with a null source: 'its Might' is null → NO split / drop Decision is ever presented to P1 and NONE of Poro / R1 / R2 takes damage (359.3.e.12, 359.3.e.14.a)", async () => {
    const game = await gustTheSource();
    const { sawSplitPrompt } = await passOut(game);
    expect(sawSplitPrompt).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.state("poro")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.state("r1")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.state("r2")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("home")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("nothing was killed → the reflexive 'for each unit this kills: Gain 1 XP' yields 0 XP for P1 (and none for P2)", async () => {
    const game = await gustTheSource();
    await passOut(game);
    expect(game.p1.xp()).toBe(0);
    expect(game.p2.xp()).toBe(0);
  });

  test("the +1 power paid for choosing the Deflect Poro is NOT refunded (355.14.i) and Alpha Strike still counts as a played spell — in P1's trash, 1 card played by P1 this turn (359.3.e.10); S may simply be replayed from hand as a new object", async () => {
    const game = await gustTheSource();
    await passOut(game);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 0 } });
    expect(game.zoneOf("alpha")).toBe("trash");
    expect(game.p1.trash()).toContain("alpha");
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(1);
    expect(game.p1.can("play", "S")).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});

describe("Case B — P1's own Flash moves the source S to BASE in response", () => {
  async function flashTheSource(): Promise<Game> {
    const game = await board().build();
    await castAlpha(game);
    expect(game.p1.can("cast", "flash")).toBe(true); // P1 holds priority first and Flash is a Reaction
    await game.p1.cast("flash", { targets: ["S"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["alpha", "flash"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    return game;
  }

  test("Flash (LIFO) resolves first: S is in P1's base — still on the board, still 'a friendly unit' (no location requirement on the source), Alpha Strike still pending", async () => {
    const game = await flashTheSource();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.state("S")).toMatchObject({ might: 3, zone: "base" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["alpha"]);
  });

  test("Alpha Strike resolves with pool = S's current Might 3 over three targets → forced 1/1/1 with NO choice offered: both Recruits die, the 2-Might Poro survives on 1 damage; S itself takes nothing (355.14.e, 355.14.f)", async () => {
    const game = await flashTheSource();
    const { sawSplitPrompt } = await passOut(game);
    expect(sawSplitPrompt).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("r1")).toBe("trash");
    expect(game.zoneOf("r2")).toBe("trash");
    expect(game.state("poro")).toMatchObject({ damage: 1, might: 2, zone: "battlefield-bf2" });
    expect(game.state("S")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("home")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.zoneOf("alpha")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("two kills → P1 gains exactly 2 XP; P2 none; Gust never cast (P2 keeps its 1 energy)", async () => {
    const game = await flashTheSource();
    await passOut(game);
    expect(game.p1.xp()).toBe(2);
    expect(game.p2.xp()).toBe(0);
    expect(game.zoneOf("gust")).toBe("hand");
    expect(game.p2.energy()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
