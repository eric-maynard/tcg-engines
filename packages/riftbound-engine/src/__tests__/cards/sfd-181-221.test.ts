/**
 * Mechanized Menace — sfd-181-221 · Legend (Rumble) · Fury/Mind
 *
 *   Your Mechs have [Shield]. (+1 [Might] while they're defenders.)
 *
 * Rules: 364 passive ability of a legend (continuous from the Legend Zone — nothing to activate,
 * being exhausted is irrelevant); 814 Shield ("While I am a defender, I have +X Might", X omitted =
 * 1 — 814.1.b.3; lasts only while the Defender designation lasts — 814.1.d.1; several Shields SUM —
 * 814.2); 108.2 "your" = units you CONTROL; 187 a Mech unit token is a Mech.
 *
 * Head-judge corner cases covered here:
 *   1. Who gets it: friendly Mechs (printed card, inline-tagged, token) yes; friendly non-Mechs no;
 *      the opponent's Mechs no; a Mech you control but don't own yes, one you own but don't control no.
 *   2. When it counts: only as DEFENDER — a 3-Might Bubble Bot holds off a 3-Might attacker (4 vs 3),
 *      but attacking with it into a 3 is a straight trade; outside combat its Might reads 3.
 *   3. 814.1.d.1: the +1 disappears the moment combat ends (Might back to 3 after the showdown).
 *   4. 814.2 stacking: Block's [Shield 3] on a legend-shielded Mech defends at +4.
 *   5. Continuous: a Mech played after the fact (Production Surge token, Bubble Bot from hand) has it
 *      immediately; an exhausted legend still grants it.
 *   6. Partner Rumble, Hotheaded: Mechs carry both [Assault] and [Shield] — +1 on either side of combat.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-181-221";
const BUBBLE_BOT = "sfd-062-221"; // Mind 3-cost 3-Might Mech: When you play me, ready another friendly Mech.
const MEGA_MECH = "ogn-088-298"; // Mind 7-cost 8-Might vanilla Mech
const RUMBLE = "sfd-026-221"; // Fury 4-Might Rumble Mech: Your Mechs each have [Assault]. …
const PRODUCTION_SURGE = "sfd-076-221"; // Mind spell 4 (2 less with a Mech) + [mind]: play a 3-Might Mech token to base; draw 1
const BLOCK = "ogn-057-298"; // Calm Action spell 2: give a unit [Shield 3] and [Tank] this turn

const shieldOf = (game: { state(id: string): { grantedKeywords: readonly { keyword: string }[] } }, id: string) =>
  game.state(id).grantedKeywords.filter((k) => k.keyword === "Shield");

/** P2 to act; P1 (legend) holds bf1 with a Bubble Bot; P2 has a `might`-Might raider in base. */
function defended(might: number) {
  return scenario()
    .active(P2)
    .legend(P1, CARD, "mm")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", BUBBLE_BOT, "bot")
    .unit(P2, "base", { might, name: "Raider" }, "raider");
}

