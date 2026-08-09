/**
 * Wuju Master — unl-191-219 · Legend (Master Yi) · Calm/Body
 *
 *   [Level 6][>] Your units have +1 [Might]. (While you have 6+ XP, get the effect.)
 *   [Level 11][>] Your units enter ready.
 *
 * Rules: 824 (Level N is a Dependent Keyword: the ability after [>] is Active only while the CONTROLLER
 * has N+ XP — it switches on the moment XP reaches N and off the moment it drops below, 727.1.b.2),
 * 107.4.c / 174 (a legend's passive text is live from the Legend Zone), 364 / 522 (a passive +1 is
 * continuous and never uses the chain), 108.2 ("your units" = units you CONTROL), 143.4 / 369.3
 * ("enter ready" replaces the default enters-exhausted for permanents you play, tokens included),
 * 730 (spending XP lowers your XP total).
 *
 * Head-judge corner cases covered here:
 *   1. Threshold edges: 5 XP nothing, exactly 6 XP on, 11+ XP still exactly +1 (the lines don't stack
 *      into +2), and the second line must not fire at 10.
 *   2. Crossing UP mid-turn through a real Hunt (Master Yi, Tempered conquers: 4 → 6 XP) turns the bonus
 *      on for every friendly unit at once — and Yi's own [Level 6] Deflect/Ganking with it.
 *   3. Crossing DOWN: Crowd Favorite "Spend 2 XP" from 7 → 5 switches the legend's +1 off board-wide
 *      while its own buff lands (3 +1buff = 4, not 5).
 *   4. Control, not ownership: a stolen enemy unit under your control gets +1; your own unit under enemy
 *      control does not; enemy units never do.
 *   5. Combat payoff: a printed 3-vs-3 trade becomes a 4-vs-3 win at 6 XP.
 *   6. [Level 11] enter ready: a unit played from hand at 11 XP should be ready (10 XP: exhausted);
 *      the opponent's plays are unaffected.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";
import { getGlobalCardRegistry } from "../../operations/card-lookup";

const CARD = "unl-191-219";
const YI_TEMPERED = "unl-113-219"; // 4 might · [Hunt 2] · [Level 6][>] I have [Deflect] and [Ganking]
const CROWD_FAVORITE = "unl-102-219"; // 3 might · [Hunt] · Spend 2 XP: [Buff] me
const RECRUIT = { cardType: "unit", domain: "calm", energyCost: 2, might: 2, name: "Test Recruit" };

function board(xp: number) {
  return scenario()
    .xp(P1, xp)
    .legend(P1, CARD, "wuju")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", { might: 2, name: "Home" }, "home")
    .unit(P1, "bf1", { might: 3, name: "Out" }, "out")
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe");
}

describe("Wuju Master (unl-191-219)", () => {
  test("registry payload, line 1: a static +1 modify-might over FRIENDLY units gated by a while-level 6 condition", async () => {
    await board(0).build();
    const abilities = getGlobalCardRegistry().getAbilities("wuju") ?? [];
    expect(abilities[0]).toMatchObject({
      condition: { threshold: 6, type: "while-level" },
      effect: { amount: 1, target: { controller: "friendly", type: "unit" }, type: "modify-might" },
      type: "static",
    });
  });

  test("registry payload, line 2 — '[Level 11][>] Your units enter ready' must exist as a second ability gated at level 11 (824); the parser dropped it entirely", async () => {
    // Expected: two abilities, the second carrying a level-11 condition and an enter-ready effect for friendly units.
    // Actual: only the level-6 might static is present.
    await board(0).build();
    const abilities = getGlobalCardRegistry().getAbilities("wuju") ?? [];
    expect(abilities).toHaveLength(2);
    expect(abilities[1]).toMatchObject({ condition: { threshold: 11, type: "while-level" } });
    expect(JSON.stringify(abilities[1])).toMatch(/enter-ready|enterReady|ready/);
  });

  test("[Level 6] edges: 5 XP → printed Might everywhere; exactly 6 XP → +1 on your base AND battlefield units, never on the enemy; nothing on the chain", async () => {
    const five = await board(5).build();
    expect(five.state("home").might).toBe(2);
    expect(five.state("out").might).toBe(3);
    const six = await board(6).build();
    expect(six.state("home")).toMatchObject({ baseMight: 2, might: 3, staticMightBonus: 1 });
    expect(six.state("out")).toMatchObject({ baseMight: 3, might: 4 });
    expect(six.state("foe").might).toBe(2);
    expect(six.chain()).toEqual([]);
  });

  test("11+ XP is still exactly +1 (the two Level lines do not stack Might)", async () => {
    const game = await board(14).build();
    expect(game.state("home").might).toBe(3);
    expect(game.state("out").might).toBe(4);
  });

  test("a unit you play at 6+ XP has +1 the moment it is on the board (and, below Level 11, still enters exhausted)", async () => {
    const game = await board(8).resources(P1, { energy: 2 }).hand(P1, RECRUIT, "rec").build();
    await game.p1.play("rec", { to: "base" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("rec")).toBe("base");
    expect(game.state("rec")).toMatchObject({ baseMight: 2, isExhausted: true, might: 3 });
  });

  test("crossing UP through a real Hunt: Master Yi, Tempered (4) conquers an empty battlefield at 4 XP → 6 XP; every friendly unit is +1 at once (Yi 5, Home 3) and Yi's own Level-6 Deflect/Ganking switch on", async () => {
    const game = await scenario()
      .xp(P1, 4)
      .legend(P1, CARD, "wuju")
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", YI_TEMPERED, "yi")
      .unit(P1, "base", { might: 2, name: "Home" }, "home")
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .build();
    expect(game.state("yi").might).toBe(4);
    expect(game.state("yi").keywords).not.toContain("Ganking");
    await game.p1.move("yi", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.xp()).toBe(6);
    expect(game.state("yi").might).toBe(5);
    expect(game.state("home").might).toBe(3);
    expect(game.state("foe").might).toBe(2);
    expect(game.state("yi").keywords).toEqual(expect.arrayContaining(["Deflect", "Ganking"]));
  });

  test("crossing DOWN: at 7 XP Crowd Favorite reads 4; 'Spend 2 XP: Buff me' leaves 5 XP — the legend's +1 switches off board-wide (Home 2) and CF is 3 + buff = 4, not 5", async () => {
    const game = await scenario()
      .xp(P1, 7)
      .legend(P1, CARD, "wuju")
      .unit(P1, "base", CROWD_FAVORITE, "cf")
      .unit(P1, "base", { might: 2, name: "Home" }, "home")
      .build();
    expect(game.state("cf").might).toBe(4);
    expect(game.state("home").might).toBe(3);
    await game.p1.activate("cf");
    expect(game.p1.xp()).toBe(5); // cost paid on activation
    expect(game.state("home").might).toBe(2); // 824.1.c: off the moment XP < 6, before the buff even resolves
    await game.settle();
    expect(game.state("cf")).toMatchObject({ baseMight: 3, isBuffed: true, might: 4, staticMightBonus: 0 });
    expect(game.state("home").might).toBe(2);
  });

  test("'your units' means CONTROL (108.2): a stolen enemy-owned unit you control gets +1; your own unit under enemy control does not", async () => {
    const game = await scenario()
      .xp(P1, 6)
      .legend(P1, CARD, "wuju")
      .card("stolen", { controller: P1, def: { cardType: "unit", might: 2, name: "Stolen" }, owner: P2, zone: "base" })
      .card("lent", { controller: P2, def: { cardType: "unit", might: 2, name: "Lent" }, owner: P1, zone: "base" })
      .build();
    expect(game.state("stolen").might).toBe(3);
    expect(game.state("lent").might).toBe(2);
  });

  test("it is the LEGEND OWNER's XP that counts: P2 sitting on 10 XP does nothing for P1's Wuju Master at 0 XP", async () => {
    const game = await board(0).xp(P2, 10).build();
    expect(game.state("home").might).toBe(2);
    expect(game.state("foe").might).toBe(2);
  });

  test("combat payoff at 6 XP: a printed 3-Might attacker into a printed 3-Might defender is 4 v 3 — the defender dies, the attacker survives and conquers", async () => {
    const game = await scenario()
      .xp(P1, 6)
      .legend(P1, CARD, "wuju")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 3, name: "Blade" }, "blade")
      .build();
    await game.p1.move("blade", "bf1");
    expect(game.state("blade")).toMatchObject({ combatRole: "attacker", might: 4 });
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    // control: the same fight at 5 XP is a 3 v 3 trade
    const trade = await scenario().xp(P1, 5).legend(P1, CARD, "wuju").battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 3 }, "wall").unit(P1, "base", { might: 3 }, "blade").build();
    await trade.p1.move("blade", "bf1");
    await trade.settle();
    expect(trade.zoneOf("blade")).toBe("trash");
    expect(trade.zoneOf("wall")).toBe("trash");
  });

  test("[Level 11] negative edge: at 10 XP a unit you play still enters EXHAUSTED", async () => {
    const game = await board(10).resources(P1, { energy: 2 }).hand(P1, RECRUIT, "rec").build();
    await game.p1.play("rec", { to: "base" });
    await game.settle();
    expect(game.state("rec").isExhausted).toBe(true);
  });

  test("[Level 11][>] 'Your units enter ready' — at 11 XP a unit played from hand enters READY (369.3-style entry replacement); the opponent's plays still enter exhausted", async () => {
    // Expected: rec is ready right after the play at 11 XP (and +1 Might from line 1); P2's unit enters exhausted.
    // Actual: the second Level line is not parsed/implemented, so rec enters exhausted.
    const game = await board(11).resources(P1, { energy: 2 }).hand(P1, RECRUIT, "rec").build();
    await game.p1.play("rec", { to: "base" });
    await game.settle();
    expect(game.state("rec")).toMatchObject({ isExhausted: false, might: 3 });
    const p2 = await scenario().active(P2).xp(P1, 11).legend(P1, CARD, "wuju").resources(P2, { energy: 2 }).hand(P2, RECRUIT, "theirs").build();
    await p2.p2.play("theirs", { to: "base" });
    await p2.settle();
    expect(p2.state("theirs").isExhausted).toBe(true);
  });
});
