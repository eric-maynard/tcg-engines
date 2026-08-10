/**
 * Interaction: Trinity Force (sfd-115-221) · Equipment · Body · 4 · +2 Might · [Equip] [body]
 *                Effect Text "When I hold, score 1 point."
 *            × Watchful Sentry (ogn-096-298) · Unit · Mind · 2 · 1 Might · "[Deathknell] — Draw 1."
 *            × Void Seeker (ogn-024-298) · Spell · Fury · 3 + [fury] · [Action] "Deal 4 to a unit at a
 *                battlefield. Draw 1."
 *
 * Question: P2's turn, Neutral Open. P1 controls bfA with Watchful Sentry wearing Trinity Force (1 + 2 = 3)
 * and a vanilla 3-Might unit V. P2 Void Seekers the Sentry (4 ≥ 3 → lethal; P2 draws 1).
 *   (a) Cleanup after Void Seeker leaves the chain: 3a queues the Sentry's Deathknell (P1) as a Pending
 *       item, 3b puts the Sentry in P1's trash — Trinity Force Detaches at bfA (719.5 / 435.4.b) — 4 keeps
 *       bfA with P1 (V is there), 5 Recalls the now-unattached gear to P1's base IN THE SAME CLEANUP
 *       (323.7 / 457.1 / 435.4.a; a corrective Recall, not a Move, 446.1). So by the first moment anyone
 *       could act, Trinity Force is already in P1's base, unattached, never in the trash; the only chain
 *       item is the Deathknell, which then resolves → P1 draws 1.
 *   (b) Next turn P1 holds bfA with V: the loose Force's Effect Text is Inactive (136.2.b / 724) → only the
 *       normal Hold point. [Equip] is a Main-Phase activation, which comes after the Scoring Step
 *       (315.2.b) — too late for this hold, in time for the following one.
 *   (c) Contrast: had the Force been on V (the survivor), V holds next Beginning Phase wearing it → the
 *       appended "When I hold, score 1 point" fires → 2 points that turn.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TRINITY_FORCE = "sfd-115-221";
const WATCHFUL_SENTRY = "ogn-096-298";
const VOID_SEEKER = "ogn-024-298";

/**
 * P2's turn 2, main phase. bfA is P1's: Watchful Sentry + vanilla V (3), Trinity Force worn by `wearer`.
 * P2: Void Seeker in hand with exactly 3 energy + [fury].
 */
function board(wearer: "sentry" | "V" = "sentry") {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { fury: 1 } })
    .battlefield("bfA", { controller: P1 })
    .unit(P1, "bfA", WATCHFUL_SENTRY, "sentry", wearer === "sentry" ? { equippedWith: ["tf"] } : undefined)
    .unit(P1, "bfA", { might: 3, name: "Vanilla V" }, "V", wearer === "V" ? { equippedWith: ["tf"] } : undefined)
    .card("tf", { def: TRINITY_FORCE, meta: { attachedTo: wearer }, owner: P1, zone: "bfA" })
    .hand(P2, VOID_SEEKER, "vs");
}

