/**
 * Interaction: Spirit's Refuge (ogn-063-298) "When you play this, buff a friendly unit. /
 *              Friendly buffed units have [Deflect] if they didn't already."
 *            × Enthusiastic Promoter (unl-043-219) "When I hold, [Buff] all units here."
 *            × Lee Sin, Ascetic (ogn-078-298) "[Exhaust]: Buff me. / I can have any number of buffs."
 *
 * Q: The Refuge buffs the Promoter on play; next Beginning Phase the Promoter holds and buffs
 *    every unit here — itself and Lee Sin included. A client glosses this as "rule 733: buffs
 *    stack and each adds +1 Might".
 *    (a) After the hold trigger, how many buffs and how much buff Might does the Promoter have?
 *        Lee Sin? (b) Does a second buff grant a SECOND [Deflect] instance (a 2-Power tax)?
 *    (c) Is "buffs stack" true, and is 733 the right citation?
 *
 * Rules:
 *   702.2.a     to Buff a unit, choose a unit and place a buff on it
 *   702.3       there can only be ONE Buff on a Unit at a time
 *   702.3.a     a Buff added to an already-buffed unit is NOT PLACED instead
 *   426.1.b.1   "if the unit already has a Buff Counter on it, it does not get another one"
 *   426.1.b.2   an effect may grant permission to be Buffed multiple times; it ignores 426.1.b.1
 *   426.1.c     an already-buffed unit is STILL a legal choice — it just isn't buffed by it
 *   703         each Buff individually contributes +1 Might
 *   809.1.c     [Deflect] taxes each TIME an opponent chooses the unit — it is not per buff
 *   733         "There is no limit to an amount of XP a player can accrue." — the XP rule.
 *               It has nothing to do with buffs and is the wrong citation for any of this.
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPIRITS_REFUGE = "ogn-063-298";
const PROMOTER = "unl-043-219";
const LEE_SIN = "ogn-078-298";

/** "[Action] Deal 1 to a unit." — the probe for the [Deflect] surcharge. */
const BOLT = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

