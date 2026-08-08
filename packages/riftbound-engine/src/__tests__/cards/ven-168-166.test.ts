/**
 * Jinx, Demolitionist — ven-168-166 · Champion Unit (Jinx) · Fury · 3 energy + [fury] · 4 Might
 *
 *   [Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)
 *   [Assault 2] (+2 [Might] while I'm an attacker.)
 *   When you play me, discard 2.
 *
 * Rules: 805 (Accelerate: optional additional cost [1]+[C matching my domain]; paid → I enter ready,
 * a replacement — not "enter exhausted then ready"), 807 (Assault: +X Might only while holding the
 * attacker designation; nothing in base, nothing while defending), 143.4 (units enter exhausted),
 * discard-as-effect rule ("discard as many as possible; with fewer cards the rest is ignored" — the
 * discard is mandatory, not "up to"), "When you play me" is a triggered ability that uses the chain
 * and resolves after Jinx is on the board; a champion unit may also be played from the Champion zone
 * for the same cost with the same trigger.
 *
 * Head-judge checklist for THIS card:
 *  1. Discard 2 is a DRAWBACK and mandatory: with 3 other cards you choose exactly 2 (no decline);
 *     with exactly 2 both go without a real choice; with 1 you discard that 1; with 0 nothing happens
 *     and Jinx still resolves normally.
 *  2. The discard happens on RESOLUTION of the trigger (hand intact while it sits on the chain), and
 *     Jinx herself — already on the board — is never a discard candidate.
 *  3. Accelerate needs a SECOND fury: 4 energy + 1 fury can play her (exhausted) but cannot
 *     accelerate; 4 + 2 fury accelerated → 0/0 and ready. Accelerating does not skip the discard.
 *  4. Assault 2 in real combat: accelerated Jinx attacks a 5-Might defender as 6 and wins; a 4-Might
 *     Jinx DEFENDING against a 5-Might attacker gets no bonus and dies.
 *  5. From the Champion zone: same 3+[fury], same "discard 2".
 *  6. Partner (Fury): discarding Flame Chompers to Jinx's trigger fires Chompers' "When you discard
 *     me, you may pay [fury] to play me".
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-168-166";
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla hand padding
const FLAME_CHOMPERS = "ogn-006-298"; // "When you discard me, you may pay [fury] to play me."

function board(energy = 3, fury = 1, handFillers = 3) {
  const b = scenario()
    .resources(P1, { energy, power: { fury } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Gatekeeper" }, "foe")
    .hand(P1, CARD, "jx");
  ["a", "b", "c"].slice(0, handFillers).forEach((alias) => b.hand(P1, FILLER, alias));
  return b;
}

describe("Jinx, Demolitionist (ven-168-166)", () => {
  test("registry payload: Fury champion 3+[fury] 4-Might Jinx; [Accelerate {1,fury}], [Assault 2], play-self trigger → discard 2", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 3, isChampion: true, might: 4, name: "Jinx, Demolitionist", powerCost: ["fury"], tags: ["Jinx"] });
    expect(def?.abilities).toHaveLength(3);
    expect(def?.abilities?.[0]).toMatchObject({ cost: { energy: 1, power: ["fury"] }, keyword: "Accelerate", type: "keyword" });
    expect(def?.abilities?.[1]).toEqual({ keyword: "Assault", type: "keyword", value: 2 });
    expect(def?.abilities?.[2]).toMatchObject({ effect: { amount: 2, type: "discard" }, trigger: { event: "play-self" }, type: "triggered" });
  });

  test("plain play: 3 energy + 1 fury, Jinx lands in base EXHAUSTED as a 4-Might unit with her trigger on the chain; the hand is untouched until it resolves", async () => {
    const game = await board().build();
    await game.p1.play("jx");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("jx")).toBe("base");
    expect(game.state("jx")).toMatchObject({ isExhausted: true, might: 4 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jx", controller: P1, triggered: true })]);
    expect(game.p1.hand().sort()).toEqual(["a", "b", "c"]);
    expect((await board(2, 1).build()).p1.can("play", "jx")).toBe(false);
    expect((await board(3, 0).resources(P1, { power: { chaos: 1 } }).build()).p1.can("play", "jx")).toBe(false);
  });

  test("'discard 2' with three other cards: a mandatory pick of exactly 2 among a/b/c (Jinx is not a candidate, no decline); the chosen two go to the trash", async () => {
    const game = await board().build();
    await game.p1.play("jx");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 2, seat: P1 });
    expect(d.options.map((o) => o.card).sort()).toEqual(["a", "b", "c"]);
    await game.p1.pick("a", "c");
    await game.settle();
    expect(game.p1.trash().sort()).toEqual(["a", "c"]);
    expect(game.p1.hand()).toEqual(["b"]);
    expect(game.zoneOf("jx")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("edge counts: exactly two other cards → both discarded without a real choice; one → that one; none → nothing, and Jinx still resolves to the board", async () => {
    const two = await board(3, 1, 2).build();
    await two.p1.play("jx");
    expect((await two.settle()).reason).toBe("open");
    expect(two.p1.trash().sort()).toEqual(["a", "b"]);
    expect(two.p1.hand()).toEqual([]);

    const one = await board(3, 1, 1).build();
    await one.p1.play("jx");
    await one.settle();
    expect(one.p1.trash()).toEqual(["a"]);
    expect(one.p1.hand()).toEqual([]);

    const none = await board(3, 1, 0).build();
    await none.p1.play("jx");
    expect((await none.settle()).reason).toBe("open");
    expect(none.p1.trash()).toEqual([]);
    expect(none.state("jx")).toMatchObject({ might: 4, zone: "base" });
  });

  test("[Accelerate]: paying the extra [1][fury] (4 energy + 2 fury total → 0/0) has her enter READY — and the discard 2 still happens", async () => {
    const game = await board(4, 2, 2).build();
    expect(game.p1.option("play", "jx")?.fields.find((f) => f.arg === "payOptional")?.options).toEqual([false, true]);
    await game.p1.play("jx", { accelerate: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.state("jx")).toMatchObject({ isExhausted: false, isReady: true, zone: "base" });
    expect(game.p1.trash().sort()).toEqual(["a", "b"]);
  });

  test("[Accelerate] needs a second FURY power (805.1.a.1): with 4 energy + 1 fury (+ off-domain power) accelerating is illegal, the plain play still works and she enters exhausted", async () => {
    const game = await board(4, 1, 0).resources(P1, { power: { calm: 3 } }).build();
    expect(game.p1.option("play", "jx")?.fields.find((f) => f.arg === "payOptional")).toBeUndefined();
    const r = await game.p1.try((p) => p.play("jx", { accelerate: true }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("jx")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { calm: 3, fury: 1 } });
    await game.p1.play("jx");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 3, fury: 0 } });
    await game.settle();
    expect(game.state("jx").isExhausted).toBe(true);
  });

  test("[Assault 2] attacking: accelerated Jinx (4 in base) moves into the 5-Might Gatekeeper as a 6-Might attacker, kills it, survives and conquers bf1", async () => {
    const game = await board(4, 2, 0).build();
    await game.p1.play("jx", { accelerate: true });
    await game.settle();
    expect(game.state("jx").might).toBe(4); // no bonus outside combat
    await game.p1.move("jx", "bf1");
    expect(game.state("jx")).toMatchObject({ combatRole: "attacker", might: 6 });
    expect(game.state("foe").might).toBe(5);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.state("jx")).toMatchObject({ damage: 0, might: 4, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("[Assault 2] is attack-only: a lone Jinx DEFENDING bf1 against a 5-Might raider stays 4 Might and dies; the raider conquers", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "jx")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("jx")).toMatchObject({ combatRole: "defender", might: 4 });
    await game.settle();
    expect(game.zoneOf("jx")).toBe("trash");
    expect(game.state("raider")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  test("from the Champion zone: same 3+[fury] cost (Accelerate optional there too), same 'discard 2' on arrival", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { fury: 2 } }).champion(P1, CARD, "jx").hand(P1, FILLER, "a").hand(P1, FILLER, "b").build();
    expect(game.p1.option("playFromChampionZone")?.fields.find((f) => f.arg === "payOptional")?.options).toEqual([false, true]);
    await game.p1.playChampion("base");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.zoneOf("jx")).toBe("base");
    await game.settle();
    expect(game.p1.champion()).toBeUndefined();
    expect(game.p1.trash().sort()).toEqual(["a", "b"]);
    expect(game.state("jx").isExhausted).toBe(true);
  });

  test("the opponent may respond to the trigger: after P1 passes, P2 holds priority with the discard still pending (hand intact)", async () => {
    const game = await board().build();
    await game.p1.play("jx");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.hand().sort()).toEqual(["a", "b", "c"]);
    await game.p2.passPriority();
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  });

  test("partner: discarding Flame Chompers to Jinx's trigger asks to pay [fury] to play it; yes → Chompers leaves the trash for the base and the fury is spent", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { fury: 2 } }).hand(P1, CARD, "jx").hand(P1, FLAME_CHOMPERS, "chomp").hand(P1, FILLER, "b").build();
    await game.p1.play("jx");
    await game.settle(); // exactly two other cards → both discarded
    expect(game.p1.trash().sort()).toEqual(["b", "chomp"]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.power("fury")).toBe(0);
    expect(game.zoneOf("chomp")).toBe("base");
    expect(game.p1.trash()).toEqual(["b"]);
  });
});
