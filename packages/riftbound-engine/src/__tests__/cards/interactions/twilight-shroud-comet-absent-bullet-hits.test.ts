/**
 * Interaction: Twilight Shroud (ven-031-166) · Spell · Calm · 1
 *     "Give a friendly unit +1 [Might] this turn. It can't be chosen by enemy spells and abilities this turn."
 *   × Falling Comet (ogn-085-298) · Spell · Mind · 5 · "[Action] Deal 6 to a unit at a battlefield."
 *   × Bullet Time (ogn-268-298) · Spell · Body/Chaos · 1 · "[Action] Pay any amount of [rainbow] to deal
 *     that much damage to all enemy units at a battlefield."
 *   (+ Discipline ogn-058-298 "[Reaction] Give a unit +2 [Might] this turn. Draw 1." as P1's OWN targeted spell)
 *
 * Rules: 757/758 (an object that "can't be chosen by [category] spells" is Untargetable = not a legal
 * target for them), 355.9.b (a valid target meets ALL restrictions — must not even be offered), 355.8 (no
 * valid target → the spell cannot be put on the chain), 355.10.b/355.10.d ("all enemy units at a
 * battlefield" targets the BATTLEFIELD; the units are selected programmatically, never chosen), 054.1
 * (can't beats can), 740.1.a/740.1.b (friendly/enemy is controller-relative).
 *
 * Question — P1's turn. P1 shrouds its 2-Might X (→ 3) and Standard-Moves it into battlefield B held by
 * P2's 4-Might D → combat showdown. P2 holds Falling Comet + Bullet Time with 3 spare power:
 *  (a) When P2 has Focus, is X in Falling Comet's offered targets (absent, not offered-then-rejected)?
 *      Can P2 still aim it at its own D? And if X were the ONLY unit at any battlefield?
 *  (b) P2 plays Bullet Time naming B and pays 3 — does shrouded X take 3 and die?
 *  (c) Can P1 itself still target X with a spell this turn?
 *  (d) On P2's next turn, is X targetable by Falling Comet again?
 *
 * Expected: (a) X ABSENT, D offered, spell castable; X alone → Comet not playable at all (355.8).
 * (b) yes — the battlefield is the target, X is hit for 3 = its Might → dies → P1's trash; D untouched;
 * no combat, P2 keeps B. (c) yes — only ENEMY spells are locked out. (d) yes — both halves are "this
 * turn"; on P2's turn X (2 Might) is offered and Comet kills it.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TWILIGHT_SHROUD = "ven-031-166";
const FALLING_COMET = "ogn-085-298";
const BULLET_TIME = "ogn-268-298";
const DISCIPLINE = "ogn-058-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn. P1: 2-Might X in base, Twilight Shroud + Discipline in hand, 3 energy; controls the empty
 * bfA. P2: 4-Might D holding bfB (omitted with `withD:false`), Falling Comet + Bullet Time in hand,
 * 6 energy + 3 rainbow power.
 */
function board(opts: { withD?: boolean } = {}) {
  let b = scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 6, power: { rainbow: 3 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "X" }, "x")
    .hand(P1, TWILIGHT_SHROUD, "shroud")
    .hand(P1, DISCIPLINE, "discipline")
    .hand(P2, FALLING_COMET, "comet")
    .hand(P2, BULLET_TIME, "bulletTime");
  if (opts.withD !== false) {
    b = b.unit(P2, "bfB", { might: 4, name: "D" }, "d");
  }
  return b;
}

/** The set of card ids a seat's cast option currently offers for `alias`. */
function targetsOffered(game: Game, seat: "p1" | "p2", alias: string): string[] {
  const field = game[seat].option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** P1 shrouds X (→ 3, Untargetable this turn). */
async function shroudX(game: Game): Promise<void> {
  await game.p1.cast("shroud", { targets: "x" });
  await game.settle();
  expect(game.state("x").might).toBe(3);
}

/** Shroud X, attack bfB with it, P1 passes Focus → P2 holds Focus in the combat showdown. */
async function p2FocusAtB(opts: { withD?: boolean } = {}): Promise<Game> {
  const game = await board(opts).build();
  await shroudX(game);
  await game.p1.move("x", "bfB");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  return game;
}

describe("setup — Twilight Shroud on X", () => {
  test("X gets +1 Might (2 → 3) and the turn-scoped 'can't be chosen by enemy spells and abilities' (Untargetable) marker; the Shroud goes to the trash", async () => {
    const game = await board().build();
    await shroudX(game);
    expect(game.state("x").grantedKeywords).toEqual([{ duration: "turn", keyword: "Untargetable", value: undefined }]);
    expect(game.zoneOf("shroud")).toBe("trash");
    expect(game.p1.energy()).toBe(2);
  });
});

describe("(a) Falling Comet — a CHOSEN unit: shrouded X is absent from the enemy's target list", () => {
  test("with P2 on Focus, Falling Comet offers exactly [D] — X is not listed at all (757, 758, 355.9.b) — and naming X anyway is rejected", async () => {
    const game = await p2FocusAtB();
    expect(targetsOffered(game, "p2", "comet")).toEqual(["d"]);
    expect((await game.p2.try((p) => p.cast("comet", { targets: "x" }))).ok).toBe(false);
    expect(game.zoneOf("comet")).toBe("hand");
    expect(game.p2.energy()).toBe(6);
    expect(game.state("x")).toMatchObject({ damage: 0, zone: "battlefield-bfB" });
  });

  test("P2's own D (a unit at a battlefield) keeps the spell castable — pointless but legal: 6 to D kills it", async () => {
    const game = await p2FocusAtB();
    expect(game.p2.can("cast", "comet")).toBe(true);
    await game.p2.cast("comet", { targets: "d" });
    expect(game.p2.energy()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "comet", controller: P2, targets: ["d"] })]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("d")).toBe("trash");
    expect(game.state("x")).toMatchObject({ damage: 0, zone: "battlefield-bfB" });
  });

  test("if shrouded X is the ONLY unit at any battlefield, Falling Comet has no legal target and cannot be played at all (355.8) — while Bullet Time (targets a battlefield) still can", async () => {
    const game = await p2FocusAtB({ withD: false });
    expect(game.p1.units("bfB")).toEqual(["x"]);
    expect(game.p2.can("cast", "comet")).toBe(false);
    expect(targetsOffered(game, "p2", "comet")).toEqual([]);
    expect((await game.p2.try((p) => p.cast("comet", { targets: "x" }))).ok).toBe(false);
    expect(game.p2.can("cast", "bulletTime")).toBe(true);
  });
});

