/**
 * Interaction: Possession (ogn-203-298) · Spell · Chaos · 8 + [chaos]×3 · Action
 *     "Choose an enemy unit at a battlefield. Take control of it and recall it."
 *   × Viktor, Leader (ogn-246-298) · Champion Unit · Order · 4 Might
 *     "When another non-Recruit unit you control dies, play a 1 [Might] Recruit unit token into your base."
 *   × Vicious Snapjaws (unl-129-219) · Unit · Chaos · 5 Might
 *     "When another friendly unit dies, gain 1 XP."
 *   (+ contrast: Hostile Takeover sfd-202-221 "Take control of an enemy unit at a battlefield. Ready it. …
 *      Lose control of that unit and recall it at end of turn.")
 *
 * Question: earlier P1 resolved Possession on P2's vanilla X (3 Might, non-Recruit) and has since moved X
 * to battlefield C, which P1 holds with X alone. P1 controls Viktor in base; P2 controls Snapjaws in base.
 * On P2's turn P2 attacks C with a 5-Might unit and X takes lethal combat damage.
 *   (a) Whose trash does X go to?
 *   (b) Does P1's Viktor trigger? Where does the Recruit go and who owns/controls it?
 *   (c) Does P2's Snapjaws gain 1 XP — X is P2's card after all?
 *   (d) Contrast: X was taken with Hostile Takeover on P1's previous turn, reverted to P2 at end of that
 *       turn, and later dies under P2's control — which of Viktor / Snapjaws triggers then?
 *
 * Rules: 740.1.a / 740.1.b (friendly / enemy = by CONTROLLER), 127.1 (owner), 323.5 / 428.2 / 056.2
 * (killed permanents go to their OWNER's trash), 191.4.a (ability controller = source's controller),
 * 383.2.c (trigger condition evaluated right after the event — look back at the controller at death),
 * 182 / 183 (token controller / owner = controller of the creating effect), 477.1.a (control change is a
 * continuous effect; Hostile Takeover's ends at end of turn).
 *
 * Expected: (a) P2's trash. (b) Yes — Viktor triggers under P1; one 1-Might Recruit token in P1's base,
 * owned AND controlled by P1. (c) No — X's controller at death was P1, so X was an ENEMY of Snapjaws;
 * P2 still wins the combat and conquers C (+1). (d) Reversed: Snapjaws +1 XP for P2, no Recruit for P1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, passivePolicy, scenario } from "../../../harness";

const POSSESSION = "ogn-203-298";
const VIKTOR = "ogn-246-298";
const SNAPJAWS = "unl-129-219";
const HOSTILE_TAKEOVER = "sfd-202-221";

function recruitsIn(game: Game, ids: readonly string[]): string[] {
  return ids.filter((id) => game.state(id).name === "Recruit");
}

/**
 * P1's turn 2 with exactly Possession's cost. P2 holds bfA with X (3-Might vanilla) + a Guard (so bfA
 * stays P2's after X leaves). bfB is P1's with a 5-Might Sentinel (only used by the contrast). bfC is
 * empty and uncontrolled. P1: Viktor in base. P2: Snapjaws + a 5-Might Bruiser in base. Victory score
 * raised so incidental conquer/hold points never end the game.
 */
function board() {
  return scenario()
    .victoryScore(15)
    .resources(P1, { energy: 8, power: { chaos: 3 } })
    .battlefield("bfA", { controller: P2 })
    .battlefield("bfB", { controller: P1 })
    .battlefield("bfC", { controller: null })
    .unit(P2, "bfA", { might: 3, name: "Xerxes" }, "x")
    .unit(P2, "bfA", { might: 2, name: "P2 Guard" }, "guard")
    .unit(P1, "base", VIKTOR, "viktor")
    .unit(P1, "bfB", { might: 5, name: "P1 Sentinel" }, "sentinel")
    .unit(P2, "base", SNAPJAWS, "snap")
    .unit(P2, "base", { might: 5, name: "P2 Bruiser" }, "bruiser")
    .hand(P1, POSSESSION, "poss");
}

