/**
 * Interaction: Alpha Strike (unl-192-219) · Spell · Calm/Body · 3 + [rainbow] · [Action]
 *     "Choose a friendly unit. It deals damage equal to its Might split among enemy units at
 *      battlefields. Then for each unit this kills, do this: Gain 1 XP."
 *   × Feral Strength (sfd-034-221) · Spell · Calm · 2 · [Reaction] "Give a unit +2 [Might] this turn."
 *   × Recruit (ogn-272-298) · 1-Might unit token — four of them, P2's, at battlefields
 *
 * Question: P1 plays Alpha Strike with P1's 2-Might unit as the source while P2 has four 1-Might Recruits
 * at battlefields.
 *   (a) At finalization may P1 name 3 or 4 Recruits, planning to pump the source in response?
 *   (b) P1 names 2 Recruits, then (still holding priority) Feral-Strengths the source → 4 Might at
 *       resolution. More targets now? Or must all 4 be split among the two locked targets (3/1, 2/2, 1/3)?
 *       Is a split decision shown over the locked targets? XP?
 *   (c) Mirror: P1 names 2 Recruits and P2 Feral-Strengths one of them to 3 Might — can P1 go 3/1 (or
 *       0/2) to kill more? And if the source had ALSO been pumped to 4?
 *
 * Rules: 355.14.b (split targets chosen at finalization), 355.14.c (their NUMBER is capped by the damage
 * available when the spell is PLAYED), 355.14.e (the division — and the pool, "its Might" — is decided at
 * RESOLUTION), 355.14.f / 355.14.g (each target ≥ 1), 355.14.h.1 (no dropping targets to concentrate
 * while damage ≥ targets), 355.15 (choices locked after finalization).
 *
 * Expected: (a) no — at most 2 Recruits (source Might 2 at play time); pumping BEFORE playing would allow 4.
 * (b) targets stay {r1, r2}; pool = 4; P1 splits all 4 between exactly those two (3/1, 2/2 or 1/3), never
 * onto r3/r4; both 1-Might Recruits die under any vector → 2 XP. (c) pool 2 over {r1 (3 Might), r2}: only
 * 1/1 is legal → no choice offered; r2 dies, r1 survives with 1 → 1 XP. With the source also at 4: P1 may
 * go 3/1 → both die → 2 XP.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ALPHA_STRIKE = "unl-192-219";
const FERAL_STRENGTH = "sfd-034-221";
const RECRUIT = "ogn-272-298";

const RECRUITS = ["r1", "r2", "r3", "r4"] as const;

/**
 * P1's turn. P1: 2-Might "Source" in base, Alpha Strike + a Feral Strength in hand, exactly 5 energy +
 * 1 rainbow (3+[rainbow] and 2). P2: Recruit tokens r1, r2 at bf1 and r3, r4 at bf2, a Feral Strength and
 * exactly 2 energy.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { rainbow: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Source" }, "src")
    .unit(P2, "bf1", RECRUIT, "r1")
    .unit(P2, "bf1", RECRUIT, "r2")
    .unit(P2, "bf2", RECRUIT, "r3")
    .unit(P2, "bf2", RECRUIT, "r4")
    .hand(P1, ALPHA_STRIKE, "alpha")
    .hand(P1, FERAL_STRENGTH, "feralP1")
    .hand(P2, FERAL_STRENGTH, "feralP2");
}

/** The `[source, ...splitTargets]` tuples Alpha Strike may be cast with right now. */
function alphaTuples(game: Game): string[][] {
  const field = game.p1.option("cast", "alpha")?.fields.find((f) => f.name === "targets");
  return (field?.options ?? []) as string[][];
}

const isSplitPrompt = (d: Decision | null): d is Extract<Decision, { kind: "distribute" }> =>
  !!d && d.kind === "distribute" && d.seat === P1;
const isDropPrompt = (d: Decision | null) => !!d && d.kind === "pick" && d.seat === P1 && d.semantics === "drop-target";

/** Pass priority back and forth until the chain is empty or a non-action prompt appears. */
async function passOut(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main" || !d.passKey) {
      return;
    }
    await game.acting().pass();
  }
}

/**
 * Answer P1's resolution-time split so that the final division is `want` (per target, each ≥ 1).
 * Tolerates either prompt shape: one decision for the whole pool, or the mandatory 1-each being implicit
 * with the excess asked for in instalments. Returns the buckets that were ever offered.
 */
async function split(game: Game, want: Readonly<Record<string, number>>): Promise<string[]> {
  const pool = Object.values(want).reduce((a, b) => a + b, 0);
  const extra: Record<string, number> = Object.fromEntries(Object.entries(want).map(([k, v]) => [k, v - 1]));
  const offered = new Set<string>();
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!isSplitPrompt(d)) {
      break;
    }
    for (const b of d.buckets) {
      offered.add(b.key);
    }
    if (d.total === pool) {
      await game.p1.distribute(want);
      continue;
    }
    const allocation: Record<string, number> = {};
    let left = d.total;
    for (const k of Object.keys(extra)) {
      const n = Math.min(left, extra[k] ?? 0);
      if (n > 0) {
        allocation[k] = n;
        extra[k] = (extra[k] ?? 0) - n;
        left -= n;
      }
    }
    await game.p1.distribute(allocation);
  }
  return [...offered].sort();
}

