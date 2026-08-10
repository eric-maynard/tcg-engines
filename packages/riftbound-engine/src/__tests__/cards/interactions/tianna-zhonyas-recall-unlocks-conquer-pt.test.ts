/**
 * Interaction: a replacement RECALL in the Combat Cleanup switches OFF a "While I'm at a battlefield"
 * static in time for that same combat's Conquer point (rule 456.2).
 *   Tianna Crownguard (sfd-060-221) · Unit · Calm · 7 · 4 Might
 *     "[Deflect] While I'm at a battlefield, opponents can't gain points."
 *   × Zhonya's Hourglass (ogn-077-298) · Gear · Calm · 2
 *     "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Playful Phantom (ogn-049-298) · Unit · Calm · 5 · 5 Might (attacker).
 *   (+ Vanguard Sergeant ogn-219-298, vanilla 4 Might, as the (b) defender.)
 *
 * Question. P2 controls bf1 with a lone Tianna and has a face-up Zhonya's in base; P1 (3 pts) attacks
 * bf1 with Phantom, nobody responds. (a) 5→Tianna (lethal) / 4→Phantom; Zhonya's replaces Tianna's
 * death (heal, exhaust, recall). Does P1 WIN (not "No Result"), conquer bf1 and GAIN the point although
 * Tianna is still on the board? Tianna's state, Hourglass's zone, any move trigger? (b) Tianna at P2's
 * OTHER battlefield bf2, bf1 held by a Sergeant that dies — P1 conquers bf1 but gains how many? (c) no
 * Zhonya's — Tianna dies; does P1 score?
 *
 * Rules: 465.2 (simultaneous combat damage), 466.1 / 466.3.a / 466.3.d (winner = sole designated player
 * with units; "No Result" only counts step-3d recalls), 369 / 370.1 / 373.1.a (mandatory replacement,
 * executed immediately), 455 / 456 / 456.1 / 456.2 (Recall: not a Move, no move triggers, location
 * changes at once), 458.1 (same object), 466.5.d / 469.1 / 471.1 (establish control → Conquer → +1),
 * 054.1 (can't beats can — only while the static is in force).
 *
 * Expected: (a) Hourglass → P2 trash; Tianna = same object in P2's base, exhausted, 0 damage, Deflect
 * intact; Phantom healed (0 dmg, 5 Might), exhausted at bf1; P1 WON, conquers bf1, 3→4. No move
 * trigger / no move counted for P2. (b) Sergeant → trash, P1 conquers bf1 (controller P1, conquered
 * this turn) but stays on 3 — Tianna is still at bf2. (c) Tianna → trash, P1 conquers and scores 3→4.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIANNA = "sfd-060-221";
const ZHONYAS = "ogn-077-298";
const PHANTOM = "ogn-049-298";
const SERGEANT = "ogn-219-298";

/**
 * P1's turn (3 points). P2 controls bf1 and bf2 (a 1-Might Holder keeps bf2 durable). Phantom ready in
 * P1's base. `tiannaAt` places Tianna; `zhonyas` puts a face-up Hourglass in P2's base; `sergeant`
 * puts a Vanguard Sergeant on bf1.
 */
function board(opts: { tiannaAt: "bf1" | "bf2"; zhonyas: boolean; sergeant?: boolean }) {
  let b = scenario()
    .points(P1, 3)
    .points(P2, 0)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 1, name: "Holder" }, "holder")
    .unit(P2, opts.tiannaAt, TIANNA, "tianna")
    .unit(P1, "base", PHANTOM, "phantom");
  if (opts.sergeant) {
    b = b.unit(P2, "bf1", SERGEANT, "sergeant");
  }
  if (opts.zhonyas) {
    b = b.gear(P2, ZHONYAS, "zh");
  }
  return b;
}

