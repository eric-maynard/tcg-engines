/**
 * Interaction: [Tank] + [Shield] on the SAME defender vs Tryndamere's excess-damage payoff.
 *
 *   Tryndamere, Barbarian (ogn-034-298) · Unit 7 [fury][fury] · 8 [Might]
 *     "When I conquer after an attack, if you assigned 5 or more excess damage to enemy
 *      units, you score 1 point."
 *   Needlessly Large Yordle (sfd-055-221) · Unit 10 [calm][calm][calm] · 5 [Might]
 *     "[Shield 5] (+5 [Might] while I'm a defender.)  [Tank] (I must be assigned combat
 *      damage first.)  I cost [2][calm] less for each point you scored from holding this turn."
 *   Cleave (ogn-004-298) · Spell 1 · [Action] · "Give a unit [Assault 3] this turn."
 *
 * Rules: 465.2.c (attacker assigns first, summed Might among the other's units) ·
 * 465.2.c.1/.c.1.a (assigning is not dealing; all damage is dealt simultaneously) ·
 * 465.2.c.3 (lethal in full on one unit before the next) · 465.2.c.4 (never more than
 * minimum lethal while further units remain) · 465.2.c.6 ([Tank] must be served first) ·
 * 466.3.a (the only player with units remaining wins) · 466.5 / 466.5.d / 469.1 (winning
 * establishes control ⇒ Conquer ⇒ a point) · 470 (one score per battlefield per turn) ·
 * 650 (a player may concede at any time).
 *
 * Q: P1 attacks with Tryndamere + a 4-Might Brawler and pumps Tryndamere with Cleave during
 *    the showdown (attacking Might 8+3+4 = 15).
 *    YES side — the Yordle is the SOLE defender: 465.2.c.4's cap has nothing left to protect,
 *    so all 15 pile onto it; 15 - lethal(10) = 5 excess ⇒ Tryndamere's trigger scores.
 *    NO side — a second, undamaged 3-Might defender stands beside it: the Tank is capped at
 *    exactly minimum lethal while the other unit lacks lethal, the remainder is forced onto
 *    that unit, and EVERY legal assignment leaves excess 15-13 = 2 ⇒ no extra point.
 *    And lethal for the Yordle is read off its DEFENDER Might (5 printed + [Shield 5] = 10),
 *    not its printed 5.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TRYNDAMERE = "ogn-034-298";
const YORDLE = "sfd-055-221";
const CLEAVE = "ogn-004-298";

/** bf1 is P2's, held by the Yordle (+ optionally a second, undamaged defender). */
function board(secondDefender: boolean) {
  const s = scenario()
    .active(P1)
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", YORDLE, "yordle")
    .unit(P1, "base", TRYNDAMERE, "trynd")
    .unit(P1, "base", { might: 4, name: "Brawler" }, "brawler")
    .hand(P1, CLEAVE, "cleave");
  return secondDefender ? s.unit(P2, "bf1", { might: 3, name: "Guard" }, "guard") : s;
}