const dealtTo = (game: Game, target: string) =>
  (game.gameState.damageLog ?? []).filter((r) => !r.combat && r.target === target).reduce((n, r) => n + r.amount, 0);

/** (b): Alpha Strike on src + r1 + r2, then — keeping priority — Feral Strength on src; everyone passes. */
async function alphaThenPumpSource(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("alpha", { targets: ["src", "r1", "r2"] });
  await game.p1.cast("feralP1", { targets: "src" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["alpha", "feralP1"]);
  await passOut(game);
  return game;
}

describe("(a) the NUMBER of split targets is capped by the source's Might when Alpha Strike is played (355.14.c)", () => {
  test("with a 2-Might source, every legal cast names the source plus AT MOST 2 Recruits — no 3- or 4-Recruit tuple exists", async () => {
    const game = await board().build();
    const tuples = alphaTuples(game);
    expect(tuples.length).toBeGreaterThan(0);
    expect(tuples.every((t) => t[0] === "src")).toBe(true);
    expect(Math.max(...tuples.map((t) => t.length - 1))).toBe(2);
    expect(tuples).toContainEqual(["src", "r1", "r2"]);
    expect(tuples).toContainEqual(["src", "r1", "r3"]); // any two, across battlefields
  });

  test("naming 3 or all 4 Recruits is rejected outright — 'I will pump it in response' does not raise the cap", async () => {
    const game = await board().build();
    await expect(game.p1.cast("alpha", { targets: ["src", "r1", "r2", "r3"] })).rejects.toThrow();
    await expect(game.p1.cast("alpha", { targets: ["src", ...RECRUITS] })).rejects.toThrow();
    expect(game.zoneOf("alpha")).toBe("hand");
    expect(game.p1.energy()).toBe(5);
  });

  test("contrast: pumping the source BEFORE playing (Feral Strength resolves first → 4 Might) makes 4-Recruit tuples legal", async () => {
    const game = await board().build();
    await game.p1.cast("feralP1", { targets: "src" });
    await passOut(game);
    expect(game.state("src").might).toBe(4);
    const tuples = alphaTuples(game);
    expect(Math.max(...tuples.map((t) => t.length - 1))).toBe(4);
    expect(tuples).toContainEqual(["src", ...RECRUITS]);
    await game.p1.cast("alpha", { targets: ["src", ...RECRUITS] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "alpha", targets: ["src", ...RECRUITS] })]);
  });
});