describe("Mechanized Menace (sfd-181-221)", () => {
  test("registry payload: a static grant-keyword Shield to friendly units filtered by the Mech tag — no cost, no trigger", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Rumble", name: "Mechanized Menace" });
    expect(def?.domain).toEqual(["fury", "mind"]);
    expect(def?.abilities).toEqual([
      { effect: { keyword: "Shield", target: { controller: "friendly", filter: { tag: "Mech" }, type: "unit" }, type: "grant-keyword" }, type: "static" },
    ]);
  });

  test("who has it: your Mechs (printed and inline-tagged) — not your non-Mechs, not the opponent's Mechs; base Might is unchanged outside combat", async () => {
    const game = await scenario()
      .legend(P1, CARD, "mm")
      .unit(P1, "base", MEGA_MECH, "mega")
      .unit(P1, "base", { might: 2, name: "Toy", tags: ["Mech"] }, "toy")
      .unit(P1, "base", { might: 2, name: "Grunt" }, "grunt")
      .unit(P2, "base", MEGA_MECH, "theirs")
      .build();
    expect(game.state("mega").keywords).toContain("Shield");
    expect(shieldOf(game, "mega")).toEqual([{ duration: "static", keyword: "Shield", value: undefined }]);
    expect(game.state("toy").keywords).toContain("Shield");
    expect(game.state("grunt").keywords).not.toContain("Shield");
    expect(game.state("theirs").keywords).not.toContain("Shield");
    expect(game.state("mega").might).toBe(8);
    expect(game.state("toy").might).toBe(2);
  });

  test("as DEFENDER the Mech fights at +1: a 3-Might Bubble Bot takes a 3-Might attacker — attacker dies, Bot lives, battlefield held", async () => {
    const game = await defended(3).build();
    await game.p2.move("raider", "bf1");
    expect(game.state("bot")).toMatchObject({ combatRole: "defender", might: 4 });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // took 4 ≥ 3
    expect(game.zoneOf("bot")).toBe("battlefield-bf1"); // took 3 < 4
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("control test (no legend): the same 3-vs-3 defense is a mutual kill — proving the +1 came from Mechanized Menace", async () => {
    const game = await scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", BUBBLE_BOT, "bot").unit(P2, "base", { might: 3 }, "raider").build();
    expect(game.state("bot").keywords).not.toContain("Shield");
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("bot")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash");
  });

  test("exactly +1, not more: a 4-Might attacker trades with the shielded 3-Might Bot (4 ≥ 4 and 4 ≥ 4)", async () => {
    const game = await defended(4).build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("bot")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash");
  });

  test("as ATTACKER Shield does nothing: the Bot attacking a 3-Might defender is a straight 3-for-3 trade", async () => {
    const game = await scenario().legend(P1, CARD, "mm").battlefield("bf1", { controller: P2 }).unit(P1, "base", BUBBLE_BOT, "bot").unit(P2, "bf1", { might: 3 }, "def").build();
    await game.p1.move("bot", "bf1");
    expect(game.state("bot")).toMatchObject({ combatRole: "attacker", might: 3 });
    await game.settle();
    expect(game.zoneOf("bot")).toBe("trash");
    expect(game.zoneOf("def")).toBe("trash");
  });

  test("814.1.d.1 — the bonus lasts only while defending: 4 during the showdown, back to 3 once combat is over", async () => {
    const game = await defended(2).build();
    expect(game.state("bot").might).toBe(3);
    await game.p2.move("raider", "bf1");
    expect(game.state("bot").might).toBe(4);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.state("bot")).toMatchObject({ combatRole: null, damage: 0, might: 3 });
  });

  test("814.2 stacking — Block's [Shield 3] on the legend-shielded Bot sums to Shield 4: it defends at 3 + 4 = 7 and survives a 6", async () => {
    const game = await defended(6).resources(P1, { energy: 2 }).hand(P1, BLOCK, "block").build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("block", { targets: "bot" });
    await game.settle();
    // Block resolved inside the showdown; combat then resolved with the Bot at 7.
    expect(game.zoneOf("raider")).toBe("trash"); // took 7 ≥ 6
    expect(game.zoneOf("bot")).toBe("battlefield-bf1"); // took 6 < 7
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("108.2 'your' follows CONTROL: an opponent-owned Mech you control has Shield; your own Mech under enemy control does not", async () => {
    const game = await scenario()
      .legend(P1, CARD, "mm")
      .card("stolen", { controller: P1, def: MEGA_MECH, owner: P2, zone: "base" })
      .card("lost", { controller: P2, def: MEGA_MECH, owner: P1, zone: "base" })
      .build();
    expect(game.state("stolen").keywords).toContain("Shield");
    expect(game.state("lost").keywords).not.toContain("Shield");
  });

  test("continuous: a Mech token played later (Production Surge, discounted to 2 by the Bot) and a Bubble Bot played from hand both have Shield at once; an exhausted legend still grants it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { mind: 1 } })
      .card("mm", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .unit(P1, "base", BUBBLE_BOT, "bot", { exhausted: true })
      .hand(P1, PRODUCTION_SURGE, "surge")
      .hand(P1, BUBBLE_BOT, "bot2")
      .build();
    expect(game.state("mm").isExhausted).toBe(true);
    expect(game.state("bot").keywords).toContain("Shield");
    await game.p1.cast("surge");
    expect(game.p1.energy()).toBe(3); // 4 − 2 (you control a Mech)
    await game.settle();
    const token = game.findAll({ name: "Mech", owner: P1 }).find((id) => game.state(id).isToken);
    expect(token).toBeDefined();
    expect(game.state(token as string)).toMatchObject({ might: 3, zone: "base" });
    expect(game.state(token as string).keywords).toContain("Shield");
    await game.p1.play("bot2");
    await game.settle({ policy: "first" }); // "ready another friendly Mech" — take whatever is offered
    expect(game.zoneOf("bot2")).toBe("base");
    expect(game.state("bot2").keywords).toContain("Shield");
  });

  test("partner Rumble, Hotheaded: every Mech (Rumble included) carries [Assault] AND [Shield]; a non-Mech ally gets neither", async () => {
    const game = await scenario()
      .legend(P1, CARD, "mm")
      .unit(P1, "base", RUMBLE, "rumble")
      .unit(P1, "base", BUBBLE_BOT, "bot")
      .unit(P1, "base", { might: 2, name: "Grunt" }, "grunt")
      .build();
    for (const id of ["rumble", "bot"]) {
      expect(game.state(id).keywords).toEqual(expect.arrayContaining(["Assault", "Shield"]));
    }
    expect(game.state("grunt").keywords).toEqual([]);
    expect(game.state("rumble").might).toBe(4);
    expect(game.state("bot").might).toBe(3);
  });

  test("Rumble + Menace in a real attack: the Bot attacks a 3-Might defender at 3+1 (Assault) and survives; defending later it would again be 4 (Shield)", async () => {
    const game = await scenario()
      .legend(P1, CARD, "mm")
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", RUMBLE, "rumble")
      .unit(P1, "base", BUBBLE_BOT, "bot")
      .unit(P2, "bf1", { might: 3, name: "Def" }, "def")
      .unit(P2, "base", { might: 3, name: "Avenger" }, "avenger")
      .build();
    await game.p1.move("bot", "bf1");
    expect(game.state("bot")).toMatchObject({ combatRole: "attacker", might: 4 });
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.locationOf("bot")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    await game.advanceTurn();
    await game.p2.move("avenger", "bf1");
    expect(game.state("bot")).toMatchObject({ combatRole: "defender", might: 4 });
    await game.settle();
    expect(game.zoneOf("avenger")).toBe("trash");
    expect(game.locationOf("bot")).toBe("bf1");
  });
});
