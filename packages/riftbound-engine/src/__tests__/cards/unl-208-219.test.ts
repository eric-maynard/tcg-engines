/**
 * Black Flame Altar — unl-208-219 · Battlefield
 *
 *   Units here with [Temporary] have [Shield]. (+1 [Might] while they're defenders.)
 *
 * Rules: 814 (Shield: passive, "+X Might while I am a defender", X omitted = 1; 814.2 Shield from
 * several sources sums), 816 (Temporary: "kill this at the start of its controller's Beginning Phase,
 * before scoring"; 816.3 having Temporary is a checkable characteristic), 364.1 (conditional keyword
 * grants are passives — continuous, no chain), 124.1 (granted keywords stop when the unit leaves),
 * 465 (combat: simultaneous damage, lethal = damage ≥ Might), 190.4 (empty battlefield → control lost).
 *
 * Head-judge notes — the tricky spots this file covers:
 *  1. The filter is the whole card: ONLY units with [Temporary] get Shield. A plain unit standing on
 *     the Altar defends at printed Might (3 into 3 trades).
 *  2. Shield is defender-only Might: a Temporary Sprite (3) DEFENDING here is a 4 — a 3-Might attacker
 *     dies and the Sprite lives; a 4-Might attacker trades exactly. Attacking FROM/INTO the Altar, a
 *     Sprite is a plain 3.
 *  3. "Units here" is anyone's units, and only HERE — a Sprite at the next battlefield gets nothing;
 *     one that walks off the Altar loses it.
 *  4. 814.2 stacking: a Temporary unit with its own Shield defends at +2.
 *  5. Partners: Last Stand (double Might this turn + GIVE Temporary) turns an ordinary unit into an
 *     Altar-shielded defender for the opponent's turn — and Temporary still kills it (and a lone
 *     Sprite) before the next hold is scored (816.1.b): the Altar protects in combat, not from the clock.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-208-219";
const SPRITE = "unl-t07"; // 3-Might Sprite unit token · [Temporary]
const LAST_STAND = "ogn-069-298"; // Calm Action spell, 3 + [calm]: Double a friendly unit's Might this turn. Give it [Temporary].

/** P2 to act; P1 controls the Altar with ONE defender on it; P2 has a ready attacker of `atkMight` in base. */
function siege(defender: Parameters<ReturnType<typeof scenario>["unit"]>[2], atkMight: number) {
  return scenario()
    .active(P2)
    .battlefield("altar", { controller: P1, def: CARD, inert: false })
    .battlefield("plain", { controller: P1 })
    .unit(P1, "altar", defender, "def")
    .unit(P2, "base", { might: atkMight, name: "Attacker" }, "atk");
}

