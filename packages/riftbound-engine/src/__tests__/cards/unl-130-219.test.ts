/**
 * Walking Roost — unl-130-219 · Unit · Chaos · 5 energy · 6 Might
 *
 *   [Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *   When you play me, choose an opponent. They play a 1 [Might] Bird unit token with [Deflect].
 *
 * Rules: 809 (Deflect = mandatory additional cost of 1 power, ANY domain, only for spells/abilities an
 * OPPONENT controls that choose it — 356.2.a.2), 187.7 (Bird token = domainless 1-Might unit token, Bird
 * tag, Deflect), 182–185 ("THEY play" — the chosen opponent performs the play, so the token enters under
 * that opponent's control in their base; token units enter exhausted like any unit, 185.2.d / 143.4),
 * 383.4.a.2 ("When you play me" is a triggered play ability that goes on the chain after the Roost has
 * entered the board), 411.4 (the opponent is responsible for that play — it is a "you play a unit"
 * event for THEM, not for the Roost's controller).
 *
 * Head-judge corner cases for THIS card:
 *   1. The gift goes to the OPPONENT: after the trigger resolves P2 (not P1) has one more unit — an
 *      exhausted 1-Might Bird token with Deflect in P2's base; P1's board is just the Roost.
 *   2. That Bird's Deflect now works AGAINST the Roost's controller: P1 choosing it with a spell pays
 *      +1 power; P2 choosing their own Bird pays nothing extra.
 *   3. Roost's own Deflect: P2's Discipline on the Roost is illegal with energy only, legal with one
 *      spare power of any domain (which is spent); P1's own Discipline on it costs the printed 2.
 *   4. Timing: the play trigger is a chain item — the Roost is already on the board (exhausted, 6
 *      Might) while it is pending and the opponent gets priority to respond before any Bird exists.
 *   5. "Choose an opponent" is a real choice only with 3+ players: in a 3-player game P1 must be asked
 *      P2-or-P3 and only the chosen one gets a Bird.
 *   6. Cost: exactly 5 energy, no power; 4 energy (even with power floating) is not enough.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, P3, scenario } from "../../harness";

const CARD = "unl-130-219";
const DISCIPLINE = "ogn-058-298"; // Calm Reaction · 2 · Give a unit +2 Might this turn. Draw 1.

const birds = (ids: readonly string[]) => ids.filter((c) => c.startsWith("token-bird-"));
const allBirds = (game: Game) => birds([...game.cardsAt("base"), ...game.battlefields().flatMap((b) => game.cardsAt(b))]);

/** P1 plays the Roost from hand and lets the play trigger resolve. */
async function playRoost(): Promise<Game> {
  const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "roost").unit(P2, "base", { might: 2, name: "Foe" }, "foe").build();
  await game.p1.play("roost");
  await game.settle();
  return game;
}

