/**
 * Brutal Hunter — ven-070-166 · Unit · Body · 3 energy + [body] · 4 Might
 *
 *   [Empower] [3] ([3]: Empower me. Use only if not Empowered.)
 *   [Empowered][>] I have +2 [Might] and [Ganking]. (I can move from battlefield to battlefield.)
 *
 * Rules: 827 (Empower is the activated ability "[3]: Empower this. Play only if not Empowered" — it
 * uses the chain (377.3) and, like any unit ability without Action/Reaction, only in your own Main
 * Phase Open State; its cost does NOT include exhausting the unit), 441 (Empowered: binary, permanent),
 * 727.1.b (the dependent passive is live exactly while Empowered — BOTH the +2 and Ganking switch on
 * together and are absent otherwise), 810/144.4.c (Ganking lets the Standard Move go battlefield →
 * battlefield; without it a unit at a battlefield may only go home), 144.2 (moving exhausts).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. All-or-nothing passive: un-empowered it is a 4 with NO Ganking (bf1 → bf2 is illegal, bf1 →
 *     base is fine); empowered it is a 6 WITH Ganking.
 *  2. Empower does not exhaust: a ready Hunter at bf1 can pay [3], let it resolve, and gank to bf2
 *     in the same turn — into an empty battlefield (conquer; the vacated bf1 goes uncontrolled, 190.4.c)
 *     or into a 5-Might defender it now beats.
 *  3. Chain timing: while the empower waits on the chain it is still a 4 without Ganking.
 *  4. [3] is energy: 2 energy + piles of body power is not enough; already Empowered → not offered;
 *     opponent's turn → not offered; the opponent can never use it.
 *  5. Persistence: Empowered, +2 and Ganking survive turn changes (not "this turn").
 *  6. Play cost 3 + [body]; short of either → unplayable; enters exhausted and un-empowered.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-070-166";

/** P1's turn; Hunter READY at bf1 (P1), bf2 per `bf2`, `energy` in pool. */
function atBf1(opts: { energy?: number; empowered?: boolean; bf2Defender?: number } = {}) {
  const b = scenario()
    .resources(P1, { energy: opts.energy ?? 3 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: opts.bf2Defender === undefined ? null : P2 })
    .unit(P1, "bf1", CARD, "bh", opts.empowered ? { empowered: true } : undefined);
  return opts.bf2Defender === undefined ? b : b.unit(P2, "bf2", { might: opts.bf2Defender, name: "Warden" }, "warden");
}

