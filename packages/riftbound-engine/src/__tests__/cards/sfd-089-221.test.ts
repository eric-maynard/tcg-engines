/**
 * Rumble, Scrapper — sfd-089-221 · Champion Unit · Mind · 5 energy + [mind] · 4 Might · Rumble
 *
 *   Your Mechs have +1 [Might] (including me).
 *   When I hold, play a 3 [Might] Mech unit token to your base.
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. "(including me)": Rumble is tagged Rumble, not Mech, yet his own static must lift HIM to 5.
 *     Exactly-lethal check: an enemy "Deal 4" (Void Seeker) must NOT kill him.
 *  2. Scope of the static: friendly Mech-tagged units and Mech tokens only — never enemy Mechs,
 *     never a friendly non-Mech. It is continuous (rule 522): a Mech token that shows up later
 *     gets it immediately, and everything drops back the moment Rumble leaves the board.
 *  3. Hold (383.4.d / 469.2): only in YOUR Beginning Phase, only if Rumble himself is at a
 *     battlefield you keep control of. Rumble in base while another unit holds → nothing; the
 *     opponent's Beginning Phase → nothing.
 *  4. The token: a 3-Might Mech unit token, played to YOUR BASE (no location choice even with a
 *     controlled battlefield), enters exhausted like any played unit, and reads 4 under the static.
 *  5. Holds accumulate: two of your Beginning Phases at the battlefield → two tokens, two points.
 *  6. Cost: 5 energy AND one mind power; either short → not playable.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-089-221";
const BUBBLE_BOT = "sfd-062-221"; // 3-Might Mind Mech
const MEGA_MECH = "ogn-088-298"; // 8-Might Mind Mech
const VOID_SEEKER = "ogn-024-298"; // Action · 3 + [fury] · Deal 4 to a unit at a battlefield. Draw 1.
const DRAG_UNDER = "sfd-164-221"; // Action · 5 + [order] · Kill a unit at a battlefield.

const mechTokens = (game: Game) =>
  game.findAll({ name: "Mech", owner: P1 }).filter((id) => game.state(id).isToken && game.locationOf(id) !== undefined);

describe("Rumble, Scrapper (sfd-089-221)", () => {
  test("costs 5 energy + 1 mind power; unplayable without the power or with 4 energy; a friendly Mech already on board jumps 3 → 4 the moment he lands", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { mind: 1 } }).unit(P1, "base", BUBBLE_BOT, "bub").hand(P1, CARD, "rum").build();
    expect(game.state("bub").might).toBe(3);
    await game.p1.play("rum");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("rum")).toBe("base");
    expect(game.state("rum").isExhausted).toBe(true);
    expect(game.state("bub").might).toBe(4);
    expect(game.chain()).toHaveLength(0);
    const noPower = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "rum").build();
    expect(noPower.p1.can("play", "rum")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 4, power: { mind: 2 } }).hand(P1, CARD, "rum").build();
    expect(lowEnergy.p1.can("play", "rum")).toBe(false);
  });

  test("static scope: friendly Mechs +1 (Bubble Bot 4, Mega-Mech 9); enemy Mechs and friendly non-Mechs untouched", async () => {
    const game = await scenario()
      .unit(P1, "base", CARD, "rum")
      .unit(P1, "base", BUBBLE_BOT, "bub")
      .unit(P1, "base", MEGA_MECH, "mega")
      .unit(P1, "base", { might: 2, name: "Plain Recruit" }, "plain")
      .unit(P2, "base", BUBBLE_BOT, "theirBub")
      .build();
    expect(game.state("bub")).toMatchObject({ baseMight: 3, might: 4 });
    expect(game.state("mega").might).toBe(9);
    expect(game.state("plain").might).toBe(2);
    expect(game.state("theirBub").might).toBe(3);
  });

  // BUG — expected: "(including me)" lifts Rumble himself to 5 even though his only tag is Rumble.
  // Actual: the parsed static filters on tag Mech and Rumble stays at 4.
  test("'(including me)' — Rumble should read 5 Might under his own static, but stays 4", async () => {
    const game = await scenario().unit(P1, "base", CARD, "rum").build();
    expect(game.state("rum")).toMatchObject({ baseMight: 4, might: 5 });
  });

  // BUG — same root cause, shown where it hurts: at 5 Might an enemy Void Seeker (deal 4) leaves
  // him alive with 4 damage; at the engine's 4 Might it is exactly lethal and he dies.
  test("enemy Void Seeker's 4 damage should NOT kill a 5-Might (including me) Rumble at a battlefield", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "rum")
      .hand(P2, VOID_SEEKER, "vs")
      .build();
    await game.p2.cast("vs", { targets: "rum" });
    await game.settle();
    expect(game.zoneOf("rum")).toBe("battlefield-bf1");
    expect(game.state("rum").damage).toBe(4);
  });

  test("continuous: when Rumble is killed (Drag Under) the friendly Mech falls back to its printed 3", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 5, power: { order: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "rum")
      .unit(P1, "base", BUBBLE_BOT, "bub")
      .hand(P2, DRAG_UNDER, "du")
      .build();
    expect(game.state("bub").might).toBe(4);
    await game.p2.cast("du", { targets: "rum" });
    await game.settle();
    expect(game.zoneOf("rum")).toBe("trash");
    expect(game.state("bub").might).toBe(3);
  });

  test("hold: at the start of YOUR Beginning Phase with Rumble at a battlefield you control → 1 point, trigger on the chain, then a Mech token in your base", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "rum").build();
    expect(mechTokens(game)).toHaveLength(0);
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rum", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.phase()).toBe("main");
    const tokens = mechTokens(game);
    expect(tokens).toHaveLength(1);
    const t = game.state(tokens[0] as string);
    expect(t).toMatchObject({ baseMight: 3, cardType: "unit", controller: P1, isExhausted: true, isToken: true, zone: "base" });
    expect(t.might).toBe(4); // it is a Mech → Rumble's static applies to it too
    expect(game.violations()).toEqual([]);
  });

  test("'to your base': the token never lands at the held battlefield and no destination prompt is raised", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "rum").build();
    await game.advanceTurn();
    expect(game.decision()?.kind).toBe("action");
    expect(game.cardsAt("bf1", P1)).toEqual(["rum"]);
    expect(mechTokens(game).map((id) => game.zoneOf(id))).toEqual(["base"]);
  });

  test("negative space: Rumble in base while ANOTHER unit holds → the point is scored but no token ('When I hold')", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "holder")
      .unit(P1, "base", CARD, "rum")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(mechTokens(game)).toHaveLength(0);
  });

  test("negative space: the OPPONENT's Beginning Phase does not hold your battlefield — no point, no token", async () => {
    const game = await scenario().turn(3).active(P1).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "rum").build();
    await game.advanceTurn(); // P1 ends → P2's turn begins
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(mechTokens(game)).toHaveLength(0);
  });

  test("holds accumulate: two of your Beginning Phases at the battlefield → 2 points and two 4-Might Mech tokens", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "rum").build();
    await game.advanceTurn(); // → P1 (hold #1)
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 (hold #2)
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(2);
    const tokens = mechTokens(game);
    expect(tokens).toHaveLength(2);
    expect(tokens.map((id) => game.state(id).might)).toEqual([4, 4]);
  });

  test("parsed abilities: +1 Might static over friendly Mech units, and a self 'hold' trigger creating a 3-Might Mech unit token in base", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ energyCost: 5, isChampion: true, might: 4, powerCost: ["mind"], tags: ["Rumble"] });
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { amount: 1, target: { controller: "friendly", filter: { tag: "Mech" }, type: "unit" }, type: "modify-might" },
      type: "static",
    });
    expect(def?.abilities?.[1]).toMatchObject({
      effect: { location: "base", token: { might: 3, name: "Mech", type: "unit" }, type: "create-token" },
      trigger: { event: "hold", on: "self" },
      type: "triggered",
    });
  });
});
