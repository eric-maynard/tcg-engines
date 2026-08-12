/**
 * Interaction: an XP threshold crossed BETWEEN finalization and resolution.
 *   Master Yi, Unstoppable (unl-059-219) · Champion Unit · Calm · 12 + [calm][calm][calm] · 12 Might
 *     "[Level 3][>] I cost [2][calm] less. … [Level 16][>] I can't be chosen by enemy spells and abilities."
 *   Keeper of the Hammer (unl-203-219) · Legend · Body/Order
 *     "When you hold, gain 1 XP.  ·  Spend 3 XP, [Exhaust]: Draw 1."
 *   Singularity (ogn-105-298) · Spell · Mind · 6 + [mind][mind] — "Deal 6 to each of up to two units."
 *
 * Question. P1 sits on 15 XP with Yi and one other unit at a battlefield P1 holds, under the Keeper.
 *   (a) At 15 XP, is choosing Yi legal?
 *   (b) The Keeper's hold trigger takes P1 to 16 while Singularity — already finalized with Yi and the
 *       other unit chosen — is still on the chain. Is Singularity countered, re-targeted, or does it
 *       resolve and simply ignore Yi?
 *   (c) P1 later spends 3 XP with the Keeper (16 → 13): may a NEW enemy spell choose Yi, and may a
 *       Singularity already on the chain be re-pointed at him?
 *
 * Expected.
 *   (a) Yes. A [Level] threshold is read continuously off current XP (824.1.b.1 / 824.1.c: "while you
 *       have N or more XP, this card gains …"), so at 15 the Level 16 clause is Inactive and Yi is an
 *       ordinary legal target; Singularity is validly finalized with both units chosen.
 *   (b) Once P1 reaches 16 the clause turns on and Yi is Untargetable for enemy spells (757.1, 758).
 *       Singularity is NOT countered and NOT re-targeted: on resolution it MISTARGETS with respect to
 *       Yi only — he takes no damage and no instruction related to him is followed (758.1, 359.3.e.5)
 *       — while the other chosen unit still takes the full 6. No replacement target may be added
 *       (355.15).
 *   (c) Spending 3 XP is an Activated Ability, so it is legal only on P1's own turn in an Open State
 *       (381). At 13 the clause is Inactive again and any spell played AFTER that may choose Yi. A
 *       spell already finalized never acquires him — 758.2 makes an object legal only for spells whose
 *       target set is (re)determined while it is legal, and choices are locked at finalization
 *       (355.15). The flip is one-way in each direction and never rewrites an existing target set.
 *
 * Rules: 757 / 757.1, 758, 758.1, 758.2, 359.3.e.5, 355.15, 824, 381, 469.2.
 *
 * Construction note: Singularity carries no [Action] / [Reaction] line, so it is playable only in its
 * controller's own Main Phase — P2 can never play it inside P1's Beginning Phase, which is where the
 * Keeper's hold trigger lives. The threshold crossings that have to happen WHILE a finalized spell
 * sits on the chain are therefore driven with the raw `gainXp` / `spendXp` moves; the Keeper's own
 * hold trigger and its Spend-3-XP ability are exercised on their own turns in their own facets.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MASTER_YI = "unl-059-219";
const KEEPER_OF_THE_HAMMER = "unl-203-219";
const SINGULARITY = "ogn-105-298";

/** P1 at `xp` under the Keeper, with Yi and an 8-Might Grunt at the battlefield P1 holds. P2 holds one Singularity. */
function board(xp: number) {
  return scenario()
    .turn(2)
    .active(P2)
    .xp(P1, xp)
    .legend(P1, KEEPER_OF_THE_HAMMER, "keeper")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", MASTER_YI, "yi")
    .unit(P1, "bf1", { might: 8, name: "Grunt" }, "grunt")
    .resources(P2, { energy: 8, power: { mind: 2 } })
    .hand(P2, SINGULARITY, "sing");
}