/** P1 Possesses X, marches it alone into empty bfC (conquer), and passes the turn: P2's open main phase. */
async function possessedAtC(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("poss", { targets: "x" });
  await game.settle();
  expect(game.state("x")).toMatchObject({ controller: P1, owner: P2, zone: "base" });
  await game.p1.move("x", "bfC");
  await game.settle();
  await game.settle(); // pass through any auto-begun non-combat showdown at the empty battlefield
  expect(game.state("x")).toMatchObject({ controller: P1, owner: P2, zone: "battlefield-bfC" });
  expect(game.gameState.battlefields.bfC?.controller).toBe(P1);
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  expect(game.phase()).toBe("main");
  return game;
}

/** …then P2's 5-Might Bruiser attacks bfC and combat resolves: the 3-Might X takes lethal damage. */
async function xDiesInCombat(): Promise<{ game: Game; triggers: Set<string> }> {
  const game = await possessedAtC();
  const p2PointsBefore = game.p2.points();
  await game.p2.move("bruiser", "bfC");
  const triggers = new Set<string>();
  await game.settle({
    policy: (d, g) => {
      for (const item of g.chain()) {
        if (item.triggered) {
          triggers.add(`${item.cardId}:${item.controller}`);
        }
      }
      return passivePolicy(d, g);
    },
  });
  expect(game.p2.points()).toBe(p2PointsBefore + 1); // P2 won the combat and conquered C
  return { game, triggers };
}

/**
 * Contrast (d): X alone at bfC under P2. P1 (Viktor in base, Sentinel 5 at bfB) casts Hostile Takeover on
 * X on P1's turn → conquers C; at end of turn X reverts to P2 and is recalled to P2's base. On P2's turn
 * P2 sends X (3) into P1's Sentinel (5) at bfB and X dies — under P2's control this time.
 */
async function revertedXDies(): Promise<{ game: Game; triggers: Set<string> }> {
  const game = await scenario()
    .victoryScore(15)
    .resources(P1, { energy: 5, power: { rainbow: 2 } })
    .battlefield("bfB", { controller: P1 })
    .battlefield("bfC", { controller: P2 })
    .unit(P2, "bfC", { might: 3, name: "Xerxes" }, "x")
    .unit(P1, "base", VIKTOR, "viktor")
    .unit(P1, "bfB", { might: 5, name: "P1 Sentinel" }, "sentinel")
    .unit(P2, "base", SNAPJAWS, "snap")
    .hand(P1, HOSTILE_TAKEOVER, "ht")
    .build();
  await game.p1.cast("ht", { targets: "x" });
  await game.settle();
  await game.settle(); // the auto-begun non-combat showdown at bfC, then conquer
  expect(game.state("x")).toMatchObject({ controller: P1, owner: P2, zone: "battlefield-bfC" });
  expect(game.gameState.battlefields.bfC?.controller).toBe(P1);
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  // Reverted at end of P1's turn and recalled to its owner's base.
  expect(game.state("x")).toMatchObject({ controller: P2, isReady: true, owner: P2, zone: "base" });
  await game.p2.move("x", "bfB");
  const triggers = new Set<string>();
  await game.settle({
    policy: (d, g) => {
      for (const item of g.chain()) {
        if (item.triggered) {
          triggers.add(`${item.cardId}:${item.controller}`);
        }
      }
      return passivePolicy(d, g);
    },
  });
  expect(game.zoneOf("x")).toBe("trash");
  expect(game.locationOf("sentinel")).toBe("bfB");
  return { game, triggers };
}