describe("(b) Bullet Time — targets the BATTLEFIELD; 'all enemy units' there are selected, not chosen", () => {
  test("Bullet Time's only choice is a battlefield (bfA | bfB) — no unit is ever offered, so X's protection is irrelevant (355.10.b, 355.10.d)", async () => {
    const game = await p2FocusAtB();
    expect(targetsOffered(game, "p2", "bulletTime").sort()).toEqual(["bfA", "bfB"]);
    await game.p2.cast("bulletTime", { targets: "bfB", x: 3 });
    expect(game.p2.energy()).toBe(5); // 1 energy on the play; the [rainbow] is paid on resolution
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bulletTime", controller: P2, targets: ["bfB"] })]);
  });

  test("on resolution P2 pays 3 power and shrouded X is dealt 3 = its Might (2 + 1) → X dies to P1's trash; D (not an enemy to P2) is untouched", async () => {
    const game = await p2FocusAtB();
    await game.p2.cast("bulletTime", { targets: "bfB", x: 3 });
    await game.settle();
    expect(game.p2.resources()).toEqual({ energy: 5, power: { rainbow: 0 } });
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.p1.trash()).toContain("x");
    expect(game.state("d")).toMatchObject({ damage: 0, zone: "battlefield-bfB" });
    expect(game.zoneOf("bulletTime")).toBe("trash");
  });

  test("with X gone P1 has no attacker: combat ends without a damage step, P2 keeps B, nobody scores, and it is P1's main phase again", async () => {
    const game = await p2FocusAtB();
    await game.p2.cast("bulletTime", { targets: "bfB", x: 3 });
    await game.settle();
    expect(game.gameState.battlefields.bfB?.controller).toBe(P2);
    expect(game.gameState.battlefields.bfB?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) own side — the restriction names ENEMY spells only (740.1)", () => {
  test("P1's own Discipline still offers shrouded X (in base, before attacking) alongside the enemy D", async () => {
    const game = await board().build();
    await shroudX(game);
    expect(targetsOffered(game, "p1", "discipline").sort()).toEqual(["d", "x"]);
  });

  test("…and mid-showdown too: P1 (Focus) Disciplines its own shrouded attacker X → 5; X then beats D (4) and conquers B", async () => {
    const game = await board().build();
    await shroudX(game);
    await game.p1.move("x", "bfB");
    expect(targetsOffered(game, "p1", "discipline")).toContain("x");
    await game.p1.cast("discipline", { targets: "x" });
    await game.settle();
    expect(game.state("x").might).toBe(5);
    expect(game.zoneOf("x")).toBe("battlefield-bfB");
    expect(game.zoneOf("d")).toBe("trash");
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
  });
});

describe("(d) expiry — both halves are 'this turn'", () => {
  /** Shroud X, park it at P1's own bfA (no showdown), pass the turn to P2 and refill P2's energy for the 5-cost Comet. */
  async function p2NextTurn(): Promise<Game> {
    const game = await board().build();
    await shroudX(game);
    await game.p1.move("x", "bfA");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    await game.p2.do("addResources", { energy: 5 });
    return game;
  }

  test("at P1's end of turn the +1 and the Untargetable marker both expire: on P2's turn X is a plain 2-Might unit at bfA", async () => {
    const game = await p2NextTurn();
    expect(game.zoneOf("x")).toBe("battlefield-bfA");
    expect(game.state("x")).toMatchObject({ grantedKeywords: [], might: 2 });
    expect(game.trace().expiration.flatMap((p) => p.expired)).toEqual(expect.arrayContaining([expect.stringContaining("x")]));
  });

  test("P2's Falling Comet now lists X again (and D); choosing X deals 6 → X dies", async () => {
    const game = await p2NextTurn();
    expect(targetsOffered(game, "p2", "comet").sort()).toEqual(["d", "x"]);
    await game.p2.cast("comet", { targets: "x" });
    await game.settle();
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.zoneOf("comet")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });
});
