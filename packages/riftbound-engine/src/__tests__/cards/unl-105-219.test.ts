/**
 * Imposing Challenger — unl-105-219 · Unit · Body · 5 energy (no power) · 5 Might
 *
 *   When I move, you may move an enemy unit here with less Might than me to a different battlefield.
 *
 * Rules: 383.1 / 420 / 446 ("When I move" = any Move of this permanent: base→bf, bf→base, a Gank, or an
 * opponent's effect moving me — 446.3.c the move itself is not on the chain, the trigger is), 359.3.f.2
 * ("here" and "my Might" are read when the instruction executes), 740 / 355.9.b (targeting restrictions:
 * ENEMY, HERE, Might strictly LESS than mine), 447.2 (destination = "a different battlefield": never a
 * base, never the battlefield it already stands on), 450 (the pushed unit contests its destination for ITS
 * controller), 456.1 (a Recall is not a move), 383.3.a ("you may").
 *
 * Head-judge checklist for THIS card:
 *  1. Attack timing: the trigger resolves inside the showdown BEFORE combat damage, so pushing the lone
 *     defender out leaves nobody to fight — the Challenger conquers; the evicted unit then contests (and,
 *     if open, conquers) the battlefield it was pushed to, scoring for the OPPONENT.
 *  2. Target legality: only enemy units HERE (not the enemy base, not another battlefield) and only with
 *     Might strictly below the Challenger's CURRENT Might (equal is not less).
 *  3. Destination legality: "a different battlefield" — base is never offered; with a single battlefield
 *     on the board there is nowhere to go and nothing moves.
 *  4. Moving home to base still triggers ("When I move"), but no enemy can be "here" in my base → no-op.
 *  5. Pushing an enemy onto a battlefield I hold with a unit stages a second combat there in which the
 *     pushed unit's controller is the attacker (450 / 464.2.c.1).
 *  6. An opponent's Charm moving the Challenger is still "I move" — the trigger is P1's to use.
 */

import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-105-219";
const CHARM = "ogn-043-298"; // Calm spell, 1 + [calm]: "Move an enemy unit."

const cards = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []);
const keys = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []);

/** Move the Challenger, pass to its trigger's "you may", say yes; returns whatever is asked next. */
async function moveAndAccept(game: Game, to: string): Promise<Decision | null> {
  await game.p1.move("ic", to);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ic", controller: P1, triggered: true })]);
  const r = await game.settle();
  expect(r.decision).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  return game.decision();
}

/** Open a staged combat if the engine left it as a turn-player option, then resolve it. */
async function fight(game: Game, bf: string): Promise<void> {
  await game.settle();
  if (game.p1.can("startShowdown")) {
    await game.p1.choose(`startShowdown:${bf}`);
  }
  await game.settle();
}