/** P1 holds bf1 with the Promoter, Lee Sin and a vanilla Grunt; two Refuges in hand. */
function board() {
  return scenario()
    .active(P1)
    .resources(P1, { energy: 4, power: { calm: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", PROMOTER, "promoter")
    .unit(P1, "bf1", LEE_SIN, "lee")
    .unit(P1, "bf1", { might: 2, name: "Grunt" }, "grunt")
    .hand(P1, SPIRITS_REFUGE, "refuge")
    .hand(P1, SPIRITS_REFUGE, "refuge2")
    .hand(P2, BOLT, "bolt");
}

/**
 * Lee Sin buffs himself, the Refuge buffs the Promoter, then two turns pass so the Promoter
 * holds bf1 and its trigger buffs every unit here (itself, Lee Sin, the Grunt).
 */
async function afterTheHold(): Promise<Game> {
  const game = await board().build();
  await game.p1.activate("lee"); // [Exhaust]: Buff me — buff #1 on Lee Sin
  await game.settle();
  await game.p1.play("refuge", { answers: ["promoter"] }); // buff #1 on the Promoter
  await game.settle();
  expect(game.state("promoter").isBuffed).toBe(true);
  expect(game.state("lee").isBuffed).toBe(true);
  expect(game.state("grunt").isBuffed).toBe(false);

  await game.advanceTurn(); // → P2's turn
  await game.advanceTurn(); // → P1's turn: the Promoter holds bf1, "[Buff] all units here" fires
  expect(game.turnPlayer()).toBe(P1);
  return game;
}

/** Buff-Might = effective Might over printed Might (nothing else modifies these units). */
const buffMight = (game: Game, alias: string) => game.state(alias).might - game.state(alias).baseMight;

describe("A second buff places no counter — Spirit's Refuge × Enthusiastic Promoter × Lee Sin, Ascetic", () => {
  test("(a) the Promoter keeps exactly ONE buff: +1 Might, not +2 (702.3 / 702.3.a / 426.1.b.1)", async () => {
    const game = await afterTheHold();
    expect(game.state("promoter").isBuffed).toBe(true);
    expect(buffMight(game, "promoter")).toBe(1);
    expect(game.state("promoter").might).toBe(3); // printed 2 + one buff
    // The engine's second-buff bookkeeping: no "extra buff" was recorded for it at all.
    expect(game.state("promoter").meta.extraBuffs).toBeUndefined();
  });

  test("(a) Lee Sin holds the 426.1.b.2 permission, so the second buff DOES land: 2 buffs, +2 Might (703)", async () => {
    const game = await afterTheHold();
    expect(game.state("lee").isBuffed).toBe(true);
    expect(game.state("lee").meta.extraBuffs).toBe(1); // one buff beyond the first
    expect(buffMight(game, "lee")).toBe(2);
    expect(game.state("lee").might).toBe(7); // printed 5 + 1 + 1
  });

  test("(a) the previously-unbuffed Grunt takes its first buff normally: +1 (702.2.a)", async () => {
    const game = await afterTheHold();
    expect(game.state("grunt").isBuffed).toBe(true);
    expect(buffMight(game, "grunt")).toBe(1);
  });

  test("426.1.c — an already-buffed unit is still a LEGAL CHOICE for a buff instruction; choosing it just places nothing", async () => {
    const game = await afterTheHold();
    await game.p1.do("addResources", { energy: 2, power: { calm: 1 } });
    const before = game.state("promoter").might;
    // The second Refuge still offers the buffed Promoter…
    await game.p1.play("refuge2");
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    expect(d?.seat).toBe(P1);
    expect((d as PickDecision).options.map((o) => o.card)).toContain(game.card("promoter"));
    // …and choosing it is legal and resolves, but no second buff is placed.
    await game.p1.pick("promoter");
    await game.settle();
    expect(game.state("promoter").might).toBe(before);
    expect(buffMight(game, "promoter")).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("(b) the [Deflect] the Refuge grants is per STATUS, not per buff: the tax is [rainbow] once, even for Lee Sin at 2 buffs (809.1.c)", async () => {
    const game = await afterTheHold();
    // Exactly ONE granted Deflect on each buffed unit — never one per counter.
    for (const alias of ["promoter", "lee", "grunt"]) {
      expect(game.state(alias).grantedKeywords.filter((k) => k.keyword === "Deflect")).toHaveLength(1);
      expect(game.state(alias).keywords).toContain("Deflect");
    }
    await game.advanceTurn(); // → P2's turn, so an opponent's spell can be priced
    await game.p2.do("addResources", { energy: 3, power: { rainbow: 2 } });
    const field = game.p2.option("cast", "bolt")?.fields.find((f) => f.name === "targets");
    expect(field?.options).toEqual([[game.card("promoter")], [game.card("lee")], [game.card("grunt")]]);
    expect(field?.surcharge).toEqual([1, 1, 1]); // Lee Sin's 2 buffs do NOT make it 2

    await game.p2.cast("bolt", { targets: "lee" });
    expect(game.p2.resources()).toEqual({ energy: 2, power: { rainbow: 1 } }); // 1 energy + ONE rainbow
    await game.settle();
    expect(game.state("lee").damage).toBe(1);
  });

  test("(c) 'buffs stack' is FALSE as a general statement — the same double-buffing gives a vanilla unit +1 and Lee Sin +2", async () => {
    const game = await afterTheHold();
    // The Grunt is now buffed; buff it again with the second Refuge and it stays at +1.
    await game.p1.do("addResources", { energy: 2, power: { calm: 1 } });
    await game.p1.play("refuge2", { answers: ["grunt"] });
    await game.settle();
    expect(buffMight(game, "grunt")).toBe(1);
    expect(game.state("grunt").meta.extraBuffs).toBeUndefined();
    // Only the printed permission stacks (426.1.b.2), and each buff is worth exactly +1 (703).
    expect(buffMight(game, "lee")).toBe(2);
    expect(buffMight(game, "promoter")).toBe(1);
  });

  test("(c) 733 is the XP-accrual cap and is untouched by any of this — no buff moved a single XP", async () => {
    const game = await afterTheHold();
    expect(game.p1.xp()).toBe(0);
    expect(game.p2.xp()).toBe(0);
    await game.p1.do("addResources", { energy: 2, power: { calm: 1 } });
    await game.p1.play("refuge2", { answers: ["lee"] }); // a third buff attempt on Lee Sin
    await game.settle();
    expect(game.p1.xp()).toBe(0);
    // …and the permission keeps working: a third buff is a third +1.
    expect(buffMight(game, "lee")).toBe(3);
    expect(game.violations()).toEqual([]);
  });
});