/** Attack bf1 with both units, cast Cleave on Tryndamere inside the showdown, resolve the chain. */
async function attackAndCleave(secondDefender: boolean): Promise<Game> {
  const game = await board(secondDefender).build();
  await game.p1.move(["trynd", "brawler"], "bf1");
  expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({
    active: true,
    battlefieldId: "bf1",
    focusPlayer: P1,
  });
  await game.p1.cast("cleave", { targets: "trynd" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

/** The open combat-damage `distribute` decision, or undefined. */
function assignment(game: Game) {
  const d = game.decision();
  return d?.kind === "distribute" ? d : undefined;
}

describe("Tank + Shield 5 under 465.2.c.4 — Tryndamere's 5-excess payoff", () => {
  test("the attack opens a showdown at bf1 with P1 as attacker holding Focus, and Cleave is a legal [Action] there for [1] — Tryndamere attacks at 8+3 = 11", async () => {
    const game = await board(false).build();
    await game.p1.move(["trynd", "brawler"], "bf1");
    expect(game.state("trynd").combatRole).toBe("attacker");
    expect(game.state("brawler").combatRole).toBe("attacker");
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, focusPlayer: P1 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });

    expect(game.p1.can("cast", "cleave")).toBe(true); // [Action]: playable in a showdown (806.1)
    expect(game.p1.energy()).toBe(1);
    await game.p1.cast("cleave", { targets: "trynd" });
    expect(game.p1.energy()).toBe(0); // the pay line is [1]
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("trynd").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.state("trynd").might).toBe(11); // 8 + Assault 3 while attacking
  });

  test("[Tank] is served first and its lethal number is the DEFENDER Might (5 + [Shield 5] = 10), not the printed 5", async () => {
    const game = await attackAndCleave(true);
    await game.p2.passFocus(); // Focus passed to P2 when P1 acted with it
    await game.p1.passFocus();

    const d = assignment(game);
    expect(d).toMatchObject({ seat: P1, total: 15 }); // P1 assigns first (465.2.c)
    const buckets = Object.fromEntries((d?.buckets ?? []).map((b) => [b.card ?? b.key, b.lethal]));
    expect(buckets).toMatchObject({ guard: 3, yordle: 10 }); // 465.2.c.6 / 726: shielded threshold
    expect(game.state("yordle").baseMight).toBe(5); // printed 5 — the lane must NOT use this number
    expect((d?.buckets ?? [])[0]?.card ?? (d?.buckets ?? [])[0]?.key).toBe("yordle"); // Tank first
  });

  test("465.2.c.4 refuses the 11th point on the Tank while the second defender lacks lethal, and refuses an incomplete assignment (650: concede stays reachable throughout)", async () => {
    const game = await attackAndCleave(true);
    await game.p2.passFocus(); // Focus passed to P2 when P1 acted with it
    await game.p1.passFocus();
    expect(assignment(game)).toBeDefined();

    // Everything on the Tank: overkill while the Guard still lacks lethal.
    expect((await game.p1.try((p) => p.distribute({ yordle: 15 }))).ok).toBe(false);
    // Guard served past lethal while the Tank is still short — both 465.2.c.3 and .c.6.
    expect((await game.p1.try((p) => p.distribute({ guard: 6, yordle: 9 }))).ok).toBe(false);
    // A partial assignment is not a complete answer: the whole 15 must be placed.
    expect((await game.p1.try((p) => p.distribute({ yordle: 10 }))).ok).toBe(false);
    // The prompt is still open and unanswered, and 650 is unconditional even inside it.
    expect(assignment(game)).toBeDefined();
    expect(game.p1.can("concede")).toBe(true);
    expect(game.p2.can("concede")).toBe(true);
  });

  test("YES side — sole defender: with no other unit left, all 15 go onto the Yordle (5 excess), it dies, Tryndamere conquers and the trigger scores ⇒ 2 points", async () => {
    const game = await attackAndCleave(false);
    await game.p2.passFocus(); // Focus passed to P2 when P1 acted with it
    await game.p1.passFocus();

    // One recipient ⇒ nothing to choose: the whole 15 is forced onto the Tank (465.2.c.4's
    // cap only bites "unless no further units remain to have damage assigned to them").
    expect(assignment(game)?.seat).not.toBe(P1);

    // P2's 10 (5 + Shield 5) among Tryndamere (lethal 8+3 = 11) and the Brawler (4).
    expect(assignment(game)).toMatchObject({ seat: P2, total: 10 });
    await game.p2.distribute({ brawler: 4, trynd: 6 });
    await game.settle();

    expect(game.zoneOf("yordle")).toBe("trash"); // 15 ≥ 10, dealt simultaneously (465.2.c.1.a)
    expect(game.zoneOf("brawler")).toBe("trash");
    expect(game.locationOf("trynd")).toBe("bf1"); // 6 < 11
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // 466.3.a → 466.5 → 466.5.d
    expect(game.p1.points()).toBe(2); // 1 Conquer (469.1) + 1 from the trigger (≥ 5 excess)
    expect(game.violations()).toEqual([]);
  });

  test("NO side — a second undamaged defender: every legal assignment leaves exactly 2 excess, so the same 15 Might scores only the Conquer point", async () => {
    const game = await attackAndCleave(true);
    await game.p2.passFocus(); // Focus passed to P2 when P1 acted with it
    await game.p1.passFocus();

    // 15 damage, 13 total lethal need ⇒ the surplus is 2 wherever it is put; 5 is unreachable.
    await game.p1.distribute({ guard: 5, yordle: 10 });
    expect(assignment(game)).toMatchObject({ seat: P2, total: 13 });
    await game.p2.distribute({ brawler: 4, trynd: 9 });
    await game.settle();

    expect(game.zoneOf("yordle")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("brawler")).toBe("trash");
    expect(game.locationOf("trynd")).toBe("bf1"); // 9 < 11
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1); // Conquer only — the trigger's "5 or more excess" is false
    expect(game.violations()).toEqual([]);
  });

  test("NO side — routing the surplus the other way changes nothing: the Tank keeps its cap and the point is still 1 (470: the Conquer scores once)", async () => {
    const game = await attackAndCleave(true);
    await game.p2.passFocus(); // Focus passed to P2 when P1 acted with it
    await game.p1.passFocus();

    // Once BOTH defenders are lethal the 2 surplus points may sit on either of them
    // (465.2.c.4's cap is spent), but the total excess is fixed at 15 - 13.
    await game.p1.distribute({ guard: 3, yordle: 12 });
    await game.p2.distribute({ brawler: 4, trynd: 9 });
    await game.settle();

    expect(game.zoneOf("yordle")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
