/**
 * Elder Dragon — unl-118-219 · Unit · Body · 12 energy + [body]×4 · 10 Might · Dragon
 *
 *   Any amount of your damage is enough to kill enemy units.
 *   When you play me, choose up to one enemy unit at each location. Deal 1 to them.
 *
 * Rules: 142.4.b (lethal damage = non-zero damage ≥ Might), 142.4.c (uses THIS card as its example:
 * the passive lowers the lethal-damage value of ENEMY units that carry damage marked by YOU),
 * 323.5 (units with lethal damage die in the next Cleanup), 364 (passives apply continuously while
 * the source is on the board and stop the moment it leaves), 465.2.c.3/4 (combat assignment must
 * give each unit exactly lethal before moving on — with lethal = 1 the Dragon's side can spread
 * 1 per enemy unit), 355.13 ("up to one" — zero is a legal choice), 106 (locations = each base and
 * each battlefield).
 *
 * Head-judge checklist (trickiest situations for THIS card):
 *  1. "your damage" is ANY damage you are responsible for — the play trigger's 1, your spells
 *     (Hextech Ray 3 into a 5-Might unit), and combat damage from your OTHER units — not only
 *     damage dealt by the Dragon itself.
 *  2. Only ENEMY units: the opponent's bolts at your units are unaffected, and so is damage you
 *     deal to your own units.
 *  3. It is a passive: once the Dragon is gone a 3-damage bolt no longer kills a 5-Might unit.
 *  4. Play trigger targeting: at most ONE enemy unit per location (base, bf1, bf2 …), friendly
 *     units never offered, declining everywhere is legal; combined with the passive every chosen
 *     unit dies from the single point of damage.
 *  5. Combat assignment with lethal = 1: the Dragon attacking into 4 + 8 Might (12 > 10) still
 *     kills both defenders and conquers; without the passive the 8-Might one would survive on 6.
 *  6. Cost: 12 + four body; three body is not enough.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-118-219";
const HEXTECH_RAY = "ogn-009-298"; // Action, 1+[fury]: Deal 3 to a unit at a battlefield.

function threeLocations() {
  return scenario()
    .resources(P1, { energy: 12, power: { body: 4 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "AtBf1" }, "a")
    .unit(P2, "bf1", { might: 2, name: "AlsoBf1" }, "a2")
    .unit(P2, "bf2", { might: 3, name: "AtBf2" }, "b")
    .unit(P2, "base", { might: 2, name: "AtHome" }, "c")
    .unit(P1, "base", { might: 2, name: "Friend" }, "friend")
    .hand(P1, CARD, "dragon");
}

/** Answer every P1 pick the play trigger raises, choosing `wanted` cards where offered, declining otherwise. */
async function answerTriggerPicks(game: Game, wanted: readonly string[]) {
  for (let i = 0; i < 8; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind !== "pick" || d.seat !== P1) {
      return;
    }
    const keys = d.options.map((o) => o.card ?? o.key);
    const hit = wanted.filter((w) => keys.includes(w));
    if (hit.length > 0) {
      await game.p1.pick(...hit.slice(0, Math.max(1, Math.min(hit.length, d.max))));
    } else {
      await game.p1.decline();
    }
  }
}

