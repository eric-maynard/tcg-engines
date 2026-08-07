/**
 * Rengar, Pouncing — sfd-025-221 · Champion Unit (Rengar) · Fury · 3 energy + [fury] · 3 Might
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve, including to a
 *   battlefield you control.)
 *   [Assault 2] (+2 [Might] while I'm an attacker.)
 *   I can be played to a battlefield you're attacking.
 *
 * Head-judge notes — the tricky spots for this card:
 *  - 813.3.a: Reaction on a UNIT is only timing permission; locations stay "your base or a
 *    battlefield you control" — the third line adds exactly one more: the battlefield where you
 *    are currently the Attacker (464.2.c). An enemy battlefield you are NOT attacking, or an open
 *    battlefield during a non-combat showdown, is never a legal destination.
 *  - 464.2.c.3.a: a unit arriving at the combat battlefield mid-combat gains the Attacker
 *    designation at the next cleanup, so Assault 2 (807.1.c) applies → he fights as 5 Might even
 *    though he entered exhausted; after combat the designation (and the +2) is gone.
 *  - As a DEFENDER (opponent attacks a battlefield you control) he may still be flashed in there
 *    (you control it) but Assault does nothing: he defends as 3.
 *  - Closed state on the opponent's turn (their spell on the chain): Reaction lets him be played
 *    to base; a vanilla unit in the same hand may not.
 *  - Cost: 3 energy + 1 fury power, also when played at Reaction speed.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-025-221";
const VANILLA = "ogn-175-298"; // Shipyard Skulker, 3-might vanilla unit
const BOLT = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

/** P1 (3 energy + 1 fury, Rengar in hand) has a 2-might scout in base facing P2's `wallMight` unit at bf "enemy". */
function attackBoard(wallMight = 6) {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .battlefield("enemy", { controller: P2 })
    .battlefield("mine", { controller: P1 })
    .battlefield("other", { controller: P2 })
    .unit(P2, "enemy", { might: wallMight, name: "Wall" }, "wall")
    .unit(P2, "other", { might: 1, name: "Bystander" }, "bystander")
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .hand(P1, CARD, "rengar");
}

function playLocations(game: { p1: { option: (v: string, c: string) => { fields: readonly { arg: string; options?: readonly unknown[] }[] } | undefined } }): unknown[] {
  return [...(game.p1.option("play", "rengar")?.fields.find((f) => f.arg === "to")?.options ?? [])].sort();
}

