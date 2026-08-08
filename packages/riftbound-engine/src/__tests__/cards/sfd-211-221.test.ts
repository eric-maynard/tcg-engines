/**
 * Marai Spire — sfd-211-221 · Battlefield
 *
 *   While you control this battlefield, friendly [Repeat] costs cost [1] less.
 *
 * Rules: 820 (Repeat = optional ADDITIONAL cost paid as the spell is played; paying it runs the effect
 * an extra time on resolution — one chain item, 820.3.a), 356.4.c (reductions to additional costs),
 * 356.6 (an Energy reduction cannot reduce a Power pip — a [rainbow]/[chaos]-only Repeat has nothing to
 * shave), 356.4.f.1 (a cost reduced to [0] that is "paid" is still paid → the extra execution happens),
 * 206 (the spell's own printed cost is untouched — only the Repeat COST is discounted), 181 / 469
 * (control of a battlefield is game state: whoever controls the Spire NOW gets the discount).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. Only the Repeat tier is discounted: Downstage Dramatics (2, Repeat [2]) costs 2 without Repeat and
 *     2+1 = 3 with it — never 1+…
 *  2. "While you control THIS battlefield": controlling some OTHER battlefield while the Spire is
 *     uncontrolled (or the opponent's) earns nothing; and control is live — conquer the Spire mid-turn
 *     and the very next Repeat is cheaper; lose it and the discount is gone even if you hold elsewhere.
 *  3. "Friendly" = the Spire controller's own spells: the opponent's Repeat costs stay full price, even
 *     for a Reaction they cast during your turn.
 *  4. Power-only Repeat ([chaos] on Called Shot) is not reducible (356.6); a mixed [1][rainbow] tier
 *     (Danger Zone) drops to just [rainbow]; Blood Rush's Repeat [1] drops to [0] and still repeats.
 *  5. Affordability edge: with exactly 3 energy Downstage+Repeat is legal under the Spire and illegal
 *     without it.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-211-221";
const DOWNSTAGE = "unl-061-219"; // [Reaction] 2 (mind), Repeat [2]: Draw 1.
const CALLED_SHOT = "sfd-122-221"; // [Action] 0 + [chaos], Repeat [chaos]: look at top 2, draw one, recycle the other.
const DANGER_ZONE = "sfd-182-221"; // [Reaction] 1 + [rainbow] (fury/mind), Repeat [1][rainbow]: your Mechs +1 Might this turn.
const BLOOD_RUSH = "sfd-003-221"; // [Action] 1 (fury), Repeat [1]: give a unit Assault 2 this turn.

const repeatMax = (game: Game, seat: "p1" | "p2", spell: string): number =>
  (game[seat].option("cast", spell)?.fields.find((f) => f.name === "repeatCount")?.max as number | undefined) ?? 0;

/** P1's turn with `energy`; the live Spire controlled by `ctl` (a holder unit of that player on it); Downstage in P1's hand. */
function board(ctl: typeof P1 | typeof P2 | null, energy = 8) {
  const b = scenario().resources(P1, { energy }).battlefield("spire", { controller: ctl, def: CARD, inert: false, owner: ctl ?? P2 }).battlefield("bf2", { controller: null }).hand(P1, DOWNSTAGE, "dd");
  if (ctl !== null) {
    b.unit(ctl, "spire", { might: 3, name: "Keeper" }, "keeper");
  }
  return b;
}