/** P2 casts Void Seeker on the Sentry and both pass once → the spell resolves and leaves the chain. */
async function voidSeekerResolved(wearer: "sentry" | "V" = "sentry"): Promise<{ game: Game; p1Hand: number; p2Hand: number }> {
  const game = await board(wearer).build();
  const p1Hand = game.p1.hand().length;
  const p2Hand = game.p2.hand().length;
  await game.p2.cast("vs", { targets: "sentry" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  return { game, p1Hand, p2Hand };
}

const isOpenMain = (d: Decision | null) => d?.kind === "action" && d.context === "main";

describe("Trinity Force bearer dies to Void Seeker — detach, same-Cleanup recall, Deathknell, and the lost hold bonus", () => {
  test("setup: the Sentry wears the Force at bfA (1 + 2 = 3), V is a bare 3; Void Seeker offers exactly the two units at the battlefield", async () => {
    const game = await board().build();
    expect(game.state("sentry")).toMatchObject({ attachments: ["tf"], baseMight: 1, location: "bfA", might: 3 });
    expect(game.state("tf")).toMatchObject({ attachedTo: "sentry", controller: P1, zone: "battlefield-bfA" });
    expect(game.state("V")).toMatchObject({ attachments: [], might: 3 });
    const offered = (game.p2.option("cast", "vs")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect([...offered].sort()).toEqual(["V", "sentry"]);
  });

  // ---------------------------------------------------------------- (a) the Cleanup after Void Seeker

  test("(a) Void Seeker resolves entirely first: 4 ≥ 3 is lethal → Sentry in P1's trash, P2 drew 1, the spell is in P2's trash (319.5)", async () => {
    const { game, p2Hand } = await voidSeekerResolved();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.trash()).toContain("sentry");
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 1); // spent Void Seeker, drew 1
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("(a) 3a before 3b: at the very first decision after the spell left the chain, the Sentry's Deathknell is the lone chain item, controlled by P1, not yet resolved (323.4 / 808.1.d.2)", async () => {
    const { game, p1Hand } = await voidSeekerResolved();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sentry", controller: P1, triggered: true })]);
    expect(game.p1.hand()).toHaveLength(p1Hand); // the draw is still on the chain
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("(a) task 5 ran in the SAME Cleanup as 3b: at that first decision Trinity Force is already in P1's base, unattached — there is no priority window with it lying at bfA (323.7 / 457.1 / 435.4.a)", async () => {
    const { game } = await voidSeekerResolved();
    // First moment anyone could act after the kill:
    expect(game.decision()?.kind).toBe("action");
    expect(game.zoneOf("tf")).toBe("base");
    expect(game.state("tf")).toMatchObject({ attachedTo: undefined, controller: P1, location: "base", owner: P1 });
    expect(game.cardsAt("battlefield-bfA")).not.toContain("tf");
    expect(game.p1.gear()).toEqual(["tf"]);
  });

  test("(a) the Force is NOT killed: never in any trash; bfA stays P1's (V is still there, task 4 changes nothing)", async () => {
    const { game } = await voidSeekerResolved();
    await game.settle();
    expect(game.p1.trash()).not.toContain("tf");
    expect(game.p2.trash()).not.toContain("tf");
    expect(game.zoneOf("tf")).toBe("base");
    expect(game.locationOf("V")).toBe("bfA");
    expect(game.state("V")).toMatchObject({ attachments: [], damage: 0, might: 3 });
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("(a) only after the Cleanups does the Deathknell finalize/resolve (320): both pass → P1 draws exactly 1, chain empty, back to P2's Neutral Open main phase", async () => {
    const { game, p1Hand, p2Hand } = await voidSeekerResolved();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    expect(game.p2.hand()).toHaveLength(p2Hand); // −1 spell +1 draw
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.turnPlayer()).toBe(P2);
  });

  test("(a) walking every decision from the cast to P2's open main phase: Trinity Force is never observed at bfA nor in a trash at any point a player could act", async () => {
    const game = await board().build();
    await game.p2.cast("vs", { targets: "sentry" });
    const seen: string[] = [];
    for (let i = 0; i < 20; i++) {
      const d = game.decision();
      if (game.zoneOf("sentry") === "trash") {
        seen.push(game.zoneOf("tf"));
      }
      if (isOpenMain(d)) {
        break;
      }
      await game.settle({ maxSteps: 1 });
    }
    expect(isOpenMain(game.decision())).toBe(true);
    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen)).toEqual(new Set(["base"]));
  });

  // ---------------------------------------------------------------- (b) next turn: no bonus from a loose Force

  test("(b) P1's next turn: V holds bfA → exactly 1 point (the Hold); the unattached Force's 'When I hold, score 1 point' is Inactive (136.2.b / 724)", async () => {
    const { game } = await voidSeekerResolved();
    await game.settle();
    expect(game.p1.points()).toBe(0);
    await game.advanceTurn(); // P2 ends → P1's Beginning (Scoring Step: Hold bfA) → … → P1's main
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.state("tf").attachedTo).toBeUndefined();
  });

  test("(b) no way to re-Equip 'in time': from P2's end of turn to P1's main phase P1 never holds an action decision offering [Equip] before the Hold point is already scored (315.2.b precedes the Action Phase)", async () => {
    const { game } = await voidSeekerResolved();
    await game.settle();
    await game.p2.endTurn();
    let equipOfferedBeforeScoring = false;
    for (let i = 0; i < 30; i++) {
      const d = game.decision();
      if (d?.seat === P1 && game.p1.points() === 0 && game.p1.legal().some((o) => o.moveId === "equipCard")) {
        equipOfferedBeforeScoring = true;
      }
      if (isOpenMain(d) && game.turnPlayer() === P1) {
        break;
      }
      await game.settle({ maxSteps: 1 });
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(equipOfferedBeforeScoring).toBe(false);
    expect(game.p1.points()).toBe(1);
  });

  test("(b) …but in that Main Phase, with [body] floating, [Equip] onto V is legal (435.1.c) → V is 5; on P1's FOLLOWING turn the hold is worth 1 + 1", async () => {
    const { game } = await voidSeekerResolved();
    await game.settle();
    await game.advanceTurn();
    expect(game.p1.points()).toBe(1);
    await game.p1.do("addResources", { power: { body: 1 } });
    const equipUnits = game.p1
      .legal()
      .filter((o) => o.moveId === "equipCard")
      .flatMap((o) => o.variants)
      .filter((v) => v.params.equipmentId === "tf")
      .map((v) => v.params.unitId as string);
    expect(equipUnits).toEqual(["V"]);
    await game.p1.choose("equipCard", { params: { equipmentId: "tf", unitId: "V" } });
    await game.settle();
    expect(game.p1.power("body")).toBe(0);
    expect(game.state("tf")).toMatchObject({ attachedTo: "V", location: "bfA" });
    expect(game.state("V")).toMatchObject({ attachments: ["tf"], might: 5 });
    expect(game.p1.points()).toBe(1); // equipping now does not retro-score this turn's hold
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1: Hold (1) + Trinity Force on the holder (1)
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(3);
  });

  // ---------------------------------------------------------------- (c) contrast: the Force on the survivor

  test("(c) contrast — Force worn by V instead: the bare 1-Might Sentry still dies to 4 (P1 draws 1 off Deathknell), the Force stays attached to V at bfA", async () => {
    const { game, p1Hand } = await voidSeekerResolved("V");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    expect(game.state("tf")).toMatchObject({ attachedTo: "V", location: "bfA", zone: "battlefield-bfA" });
    expect(game.state("V")).toMatchObject({ attachments: ["tf"], might: 5 });
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
  });

  test("(c) contrast — next turn V holds bfA WEARING the Force: Hold point + 'When I hold, score 1 point' = 2 points (vs 1 in (b))", async () => {
    const { game } = await voidSeekerResolved("V");
    await game.settle();
    expect(game.p1.points()).toBe(0);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