describe("Brutal Hunter (ven-070-166)", () => {
  test("registry payload: Body 3+[body] 4-Might; [activated {energy 3} empower self / not-empowered, static while-empowered → sequence(+2 Might self, grant Ganking self)]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 3, might: 4, name: "Brutal Hunter" });
    expect(def?.powerCost).toEqual(["body"]);
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({ cost: { energy: 3 }, effect: { target: "self", type: "empower" }, restrictions: [{ type: "not-empowered" }], type: "activated" });
    expect(def?.abilities?.[1]).toMatchObject({
      condition: { type: "while-empowered" },
      effect: { effects: [{ amount: 2, target: "self", type: "modify-might" }, { keyword: "Ganking", type: "grant-keyword" }], type: "sequence" },
      type: "static",
    });
  });

  test("play cost: 3 energy + 1 body → exhausted, un-empowered 4-Might unit without Ganking; short an energy or the body pip → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { body: 1 } }).hand(P1, CARD, "bh").build();
    await game.p1.play("bh");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.state("bh")).toMatchObject({ baseMight: 4, isEmpowered: false, isExhausted: true, might: 4, zone: "base" });
    expect(game.state("bh").keywords).not.toContain("Ganking");
    expect((await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "b").build()).p1.can("play", "b")).toBe(false);
    expect((await scenario().resources(P1, { energy: 2, power: { body: 3 } }).hand(P1, CARD, "b").build()).p1.can("play", "b")).toBe(false);
  });

  test("[Empower] [3]: pays 3 energy, sits on the chain as a plain 4 (no Ganking yet), resolves → Empowered 6 Might WITH Ganking; the unit is not exhausted by it and the ability is gone", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).unit(P1, "base", CARD, "bh").build();
    await game.p1.activate("bh");
    expect(game.p1.energy()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bh", controller: P1 })]);
    expect(game.state("bh")).toMatchObject({ isEmpowered: false, might: 4 });
    expect(game.state("bh").keywords).not.toContain("Ganking");
    await game.settle();
    expect(game.state("bh")).toMatchObject({ baseMight: 4, isEmpowered: true, isReady: true, might: 6 });
    expect(game.state("bh").keywords).toContain("Ganking");
    expect(game.p1.can("activate", "bh")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("negative space on the cost/restriction: 2 energy (+ body power) → not activatable; already Empowered → not offered; P2 can never use P1's Hunter", async () => {
    const poor = await scenario().resources(P1, { energy: 2, power: { body: 4 } }).unit(P1, "base", CARD, "bh").build();
    expect(poor.p1.can("activate", "bh")).toBe(false);
    expect((await poor.p1.try((p) => p.activate("bh", 0))).ok).toBe(false);
    expect(poor.p1.energy()).toBe(2);
    const done = await scenario().resources(P1, { energy: 3 }).unit(P1, "base", CARD, "bh", { empowered: true }).build();
    expect(done.state("bh")).toMatchObject({ isEmpowered: true, might: 6 });
    expect(done.p1.can("activate", "bh")).toBe(false);
    const theirs = await scenario().active(P2).resources(P2, { energy: 9 }).unit(P1, "base", CARD, "bh").build();
    expect(theirs.p2.can("activate", "bh")).toBe(false);
  });

  test("timing: the [Empower] ability is not available on the opponent's turn (no Action/Reaction)", async () => {
    const game = await scenario().active(P2).resources(P1, { energy: 3 }).unit(P1, "base", CARD, "bh").build();
    expect(game.p1.can("activate", "bh")).toBe(false);
    expect(game.p1.legal()).toEqual([]);
  });

  test("NOT Empowered at bf1: no Ganking → bf1 → bf2 is illegal (144.4), only the move home is offered", async () => {
    const game = await atBf1({ energy: 0 }).build();
    expect(game.state("bh").keywords).not.toContain("Ganking");
    expect(game.p1.can("gank", "bh")).toBe(false);
    expect((await game.p1.try((p) => p.gank("bh", "bf2"))).ok).toBe(false);
    expect((await game.p1.try((p) => p.move("bh", "bf2"))).ok).toBe(false);
    expect(game.locationOf("bh")).toBe("bf1");
    await game.p1.move("bh", "base");
    expect(game.state("bh")).toMatchObject({ isExhausted: true, zone: "base" });
  });

  test("Empowered at bf1: Ganking lets it move bf1 → an OPEN bf2 (exhausting it) and conquer for a point — and the vacated bf1 becomes uncontrolled (190.4.c)", async () => {
    const game = await atBf1({ empowered: true, energy: 0 }).build();
    expect(game.state("bh").keywords).toContain("Ganking");
    expect(game.p1.can("gank", "bh")).toBe(true);
    await game.p1.gank("bh", "bf2");
    await game.settle();
    expect(game.state("bh")).toMatchObject({ isExhausted: true, might: 6, zone: "battlefield-bf2" });
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull(); // no P1 unit left behind
    expect(game.p1.points()).toBe(1);
  });

  test("same-turn line: ready 4-Might Hunter at bf1 pays [3] (not exhausted by it), the empower resolves, then it ganks into bf2's 5-Might Warden and wins as a 6 (takes 5 < 6), conquering bf2", async () => {
    const game = await atBf1({ bf2Defender: 5, energy: 3 }).build();
    expect(game.p1.can("gank", "bh")).toBe(false); // not yet
    await game.p1.activate("bh");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("bh")).toMatchObject({ isEmpowered: true, isReady: true, might: 6 });
    await game.p1.gank("bh", "bf2");
    expect(game.state("bh").combatRole).toBe("attacker");
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.state("bh")).toMatchObject({ damage: 0, might: 6, zone: "battlefield-bf2" });
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("near miss — un-empowered it could not even reach bf2, and as a 4 walking from base into a 5-Might Warden it simply dies", async () => {
    const game = await scenario()
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 5, name: "Warden" }, "warden")
      .unit(P1, "base", CARD, "bh")
      .build();
    await game.p1.move("bh", "bf2");
    await game.settle();
    expect(game.zoneOf("bh")).toBe("trash");
    expect(game.state("warden")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.p1.points()).toBe(0);
  });

  test("persistence: Empowered, the +2 and Ganking survive into P2's turn and back to P1's (readied), and the [Empower] ability stays gone", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).battlefield("bf1", { controller: P1 }).battlefield("bf2", { controller: null }).unit(P1, "bf1", CARD, "bh").build();
    await game.p1.activate("bh");
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("bh")).toMatchObject({ isEmpowered: true, might: 6 });
    expect(game.state("bh").keywords).toContain("Ganking");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("bh")).toMatchObject({ isEmpowered: true, isReady: true, might: 6 });
    expect(game.p1.can("activate", "bh")).toBe(false);
    expect(game.p1.can("gank", "bh")).toBe(true);
  });
});