describe("Marai Spire (sfd-211-221)", () => {
  test("registry payload: one STATIC ability — condition 'you control (this) battlefield', effect cost-reduction of 1 energy scoped to friendly [Repeat] costs", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Marai Spire" });
    expect(def?.abilities).toHaveLength(1);
    const ab = def?.abilities?.[0] as { type: string; condition?: { type: string }; effect: { type: string; target: unknown; reduction?: unknown; amount?: unknown } };
    expect(ab.type).toBe("static");
    expect(ab.condition?.type).toBe("control-battlefield");
    expect(ab.effect.type).toBe("cost-reduction");
    expect(JSON.stringify(ab.effect.target).toLowerCase()).toContain("repeat");
    expect(JSON.stringify(ab.effect.reduction ?? ab.effect.amount)).toMatch(/1/);
  });

  test("controlling the Spire: Downstage Dramatics with its Repeat paid costs 2 + (2−1) = 3, is ONE chain item, and draws 2", async () => {
    const game = await board(P1).build();
    expect(repeatMax(game, "p1", "dd")).toBe(1);
    await game.p1.cast("dd", { repeat: 1 });
    expect(game.p1.energy()).toBe(8 - 3);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dd", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.zoneOf("dd")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("only the Repeat COST is discounted (206): cast without Repeat it is still the full printed 2, one draw", async () => {
    const game = await board(P1).build();
    await game.p1.cast("dd");
    expect(game.p1.energy()).toBe(6);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("affordability edge: with exactly 3 energy the Repeat is offered under the Spire (→ 0 left) but NOT when the opponent controls it (needs 4)", async () => {
    const mine = await board(P1, 3).build();
    expect(repeatMax(mine, "p1", "dd")).toBe(1);
    await mine.p1.cast("dd", { repeat: 1 });
    expect(mine.p1.energy()).toBe(0);
    const theirs = await board(P2, 3).build();
    expect(repeatMax(theirs, "p1", "dd")).toBe(0);
    expect((await theirs.p1.try((p) => p.cast("dd", { repeat: 1 }))).ok).toBe(false);
    expect(theirs.zoneOf("dd")).toBe("hand");
  });

  test("opponent controls the Spire: P1's Repeat is full price — 2 + 2 = 4", async () => {
    const game = await board(P2).build();
    await game.p1.cast("dd", { repeat: 1 });
    expect(game.p1.energy()).toBe(4);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
  });

  test("'friendly' only: while P1 controls the Spire, P2's own Downstage (a Reaction cast in response on P1's turn) pays the full 4 for its Repeat", async () => {
    const game = await board(P1).resources(P2, { energy: 4 }).hand(P2, DOWNSTAGE, "dd2").build();
    await game.p1.cast("dd");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(repeatMax(game, "p2", "dd2")).toBe(1);
    await game.p2.cast("dd2", { repeat: 1 });
    expect(game.p2.energy()).toBe(0);
    await game.settle();
    expect(game.p2.hand()).toHaveLength(2);
    expect(game.p1.hand()).toHaveLength(1);
  });

  // BUG — expected: the condition is "you control THIS battlefield"; with the Spire uncontrolled, holding
  // bf2 is irrelevant → 2 + 2 = 4 paid, 4 left. Actual: the parsed `control-battlefield` condition is
  // satisfied by controlling ANY battlefield, so the discount applies (5 left).
  test.failing("BUG: Marai Spire discounts Repeat costs when its card's player controls ANY battlefield, not specifically the Spire (uncontrolled Spire + held bf2 → should be full price)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8 })
      .battlefield("spire", { controller: null, def: CARD, inert: false, owner: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 3, name: "Elsewhere" }, "elsewhere")
      .hand(P1, DOWNSTAGE, "dd")
      .build();
    await game.p1.cast("dd", { repeat: 1 });
    expect(game.p1.energy()).toBe(4);
  });

  // BUG — expected: control is game state (469.1.b) — once P1's Climber conquers the (opponent-contributed)
  // Spire, P1 controls it and Downstage+Repeat costs 3 → 5 left. Actual: the static is keyed to the
  // battlefield CARD's seeded controller/owner (P2), which a conquer never updates, so P1 pays 4.
  test.failing("BUG: conquering Marai Spire (an opponent's battlefield card) does not start discounting the conqueror's Repeat costs", async () => {
    const game2 = await scenario()
      .resources(P1, { energy: 8 })
      .battlefield("spire", { controller: null, def: CARD, inert: false, owner: P2 })
      .unit(P1, "base", { might: 3, name: "Climber" }, "climber")
      .hand(P1, DOWNSTAGE, "dd")
      .build();
    await game2.p1.move("climber", "spire");
    await game2.settle();
    await game2.settle();
    expect(game2.gameState.battlefields.spire?.controller).toBe(P1);
    expect(game2.p1.points()).toBe(1);
    expect(repeatMax(game2, "p1", "dd")).toBe(1);
    await game2.p1.cast("dd", { repeat: 1 });
    expect(game2.p1.energy()).toBe(5);
  });

  // BUG — expected: P2's 6-Might Raider kills the Keeper and takes the Spire; on P1's next turn P1 (holding
  // only bf2) pays 2 + 2 for Downstage+Repeat → 4 left. Actual: the Spire card is still "P1's" and P1
  // controls A battlefield (bf2), so the discount keeps applying (5 left). Energy is topped up to 8 first.
  test.failing("BUG: after losing Marai Spire to the opponent, its former controller keeps the Repeat discount while holding any other battlefield", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("spire", { controller: P1, def: CARD, inert: false, owner: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "spire", { might: 3, name: "Keeper" }, "keeper")
      .unit(P1, "bf2", { might: 3, name: "Elsewhere" }, "elsewhere")
      .unit(P2, "base", { might: 6, name: "Raider" }, "raider")
      .hand(P1, DOWNSTAGE, "dd")
      .build();
    await game.p2.move("raider", "spire");
    await game.settle();
    expect(game.zoneOf("keeper")).toBe("trash");
    expect(game.gameState.battlefields.spire?.controller).toBe(P2);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.tapRunes(game.p1.runes({ ready: true }).length);
    await game.p1.do("addResources", { energy: 8 - game.p1.energy() });
    expect(game.p1.energy()).toBe(8);
    await game.p1.cast("dd", { repeat: 1 });
    expect(game.p1.energy()).toBe(4);
  });

  test("356.6 — a Power-only Repeat has nothing to reduce: Called Shot's Repeat [chaos] still needs a second chaos under the Spire (1 chaos → no Repeat offered; 2 chaos → both spent, 0 energy)", async () => {
    const one = await scenario().resources(P1, { energy: 5, power: { chaos: 1 } }).battlefield("spire", { controller: P1, def: CARD, inert: false, owner: P1 }).unit(P1, "spire", { might: 3 }, "keeper").hand(P1, CALLED_SHOT, "shot").build();
    expect(one.p1.can("cast", "shot")).toBe(true);
    expect(repeatMax(one, "p1", "shot")).toBe(0);
    const two = await scenario().resources(P1, { energy: 5, power: { chaos: 2 } }).battlefield("spire", { controller: P1, def: CARD, inert: false, owner: P1 }).unit(P1, "spire", { might: 3 }, "keeper").hand(P1, CALLED_SHOT, "shot").build();
    expect(repeatMax(two, "p1", "shot")).toBe(1);
    await two.p1.cast("shot", { repeat: 1 });
    expect(two.p1.resources()).toEqual({ energy: 5, power: { chaos: 0 } });
  });

  test("mixed tier: Danger Zone's Repeat [1][rainbow] becomes just [rainbow] — total 1 energy + 2 power under the Spire (vs 2 energy + 2 power without)", async () => {
    const withSpire = await scenario().resources(P1, { energy: 5, power: { fury: 2 } }).battlefield("spire", { controller: P1, def: CARD, inert: false, owner: P1 }).unit(P1, "spire", { might: 3 }, "keeper").hand(P1, DANGER_ZONE, "dz").build();
    await withSpire.p1.cast("dz", { repeat: 1 });
    expect(withSpire.p1.resources()).toEqual({ energy: 4, power: { fury: 0 } });
    const without = await scenario().resources(P1, { energy: 5, power: { fury: 2 } }).battlefield("spire", { controller: P2, def: CARD, inert: false, owner: P2 }).unit(P2, "spire", { might: 3 }, "keeper").hand(P1, DANGER_ZONE, "dz").build();
    await without.p1.cast("dz", { repeat: 1 });
    expect(without.p1.resources()).toEqual({ energy: 3, power: { fury: 0 } });
  });

  test("reduced to [0] is still 'paid' (356.4.f.1): Blood Rush (1, Repeat [1]) with Repeat costs exactly 1 under the Spire and the effect still lands", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("spire", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "spire", { might: 3, name: "Keeper" }, "keeper")
      .hand(P1, BLOOD_RUSH, "rush")
      .build();
    expect(repeatMax(game, "p1", "rush")).toBe(1);
    await game.p1.cast("rush", { repeat: 1, targets: "keeper" });
    expect(game.p1.energy()).toBe(0);
    game.script(P1, ["keeper", "keeper"]); // 820.2.a — the extra execution may name its own target
    await game.settle();
    expect(game.zoneOf("rush")).toBe("trash");
    expect(game.state("keeper").keywords).toContain("Assault");
    expect(game.state("keeper").grantedKeywords.filter((g) => g.keyword === "Assault").length).toBeGreaterThanOrEqual(1);
  });
});
