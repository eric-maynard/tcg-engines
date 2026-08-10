/**
 * Interaction: Combat Experience (unl-031-219) · Spell · Calm · 1 · Reaction
 *     "Give a unit +1 [Might] this turn. [Level 6][>] Give it +3 [Might] this turn instead.
 *      (While you have 6+ XP, get the effect.)"
 *   × Vicious Snapjaws (unl-129-219) · Unit · Chaos · 5 · 5 Might
 *     "When another friendly unit dies, gain 1 XP."
 *   × Flurry of Blades (ogn-133-298) · Spell · Body · 1 · Reaction
 *     "Deal 1 to all units at battlefields."
 *   (+ a Recruit token ogn-271-298, 1 Might, and a vanilla 4-Might unit A at bf1.)
 *
 * Question: is a spell's [Level N] clause locked in when the spell is played, or evaluated when it
 * resolves? P1 has EXACTLY 5 XP, Snapjaws in base, and at bf1 a 4-Might unit A + a 1-Might Recruit R.
 * P1 plays Combat Experience on A; P2 responds with Flurry of Blades.
 *   (a) At the moment CE is finalized, which text applies / is anything locked?
 *   (b) Resolve LIFO: Flurry kills R → Snapjaws triggers ON TOP of the still-pending CE → P1 6 XP →
 *       CE resolves at Level 6 → A gets +3 (7 Might, 1 damage). P2's XP untouched.
 *   (c) NO side #1: P2 passes instead → CE resolves at 5 XP → +1 (A = 5).
 *   (d) NO side #2: Snapjaws and R belong to P2 (both players at 5 XP) → P2's XP moves 5→6, P1 stays
 *       at 5 → P1's CE gives +1; P2's 6 XP does not level up P1's spell.
 *
 * Rules: 824.1.b.1 (Level = "WHILE you have N+ XP, this card gains [Text]" — continuous, not a
 * play-time snapshot), 824.1.c / 824.1.d (Active/Inactive tracks the CONTROLLING player's XP),
 * 402.2 / 404.1 (only choices and costs are fixed while playing), 730.1 (gain XP), 729.2 / 732 (XP is
 * per player), 359.3.e.2 (target still legal at resolution), 322.1 (Cleanup after a chain item
 * resolves kills lethally damaged units before the next item), triggered abilities go on top of the
 * chain and resolve before older items (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const COMBAT_EXPERIENCE = "unl-031-219";
const SNAPJAWS = "unl-129-219";
const FLURRY = "ogn-133-298";
const RECRUIT_TOKEN = "ogn-271-298";

/**
 * P1's turn, open main phase. P1: 5 XP, Snapjaws in base, A (4) + Recruit R (1) at bf1, CE in hand
 * with exactly its [1]. P2: Flurry in hand with exactly its [1]; P2's own units sit in base (Flurry
 * only hits battlefields). `mirror` moves Snapjaws and the Recruit to P2 (Recruit at P2's bf2).
 */
function board(opts: { mirror?: boolean; p2xp?: number } = {}) {
  const b = scenario()
    .xp(P1, 5)
    .xp(P2, opts.p2xp ?? 0)
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 4, name: "Veteran A" }, "unitA")
    .hand(P1, COMBAT_EXPERIENCE, "ce")
    .hand(P2, FLURRY, "flurry");
  if (opts.mirror) {
    b.unit(P2, "base", SNAPJAWS, "snap").unit(P2, "bf2", RECRUIT_TOKEN, "recruit");
  } else {
    b.unit(P1, "base", SNAPJAWS, "snap").unit(P1, "bf1", RECRUIT_TOKEN, "recruit");
  }
  return b;
}

