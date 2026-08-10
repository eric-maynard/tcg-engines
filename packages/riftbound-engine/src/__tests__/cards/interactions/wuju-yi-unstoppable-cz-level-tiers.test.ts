/**
 * Interaction: Wuju Master (unl-191-219) · Legend · Calm/Body
 *     "[Level 6][>] Your units have +1 [Might]. [Level 11][>] Your units enter ready."
 *   × Master Yi, Unstoppable (unl-059-219) · Champion Unit · Calm · 12 + [calm][calm][calm] · 12 Might
 *     "[Level 3][>] I cost [2][calm] less. [Level 6][>] I cost [4][calm][calm] less instead.
 *      [Level 11][>] I cost [6][calm][calm][calm] less instead.
 *      [Level 16][>] I can't be chosen by enemy spells and abilities."   — still in P1's Champion Zone
 *   × Vengeance (ogn-229-298) · Spell · Order · 4 + [order][order] · "Kill a unit."   — in P2's hand
 *
 * Question: P2 has 20 XP throughout. Vary P1's XP 0 / 4 / 11 / 16 / 40. For each:
 *   (a) what does Yi cost FROM THE CHAMPION ZONE, and with exactly 6 energy + 0 calm is the CZ play
 *       offered? Do the three tiers stack (−2−4−6) or replace? Do Level cost reductions and the
 *       legend's Level passives apply to a CZ play at all?
 *   (b) after it resolves: ready or exhausted, and what Might?
 *   (c) on P2's next turn, can Vengeance choose Yi?
 *   (d) does P2's 20 XP ever feed P1's Level checks; is 40 XP legal / capped; is XP spent?
 *
 * Rules: 108.3.d / 419.1.a (a play from the Champion Zone is an ordinary play — 356.1 cost
 * modifications and all passives apply exactly as from hand), 824.1.b.1 / 824.1.c / 824.1.d (Level N
 * is Active while the CONTROLLER has N+ XP), 824.2, "instead" → only the highest active tier applies,
 * 174.6 (legend passives), 729.2 / 731 / 732 (XP is a per-player resource, a threshold — never spent
 * by Level), 733 (no XP cap), 355.9.b (can't-be-chosen units are not legal targets for the enemy).
 *
 * Expected: XP 0 → 12+[calm]×3, not offered at 6/0; played in full: exhausted, 12 Might; Vengeance may
 * choose him. XP 4 → 10+[calm][calm], not offered at 6/0; exhausted, 12; targetable. XP 11 → 6+0 →
 * OFFERED at exactly 6/0; enters READY (Wuju L11) at 12+1 = 13 (Wuju L6); still targetable. XP 16 →
 * same cost, ready, 13, and NOT a legal Vengeance target. XP 40 → identical to 16. P2's XP never
 * matters; P1's XP is unchanged by the play; the CZ goes occupied → empty exactly once.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WUJU_MASTER = "unl-191-219";
const YI_UNSTOPPABLE = "unl-059-219";
const VENGEANCE = "ogn-229-298";

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

function castTargets(game: G, seat: "p1" | "p2", alias: string): string[] {
  const field = game[seat].option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

/**
 * P1's turn 2. P1: legend Wuju Master, Yi in the Champion Zone, a plain 2-Might ally in base (a
 * reference Vengeance target), `p1xp` XP and the given pool. P2: 20 XP, Vengeance in hand.
 */
function board(p1xp: number, pool: { energy: number; calm: number } = { calm: 0, energy: 6 }, p2xp = 20) {
  return scenario()
    .xp(P1, p1xp)
    .xp(P2, p2xp)
    .resources(P1, { energy: pool.energy, power: { calm: pool.calm } })
    .legend(P1, WUJU_MASTER, "wuju")
    .champion(P1, YI_UNSTOPPABLE, "yi")
    .unit(P1, "base", { might: 2, name: "Plain Disciple" }, "plain")
    .hand(P2, VENGEANCE, "vengeance");
}

/** Play Yi from the CZ to base and let it resolve. Asserts the CZ empties exactly once and XP is untouched. */
async function playYi(game: G, p1xp: number): Promise<void> {
  expect(game.p1.champion()).toBe("yi");
  expect(game.zoneOf("yi")).toBe("championZone");
  await game.p1.playChampion("base");
  await game.settle();
  expect(game.zoneOf("yi")).toBe("base");
  expect(game.p1.champion()).toBeUndefined();
  expect(game.p1.xp()).toBe(p1xp); // Level is a threshold, never a cost (729.2)
  expect(game.p2.xp()).toBe(20);
}