describe("Walking Roost (unl-130-219)", () => {
  test("registry payload: Deflect 1 keyword + a play-self trigger creating a 1-Might Bird unit token with Deflect", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 5, might: 6, name: "Walking Roost" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toEqual({ keyword: "Deflect", type: "keyword", value: 1 });
    expect(def?.abilities?.[1]).toMatchObject({
      effect: { token: { keywords: ["Deflect"], might: 1, name: "Bird", type: "unit" }, type: "create-token" },
      trigger: { event: "play-self" },
      type: "triggered",
    });
  });

  // BUG — expected: the printed text hands the token to a CHOSEN OPPONENT, so the create-token effect
  // must name that player (some opponent/“they” marker). Actual: the effect is a plain self create-token
  // to "base" with no player at all — the "choose an opponent. They play…" clause was dropped.
  test("parsed create-token effect encodes that the chosen OPPONENT plays the Bird", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    const effect = (def?.abilities?.[1] as { effect?: unknown } | undefined)?.effect;
    expect(JSON.stringify(effect)).toMatch(/opponent/i);
  });

  test("cost: 5 energy, no power; enters the base exhausted as a 6-Might unit with Deflect; 4 energy (+ loose power) is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "roost").build();
    await game.p1.play("roost");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("roost")).toBe("base");
    expect(game.state("roost")).toMatchObject({ isExhausted: true, might: 6 });
    expect(game.state("roost").keywords).toContain("Deflect");
    const poor = await scenario().resources(P1, { energy: 4, power: { chaos: 2 } }).hand(P1, CARD, "roost").build();
    expect(poor.p1.can("play", "roost")).toBe(false);
  });

  test("'When you play me' is a chain item: Roost is on the board while it is pending, P2 gets priority to respond, and no Bird exists yet", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "roost").build();
    await game.p1.play("roost");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "roost", controller: P1, triggered: true })]);
    expect(game.zoneOf("roost")).toBe("base");
    expect(allBirds(game)).toHaveLength(0);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(allBirds(game)).toHaveLength(0);
    await game.settle();
    expect(allBirds(game)).toHaveLength(1); // exactly one Bird is created once it resolves
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("the created token is a 1-Might Bird UNIT token with Deflect that enters exhausted (187.7, 185.2.d)", async () => {
    const game = await playRoost();
    const [bird] = allBirds(game);
    expect(bird).toBeDefined();
    expect(game.state(bird!)).toMatchObject({ baseMight: 1, cardType: "unit", isExhausted: true, isToken: true, might: 1, name: "Bird" });
    expect(game.state(bird!).keywords).toContain("Deflect");
    expect(game.zoneOf(bird!)).toBe("base");
  });

  // BUG — expected (182/185, "THEY play"): the Bird enters under the chosen opponent's control in P2's
  // base; P1's only unit is the Roost. Actual: the token is created for P1 (owner+controller player-1).
  test("the Bird token is played by / belongs to the chosen OPPONENT, not the Roost's controller", async () => {
    const game = await playRoost();
    expect(game.p1.units()).toEqual(["roost"]);
    expect(birds(game.p2.units("base"))).toHaveLength(1);
    const [bird] = birds(game.p2.units("base"));
    expect(game.state(bird!)).toMatchObject({ controller: P2, isExhausted: true, might: 1 });
    expect(game.p2.units()).toHaveLength(2); // Foe + Bird
  });

  // BUG (follows from the one above) — expected: the gifted Bird's Deflect taxes P1 (an opponent of its
  // controller): P1's Discipline on it is illegal with 2 energy and legal with 2 energy + 1 power, which
  // is spent. Actual: the Bird is P1's own unit, so P1 targets it tax-free.
  test("the opponent's Bird has Deflect against the Roost's controller — P1 must pay [rainbow] to choose it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7 })
      .hand(P1, CARD, "roost")
      .hand(P1, DISCIPLINE, "disc")
      .build();
    await game.p1.play("roost");
    await game.settle();
    const [bird] = allBirds(game);
    expect(bird).toBeDefined();
    expect(game.p1.energy()).toBe(2);
    expect((await game.p1.try((p) => p.cast("disc", { targets: bird! }))).ok).toBe(false); // no power for Deflect
    await game.p1.do("addResources", { power: { fury: 1 } });
    await game.p1.cast("disc", { targets: bird! });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("Roost's Deflect: P2's Discipline choosing it is illegal on energy alone, legal with one power of ANY domain (spent); resolves to 8 Might this turn", async () => {
    const broke = await scenario().active(P2).resources(P2, { energy: 2 }).unit(P1, "base", CARD, "roost").unit(P2, "base", { might: 2 }, "foe").hand(P2, DISCIPLINE, "disc").build();
    expect((await broke.p2.try((p) => p.cast("disc", { targets: "roost" }))).ok).toBe(false);
    await broke.p2.cast("disc", { targets: "foe" }); // an untaxed target is fine with the same 2 energy
    expect(broke.p2.energy()).toBe(0);

    const game = await scenario().active(P2).resources(P2, { energy: 2, power: { order: 1 } }).unit(P1, "base", CARD, "roost").hand(P2, DISCIPLINE, "disc").build();
    await game.p2.cast("disc", { targets: "roost" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.state("roost").might).toBe(8);
    await game.advanceTurn();
    expect(game.state("roost").might).toBe(6); // "this turn"
  });

  test("Deflect never taxes the Roost's own controller: P1's Discipline on it costs exactly 2 energy, no power", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARD, "roost").hand(P1, DISCIPLINE, "disc").build();
    await game.p1.cast("disc", { targets: "roost" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("roost").might).toBe(8);
  });

  test("negative space: a Roost that is merely on the board (not played this way) creates nothing; the trigger fires once per play, not per turn", async () => {
    const game = await scenario().turn(2).active(P2).unit(P1, "base", CARD, "roost").build();
    expect(allBirds(game)).toHaveLength(0);
    await game.advanceTurn(); // into P1's turn: no play happened, no Bird
    expect(game.turnPlayer()).toBe(P1);
    expect(allBirds(game)).toHaveLength(0);
    expect(game.chain()).toHaveLength(0);
  });

  // BUG — expected: with two opponents P1 is asked to choose P2 or P3 and only the chosen seat receives
  // a Bird. Actual: no choice is offered and the token is minted for P1.
  test("3-player — 'choose an opponent' prompts P1 (P2 | P3) and only the chosen opponent gets the Bird", async () => {
    const game = await scenario({ players: 3 }).resources(P1, { energy: 5 }).hand(P1, CARD, "roost").build();
    await game.p1.play("roost");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const keyForP3 = d?.kind === "pick" ? d.options.find((o) => o.seatRef === P3 || o.key === P3 || o.label.includes(P3))?.key : undefined;
    expect(keyForP3).toBeDefined();
    await game.p1.pick(keyForP3!);
    await game.settle();
    expect(birds(game.seat(P3).units("base"))).toHaveLength(1);
    expect(birds(game.p2.units("base"))).toHaveLength(0);
    expect(birds(game.p1.units("base"))).toHaveLength(0);
  });
});