/** Phantom attacks bf1; nobody responds; combat resolves; back to P1's open main phase. */
async function attack(game: Game): Promise<void> {
  await game.p1.move("phantom", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  const s = await game.settle();
  expect(s.reason).toBe("open");
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
}

describe("(a) Tianna alone at bf1 + Zhonya's: the 3b replacement recall takes her static offline before the conquer is scored", () => {
  test("the combat is Phantom (attacker, 5) vs Tianna (defender, 4) at bf1", async () => {
    const game = await board({ tiannaAt: "bf1", zhonyas: true }).build();
    await game.p1.move("phantom", "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.state("phantom").combatRole).toBe("attacker");
    expect(game.state("tianna").combatRole).toBe("defender");
    expect(game.state("tianna").might).toBe(4);
    expect(game.state("phantom").might).toBe(5);
  });

  test("Zhonya's replaces Tianna's death: the Hourglass is killed to P2's trash; Tianna is the SAME object, now in P2's base, exhausted, undamaged, Deflect intact (369, 370.1, 373.1.a, 455, 458.1)", async () => {
    const game = await board({ tiannaAt: "bf1", zhonyas: true }).build();
    await attack(game);
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.p2.trash()).toContain("zh");
    expect(game.has("tianna")).toBe(true);
    expect(game.state("tianna")).toMatchObject({
      controller: P2,
      damage: 0,
      isExhausted: true,
      location: "base",
      might: 4,
      owner: P2,
      zone: "base",
    });
    expect(game.state("tianna").keywords).toContain("Deflect");
    expect(game.p2.trash()).not.toContain("tianna");
  });

  test("the recall is not a Move: nothing was put on the chain and no move is counted for P2 (456, 456.1)", async () => {
    const game = await board({ tiannaAt: "bf1", zhonyas: true }).build();
    await attack(game);
    expect(game.chain()).toEqual([]);
    expect(game.gameState.unitsMovedThisTurn?.[P2] ?? 0).toBe(0);
    expect(game.gameState.unitsMovedThisTurn?.[P1]).toBe(1); // Phantom's Standard Move only
  });

  test("Phantom is healed in the cleanup (0 damage, 5 Might), stays at bf1 exhausted — the attacker is NOT recalled (466.3.a: P1 WON, not 'No Result')", async () => {
    const game = await board({ tiannaAt: "bf1", zhonyas: true }).build();
    await attack(game);
    expect(game.state("phantom")).toMatchObject({ damage: 0, isExhausted: true, location: "bf1", might: 5 });
    expect(game.p1.units("bf1")).toEqual(["phantom"]);
    expect(game.p2.units("bf1")).toEqual([]);
  });

  test("P1 establishes control of bf1 = Conquer, and GAINS the point (3 → 4): Tianna is in base when 471.1 is processed, so her static is not in force (456.2, 466.5.d, 469.1)", async () => {
    const game = await board({ tiannaAt: "bf1", zhonyas: true }).build();
    await attack(game);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.gameState.conqueredThisTurn?.[P1]).toEqual(["bf1"]);
    expect(game.p1.points()).toBe(4);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) NO-side contrast — Tianna stands at bf2; a vanilla Sergeant defends bf1 and dies", () => {
  test("Sergeant → P2's trash, P1 wins and conquers bf1 (controller P1, conquered this turn) but gains ZERO points — Tianna is still at a battlefield (054.1 beats 471.1)", async () => {
    const game = await board({ sergeant: true, tiannaAt: "bf2", zhonyas: false }).build();
    await attack(game);
    expect(game.zoneOf("sergeant")).toBe("trash");
    expect(game.state("tianna").location).toBe("bf2");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.gameState.conqueredThisTurn?.[P1]).toEqual(["bf1"]);
    expect(game.p1.points()).toBe(3);
    expect(game.p2.points()).toBe(0);
    expect(game.state("phantom")).toMatchObject({ damage: 0, isExhausted: true, location: "bf1" });
    expect(game.violations()).toEqual([]);
  });

  test("with Zhonya's ALSO present the Sergeant is saved to base instead — still a P1 conquer of bf1, still 0 points while Tianna holds bf2", async () => {
    const game = await board({ sergeant: true, tiannaAt: "bf2", zhonyas: true }).build();
    await attack(game);
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("sergeant")).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(3);
  });
});

describe("(c) control — no Zhonya's at all: Tianna simply dies", () => {
  test("Tianna → P2's trash; P1 conquers bf1 and scores 3 → 4 (same result as (a))", async () => {
    const game = await board({ tiannaAt: "bf1", zhonyas: false }).build();
    await attack(game);
    expect(game.zoneOf("tianna")).toBe("trash");
    expect(game.p2.trash()).toContain("tianna");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(4);
    expect(game.state("phantom")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.violations()).toEqual([]);
  });

  test("discriminator: (a) and (c) score, (b) does not — the only difference between (a) and (b) is Tianna's post-cleanup LOCATION", async () => {
    const a = await board({ tiannaAt: "bf1", zhonyas: true }).build();
    await attack(a);
    const b = await board({ sergeant: true, tiannaAt: "bf2", zhonyas: false }).build();
    await attack(b);
    const c = await board({ tiannaAt: "bf1", zhonyas: false }).build();
    await attack(c);
    expect([a.state("tianna").location, a.p1.points()]).toEqual(["base", 4]);
    expect([b.state("tianna").location, b.p1.points()]).toEqual(["bf2", 3]);
    expect([c.zoneOf("tianna"), c.p1.points()]).toEqual(["trash", 4]);
    // all three are conquers of bf1 by P1
    for (const g of [a, b, c]) {
      expect(g.gameState.battlefields.bf1?.controller).toBe(P1);
      expect(g.gameState.conqueredThisTurn?.[P1]).toEqual(["bf1"]);
    }
  });
});
