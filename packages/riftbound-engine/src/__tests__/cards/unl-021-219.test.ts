/**
 * Grim Apothecary — unl-021-219 · Unit · Fury · 3 energy (no power) · 3 Might
 *
 *   [Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)
 *   When you play me, you may return a friendly unit at a battlefield to its owner's hand.
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. "a friendly unit at a battlefield" includes HERSELF once she has been played to a battlefield
 *     (the play trigger resolves with her on the board) — a legal self-bounce; units in a base and
 *     enemy units are never legal picks.
 *  2. "you may" — declining must leave the board untouched; with no friendly unit at any battlefield
 *     the trigger simply does nothing (no stuck prompt).
 *  3. Ambush (822) on the OPPONENT's turn: when P1 receives Focus in P2's combat showdown she can be
 *     played to the attacked battlefield only (never to base at Reaction speed), and her trigger can
 *     lift the outmatched defender to hand — she then defends alone (323.2.a) as a 3-Might unit.
 *  4. Reaction timing ≠ "any time": in P2's Neutral Open main phase P1 must not be offered the play.
 *  5. A returned unit is a new object in hand: damage and buffs do not persist (rule 106 / zone change).
 *  6. Cost: exactly 3 energy, no power; the play trigger is a triggered item on the chain (383).
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-021-219";

/** P1: Scout (damaged, buffed) at bf1, Ranger at bf2, Home in base; P2: Foe at bf3, Lurker in base. */
function board(energy = 3) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .battlefield("bf3", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout", { buffed: true, damage: 1 })
    .unit(P1, "bf2", { might: 1, name: "Ranger" }, "ranger")
    .unit(P1, "base", { might: 2, name: "Home" }, "home")
    .unit(P2, "bf3", { might: 1, name: "Foe" }, "foe")
    .unit(P2, "base", { might: 4, name: "Lurker" }, "lurker")
    .hand(P1, CARD, "grim");
}

const pickKeys = (d: unknown) => ((d as PickDecision).options ?? []).map((o) => o.card ?? o.key).sort();