describe("Possessed unit dies in combat — Viktor (controller) vs Snapjaws (owner)", () => {
  test("setup: after Possession + move, X (owner P2) stands alone at bfC under P1's control on P2's turn; nobody has XP or Recruits yet", async () => {
    const game = await possessedAtC();
    expect(game.zoneOf("poss")).toBe("trash");
    expect(game.p1.units("bfC")).toEqual(["x"]);
    expect(game.p2.units("bfC")).toEqual([]);
    expect(game.state("x")).toMatchObject({ controller: P1, might: 3, owner: P2 });
    expect(game.p1.xp()).toBe(0);
    expect(game.p2.xp()).toBe(0);
    expect(recruitsIn(game, [...game.cardsAt("base", P1), ...game.cardsAt("base", P2)])).toEqual([]);
  });

  // ---- (a) whose trash --------------------------------------------------------------------------------

  test("(a) killed by P2's 5-Might Bruiser, X goes to its OWNER's (P2's) trash — never P1's; P2 conquers bfC (323.5, 428.2, 056.2, 127.1)", async () => {
    const { game } = await xDiesInCombat();
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.state("x").owner).toBe(P2);
    expect(game.p2.trash()).toContain("x");
    expect(game.p1.trash()).not.toContain("x");
    expect(game.locationOf("bruiser")).toBe("bfC");
    expect(game.state("bruiser").damage).toBe(0); // combat damage heals at end of combat
    expect(game.gameState.battlefields.bfC?.controller).toBe(P2);
  });

  // ---- (b) Viktor -----------------------------------------------------------------------------------------

  test("(b) Viktor's ability triggers, controlled by P1 — X was 'a non-Recruit unit you control' for P1 at the moment it died (740.1.a, 383.2.c, 191.4.a)", async () => {
    const { game, triggers } = await xDiesInCombat();
    expect([...triggers]).toContain(`viktor:${P1}`);
    expect([...triggers].filter((t) => t.startsWith("viktor:"))).toEqual([`viktor:${P1}`]);
    expect(game.chain()).toEqual([]);
  });

  test("(b) exactly one 1-Might Recruit token appears in P1's base (none in P2's), and P1 both CONTROLS and OWNS it (182, 183)", async () => {
    const { game } = await xDiesInCombat();
    const p1Recruits = recruitsIn(game, game.cardsAt("base", P1));
    expect(p1Recruits).toHaveLength(1);
    expect(game.state(p1Recruits[0] as string)).toMatchObject({ controller: P1, isToken: true, might: 1, owner: P1, zone: "base" });
    expect(recruitsIn(game, game.cardsAt("base", P2))).toEqual([]);
    expect(game.p1.units("base").sort()).toEqual([p1Recruits[0] as string, "viktor"].sort());
  });

  test("(b) the Recruit never 'reverts' to P2: two turns later it is still P1's, in P1's base", async () => {
    const { game } = await xDiesInCombat();
    const [recruit] = recruitsIn(game, game.cardsAt("base", P1));
    expect(recruit).toBeDefined();
    await game.advanceToTurnOf(P1);
    await game.advanceToTurnOf(P2);
    expect(game.state(recruit as string)).toMatchObject({ controller: P1, owner: P1, zone: "base" });
    expect(game.p2.units()).not.toContain(recruit as string);
  });

  // ---- (c) Snapjaws ---------------------------------------------------------------------------------------

  test("(c) P2's Snapjaws does NOT trigger and P2 gains no XP: X's controller at death was P1, so X was an ENEMY unit to Snapjaws even though P2 owns it (740.1.a / 740.1.b)", async () => {
    const { game, triggers } = await xDiesInCombat();
    expect([...triggers].some((t) => t.startsWith("snap:"))).toBe(false);
    expect(game.p2.xp()).toBe(0);
    expect(game.p1.xp()).toBe(0);
    expect(game.zoneOf("snap")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  // ---- (d) contrast: Hostile Takeover, reverted, dies under P2 ---------------------------------------------

  test("(d) contrast — after Hostile Takeover's control has reverted, X dying (3 into P1's 5-Might Sentinel) is 'another friendly unit' for P2's Snapjaws: it triggers under P2 and P2 gains exactly 1 XP", async () => {
    const { game, triggers } = await revertedXDies();
    expect([...triggers]).toContain(`snap:${P2}`);
    expect(game.p2.xp()).toBe(1);
    expect(game.p1.xp()).toBe(0);
    expect(game.p2.trash()).toContain("x"); // still the owner's trash, same as (a)
  });

  test("(d) contrast — …and it is NOT 'a unit you control' for P1's Viktor: no Viktor trigger, no Recruit token anywhere", async () => {
    const { game, triggers } = await revertedXDies();
    expect([...triggers].some((t) => t.startsWith("viktor:"))).toBe(false);
    expect(recruitsIn(game, [...game.cardsAt("base", P1), ...game.cardsAt("base", P2)])).toEqual([]);
    expect(game.p1.units("base")).toEqual(["viktor"]);
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