/** Every player passes priority once, starting with whoever holds it → the top chain item resolves. */
async function resolveTop(game: Game): Promise<void> {
  const n = game.chain().length;
  await game.acting().passPriority();
  if (game.chain().length >= n && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
}

/** CE cast on A, P2 responds with Flurry; nothing resolved yet. */
async function ceThenFlurry(opts: { mirror?: boolean; p2xp?: number } = {}): Promise<Game> {
  const game = await board(opts).build();
  await game.p1.cast("ce", { targets: "unitA" });
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  await game.p2.cast("flurry");
  expect(game.chain().map((i) => i.cardId)).toEqual(["ce", "flurry"]);
  return game;
}

describe("(a) finalizing Combat Experience at 5 XP locks its target and cost — not its Level text", () => {
  test("CE goes on the chain targeting A for exactly 1 energy; A is still a plain 4 (nothing applied yet); P1 still has 5 XP", async () => {
    const game = await board().build();
    expect(game.state("unitA").might).toBe(4);
    await game.p1.cast("ce", { targets: "unitA" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ce", controller: P1, targets: ["unitA"], triggered: false })]);
    expect(game.state("unitA").might).toBe(4);
    expect(game.p1.xp()).toBe(5);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("P2 may respond at Reaction speed: after P1 passes, Flurry of Blades is legal for P2 and lands ABOVE CE on the chain", async () => {
    const game = await board().build();
    await game.p1.cast("ce", { targets: "unitA" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "flurry")).toBe(true);
    await game.p2.cast("flurry");
    expect(game.chain().map((i) => i.cardId)).toEqual(["ce", "flurry"]);
    expect(game.p2.energy()).toBe(0);
  });
});

describe("(b) LIFO: Flurry → Recruit dies → Snapjaws trigger on top of CE → 6 XP → CE resolves as +3", () => {
  test("Flurry resolves first: A takes 1 (survives, 1 damage marked), the 1-Might Recruit is killed in the Cleanup and ceases to exist; Snapjaws in base is untouched (322.1)", async () => {
    const game = await ceThenFlurry();
    await resolveTop(game);
    expect(game.zoneOf("flurry")).toBe("trash");
    expect(game.state("unitA")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    expect(game.zoneOf("recruit")).toBe("gone");
    expect(game.state("snap")).toMatchObject({ damage: 0, zone: "base" });
  });

  test("Snapjaws' 'another friendly unit died' trigger is added ON TOP of the still-pending CE (chain = [ce, snap-trigger]); P1's XP is still 5 until it resolves", async () => {
    const game = await ceThenFlurry();
    await resolveTop(game);
    const chain = game.chain();
    expect(chain).toHaveLength(2);
    expect(chain[0]).toMatchObject({ cardId: "ce", controller: P1, triggered: false });
    expect(chain[1]).toMatchObject({ cardId: "snap", controller: P1, triggered: true });
    expect(game.p1.xp()).toBe(5);
    expect(game.state("unitA").might).toBe(4); // CE has not resolved
  });

  test("the trigger resolves next: P1 goes 5 → 6 XP (730.1) while CE is STILL on the chain; P2's XP unchanged", async () => {
    const game = await ceThenFlurry();
    await resolveTop(game); // flurry
    await resolveTop(game); // snapjaws trigger
    expect(game.p1.xp()).toBe(6);
    expect(game.p2.xp()).toBe(0);
    expect(game.chain().map((i) => i.cardId)).toEqual(["ce"]);
    expect(game.state("unitA").might).toBe(4);
  });

  test("CE finally resolves with its controller at 6 XP → the Level 6 text is Active and REPLACES the +1: A = 4 + 3 = 7 Might, still carrying 1 damage (824.1.b.1, 824.1.c)", async () => {
    const game = await ceThenFlurry();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ce")).toBe("trash");
    expect(game.p1.xp()).toBe(6);
    expect(game.p2.xp()).toBe(0);
    expect(game.state("unitA")).toMatchObject({ baseMight: 4, damage: 1, might: 7, zone: "battlefield-bf1" });
    expect(game.state("unitA").might).not.toBe(5); // not the play-time +1
    expect(game.state("unitA").might).not.toBe(8); // "instead": not +1 and +3
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) NO side #1 — P2 passes instead of playing Flurry", () => {
  test("CE resolves at 5 XP → only +1: A = 5, undamaged; Recruit alive; XP stays 5", async () => {
    const game = await board().build();
    await game.p1.cast("ce", { targets: "unitA" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("ce")).toBe("trash");
    expect(game.state("unitA")).toMatchObject({ damage: 0, might: 5 });
    expect(game.zoneOf("recruit")).toBe("battlefield-bf1");
    expect(game.p1.xp()).toBe(5);
    expect(game.p2.hand()).toContain("flurry");
  });
});

describe("(d) NO side #2 — Snapjaws and the Recruit are P2's (both players at 5 XP)", () => {
  test("same stack: Flurry kills P2's own Recruit at bf2 → P2's Snapjaws triggers under P2's control on top of CE", async () => {
    const game = await ceThenFlurry({ mirror: true, p2xp: 5 });
    await resolveTop(game);
    expect(game.zoneOf("recruit")).toBe("gone");
    expect(game.state("unitA").damage).toBe(1);
    const chain = game.chain();
    expect(chain).toHaveLength(2);
    expect(chain[0]).toMatchObject({ cardId: "ce", controller: P1 });
    expect(chain[1]).toMatchObject({ cardId: "snap", controller: P2, triggered: true });
  });

  test("XP is per player (729.2 / 732): P2 goes 5 → 6, P1 stays at 5 — so P1's CE resolves as +1 (A = 5 with 1 damage); P2's 6 XP does not activate Level text on P1's spell (824.1.c)", async () => {
    const game = await ceThenFlurry({ mirror: true, p2xp: 5 });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p2.xp()).toBe(6);
    expect(game.p1.xp()).toBe(5);
    expect(game.state("unitA")).toMatchObject({ damage: 1, might: 5, zone: "battlefield-bf1" });
    expect(game.zoneOf("ce")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("mirror sanity: a friendly-to-P1 death is what P1's Snapjaws needs — in the (d) layout P1 has no Snapjaws, so nothing of P1's triggers and only ONE trigger (P2's) ever appears", async () => {
    const game = await ceThenFlurry({ mirror: true, p2xp: 5 });
    await resolveTop(game);
    expect(game.chain().filter((i) => i.triggered)).toHaveLength(1);
    expect(game.chain().filter((i) => i.triggered && i.controller === P1)).toEqual([]);
  });
});