describe("Rengar, Pouncing (sfd-025-221)", () => {
  test("cost: 3 energy + 1 fury deducted; enters base exhausted as a 3-Might unit; unaffordable without the fury or with 2 energy", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, CARD, "rengar").build();
    await game.p1.play("rengar");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("rengar")).toBe("base");
    expect(game.state("rengar").might).toBe(3);
    expect(game.state("rengar").isExhausted).toBe(true);
    const noFury = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "rengar").build();
    expect(noFury.p1.can("play", "rengar")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 2, power: { fury: 1 } }).hand(P1, CARD, "rengar").build();
    expect(lowEnergy.p1.can("play", "rengar")).toBe(false);
  });

  test("Open state, no combat: only base and the battlefield you control are offered — never an enemy battlefield (813.3.a)", async () => {
    const game = await attackBoard().build();
    expect(playLocations(game)).toEqual(["base", "battlefield-mine"]);
    const r = await game.p1.try((p) => p.play("rengar", { to: "enemy" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("rengar")).toBe("hand");
    expect(game.p1.energy()).toBe(3);
  });

  test("while you attack a battlefield, that battlefield (and only that enemy battlefield) becomes a legal destination", async () => {
    const game = await attackBoard().build();
    await game.p1.move("scout", "enemy");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(playLocations(game)).toEqual(["base", "battlefield-enemy", "battlefield-mine"]);
    const r = await game.p1.try((p) => p.play("rengar", { to: "other" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("rengar")).toBe("hand");
  });

  test("pounce: played into the combat he becomes an attacker (464.2.c.3.a) with Assault 2 → 5 Might; 2 + 5 = 7 kills the 6-Might defender and conquers", async () => {
    const game = await attackBoard(6).build();
    await game.p1.move("scout", "enemy");
    await game.p1.play("rengar", { to: "enemy" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("rengar")).toBe("battlefield-enemy");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    // Mid-showdown: designated attacker, Assault live, still exhausted from entering.
    expect(game.state("rengar").combatRole).toBe("attacker");
    expect(game.state("rengar").might).toBe(5);
    expect(game.state("rengar").isExhausted).toBe(true);
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.gameState.battlefields.enemy?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("rengar")).toBe("battlefield-enemy");
    // Combat over → no designation → back to printed 3.
    expect(game.state("rengar").might).toBe(3);
    expect(game.state("rengar").combatRole).toBeNull();
  });

  test("negative space: without the pounce the lone 2-Might scout loses to the 6-Might wall (so the previous win was Rengar's doing)", async () => {
    const game = await attackBoard(6).build();
    await game.p1.move("scout", "enemy");
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-enemy");
    expect(game.gameState.battlefields.enemy?.controller).toBe(P2);
    expect(game.zoneOf("rengar")).toBe("hand");
  });

  test("one short: 2 + 5 = 7 does not kill an 8-Might defender; the attackers die / are repelled and P2 keeps the battlefield", async () => {
    const game = await attackBoard(8).build();
    await game.p1.move("scout", "enemy");
    await game.p1.play("rengar", { to: "enemy" });
    await game.settle();
    expect(game.zoneOf("wall")).toBe("battlefield-enemy");
    expect(game.gameState.battlefields.enemy?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.locationOf("rengar")).not.toBe("enemy");
  });

  test("Assault 2 on a normal attack: moved in alone he fights as 5 and kills a 5-Might defender", async () => {
    const game = await scenario()
      .battlefield("enemy", { controller: P2 })
      .unit(P2, "enemy", { might: 5, name: "Guard" }, "guard")
      .unit(P1, "base", CARD, "rengar")
      .build();
    expect(game.state("rengar").might).toBe(3); // at rest
    await game.p1.move("rengar", "enemy");
    expect(game.state("rengar").might).toBe(5);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
  });

  test("Assault does nothing on defense: a 4-Might attacker kills a defending Rengar (3), who only deals 3 back", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("mine", { controller: P1 })
      .unit(P1, "mine", CARD, "rengar")
      .unit(P2, "base", { might: 4, name: "Bruiser" }, "bruiser")
      .build();
    await game.p2.move("bruiser", "mine");
    expect(game.state("rengar").combatRole).toBe("defender");
    expect(game.state("rengar").might).toBe(3);
    await game.settle();
    expect(game.zoneOf("rengar")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("battlefield-mine"); // took 3 < 4
    expect(game.gameState.battlefields.mine?.controller).toBe(P2);
  });

  test("[Reaction] is not permission to play in the opponent's Neutral Open state (316.5.b, 813.1.c.1) — the engine offers the unit play anyway", async () => {
    // Expected: on P2's turn with no chain/showdown only P2 may play cards, so Rengar is not legal
    // for P1. Actual: playUnit is offered to (and accepted from) P1 in P2's open main phase.
    const game = await scenario().active(P2).resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, CARD, "rengar").build();
    expect(game.p1.can("play", "rengar")).toBe(false);
    const r = await game.p1.try((p) => p.play("rengar"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("rengar")).toBe("hand");
  });

  test("[Reaction] on the opponent's turn: while P2 attacks your battlefield you may flash Rengar in there (you control it) or to base; he defends as 3", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("mine", { controller: P1 })
      .battlefield("theirs", { controller: P2 })
      .unit(P1, "mine", { might: 2, name: "Sentry" }, "sentry")
      .unit(P2, "base", { might: 4, name: "Bruiser" }, "bruiser")
      .hand(P1, CARD, "rengar")
      .build();
    await game.p2.move("bruiser", "mine");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(playLocations(game)).toEqual(["base", "battlefield-mine"]);
    await game.p1.play("rengar", { to: "mine" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("rengar")).toBe("battlefield-mine");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.state("rengar").might).toBe(3); // no Assault on defense
    await game.settle();
    // Defenders 2 + 3 = 5 ≥ 4 → the attacker dies; whichever defender soaks its 4, "mine" stays P1's.
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.gameState.battlefields.mine?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("flashed in as a defender mid-combat he gains the Defender designation at the next cleanup (464.2.c.3.a)", async () => {
    // A cleanup follows every action, so Rengar reads combatRole "defender" like the Sentry beside him.
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("mine", { controller: P1 })
      .unit(P1, "mine", { might: 2, name: "Sentry" }, "sentry")
      .unit(P2, "base", { might: 4, name: "Bruiser" }, "bruiser")
      .hand(P1, CARD, "rengar")
      .build();
    await game.p2.move("bruiser", "mine");
    await game.p2.passFocus();
    await game.p1.play("rengar", { to: "mine" });
    expect(game.state("sentry").combatRole).toBe("defender");
    expect(game.state("rengar").combatRole).toBe("defender");
  });

  test("[Reaction] in a Closed state on the opponent's turn: playable to base in response to their spell; a vanilla unit in the same hand is not", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 5, power: { fury: 2 } })
      .resources(P2, { energy: 1 })
      .unit(P1, "base", { might: 2, name: "Dummy" }, "dummy")
      .hand(P1, CARD, "rengar")
      .hand(P1, VANILLA, "skulker")
      .hand(P2, BOLT, "bolt")
      .build();
    await game.p2.cast("bolt", { targets: "dummy" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.p1.can("play", "skulker")).toBe(false);
    expect(game.p1.can("play", "rengar")).toBe(true);
    expect(playLocations(game)).toEqual(["base"]);
    await game.p1.play("rengar");
    expect(game.zoneOf("rengar")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } });
    await game.settle();
    expect(game.state("dummy").damage).toBe(1); // their spell still resolved afterwards
    expect(game.turnPlayer()).toBe(P2);
  });

  test("a non-combat showdown (moving onto an empty open battlefield) is not 'attacking' (124.2/464.2.c/807.1.d) — that not-yet-controlled battlefield must not be offered", async () => {
    // Expected: during the non-combat showdown P1 neither controls "open" (control comes on conquer
    // after the showdown) nor has an Attacker designation (no combat), so only base is legal.
    // Actual: the engine treats "contested by you" as "attacking" and offers battlefield-open.
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("open", { controller: null })
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .hand(P1, CARD, "rengar")
      .build();
    await game.p1.move("scout", "open");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.gameState.battlefields.open?.controller).not.toBe(P1);
    expect(playLocations(game)).toEqual(["base"]);
    const r = await game.p1.try((p) => p.play("rengar", { to: "open" }));
    expect(r.ok).toBe(false);
  });

  test("after that showdown ends you control the battlefield, so it is an ordinary 355.2.a destination", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("open", { controller: null })
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .hand(P1, CARD, "rengar")
      .build();
    await game.p1.move("scout", "open");
    await game.settle();
    expect(game.gameState.battlefields.open?.controller).toBe(P1);
    expect(playLocations(game)).toEqual(["base", "battlefield-open"]);
    await game.p1.play("rengar", { to: "open" });
    expect(game.zoneOf("rengar")).toBe("battlefield-open");
  });

  test("parsed abilities match the printed text: Reaction keyword, Assault 2, and a self static enabling play-to-attacked-battlefield; [fury] power cost; reaction timing", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 3, isChampion: true, might: 3, powerCost: ["fury"], timing: "reaction" });
    const abilities = (def?.abilities ?? []) as { type: string; keyword?: string; value?: number; effect?: Record<string, unknown> }[];
    expect(abilities).toHaveLength(3);
    expect(abilities[0]).toMatchObject({ keyword: "Reaction", type: "keyword" });
    expect(abilities[1]).toMatchObject({ keyword: "Assault", type: "keyword", value: 2 });
    expect(abilities[2]).toMatchObject({ effect: { target: "self" }, type: "static" });
    expect(JSON.stringify(abilities[2])).toMatch(/Attack/i);
  });
});