describe("Elder Dragon (unl-118-219)", () => {
  test("cost: 12 energy + 4 body puts a 10-Might Dragon in base (pool emptied); 3 body or 11 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 12, power: { body: 4 } }).hand(P1, CARD, "dragon").build();
    await game.p1.play("dragon");
    await game.settle();
    expect(game.zoneOf("dragon")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.state("dragon")).toMatchObject({ baseMight: 10, might: 10 });
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def?.tags).toEqual(["Dragon"]);
    const shortPower = await scenario().resources(P1, { energy: 12, power: { body: 3 } }).hand(P1, CARD, "dragon").build();
    expect(shortPower.p1.can("play", "dragon")).toBe(false);
    const shortEnergy = await scenario().resources(P1, { energy: 11, power: { body: 4 } }).hand(P1, CARD, "dragon").build();
    expect(shortEnergy.p1.can("play", "dragon")).toBe(false);
  });

  test("'When you play me' — P1 is asked to choose up to one ENEMY unit at each location; friendly units are never offered", async () => {
    // Expected: after the Dragon enters, a P1 pick appears offering a / a2 / b / c (never friend
    // or dragon). Actual: the trigger was parsed as a bare `spell` damage effect and never fires —
    // the game is back in an open main phase with no prompt.
    const game = await threeLocations().build();
    await game.p1.play("dragon");
    await game.settle();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toEqual(expect.arrayContaining(["a", "b", "c"]));
    expect(offered).not.toContain("friend");
    expect(offered).not.toContain("dragon");
  });

  test("play trigger + passive together — one enemy unit per location takes 1 and therefore DIES (142.4.c); the second unit at bf1 is untouched", async () => {
    // Expected: a (5 Might), b (3), c (2) each take 1 of P1's damage → lethal → trash; a2 stays
    // undamaged (only one per location); friend untouched. Actual: no trigger, nobody is damaged.
    const game = await threeLocations().build();
    await game.p1.play("dragon");
    await answerTriggerPicks(game, ["a", "b", "c"]);
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("c")).toBe("trash");
    expect(game.zoneOf("a2")).toBe("battlefield-bf1");
    expect(game.state("a2").damage).toBe(0);
    expect(game.zoneOf("friend")).toBe("base");
    expect(game.zoneOf("dragon")).toBe("base");
  });

  test("'up to one': declining every location is legal — the Dragon simply enters and no unit is damaged", async () => {
    const game = await threeLocations().build();
    await game.p1.play("dragon");
    await answerTriggerPicks(game, []);
    await game.settle();
    expect(game.zoneOf("dragon")).toBe("base");
    for (const id of ["a", "a2", "b", "c", "friend"]) {
      expect(game.state(id).damage).toBe(0);
    }
    expect(game.decision()?.kind).toBe("action");
  });

  test("passive with a SPELL — with the Dragon on my board, my Hextech Ray (3) kills a 5-Might enemy unit (142.4.c)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .unit(P1, "base", CARD, "dragon")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    await game.p1.cast("ray", { targets: "wall" });
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
  });

  test.failing("BUG: passive with an ALLY's combat damage — a 1-Might friendly attacker kills the 5-Might defender (both die, nobody conquers)", async () => {
    // Expected: Poke deals 1 (P1's damage) → lethal for the enemy Wall; Wall deals 5 → Poke dies too;
    // bf1 stays with P2 (no surviving attacker). Actual: Wall survives with its damage healed.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .unit(P1, "base", CARD, "dragon")
      .unit(P1, "base", { might: 1, name: "Poke" }, "poke")
      .build();
    await game.p1.move("poke", "bf1");
    await game.settle();
    expect(game.zoneOf("poke")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test.failing("BUG: combat assignment with lethal = 1 — the Dragon (10) attacking into 4 + 8 Might kills BOTH defenders and conquers (465.2.c.3)", async () => {
    // Expected: 1 to each defender is already lethal, so 10 damage kills both; the Dragon takes 12
    // and… dies as well (12 ≥ 10) — so nobody conquers, but both defenders are gone. Actual: only
    // the 4-Might defender dies; the 8-Might one survives on 6.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Small" }, "small")
      .unit(P2, "bf1", { might: 8, name: "Big" }, "big")
      .unit(P1, "base", CARD, "dragon")
      .build();
    await game.p1.move("dragon", "bf1");
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.zoneOf("dragon")).toBe("trash"); // 4 + 8 = 12 ≥ 10
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("the Dragon alone into a single 8-Might defender: 10 ≥ 8 kills it, 8 < 10 lets the Dragon live and conquer (plain combat, no passive needed)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 8, name: "Big" }, "big")
      .unit(P1, "base", CARD, "dragon")
      .build();
    await game.p1.move("dragon", "bf1");
    await game.settle();
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.locationOf("dragon")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("only ENEMY units / only YOUR damage: the opponent's Hextech Ray at my 5-Might unit leaves it alive on 3 even with my Dragon out", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 5, name: "Holder" }, "holder")
      .unit(P1, "base", CARD, "dragon")
      .hand(P2, HEXTECH_RAY, "ray")
      .build();
    await game.p2.cast("ray", { targets: "holder" });
    await game.settle();
    expect(game.zoneOf("holder")).toBe("battlefield-bf1");
    expect(game.state("holder").damage).toBe(3);
  });

  test("the OPPONENT's Dragon does not make my damage lethal either: my Hextech Ray (3) at their 5-Might unit leaves it on 3", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .unit(P2, "base", CARD, "theirDragon")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    await game.p1.cast("ray", { targets: "wall" });
    await game.settle();
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.state("wall").damage).toBe(3);
  });

  test("passive ends when the Dragon leaves the board (364): with the Dragon in my trash, Hextech Ray (3) does not kill a 5-Might unit", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .trash(P1, CARD, "dragon")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    await game.p1.cast("ray", { targets: "wall" });
    await game.settle();
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.state("wall").damage).toBe(3);
  });

  test("registry payload should be [static lethal-damage modifier for enemy units, triggered play-self → damage 1 to up-to-one enemy unit per location]", async () => {
    // Expected: two abilities — a `static` (your damage is lethal to enemy units) and a `triggered`
    // { trigger: play-self, effect: damage 1, target: enemy unit, up to 1 per location }.
    // Actual: a single { type: "spell", effect: { type: "damage", amount: 1, target: unit } }.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 12, might: 10, powerCost: ["body", "body", "body", "body"] });
    const abilities = (def?.abilities ?? []) as { type: string; trigger?: { event?: string }; effect?: unknown }[];
    expect(abilities.some((a) => a.type === "spell")).toBe(false);
    expect(abilities.some((a) => a.type === "static")).toBe(true);
    const trig = abilities.find((a) => a.type === "triggered" && a.trigger?.event === "play-self");
    expect(trig).toBeDefined();
    const json = JSON.stringify(trig?.effect);
    expect(json).toContain('"damage"');
    expect(json).toContain('"enemy"');
    expect(json).toMatch(/"amount":1/);
  });
});