describe("Imposing Challenger (unl-105-219)", () => {
  test("registry payload keeps the printed restrictions — an optional self-move trigger whose target is an ENEMY unit HERE with LESS Might, destination a different BATTLEFIELD", async () => {
    // Expected: the effect encodes "here", the Might comparison and a battlefield-only destination.
    // Actual: { target: { controller: enemy, type: unit }, to: "choose" } — all three restrictions dropped.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 5, might: 5, name: "Imposing Challenger" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    const ab = def?.abilities?.[0] as { type: string; optional?: boolean; trigger: unknown; effect: Record<string, unknown> };
    expect(ab).toMatchObject({ optional: true, trigger: { event: "move", on: "self" }, type: "triggered" });
    expect(ab.effect).toMatchObject({ target: { controller: "enemy", type: "unit" }, type: "move" });
    const text = JSON.stringify(ab.effect);
    expect(text).toMatch(/here/i);
    expect(text).toMatch(/might/i);
    expect(text).toMatch(/battlefield/i);
    expect(ab.effect.to).not.toBe("base");
  });

  test("cost: 5 energy, no power; enters the base exhausted as a 5-Might unit and playing it is not a move (no trigger); 4 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 1 }, "weak").hand(P1, CARD, "ic").build();
    await game.p1.play("ic");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("ic")).toMatchObject({ baseMight: 5, isExhausted: true, might: 5, zone: "base" });
    expect(game.locationOf("weak")).toBe("bf1");
    expect((await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "ic").build()).p1.can("play", "ic")).toBe(false);
  });

  test("the payoff: attacking a lone 3-Might defender, push it to the open bf2 before combat → nobody defends, P1 conquers bf1 unhurt; the evicted unit takes bf2 for P2 (450)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", CARD, "ic")
      .unit(P2, "bf1", { might: 3, name: "Small" }, "small")
      .build();
    const d = await moveAndAccept(game, "bf1");
    // A single legal target may be auto-taken; either way we end at the destination prompt.
    if (d?.kind === "pick" && d.semantics === "target") {
      await game.p1.pick("small");
    }
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    await game.p1.pick("battlefield-bf2");
    expect(game.state("small")).toMatchObject({ controller: P2, zone: "battlefield-bf2" });
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P2 });
    await game.settle(); // combat at bf1 with no defender
    await game.settle(); // cleanup showdown at bf2
    expect(game.state("ic")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("small")).toBe("battlefield-bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("'you may': declining moves nobody and the ordinary combat follows — 5 beats 3, Small dies, P1 conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", CARD, "ic")
      .unit(P2, "bf1", { might: 3, name: "Small" }, "small")
      .build();
    await game.p1.move("ic", "bf1");
    await game.settle();
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.locationOf("ic")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf2?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
  });

  test("pushing the defender onto a battlefield I hold with a 4-Might Guard: it arrives as P2's contest there (450), the second fight kills it, and P1 ends with both battlefields", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "base", CARD, "ic")
      .unit(P1, "bf2", { might: 4, name: "Guard" }, "guard")
      .unit(P2, "bf1", { might: 3, name: "Small" }, "small")
      .build();
    const d = await moveAndAccept(game, "bf1");
    if (d?.kind === "pick" && d.semantics === "target") {
      await game.p1.pick("small");
    }
    await game.p1.pick("battlefield-bf2");
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    await game.settle(); // bf1: no defender left → conquer
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    await fight(game, "bf2");
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.state("guard")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1); // conquering bf1; defending bf2 scores nothing
    expect(game.p2.points()).toBe(0);
  });

  test("'an enemy unit HERE with LESS Might than me' — into Small (3) + Big (6) with Home (1) in P2's base, only Small is a legal choice", async () => {
    // Expected: offered exactly [small]. Actual: home, small and big are all offered (no here / Might filter).
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", CARD, "ic")
      .unit(P2, "bf1", { might: 3, name: "Small" }, "small")
      .unit(P2, "bf1", { might: 6, name: "Big" }, "big")
      .unit(P2, "base", { might: 1, name: "Home" }, "home")
      .build();
    const d = await moveAndAccept(game, "bf1");
    if (d?.kind === "pick" && d.semantics === "target") {
      expect(cards(d)).toEqual(["small"]);
    } else {
      // auto-taken single target → we must be choosing SMALL's destination
      expect(d).toMatchObject({ kind: "pick", semantics: "destination", source: { cardId: "small" } });
    }
  });

  test.failing("BUG: equal Might is not 'less' — a lone 5-Might Twin here is not a legal choice, so accepting the trigger does nothing and the 5-vs-5 combat trades", async () => {
    // Expected: after "yes" no target/destination prompt about Twin; combat: both 5s die, bf1 stays P2's (no units).
    // Actual: Twin is offered (and could be pushed away for a free conquer).
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", CARD, "ic")
      .unit(P2, "bf1", { might: 5, name: "Twin" }, "twin")
      .build();
    const d = await moveAndAccept(game, "bf1");
    expect(cards(d)).not.toContain("twin");
    expect(d?.source?.cardId).not.toBe("twin");
    await game.settle();
    expect(game.zoneOf("twin")).toBe("trash");
    expect(game.zoneOf("ic")).toBe("trash");
    expect(game.p1.points()).toBe(0);
  });

  test("'to a different battlefield' — the destination menu lists only OTHER battlefields (bf2, bf3): never a base, never bf1 itself", async () => {
    // Expected: [battlefield-bf2, battlefield-bf3]. Actual: "base" is offered as well.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .battlefield("bf3", { controller: P2 })
      .unit(P1, "base", CARD, "ic")
      .unit(P2, "bf1", { might: 3, name: "Small" }, "small")
      .unit(P2, "bf3", { might: 2, name: "Far" }, "far")
      .build();
    let d = await moveAndAccept(game, "bf1");
    if (d?.kind === "pick" && d.semantics === "target") {
      await game.p1.pick("small");
      d = game.decision();
    }
    expect(d).toMatchObject({ kind: "pick", semantics: "destination" });
    expect(keys(d)).toEqual(["battlefield-bf2", "battlefield-bf3"]);
  });

  test("with a single battlefield on the board there is no 'different battlefield' — Small cannot be moved anywhere (certainly not to a base) and the plain combat happens", async () => {
    // Expected: no destination offered / Small stays; combat 5 vs 3 kills Small. Actual: "base" is offered.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "ic")
      .unit(P2, "bf1", { might: 3, name: "Small" }, "small")
      .build();
    const d = await moveAndAccept(game, "bf1");
    expect(keys(d)).not.toContain("base");
    await game.settle({ policy: "first" });
    expect(game.p2.units("base")).not.toContain("small");
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("'When I move' is ANY move of mine: a Gank bf1 → bf2 puts the trigger on the chain, and so does walking home to base", async () => {
    const gank = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CARD, "ic", { grantedKeywords: [{ duration: "permanent", keyword: "Ganking" }] })
      .unit(P2, "bf2", { might: 3, name: "Small" }, "small")
      .build();
    await gank.p1.gank("ic", "bf2");
    expect(gank.chain()).toEqual([expect.objectContaining({ cardId: "ic", triggered: true })]);
    const home = await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "ic").unit(P2, "base", { might: 1 }, "weak").build();
    await home.p1.move("ic", "base");
    expect(home.chain()).toEqual([expect.objectContaining({ cardId: "ic", triggered: true })]);
  });

  test.failing("BUG: moving home to base triggers but no enemy is 'here' in my base — accepting finds no legal unit and nothing moves", async () => {
    // Expected: after "yes" no pick naming weak/far; both stay put; P1 back in an open main phase.
    // Actual: every enemy unit on the board is offered.
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CARD, "ic")
      .unit(P2, "bf2", { might: 2, name: "Far" }, "far")
      .unit(P2, "base", { might: 1, name: "Weak" }, "weak")
      .build();
    const d = await moveAndAccept(game, "base");
    expect(cards(d)).toEqual([]);
    expect(["far", "weak"]).not.toContain(String(d?.source?.cardId));
    await game.settle();
    expect(game.locationOf("far")).toBe("bf2");
    expect(game.locationOf("weak")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("an OPPONENT's Charm moving the Challenger is still 'I move': the trigger goes on the chain under P1's control and the 'you may' is P1's to answer", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .battlefield("bf3", { controller: null })
      .unit(P1, "bf1", CARD, "ic")
      .unit(P2, "bf2", { might: 2, name: "Weak" }, "weak")
      .hand(P2, CHARM, "charm")
      .build();
    await game.p2.cast("charm", { targets: "ic" });
    const r = await game.settle();
    expect(r.decision).toMatchObject({ kind: "pick", seat: P2, semantics: "destination" });
    await game.p2.pick("battlefield-bf2");
    expect(game.locationOf("ic")).toBe("bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ic", controller: P1, triggered: true })]);
    const r2 = await game.settle();
    expect(r2.decision).toMatchObject({ kind: "yes-no", seat: P1 });
  });
});