describe("Grim Apothecary (unl-021-219)", () => {
  test("cost & body: exactly 3 energy, no power; enters the base exhausted as a 3-Might unit; the play trigger is a triggered chain item; 2 energy is not enough", async () => {
    const game = await board().build();
    await game.p1.play("grim", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("grim")).toBe("base");
    expect(game.state("grim")).toMatchObject({ baseMight: 3, isExhausted: true, might: 3 });
    expect(game.state("grim").keywords).toContain("Ambush");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "grim", controller: P1, triggered: true })]);
    expect((await board(2).build()).p1.can("play", "grim")).toBe(false);
  });

  test("played to base → 'you may' yes → only friendly units AT A BATTLEFIELD are offered (Scout, Ranger — not Home in base, not enemies); Scout returns to P1's hand", async () => {
    const game = await board().build();
    await game.p1.play("grim", { to: "base" });
    // rule 402 (finalization): the "you may" and the pick are answered before priority; the effect waits for resolution
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.decision()?.kind).toBe("pick");
    expect(pickKeys(game.decision())).toEqual(["ranger", "scout"]);
    await game.p1.pick("scout");
    await game.settle();
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.p1.hand()).toEqual(["scout"]);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.locationOf("ranger")).toBe("bf2");
    expect(game.locationOf("home")).toBe("base");
    expect(game.locationOf("foe")).toBe("bf3");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("the returned unit forgets its board state: back in hand it has no damage and no buff", async () => {
    const game = await board().build();
    expect(game.state("scout")).toMatchObject({ damage: 1, isBuffed: true });
    await game.p1.play("grim", { to: "base" });
    await game.p1.yes();
    await game.p1.pick("scout");
    await game.settle();
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.state("scout")).toMatchObject({ damage: 0, isBuffed: false });
  });

  test("'you may': declining returns nothing and the turn continues", async () => {
    const game = await board().build();
    await game.p1.play("grim", { to: "base" });
    await game.settle();
    await game.p1.no();
    expect(game.locationOf("scout")).toBe("bf1");
    expect(game.locationOf("ranger")).toBe("bf2");
    expect(game.chain()).toHaveLength(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("played TO a battlefield she is herself 'a friendly unit at a battlefield': offered alongside Scout/Ranger and may bounce herself back to hand (energy stays spent)", async () => {
    const game = await board().build();
    await game.p1.play("grim", { to: "bf1" });
    expect(game.locationOf("grim")).toBe("bf1");
    await game.p1.yes();
    expect(pickKeys(game.decision())).toEqual(["grim", "ranger", "scout"]);
    await game.p1.pick("grim");
    await game.settle();
    expect(game.zoneOf("grim")).toBe("hand");
    expect(game.p1.energy()).toBe(0);
    expect(game.locationOf("scout")).toBe("bf1");
  });

  test("no friendly unit at any battlefield: the trigger has nothing to return — no prompt lingers, board unchanged", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Home" }, "home")
      .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
      .hand(P1, CARD, "grim")
      .build();
    await game.p1.play("grim", { to: "base" });
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
      await game.settle();
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.locationOf("home")).toBe("base");
    expect(game.locationOf("foe")).toBe("bf1");
    expect(game.p1.hand()).toEqual([]);
  });

  test("Ambush on the opponent's turn: in P2's showdown at bf1 she is playable to bf1 only (not base), lifts the outmatched Scout to hand, then defends alone — the 2-Might attacker dies, she survives, P1 keeps bf1", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Scout" }, "scout")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .hand(P1, CARD, "grim")
      .build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    const dests = (game.p1.option("playUnit", "grim")?.variants.map((v) => v.params.location as string) ?? []).sort();
    expect(dests).toEqual(["battlefield-bf1"]);
    await game.p1.play("grim", { to: "bf1" });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("grim")).toMatchObject({ combatRole: "defender", isExhausted: true, location: "bf1" });
    // Her trigger is on the chain inside the showdown; both pass → resolve → yes → Scout (or her).
    game.script(P1, ["yes", "scout"]);
    await game.settle();
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.zoneOf("raider")).toBe("trash"); // took 3 from the Apothecary
    expect(game.locationOf("grim")).toBe("bf1"); // took 2 < 3
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("Ambush needs 'a battlefield where you have units': in P2's showdown at a battlefield where P1 has nobody, she cannot be played at all", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 }) // controlled by P1 but empty
      .unit(P1, "base", { might: 2, name: "Home" }, "home")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .hand(P1, CARD, "grim")
      .build();
    await game.p2.move("raider", "bf1"); // empty enemy battlefield → a (non-combat) showdown still opens
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("play", "grim")).toBe(false);
    expect((await game.p1.try((p) => p.play("grim", { to: "bf1" }))).ok).toBe(false);
    expect(game.zoneOf("grim")).toBe("hand");
  });

  test("Reaction timing only (813 / 310.1.a): during P2's Neutral Open main phase P1 is not offered the Ambush play even with a unit at a battlefield", async () => {
    const game = await board().active(P2).build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.can("play", "grim")).toBe(false);
    const t = await game.p1.try((p) => p.play("grim", { to: "bf1" }));
    expect(t.ok).toBe(false);
    expect(game.zoneOf("grim")).toBe("hand");
  });

  test("on your own turn the destinations are base + the battlefields where you have units (bf1, bf2); the enemy battlefield bf3 with no friendly unit is refused", async () => {
    const game = await board().build();
    const dests = (game.p1.option("playUnit", "grim")?.variants.map((v) => v.params.location as string) ?? []).sort();
    expect(dests).toEqual(["base", "battlefield-bf1", "battlefield-bf2"]);
    expect((await game.p1.try((p) => p.play("grim", { to: "bf3" }))).ok).toBe(false);
  });

  test("registry payload matches the printed text: Ambush keyword + optional play-self trigger returning a friendly battlefield unit to hand; 3 energy, no power, 3 Might", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 3, might: 3, name: "Grim Apothecary" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toEqual({ keyword: "Ambush", type: "keyword" });
    expect(def?.abilities?.[1]).toMatchObject({
      effect: { target: { controller: "friendly", location: "battlefield", type: "unit" }, type: "return-to-hand" },
      optional: true,
      trigger: { event: "play-self" },
      type: "triggered",
    });
  });
});
