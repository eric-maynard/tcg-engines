/**
 * Interaction: Elder Dragon (unl-118-219) · "Any amount of your damage is enough to kill enemy units."
 *   × Falling Star (ogn-029-298) · Fury spell · 2 + [fury][fury] · "Deal 3 to a unit. Deal 3 to a unit."
 *   × The Boss (ogn-269-298) · Legend · "If a buffed unit you control would die, you may pay
 *      [rainbow], exhaust me, and spend its buff to heal it, exhaust it, and recall it instead."
 *
 * Rules: 142.4.a (Lethal Damage = the marked amount that kills the unit in a Cleanup), 142.4.b
 * (normally Might or more), 142.4.c (effects may alter that amount — the CR names Elder Dragon
 * as the example), 142.3.a / 142.3.b ("your damage" = damage marked by the player responsible
 * for the Deal), 321 / 321.1 (no Cleanup runs during the resolution of a chain item), 319.5 /
 * 323.5 (the Cleanup happens once the item has finished resolving), 702.2.b (spending a buff
 * removes the buff counter), 703 (buffs), 418.1 (recall = send to base, not a move), 428.5.c
 * (a Cleanup kill is attributed to the spell that dealt the damage), 359.3.e.5 (an illegal
 * target is simply unaffected).
 *
 * Question: P1 has Elder Dragon in base. P2 has a buffed vanilla B at bf1 (printed 4, +1 buff =
 * 5 Might) and The Boss ready with 1 [rainbow]. P1 casts Falling Star naming B for BOTH instances.
 *   (a) At WHICH instance does B carry lethal damage — and therefore at which instance is The
 *       Boss offered: instance 1 (Dragon out) or instance 2 (no Dragon)?
 *   (b) After P2 accepts at instance 1 and B is healed, unbuffed and recalled to base, does
 *       instance 2 still hit B, is 3 lethal on it again, and can The Boss save it twice?
 *   (c) Does the Dragon's clause touch P1's OWN units, or damage that P2 marks on P2's units?
 *
 * Expected: (a) with the Dragon out ANY nonzero amount of P1's damage is lethal, so the prompt
 * comes after instance 1 with 3 marked; without the Dragon 3/5 is not lethal and the prompt only
 * comes after instance 2, with 6 marked. Same play, different instance. (b) the save costs
 * [rainbow] + exhaust The Boss + B's buff (so B is now an UNBUFFED 4-Might unit in base);
 * instance 2 targets "a unit" with no location clause, so it still hits B for 3, which is lethal
 * again under the Dragon — but The Boss is exhausted and its "a buffed unit you control"
 * condition no longer holds, so B dies in the single Cleanup after Falling Star leaves the chain.
 * Without the Dragon the identical line ends with B ALIVE in base at 4 Might, 0 damage.
 * (c) neither: "enemy units" is relative to the Dragon and "your damage" is the Dragon
 * controller's damage — P2 dealing 3 to their own 5-Might unit is not lethal and asks nothing.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ELDER_DRAGON = "unl-118-219";
const FALLING_STAR = "ogn-029-298";
const THE_BOSS = "ogn-269-298";

/**
 * P1's main phase. P2 has the buffed B (printed 4 + buff = 5) plus a 9-Might anchor holding bf1,
 * The Boss ready with 2 [rainbow] in the pool. P1 holds Falling Star.
 */
function board(opts: { dragon?: boolean; boss?: boolean; buffed?: boolean } = {}) {
  const { boss = true, buffed = true, dragon = true } = opts;
  let s = scenario()
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .resources(P2, { power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "B" }, "b", buffed ? { buffed: true } : undefined)
    .unit(P2, "bf1", { might: 9, name: "Anchor" }, "anchor")
    .hand(P1, FALLING_STAR, "fs");
  if (boss) {
    s = s.legend(P2, THE_BOSS, "boss");
  }
  if (dragon) {
    s = s.unit(P1, "base", ELDER_DRAGON, "dragon");
  }
  return s;
}

/** Cast Falling Star at B twice and run until something is asked (or the board reopens). */
async function bothInstancesAtB(game: Game): Promise<string | undefined> {
  await game.p1.cast("fs", { targets: ["b", "b"] });
  return (await game.settle()).reason;
}