describe("Black Flame Altar (unl-208-219)", () => {
  // BUG — expected: the static grants Shield only to units here WITH [Temporary] (a keyword filter on the target, cf.
  // Petal Pixie's `filter: { keyword: "Temporary" }`). Actual parse: `target: { type: "unit", location: "here" }` —
  // the Temporary restriction was dropped, so every unit on the Altar is granted Shield.
  test("registry payload should be a static Shield grant restricted to units here WITH [Temporary] (filter missing)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Black Flame Altar" });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { keyword: "Shield", target: { filter: { keyword: "Temporary" }, location: "here", type: "unit" }, type: "grant-keyword" },
      type: "static",
    });
  });

  test("continuous passive (364.1): a Temporary Sprite standing on the Altar shows a static Shield grant at rest — still 3 Might out of combat — while a Sprite at the next battlefield has none", async () => {
    const game = await siege(SPRITE, 3).unit(P1, "plain", SPRITE, "away").build();
    expect(game.state("def").keywords).toEqual(expect.arrayContaining(["Temporary", "Shield"]));
    expect(game.state("def").grantedKeywords).toEqual([{ duration: "static", keyword: "Shield" }]);
    expect(game.state("def").might).toBe(3);
    expect(game.state("away").keywords).toEqual(["Temporary"]);
    expect(game.state("away").grantedKeywords).toEqual([]);
    expect(game.chain()).toEqual([]);
  });

  test("defending Sprite is a 4: a 3-Might attacker deals 3 (< 4) and takes 4 (≥ 3) — attacker dies, Sprite lives healed, P1 keeps the Altar and P2 scores nothing", async () => {
    const game = await siege(SPRITE, 3).build();
    await game.p2.move("atk", "altar");
    expect(game.state("def")).toMatchObject({ combatRole: "defender", might: 4 });
    expect(game.state("atk")).toMatchObject({ combatRole: "attacker", might: 3 });
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("def")).toBe("battlefield-altar");
    expect(game.state("def")).toMatchObject({ damage: 0, might: 3 }); // Shield ends with the defender designation (814.1.d.1)
    expect(game.gameState.battlefields.altar?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("exactly lethal both ways: a 4-Might attacker into the shielded Sprite (4) — both die, the Altar empties and nobody conquers", async () => {
    const game = await siege(SPRITE, 4).build();
    await game.p2.move("atk", "altar");
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("def")).toBe("gone"); // a dead token ceases to exist (186.1)
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields.altar?.controller).not.toBe(P2);
  });

  // BUG — expected: a unit WITHOUT [Temporary] gets no Shield from the Altar, so a plain 3 defending against a 3
  // trades (both to trash). Actual: the unfiltered grant makes it a 4-Might defender that survives.
  test("negative space — a NON-Temporary 3-Might unit on the Altar defends at 3: into a 3-Might attacker both die", async () => {
    const game = await siege({ might: 3, name: "Regular" }, 3).build();
    expect(game.state("def").keywords).not.toContain("Shield");
    await game.p2.move("atk", "altar");
    expect(game.state("def")).toMatchObject({ combatRole: "defender", might: 3 });
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("def")).toBe("trash");
  });

  test("Shield is defender-only: P1's Sprite ATTACKING into P2's Altar held by P2's own Temporary Sprite — attacker stays 3, the ENEMY defender is the 4 ('units here' = anyone's) → attacker dies, defender holds", async () => {
    const game = await scenario()
      .battlefield("altar", { controller: P2, def: CARD, inert: false })
      .unit(P2, "altar", SPRITE, "theirSprite")
      .unit(P1, "base", SPRITE, "mySprite")
      .build();
    await game.p1.move("mySprite", "altar");
    expect(game.state("mySprite")).toMatchObject({ combatRole: "attacker", might: 3 });
    expect(game.state("theirSprite")).toMatchObject({ combatRole: "defender", might: 4 });
    await game.settle();
    expect(game.zoneOf("mySprite")).toBe("gone");
    expect(game.zoneOf("theirSprite")).toBe("battlefield-altar");
    expect(game.gameState.battlefields.altar?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("'here' only: the same Sprite defending the PLAIN battlefield next door is an ordinary 3 — into a 3-Might attacker both die", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("altar", { controller: P1, def: CARD, inert: false })
      .battlefield("plain", { controller: P1 })
      .unit(P1, "plain", SPRITE, "def")
      .unit(P2, "base", { might: 3, name: "Attacker" }, "atk")
      .build();
    await game.p2.move("atk", "plain");
    expect(game.state("def")).toMatchObject({ combatRole: "defender", might: 3 });
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("def")).toBe("gone");
  });

  // BUG — expected (814.2): printed Shield + the Altar's Shield = Shield 2, so the veteran DEFENDS AS A 5: it deals 5
  // (kills a 5-Might attacker) and dies to the 5 back — an exact trade. Actual: `state().might` says 5, but combat deals
  // and checks with 4 (one Shield instance): the 5-Might attacker survives on 4 damage.
  test("814.2 — Shield sums: a Temporary unit with its own [Shield] is a 5-Might defender on the Altar (3 + 1 + 1); a 5-Might attacker trades with it exactly", async () => {
    const five = await siege({ keywords: ["Shield", "Temporary"], might: 3, name: "Masked Veteran" }, 5).build();
    await five.p2.move("atk", "altar");
    expect(five.state("def")).toMatchObject({ combatRole: "defender", might: 5 });
    await five.settle();
    expect(five.zoneOf("atk")).toBe("trash");
    expect(five.zoneOf("def")).toBe("trash");
  });

  // BUG — expected (814.2 + 465): the summed Shield is real Might in combat, so 4 damage into the 5-Might defender is
  // not lethal — the 4-Might attacker dies (takes 5) and the veteran survives. Actual: the card view reports Might 5
  // but combat resolution kills the defender on 4 damage (only one Shield instance is counted when checking lethal).
  test("814.2 in combat — the doubly-shielded 5-Might defender must SURVIVE a 4-Might attacker (4 < 5) while killing it", async () => {
    const four = await siege({ keywords: ["Shield", "Temporary"], might: 3, name: "Masked Veteran" }, 4).build();
    await four.p2.move("atk", "altar");
    expect(four.state("def")).toMatchObject({ combatRole: "defender", might: 5 });
    await four.settle();
    expect(four.zoneOf("atk")).toBe("trash");
    expect(four.zoneOf("def")).toBe("battlefield-altar");
    expect(four.state("def").damage).toBe(0);
  });

  test("124.1 — walking off the Altar drops the grant: the Sprite moved home to base has [Temporary] only", async () => {
    const game = await scenario()
      .battlefield("altar", { controller: P1, def: CARD, inert: false })
      .unit(P1, "altar", SPRITE, "sprite")
      .unit(P1, "altar", { might: 1, name: "Anchor" }, "anchor")
      .build();
    expect(game.state("sprite").keywords).toContain("Shield");
    await game.p1.move("sprite", "base");
    await game.settle();
    expect(game.locationOf("sprite")).toBe("base");
    expect(game.state("sprite").keywords).toEqual(["Temporary"]);
    expect(game.state("sprite").grantedKeywords).toEqual([]);
  });

  test("partner — Last Stand on an ordinary 2-Might unit at the Altar: 4 Might + [Temporary] now (so Shield shows); on P2's turn the doubling is gone but Temporary+Shield remain → it defends as a 3 and kills a 2-Might attacker", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .battlefield("altar", { controller: P1, def: CARD, inert: false })
      .unit(P1, "altar", { might: 2, name: "Militia" }, "militia")
      .unit(P2, "base", { might: 2, name: "Attacker" }, "atk")
      .hand(P1, LAST_STAND, "ls")
      .build();
    await game.p1.cast("ls", { targets: "militia" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.state("militia").might).toBe(4);
    expect(game.state("militia").keywords).toEqual(expect.arrayContaining(["Temporary", "Shield"]));
    expect(game.state("militia").grantedKeywords).toEqual(
      expect.arrayContaining([{ duration: "permanent", keyword: "Temporary" }, { duration: "static", keyword: "Shield" }]),
    );
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("militia").might).toBe(2); // "this turn" doubling expired (317.2.c) …
    expect(game.state("militia").keywords).toEqual(expect.arrayContaining(["Temporary", "Shield"])); // … the given keyword did not
    await game.p2.move("atk", "altar");
    expect(game.state("militia")).toMatchObject({ combatRole: "defender", might: 3 });
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("militia")).toBe("battlefield-altar");
    expect(game.gameState.battlefields.altar?.controller).toBe(P1);
    // 816.1.b — and the clock still runs: at the start of P1's next Beginning Phase it is killed BEFORE scoring.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("militia")).toBe("trash");
    expect(game.p1.points()).toBe(0);
  });

  test("partner — the Altar shields in combat, not from Temporary itself: a lone Sprite holding the Altar dies at the start of P1's Beginning Phase (its trigger on the chain first), no hold point, the Altar falls uncontrolled", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("altar", { controller: P1, def: CARD, inert: false }).unit(P1, "altar", SPRITE, "sprite").build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sprite", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.altar?.controller).toBe(null);
  });
});