describe("(b) two Recruits locked, then the source is pumped to 4 — the pool grows, the target list does not", () => {
  test("P1 keeps priority after Alpha Strike and may add Feral Strength on the source; chain = [Alpha Strike (src,r1,r2), Feral Strength (src)]; all 5 energy + the rainbow spent", async () => {
    const game = await board().build();
    await game.p1.cast("alpha", { targets: ["src", "r1", "r2"] });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "feralP1")).toBe(true);
    await game.p1.cast("feralP1", { targets: "src" });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "alpha", controller: P1, targets: ["src", "r1", "r2"] }),
      expect.objectContaining({ cardId: "feralP1", controller: P1, targets: ["src"] }),
    ]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });

  test("LIFO: Feral Strength resolves first (source 4 Might); when Alpha Strike resolves P1 is shown a SPLIT decision (not a drop prompt) whose buckets are exactly the two locked Recruits — r3/r4 can never be added (355.14.b, 355.15)", async () => {
    const game = await alphaThenPumpSource();
    expect(game.zoneOf("feralP1")).toBe("trash");
    expect(game.state("src").might).toBe(4);
    const d = game.decision();
    expect(isDropPrompt(d)).toBe(false);
    expect(isSplitPrompt(d)).toBe(true);
    if (isSplitPrompt(d)) {
      expect(d.buckets.map((b) => b.key).sort()).toEqual(["r1", "r2"]);
    }
    const r = await game.p1.try((p) => p.distribute({ r3: 1 }));
    expect(r.ok).toBe(false);
  });

  test("3/1: all 4 damage lands on the two locked targets (r1 takes 3, r2 takes 1), nothing touches r3/r4; both Recruits die → 2 XP", async () => {
    const game = await alphaThenPumpSource();
    const offered = await split(game, { r1: 3, r2: 1 });
    expect(offered).toEqual(["r1", "r2"]);
    await game.settle();
    expect(dealtTo(game, "r1")).toBe(3);
    expect(dealtTo(game, "r2")).toBe(1);
    expect(dealtTo(game, "r1") + dealtTo(game, "r2")).toBe(4); // resolution-time pool, 355.14.e
    expect(dealtTo(game, "r3") + dealtTo(game, "r4")).toBe(0);
    expect(game.zoneOf("r1")).toBe("gone"); // tokens cease to exist
    expect(game.zoneOf("r2")).toBe("gone");
    expect(game.state("r3")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.state("r4")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.p1.xp()).toBe(2);
    expect(game.zoneOf("alpha")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("2/2 and 1/3 are equally legal vectors (each ≥ 1, whole pool assigned, 355.14.f/g) — both Recruits die either way → 2 XP; the source itself takes nothing", async () => {
    for (const want of [
      { r1: 2, r2: 2 },
      { r1: 1, r2: 3 },
    ]) {
      const game = await alphaThenPumpSource();
      await split(game, want);
      await game.settle();
      expect(dealtTo(game, "r1")).toBe(want.r1);
      expect(dealtTo(game, "r2")).toBe(want.r2);
      expect(game.zoneOf("r1")).toBe("gone");
      expect(game.zoneOf("r2")).toBe("gone");
      expect(game.p1.xp()).toBe(2);
      expect(game.state("src")).toMatchObject({ damage: 0, might: 4, zone: "base" });
      expect(game.violations()).toEqual([]);
    }
  });

  test("a lopsided 4/0 is refused — a locked target may not be left with nothing (355.14.f, 355.14.h.1)", async () => {
    const game = await alphaThenPumpSource();
    const d = game.decision();
    expect(isSplitPrompt(d)).toBe(true);
    const r = await game.p1.try((p) => p.distribute({ r1: 4, r2: 0 }));
    expect(r.ok).toBe(false);
    // r2 still ends up with at least 1 whatever P1 does from here.
    await split(game, { r1: 3, r2: 1 });
    await game.settle();
    expect(dealtTo(game, "r2")).toBeGreaterThanOrEqual(1);
  });
});

describe("(c) mirror — P2 pumps a locked Recruit instead", () => {
  /** Alpha Strike on src + r1 + r2; P1 passes; P2 Feral-Strengths r1; everyone passes. */
  async function alphaThenP2PumpsR1(alsoPumpSource = false): Promise<Game> {
    const game = await board().build();
    await game.p1.cast("alpha", { targets: ["src", "r1", "r2"] });
    if (alsoPumpSource) {
      await game.p1.cast("feralP1", { targets: "src" });
    }
    await game.p1.passPriority();
    expect(game.p2.can("cast", "feralP2")).toBe(true);
    await game.p2.cast("feralP2", { targets: "r1" });
    await passOut(game);
    return game;
  }

  test("unbuffed source (pool 2) vs {r1 now 3 Might, r2}: the only legal division is 1/1, so P1 is offered NO choice at all — no split decision, no drop prompt (355.14.f, 355.14.h.1)", async () => {
    const game = await alphaThenP2PumpsR1();
    expect(game.zoneOf("feralP2")).toBe("trash");
    expect(isSplitPrompt(game.decision())).toBe(false);
    expect(isDropPrompt(game.decision())).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("…1 to each: r2 (1 Might) dies, r1 (3 Might) survives with 1 damage → exactly 1 XP; P1 could not go 3/1 or 0/2", async () => {
    const game = await alphaThenP2PumpsR1();
    await game.settle();
    expect(dealtTo(game, "r1")).toBe(1);
    expect(dealtTo(game, "r2")).toBe(1);
    expect(game.state("r1")).toMatchObject({ damage: 1, might: 3, zone: "battlefield-bf1" });
    expect(game.zoneOf("r2")).toBe("gone");
    expect(game.p1.xp()).toBe(1);
    expect(game.p2.xp()).toBe(0);
    expect(game.zoneOf("alpha")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("if P1 had ALSO pumped the source to 4 (chain: Alpha, Feral P1 on src, Feral P2 on r1): pool 4 over {r1 (3), r2 (1)} → P1 gets the split decision and may go 3/1 → both die → 2 XP", async () => {
    const game = await alphaThenP2PumpsR1(true);
    expect(game.state("src").might).toBe(4);
    expect(game.state("r1").might).toBe(3);
    expect(isSplitPrompt(game.decision())).toBe(true);
    const offered = await split(game, { r1: 3, r2: 1 });
    expect(offered).toEqual(["r1", "r2"]);
    await game.settle();
    expect(dealtTo(game, "r1")).toBe(3);
    expect(dealtTo(game, "r2")).toBe(1);
    expect(game.zoneOf("r1")).toBe("gone");
    expect(game.zoneOf("r2")).toBe("gone");
    expect(game.p1.xp()).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("…whereas splitting 2/2 there wastes the pump: r1 (3 Might) survives with 2, only r2 dies → 1 XP — the division is P1's real decision (355.14.e)", async () => {
    const game = await alphaThenP2PumpsR1(true);
    await split(game, { r1: 2, r2: 2 });
    await game.settle();
    expect(game.state("r1")).toMatchObject({ damage: 2, might: 3, zone: "battlefield-bf1" });
    expect(game.zoneOf("r2")).toBe("gone");
    expect(game.p1.xp()).toBe(1);
  });
});