/** …then hand the turn to P2, give P2 exactly Vengeance's cost, and report whether Yi is a legal choice. */
async function vengeanceOnP2Turn(game: G): Promise<{ offered: string[]; canHitYi: boolean }> {
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  expect(game.phase()).toBe("main");
  await game.p2.do("addResources", { energy: 4, power: { order: 2 } });
  expect(game.p2.can("cast", "vengeance")).toBe(true);
  const offered = castTargets(game, "p2", "vengeance");
  const r = await game.p2.try((p) => p.cast("vengeance", { targets: "yi" }));
  return { canHitYi: r.ok, offered };
}

describe("Wuju Master × Master Yi, Unstoppable (Champion Zone) × Vengeance — Level tiers by P1's XP", () => {
  // ── XP 0 ────────────────────────────────────────────────────────────────────────────────────
  test("XP 0 (a): no tier active — the CZ play costs the full 12 + [calm]×3; NOT offered with 6 energy / 0 calm, nor with 11+3 or 12+2", async () => {
    const game = await board(0).build();
    expect(game.p1.can("playChampion")).toBe(false);
    const r = await game.p1.try((p) => p.playChampion("base"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("yi")).toBe("championZone");
    expect((await board(0, { calm: 3, energy: 11 }).build()).p1.can("playChampion")).toBe(false);
    expect((await board(0, { calm: 2, energy: 12 }).build()).p1.can("playChampion")).toBe(false);
    expect((await board(0, { calm: 3, energy: 12 }).build()).p1.can("playChampion")).toBe(true);
  });

  test("XP 0 (b): paid in full (12+3 calm → pool emptied) he enters the base EXHAUSTED at 12 Might (no Wuju passives below Level 6); XP unchanged, CZ emptied", async () => {
    const game = await board(0, { calm: 3, energy: 12 }).build();
    await playYi(game, 0);
    expect([game.p1.energy(), game.p1.power()]).toEqual([0, 0]); // pool emptied
    expect(game.state("yi")).toMatchObject({ baseMight: 12, isExhausted: true, might: 12, zone: "base" });
    expect(game.state("plain").might).toBe(2);
  });

  test("XP 0 (c): on P2's next turn Vengeance may choose Yi (Level 16 inactive) — he dies", async () => {
    const game = await board(0, { calm: 3, energy: 12 }).build();
    await playYi(game, 0);
    const v = await vengeanceOnP2Turn(game);
    expect(v.offered).toEqual(["plain", "yi"]);
    expect(v.canHitYi).toBe(true);
    await game.settle();
    expect(game.zoneOf("yi")).toBe("trash");
  });

  // ── XP 4 ────────────────────────────────────────────────────────────────────────────────────
  test("XP 4 (a): only [Level 3] is active → 10 + [calm][calm]; NOT offered at 6/0, nor at 9+2 / 10+1; offered at exactly 10+2", async () => {
    expect((await board(4).build()).p1.can("playChampion")).toBe(false);
    expect((await board(4, { calm: 2, energy: 9 }).build()).p1.can("playChampion")).toBe(false);
    expect((await board(4, { calm: 1, energy: 10 }).build()).p1.can("playChampion")).toBe(false);
    expect((await board(4, { calm: 2, energy: 10 }).build()).p1.can("playChampion")).toBe(true);
  });

  test("XP 4 (b): played for 10+2 (pool emptied) he enters EXHAUSTED at 12 Might; XP stays 4", async () => {
    const game = await board(4, { calm: 2, energy: 10 }).build();
    await playYi(game, 4);
    expect([game.p1.energy(), game.p1.power()]).toEqual([0, 0]); // pool emptied
    expect(game.state("yi")).toMatchObject({ isExhausted: true, might: 12, zone: "base" });
  });

  test("XP 4 (c): Vengeance may choose Yi on P2's turn", async () => {
    const game = await board(4, { calm: 2, energy: 10 }).build();
    await playYi(game, 4);
    const v = await vengeanceOnP2Turn(game);
    expect(v.offered).toContain("yi");
    expect(v.canHitYi).toBe(true);
  });

  // ── XP 11 ───────────────────────────────────────────────────────────────────────────────────
  test("XP 11 (a): [Level 11] tier REPLACES the lower ones ('instead') → 6 energy + 0 power → the CZ play IS offered with exactly 6 energy and no calm; 5 energy is one short", async () => {
    const game = await board(11).build();
    expect(game.p1.can("playChampion")).toBe(true);
    expect((await board(11, { calm: 3, energy: 5 }).build()).p1.can("playChampion")).toBe(false);
  });

  test("XP 11 (a′): tiers never SUM — if −2−4−6 stacked the cost would be 0; with 0 energy the play is not offered", async () => {
    expect((await board(11, { calm: 0, energy: 0 }).build()).p1.can("playChampion")).toBe(false);
  });

  test("XP 11 (b): pays exactly 6 (pool emptied); Wuju L11 'your units enter ready' → Yi enters READY; Wuju L6 → 12+1 = 13 Might (the plain ally is 2+1 = 3)", async () => {
    const game = await board(11).build();
    expect(game.state("plain").might).toBe(3); // L6 passive already live on the board before the play
    await playYi(game, 11);
    expect([game.p1.energy(), game.p1.power()]).toEqual([0, 0]); // pool emptied
    expect(game.state("yi")).toMatchObject({ baseMight: 12, isExhausted: false, isReady: true, might: 13, zone: "base" });
    expect(game.state("plain").might).toBe(3);
    expect(game.chain()).toEqual([]);
  });

  test("XP 11 (c): Level 16 is NOT active at 11 XP — Vengeance may still choose Yi", async () => {
    const game = await board(11).build();
    await playYi(game, 11);
    const v = await vengeanceOnP2Turn(game);
    expect(v.offered).toEqual(["plain", "yi"]);
    expect(v.canHitYi).toBe(true);
  });

  // ── XP 16 ───────────────────────────────────────────────────────────────────────────────────
  test("XP 16 (a)+(b): no higher cost tier — still 6 + 0, offered at 6/0; enters READY at 13 Might", async () => {
    const game = await board(16).build();
    expect(game.p1.can("playChampion")).toBe(true);
    await playYi(game, 16);
    expect([game.p1.energy(), game.p1.power()]).toEqual([0, 0]); // pool emptied
    expect(game.state("yi")).toMatchObject({ isReady: true, might: 13, zone: "base" });
  });

  test("XP 16 (c): [Level 16] active — P2's Vengeance is offered only the plain ally; choosing Yi is rejected and nothing is spent (355.9.b)", async () => {
    const game = await board(16).build();
    await playYi(game, 16);
    const v = await vengeanceOnP2Turn(game);
    expect(v.offered).toEqual(["plain"]);
    expect(v.canHitYi).toBe(false);
    expect(game.zoneOf("vengeance")).toBe("hand");
    expect(game.p2.resources()).toMatchObject({ energy: 4, power: { order: 2 } });
    expect(game.zoneOf("yi")).toBe("base");
  });

  // ── XP 40 ───────────────────────────────────────────────────────────────────────────────────
  test("XP 40: identical to 16 — 733 no XP cap, nothing errors: offered at 6/0, enters ready at 13, XP reads 40 before and after", async () => {
    const game = await board(40).build();
    expect(game.p1.xp()).toBe(40);
    expect(game.p1.can("playChampion")).toBe(true);
    await playYi(game, 40);
    expect([game.p1.energy(), game.p1.power()]).toEqual([0, 0]); // pool emptied
    expect(game.state("yi")).toMatchObject({ isReady: true, might: 13, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("XP 40 (c): Vengeance may not choose Yi", async () => {
    const game = await board(40).build();
    await playYi(game, 40);
    const v = await vengeanceOnP2Turn(game);
    expect(v.offered).toEqual(["plain"]);
    expect(v.canHitYi).toBe(false);
  });

  // ── (d) whose XP? ───────────────────────────────────────────────────────────────────────────
  test("(d) Level reads the CONTROLLER's XP only (824.1.c): P1 at 4 XP with P2 at 20 still costs 10+[calm][calm] — 6/0 and 8+1 are not enough; P2 at 0 XP changes nothing either", async () => {
    // P2's 20 XP would make Yi 6+0 (and untargetable) if it leaked into P1's Level checks.
    expect((await board(4, { calm: 0, energy: 6 }, 20).build()).p1.can("playChampion")).toBe(false);
    expect((await board(4, { calm: 1, energy: 8 }, 20).build()).p1.can("playChampion")).toBe(false);
    expect((await board(4, { calm: 2, energy: 10 }, 20).build()).p1.can("playChampion")).toBe(true);
    // Symmetric probe: P2's XP being 0 instead of 20 does not change P1's price at 11 XP.
    expect((await board(11, { calm: 0, energy: 6 }, 0).build()).p1.can("playChampion")).toBe(true);
  });

  test("(d) the enemy's Level check reads ITS controller too: with P1 at 4 XP, P2's 20 XP does not make Yi untargetable for P2 — and P1 at 16 / P2 at 0 still does", async () => {
    const low = await board(4, { calm: 2, energy: 10 }, 20).build();
    await playYi(low, 4);
    expect((await vengeanceOnP2Turn(low)).canHitYi).toBe(true);

    const high = await board(16, { calm: 0, energy: 6 }, 0).build();
    await high.p1.playChampion("base");
    await high.settle();
    await high.advanceTurn();
    await high.p2.do("addResources", { energy: 4, power: { order: 2 } });
    expect(castTargets(high, "p2", "vengeance")).toEqual(["plain"]);
  });
});
