/**
 * Bandle Tree — ogn-278-298 · Battlefield
 *
 *   You may hide an additional card here.
 *
 * Rules: 107.3.b (a Facedown Zone holds one card) / 107.3.b.1 (that maximum can be raised),
 * 107.3.c (only the battlefield's controller may occupy it), 107.3.d + 811.1.b (lose control →
 * the facedown cards are removed at the next Cleanup), 421 / 811.1.b (Hide: your turn, Open State,
 * pay [rainbow], no chain), 811.1.c.3 (playing from facedown DOES open a chain), 365.1 (a passive
 * is live while its source is in play).
 *
 * Head-judge notes — the tricky spots this file covers:
 *  1. "an additional card" = capacity exactly TWO for the controller: the second Hide is legal, a
 *     third is not; each Hide is its own [rainbow]. A plain battlefield still caps at one.
 *  2. "You" is whoever CONTROLS Bandle Tree — the opponent who conquers it hides two there too;
 *     the player who merely OWNS/brought the battlefield gets nothing while not controlling it.
 *  3. Two facedown cards are two independent Hidden cards: each can be played from facedown on a
 *     later turn (to THIS battlefield, for [0]) while the other stays hidden; the opponent sees a
 *     count of 2 but no identities.
 *  4. Losing control of the Tree removes BOTH facedown cards at the next Cleanup (107.3.d).
 *  5. Engine modelling: the bonus is baked into state by the setup move
 *     (`applyBattlefieldPermanentEffects`) instead of being derived from the live static like
 *     `increase-victory-score` is — so the real-setup path (Game.fromDecks) is exercised for the
 *     positive clauses, and a scenario-placed Bandle Tree documents the gap.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { Game as HarnessGame, loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ogn-278-298";
const PAKAA_CUB = "ogn-135-298"; // Unit · Body · 3 energy · 3 Might · [Hidden] — nothing else
const CONSULT = "ogn-083-298"; // Spell · [Hidden] [Reaction] Draw 2.
const HARMLESS_BF = "ogn-293-298"; // "When you hold here, if you have 7+ units here, you win the game."
const CALM_RUNE = "ogn-042-298";
const TREE = "player-1-bf-ogn-278-298"; // instance id given by the constructed-deck setup

/** A real constructed game (setup ran): both decks are 40 Pakaa Cubs; P1 brought Bandle Tree. P1 to act, turn 1. */
async function realGame(): Promise<Game> {
  const main = Array.from({ length: 40 }, () => PAKAA_CUB);
  const runes = Array.from({ length: 12 }, () => CALM_RUNE);
  return HarnessGame.fromDecks({
    p1: { battlefieldIds: [CARD], mainDeckCardIds: main, runeDeckCardIds: runes },
    p2: { battlefieldIds: [HARMLESS_BF], mainDeckCardIds: main, runeDeckCardIds: runes },
    seed: "bandle-tree",
  });
}

/** `seat` plays a Cub now, and two turns later walks it onto the (empty) Bandle Tree and holds `rainbow` power. */
async function takeTheTree(game: Game, seat: typeof P1 | typeof P2, rainbow: number): Promise<string> {
  const me = game.seat(seat);
  const scout = me.hand()[0] as string;
  await me.do("addResources", { energy: 3 });
  await me.play(scout);
  await game.settle();
  await game.advanceTurn();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(seat);
  await me.move(scout, TREE);
  await game.settle();
  await game.settle();
  expect(game.gameState.battlefields[TREE]?.controller).toBe(seat);
  await me.do("addResources", { power: { rainbow } });
  return scout;
}