describe("Elder Dragon × Falling Star × The Boss — which instance is lethal decides which instance prompts", () => {
  // ── (a) which instance carries lethal damage ──────────────────────────────────────────────

  test("(a) with Elder Dragon out, The Boss is offered after INSTANCE 1: B has exactly 3 marked, is still alive at bf1, and Falling Star is still resolving (321 — no Cleanup mid-resolution)", async () => {
    const game = await board().build();
    expect(game.state("b").might).toBe(5); // printed 4 + buff
    expect(await bothInstancesAtB(game)).toBe("unanswered");
    expect(game.decision()).toMatchObject({
      kind: "yes-no",
      seat: P2,
      source: { cardId: "boss" },
    });
    expect(game.state("b")).toMatchObject({ damage: 3, location: "bf1", zone: "battlefield-bf1" });
    expect(game.zoneOf("fs")).toBe("chain"); // still resolving: B carries lethal damage but no Cleanup has run
  });

  test("(a) WITHOUT Elder Dragon the very same play prompts only after INSTANCE 2: 3/5 is not lethal (142.4.b), so the first thing anyone is asked shows 6 marked", async () => {
    const game = await board({ dragon: false }).build();
    expect(await bothInstancesAtB(game)).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "boss" } });
    expect(game.state("b").damage).toBe(6);
  });

  test("(a) the baseline the prompt index rests on: 3 of P1's damage kills a 9-Might enemy while the Dragon is out", async () => {
    const game = await board({ boss: false }).build();
    await game.p1.cast("fs", { targets: ["anchor", "b"] });
    await game.settle();
    expect(game.zoneOf("anchor")).toBe("trash"); // 3 < 9 Might, lethal anyway (142.4.c)
    expect(game.zoneOf("b")).toBe("trash");
  });

  test("(a) The Boss is not offered at all when the unit is unbuffed — its condition is 'a buffed unit you control', however lethal the damage is", async () => {
    const game = await board({ buffed: false }).build();
    expect(await bothInstancesAtB(game)).toBe("open");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.state("boss").isReady).toBe(true);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 2 } });
  });

  // ── (b) accepting at instance 1 and what instance 2 does ──────────────────────────────────

  test("(b) accepting at instance 1 pays [rainbow] + exhausts The Boss + spends B's buff (702.2.b) — and then instance 2 deals 3 to B in base, lethal AGAIN under the Dragon, with no second offer: B dies", async () => {
    const game = await board().build();
    await bothInstancesAtB(game);
    await game.p2.yes();
    const r = await game.settle();

    expect(r.reason).toBe("open"); // The Boss is never asked a second time
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.p2.trash()).toContain("b");
    expect(game.state("b").isBuffed).toBe(false); // the buff was spent, not restored
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.zoneOf("fs")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(b) contrast — the identical accept WITHOUT Elder Dragon ends with B ALIVE: healed to 0, unbuffed (4 Might), exhausted, recalled to base (418.1)", async () => {
    const game = await board({ dragon: false }).build();
    await bothInstancesAtB(game);
    await game.p2.yes();
    const r = await game.settle();

    expect(r.reason).toBe("open");
    expect(game.zoneOf("b")).toBe("base");
    expect(game.state("b")).toMatchObject({
      controller: P2,
      damage: 0,
      isBuffed: false,
      isExhausted: true,
      location: "base",
      might: 4,
    });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
  });

  test("(b) declining at instance 1 spends nothing — The Boss stays ready with both [rainbow] — and there is no second offer at instance 2; B still dies", async () => {
    const game = await board().build();
    await bothInstancesAtB(game);
    await game.p2.no();
    const r = await game.settle();

    expect(r.reason).toBe("open");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.state("boss").isExhausted).toBe(false);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 2 } });
  });

  // ── (c) whose damage, whose units ─────────────────────────────────────────────────────────

  test("(c) 'enemy units' is relative to Elder Dragon: P1's OWN 5-Might unit takes 3 from P1's own Falling Star and lives, while the enemy takes 3 and dies", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 5, name: "Mine" }, "mine")
      .unit(P1, "base", ELDER_DRAGON, "dragon")
      .unit(P2, "base", { might: 9, name: "Wall" }, "wall")
      .hand(P1, FALLING_STAR, "fs")
      .build();
    await game.p1.cast("fs", { targets: ["mine", "wall"] });
    await game.settle();
    expect(game.zoneOf("mine")).toBe("battlefield-bf1");
    expect(game.state("mine").damage).toBe(3);
    expect(game.zoneOf("wall")).toBe("trash");
  });

  test("(c) 'your damage' (142.3.a) is the Dragon controller's: P2 dealing 3 to their OWN 6-Might unit while P1's Dragon is out is not lethal — the unit lives and The Boss is never offered", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { fury: 2, rainbow: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "B" }, "b", { buffed: true })
      .unit(P2, "bf1", { might: 9, name: "Anchor" }, "anchor")
      .legend(P2, THE_BOSS, "boss")
      .unit(P1, "base", ELDER_DRAGON, "dragon")
      .hand(P2, FALLING_STAR, "fs")
      .build();
    await game.p2.cast("fs", { targets: ["b", "anchor"] });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("b")).toBe("battlefield-bf1");
    expect(game.state("b")).toMatchObject({ damage: 3, isBuffed: true, might: 6 });
    expect(game.state("boss").isReady).toBe(true);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0, rainbow: 1 } });
  });
});