/** The distinct card ids Singularity offers P2 as targets right now. */
function targetsOffered(game: Game): string[] {
  const field = game.p2.option("cast", "sing")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// (a) at 15 XP the Level 16 clause is inactive
// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("(a) 824 — the [Level 16] clause is read off CURRENT XP, so at 15 Yi is an ordinary target", () => {
  test("at 15 XP Singularity offers Yi, the Grunt, and the pair — 'up to two' also allows the empty set", async () => {
    const game = await board(15).build();
    expect(targetsOffered(game)).toEqual(expect.arrayContaining([game.card("yi"), game.card("grunt")]));
    const field = game.p2.option("cast", "sing")?.fields.find((f) => f.name === "targets");
    expect(field?.options).toEqual(expect.arrayContaining([["yi", "grunt"]]));
  });

  test("at 16 XP the clause is Active: Yi is absent from the offered set and naming him is refused outright (757.1, 758)", async () => {
    const game = await board(16).build();
    expect(targetsOffered(game)).toEqual([game.card("grunt")]);
    await expect(game.p2.cast("sing", { targets: ["yi", "grunt"] })).rejects.toThrow();
    await expect(game.p2.cast("sing", { targets: "yi" })).rejects.toThrow();
    expect(game.chain()).toEqual([]);
  });

  test("one XP either side of the line is the whole difference: 15 offers Yi, 16 does not — nothing else about the board changed", async () => {
    const at15 = await board(15).build();
    const at16 = await board(16).build();
    expect(at15.state("yi").might).toBe(at16.state("yi").might);
    expect(targetsOffered(at15)).toContain(at15.card("yi"));
    expect(targetsOffered(at16)).not.toContain(at16.card("yi"));
  });

  test("Singularity is validly finalized at 15 with BOTH units chosen and the target set rides on the chain item (355.15)", async () => {
    const game = await board(15).build();
    await game.p2.cast("sing", { targets: ["yi", "grunt"] });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "sing", controller: P2, targets: ["yi", "grunt"], triggered: false }),
    ]);
    expect(game.state("yi").damage).toBe(0); // nothing has resolved yet
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// The Keeper's hold trigger really does move P1 across the line
// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("469.2 — the hold that takes P1 from 15 to 16 XP, and what a spell played AFTER it may choose", () => {
  test("P1 maintains control of bf1 in its Beginning Phase: the Keeper's 'when you hold' trigger gains 1 XP (15 → 16) and the Hold also scores the point", async () => {
    const game = await board(15).build();
    expect(game.p1.xp()).toBe(15);
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.xp()).toBe(16);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
  });

  test("from that instant a spell whose targets are determined now cannot name Yi (758, 758.2 read forwards)", async () => {
    const game = await board(15).build();
    await game.p2.endTurn();
    await game.settle();
    await game.advanceTurn(); // → P2's Main Phase again, P1 now on 16 XP
    await game.p2.do("addResources", { energy: 8, power: { mind: 2 } });
    expect(game.p1.xp()).toBe(16);
    expect(targetsOffered(game)).not.toContain(game.card("yi"));
    await expect(game.p2.cast("sing", { targets: "yi" })).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// (b) crossing UP mid-chain: mistarget, not counter, not re-target
// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("(b) 758.1 / 359.3.e.5 — Yi becomes untargetable after being chosen: Singularity mistargets on him alone", () => {
  /** Finalize Singularity on [Yi, Grunt] at 15 XP, then take P1 to 16 while the spell sits on the chain. */
  async function crossedUp(): Promise<Game> {
    const game = await board(15).build();
    await game.p2.cast("sing", { targets: ["yi", "grunt"] });
    await game.p1.do("gainXp", { amount: 1 });
    expect(game.p1.xp()).toBe(16);
    return game;
  }

  test("the chain item is untouched by the crossing: still Singularity, still both targets, not countered (355.15)", async () => {
    const game = await crossedUp();
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "sing", controller: P2, countered: false, targets: ["yi", "grunt"] }),
    ]);
  });

  test("on resolution Yi is unaffected — 0 damage, undamaged and alive — while the Grunt takes the full 6", async () => {
    const game = await crossedUp();
    await game.settle();
    expect(game.state("yi").damage).toBe(0);
    expect(game.zoneOf("yi")).toBe("battlefield-bf1");
    expect(game.state("grunt").damage).toBe(6);
    expect(game.zoneOf("grunt")).toBe("battlefield-bf1"); // 8 Might survives 6
  });

  test("Singularity is NOT countered: it resolves and goes to the trash, and the chain is empty afterwards (359.3.e.5 — the rest of the spell still happens)", async () => {
    const game = await crossedUp();
    await game.settle();
    expect(game.zoneOf("sing")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control: WITHOUT the crossing the very same cast deals 6 to Yi as well — so it really is the threshold, not the targeting, that spares him", async () => {
    const game = await board(15).build();
    await game.p2.cast("sing", { targets: ["yi", "grunt"] });
    await game.settle();
    expect(game.state("yi").damage).toBe(6);
    expect(game.state("grunt").damage).toBe(6);
    expect(game.p1.xp()).toBe(15);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// (c) crossing DOWN: the flip is one-way and never rewrites a locked target set
// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("(c) 381 / 758.2 / 355.15 — spending 3 XP re-opens Yi for FUTURE spells only", () => {
  test("the Keeper's Spend-3-XP ability is an Activated Ability: it is not offered on P2's turn and is on P1's (381)", async () => {
    const canSpendXp = (g: Game): boolean => g.p1.legal().some((o) => o.key === "activateAbility:keeper#1");
    const game = await board(16).build(); // P2 is the turn player
    expect(canSpendXp(game)).toBe(false);
    await game.advanceTurn(); // → P1's Main Phase
    expect(game.turnPlayer()).toBe(P1);
    expect(canSpendXp(game)).toBe(true);
  });

  test("activating it spends 3 and draws 1 — P1's own Beginning Phase first holds bf1 for +1 XP (16 → 17), so the ability leaves P1 on 14 and Yi's clause goes Inactive (824.1.d)", async () => {
    const game = await board(16).build();
    await game.advanceTurn(); // → P1's turn: the Keeper's hold trigger banks 1 XP on the way in
    expect(game.p1.xp()).toBe(17);
    const hand = game.p1.hand().length;
    await game.p1.activate("keeper", 1);
    await game.settle();
    expect(game.p1.xp()).toBe(14);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.state("keeper").isExhausted).toBe(true);
  });

  test("a NEW spell played after the drop may choose Yi again — the flip is symmetric for target sets determined afterwards (758.2)", async () => {
    const game = await board(16).build();
    await game.advanceTurn(); // → P1's Main Phase
    await game.p1.activate("keeper", 1);
    await game.settle();
    expect(game.p1.xp()).toBe(14); // 16 + 1 (hold) − 3
    await game.advanceTurn(); // → P2's Main Phase
    await game.p2.do("addResources", { energy: 8, power: { mind: 2 } });
    expect(targetsOffered(game)).toEqual(expect.arrayContaining([game.card("yi"), game.card("grunt")]));
    await game.p2.cast("sing", { targets: ["yi", "grunt"] });
    await game.settle();
    expect(game.state("yi").damage).toBe(6);
  });

  test("a Singularity ALREADY finalized on the Grunt alone does not acquire Yi when P1 drops below 16 mid-chain — no target is added (355.15)", async () => {
    const game = await board(16).build();
    await game.p2.cast("sing", { targets: "grunt" }); // Yi was not choosable when this was finalized
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sing", targets: ["grunt"] })]);
    await game.p1.do("spendXp", { amount: 3 });
    expect(game.p1.xp()).toBe(13);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sing", targets: ["grunt"] })]);

    await game.settle();
    expect(game.state("grunt").damage).toBe(6);
    expect(game.state("yi").damage).toBe(0);
    expect(game.zoneOf("sing")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("and the mirror of (b): dropping below 16 while Yi is ALREADY a chosen target changes nothing — he was legal when chosen and is legal on resolution", async () => {
    const game = await board(15).build();
    await game.p2.cast("sing", { targets: ["yi", "grunt"] });
    await game.p1.do("gainXp", { amount: 1 }); // 16 — Yi untargetable
    await game.p1.do("spendXp", { amount: 3 }); // 13 — legal again, before resolution
    await game.settle();
    expect(game.p1.xp()).toBe(13);
    expect(game.state("yi").damage).toBe(6); // 758.2: legal at resolution ⇒ affected
    expect(game.state("grunt").damage).toBe(6);
  });
});