describe("Bandle Tree (ogn-278-298)", () => {
  test("registry payload: a single static `increase-hidden-capacity` by 1 — no trigger, no cost, no target", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Bandle Tree", rulesText: "You may hide an additional card here." });
    expect(def?.abilities).toEqual([{ effect: { amount: 1, type: "increase-hidden-capacity" }, type: "static" }]);
    const game = await realGame();
    expect(game.gameState.battlefields[TREE]).toMatchObject({ controller: null, hiddenCapacityBonus: 1 });
    expect(game.gameState.battlefields["player-2-bf-ogn-293-298"]?.hiddenCapacityBonus).toBeUndefined();
  });

  test("the controller hides a SECOND card here: two Hides, each costing [rainbow], no chain, both cards facedown at the Tree", async () => {
    const game = await realGame();
    await takeTheTree(game, P1, 2);
    const [b, c] = game.p1.hand();
    await game.p1.hide(b as string, TREE);
    expect(game.p1.resources().power.rainbow).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("hide", c as string)).toBe(true);
    await game.p1.hide(c as string, TREE);
    expect(game.p1.resources().power.rainbow).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.p1.facedown(TREE).sort()).toEqual([b, c].sort() as string[]);
    expect(game.zoneOf(b as string)).toBe(`facedown-${TREE}`);
    expect(game.state(c as string).isHidden).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("'AN additional card' — exactly two, not unlimited: with two cards facedown a third Hide is not offered even with power to spare", async () => {
    const game = await realGame();
    await takeTheTree(game, P1, 3);
    const [b, c, d] = game.p1.hand();
    await game.p1.hide(b as string, TREE);
    await game.p1.hide(c as string, TREE);
    expect(game.p1.resources().power.rainbow).toBe(1);
    expect(game.p1.can("hide", d as string)).toBe(false);
    expect(game.p1.legal().some((o) => o.verb === "hide")).toBe(false);
    const r = await game.p1.try((p) => p.hide(d as string, TREE));
    expect(r.ok).toBe(false);
    expect(game.p1.facedown(TREE)).toHaveLength(2);
  });

  test("negative space: an ordinary battlefield still holds ONE facedown card per controller (107.3.b) — the second Hide is illegal there", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 2 } })
      .battlefield("plain", { controller: P1 })
      .unit(P1, "plain", { might: 2 }, "holder")
      .hand(P1, PAKAA_CUB, "cub1")
      .hand(P1, PAKAA_CUB, "cub2")
      .build();
    await game.p1.hide("cub1", "plain");
    expect(game.p1.can("hide", "cub2")).toBe(false);
    expect((await game.p1.try((p) => p.hide("cub2", "plain"))).ok).toBe(false);
    expect(game.p1.facedown("plain")).toEqual(["cub1"]);
    expect(game.p1.power()).toBe(1);
  });

  test("'You' = whoever CONTROLS the Tree: P2 conquers P1's Bandle Tree and hides two cards there; P1 (its owner, not controller) cannot hide there at all", async () => {
    const game = await realGame();
    await game.advanceTurn(); // P1 does nothing on turn 1
    expect(game.turnPlayer()).toBe(P2);
    await takeTheTree(game, P2, 2);
    const [x, y] = game.p2.hand();
    await game.p2.hide(x as string, TREE);
    await game.p2.hide(y as string, TREE);
    expect(game.p2.facedown(TREE)).toHaveLength(2);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { power: { rainbow: 2 } });
    expect(game.p1.legal().some((o) => o.verb === "hide")).toBe(false); // 107.3.c — P1 controls no battlefield
  });

  test("two independent Hidden cards: next turn one Cub is played from facedown (to THIS battlefield, for [0]) while the other stays hidden — then it too", async () => {
    const game = await realGame();
    const scout = await takeTheTree(game, P1, 2);
    const [b, c] = game.p1.hand() as [string, string];
    await game.p1.hide(b, TREE);
    await game.p1.hide(c, TREE);
    expect(game.p1.can("reveal", b)).toBe(false); // "Beginning on the next turn" (811.1.b)
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.energy()).toBe(0); // pools emptied; the play from hidden ignores the 3-energy cost
    await game.p1.reveal(b);
    await game.settle(); // a permanent leaves the chain as soon as it is finalized (359.2) and enters exhausted (359.2.c)
    expect(game.zoneOf(c)).toBe(`facedown-${TREE}`);
    expect(game.zoneOf(b)).toBe(`battlefield-${TREE}`);
    expect(game.state(b)).toMatchObject({ isExhausted: true, isHidden: false, might: 3 });
    expect(game.p1.units(TREE).sort()).toEqual([scout, b].sort());
    expect(game.p1.facedown(TREE)).toEqual([c]);
    await game.p1.reveal(c);
    await game.settle();
    expect(game.p1.units(TREE)).toHaveLength(3);
    expect(game.p1.facedown(TREE)).toEqual([]);
    expect(game.p1.energy()).toBe(0);
  });

  test("the opponent sees HOW MANY cards are facedown at the Tree (2) but not which (107.3.f / 128.4)", async () => {
    const game = await realGame();
    await takeTheTree(game, P1, 2);
    const [b, c] = game.p1.hand() as [string, string];
    await game.p1.hide(b, TREE);
    await game.p1.hide(c, TREE);
    const seenByP2 = game.p2.view().battlefields.find((bf) => bf.id === TREE);
    expect(seenByP2?.facedownCount).toBe(2);
    const p2Zone = game.p2.view().zones[`facedown-${TREE}`] ?? [];
    expect(p2Zone.every((v) => (v as { hidden?: boolean }).hidden === true && !("id" in v))).toBe(true);
    const seenByP1 = game.p1.view().zones[`facedown-${TREE}`] ?? [];
    expect(seenByP1.map((v) => (v as { id?: string }).id).sort()).toEqual([b, c].sort());
  });

  test("losing control of the Tree removes BOTH facedown cards at the next Cleanup (107.3.d): the lone holder walks home → control lapses → both hidden Cubs are trashed", async () => {
    const game = await realGame();
    const scout = await takeTheTree(game, P1, 2);
    const [b, c] = game.p1.hand() as [string, string];
    await game.p1.hide(b, TREE);
    await game.p1.hide(c, TREE);
    await game.advanceTurn();
    await game.advanceTurn(); // the scout readies in P1's Awaken
    await game.p1.move(scout, "base");
    await game.settle();
    expect(game.gameState.battlefields[TREE]?.controller).toBe(null);
    expect(game.zoneOf(b)).toBe("trash");
    expect(game.zoneOf(c)).toBe("trash");
    expect(game.p1.facedown(TREE)).toEqual([]);
    expect(game.state(b).isHidden).toBe(false);
  });

  // BUG — expected (365.1): Bandle Tree's passive is live whenever the battlefield is in play, so a board built with a
  // non-inert Bandle Tree lets its controller hide a second card. Actual: the +1 capacity is only baked into
  // `battlefields[id].hiddenCapacityBonus` by the setup move (`applyBattlefieldPermanentEffects`); `hiddenCapacityAt`
  // reads permanents' statics live but never the battlefield's own, so a Tree that reaches play any other way
  // (scenario placement, a battlefield swap à la 438.1.a) grants nothing and the second Hide is refused.
  test.failing("BUG: the extra slot should come from the live static (365.1), not a setup-time bake — scenario-placed Bandle Tree refuses the second Hide", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 2 } })
      .battlefield("tree", { controller: P1, def: CARD, inert: false })
      .unit(P1, "tree", { might: 2 }, "holder")
      .hand(P1, PAKAA_CUB, "cub")
      .hand(P1, CONSULT, "consult")
      .build();
    await game.p1.hide("consult", "tree");
    expect(game.p1.can("hide", "cub")).toBe(true);
    await game.p1.hide("cub", "tree");
    expect(game.p1.facedown("tree").sort()).toEqual(["consult", "cub"]);
    expect(game.p1.power()).toBe(0);
  });
});
