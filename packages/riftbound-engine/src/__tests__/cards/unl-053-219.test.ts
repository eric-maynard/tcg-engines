/**
 * Scuttle Crab — unl-053-219 · Unit · Calm · 2 energy · 0 Might
 *
 *   (Units with 0 [Might] can conquer and hold.)
 *   When you play me, draw 1.
 *   [Deathknell][>] Choose an opponent. They reveal their hand. You can look at their
 *   facedown cards this turn. Gain 1 XP. (When I die, get the effects.)
 *
 * Head-judge checklist (trickiest situations for this card):
 *  1. 0 Might: lethal damage is "non-zero damage ≥ Might" (142.4.b) — the Crab does NOT die
 *     just for having 0 Might, but ANY 1 damage kills it; in combat it contributes 0 damage.
 *  2. 0 Might still conquers an empty battlefield and still holds at Beginning (reminder text /
 *     348.2.a) — the point must be scored with the Crab as the only unit there.
 *  3. Deathknell fires for the Crab's CONTROLLER no matter whose turn / whose effect killed it
 *     (spell kill on the opponent's turn, combat death as attacker) — XP goes to P1, never P2.
 *  4. Deathknell goes on the chain before the Crab hits the trash (428.1.a.1.b); the XP is
 *     gained on resolution, not on death — and nothing is gained while it merely survives.
 *  5. "They reveal their hand / look at facedown cards this turn" are information effects with
 *     a this-turn expiry; the play trigger is a separate draw that must not also fire on death.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, isHiddenView, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-053-219";
const FILLER = "ogn-175-298"; // Shipyard Skulker, vanilla 3-might
const VENGEANCE = "ogn-229-298"; // 4 energy + [order][order] spell: Kill a unit.

describe("Scuttle Crab (unl-053-219)", () => {
  test("parsed abilities are a play-self draw trigger + a Deathknell (die) trigger ending in gain 1 XP", async () => {
    // Expected: [triggered play-self → draw 1, keyword Deathknell / triggered die → (…, gain-xp 1)].
    // Actual: abilities = [{ type: "spell", effect: gain-xp 1 }] — both printed abilities are lost.
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 2, might: 0 });
    const abilities = (def?.abilities ?? []) as { type: string; trigger?: { event: string }; effect?: unknown }[];
    expect(abilities.some((a) => a.type === "triggered" && a.trigger?.event === "play-self" && JSON.stringify(a.effect).includes('"draw"'))).toBe(true);
    const knell = abilities.find((a) => a.type === "triggered" && a.trigger?.event === "die");
    expect(knell).toBeDefined();
    expect(JSON.stringify(knell?.effect)).toContain("gain-xp");
    expect(abilities.some((a) => a.type === "spell")).toBe(false);
  });

  test("cost: 2 energy for a 0-Might unit that enters the base; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "crab").build();
    await game.p1.play("crab");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("crab")).toBe("base");
    expect(game.state("crab").might).toBe(0);
    expect(game.state("crab").baseMight).toBe(0);
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "crab").build();
    expect(poor.p1.can("play", "crab")).toBe(false);
  });

  test("'When you play me, draw 1' — playing the Crab should draw its controller 1 card", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).deckTop(P1, FILLER, "top").hand(P1, CARD, "crab").build();
    await game.p1.play("crab");
    await game.settle();
    expect(game.zoneOf("crab")).toBe("base");
    expect(game.zoneOf("top")).toBe("hand");
    expect(game.p1.hand()).toEqual(["top"]);
    expect(game.p1.xp()).toBe(0); // the play trigger is a draw, not the Deathknell XP
  });

  test("0 Might can conquer: moving alone onto an empty enemy-controlled battlefield takes control and scores 1", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "crab")
      .build();
    await game.p1.move("crab", "bf1");
    await game.settle();
    expect(game.locationOf("crab")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("0 Might can hold: controlling a battlefield with only the Crab there scores 1 at the start of your turn", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "crab")
      .build();
    expect(game.p1.points()).toBe(0);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.locationOf("crab")).toBe("bf1");
  });

  test("0 Might is not lethal by itself (142.4.b): the Crab survives turn cycling with no damage and gains no XP", async () => {
    const game = await scenario().unit(P1, "base", CARD, "crab").build();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.zoneOf("crab")).toBe("base");
    expect(game.p1.xp()).toBe(0);
  });

  test("Deathknell — killed by an enemy spell on the opponent's turn, the Crab's controller (P1) gains 1 XP and P2 gains none", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 4, power: { order: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "crab")
      .hand(P2, VENGEANCE, "vengeance")
      .build();
    await game.p2.cast("vengeance", { targets: "crab" });
    await game.settle();
    expect(game.zoneOf("crab")).toBe("trash");
    expect(game.p1.xp()).toBe(1);
    expect(game.p2.xp()).toBe(0);
  });

  test("Deathknell in combat — a 0-Might attacker dies to a 1-Might defender (dealing 0 back) and its controller gains 1 XP", async () => {
    // Expected (323.4 / 808): Crab takes 1 ≥ 0 (non-zero) → dies; defender undamaged; P1 xp 1.
    // Actual: the combat death happens but no Deathknell trigger exists → xp stays 0.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Minnow" }, "minnow")
      .unit(P1, "base", CARD, "crab")
      .build();
    await game.p1.move("crab", "bf1");
    await game.settle();
    expect(game.zoneOf("crab")).toBe("trash");
    expect(game.state("minnow").damage).toBe(0);
    expect(game.zoneOf("minnow")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.xp()).toBe(1);
  });

  test("the 0-Might Crab attacking a 1-Might defender dies (142.4.b) and deals no damage", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Minnow" }, "minnow")
      .unit(P1, "base", CARD, "crab")
      .build();
    await game.p1.move("crab", "bf1");
    await game.settle();
    expect(game.zoneOf("crab")).toBe("trash");
    expect(game.state("minnow").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("Deathknell information effects — the chosen opponent's hand and their facedown cards become visible to P1 this turn only", async () => {
    // Expected: after the Deathknell resolves P1's view of P2's hand / facedown zone shows real
    // cards (not redacted); after the turn passes the facedown card is private again.
    // Actual: no Deathknell exists (and no reveal/peek grant is recorded), so P1 sees hidden views.
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 4, power: { order: 2 } })
      .battlefield("bf1", { controller: P2 })
      // rule 190.4.c / 107.3.d: P2 must keep a unit at bf1 or it loses control
      // in cleanup and its facedown card is removed before we can look at it.
      .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P1, "base", CARD, "crab")
      .hand(P2, FILLER, "secret")
      .facedown(P2, "bf1", FILLER, "buried")
      .hand(P2, VENGEANCE, "vengeance")
      .build();
    await game.p2.cast("vengeance", { targets: "crab" });
    await game.settle();
    expect(game.zoneOf("crab")).toBe("trash");
    const p2HandSeenByP1 = (game.p1.view().zones.hand ?? []).filter((c) => c.owner === P2);
    expect(p2HandSeenByP1.length).toBeGreaterThan(0);
    expect(p2HandSeenByP1.every((c) => !isHiddenView(c))).toBe(true);
    const facedownSeenByP1 = game.p1.view().zones["facedown-bf1"] ?? [];
    expect(facedownSeenByP1).toHaveLength(1);
    expect(isHiddenView(facedownSeenByP1[0]!)).toBe(false);
    await game.advanceTurn(); // "this turn" has ended
    const later = game.p1.view().zones["facedown-bf1"] ?? [];
    expect(isHiddenView(later[0]!)).toBe(true);
  });
});
