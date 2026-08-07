/**
 * Bird — unl-t02 · Token Unit · (no domain, no cost) · 1 Might
 *
 *   [Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *
 * Rule 187.7: "A 1 [M] Bird token is a domainless unit token with 1 Might, the Bird tag, and the
 * Deflect keyword."
 *
 * Head-judge notes — the tricky spots for this card:
 *  1. Deflect (809.1.c) taxes OPPONENTS only, and abilities as well as spells: an enemy Iron
 *     Ballista activation aimed at the Bird needs a power of any domain; the Bird's own controller
 *     bounces / targets it for free. No spare power → the Bird is simply not a legal choice, while
 *     the plain unit next to it still is.
 *  2. It is a TOKEN (185/186): cost 0, no domain, and it ceases to exist the moment it reaches any
 *     non-board zone — killed it never lands in the trash, Retreat-ed it never reaches the hand
 *     (but Retreat's "its owner channels 1 rune" still happens).
 *  3. The Bird TAG matters (187.7): Brush gives "Bird … units here +1 [Might]". The printed token
 *     card must carry the tag exactly like a token minted by Frisky Hunter.
 *  4. It is a real unit in every other way (185.2.d): enters exhausted when played (Frisky Hunter
 *     plays it "here"), holds / defends a battlefield, dies to 1 damage, deals 1 in combat.
 *  5. Deflect is per Bird chosen (809.1.c "for each time"): a caster short of power can still hit
 *     the NON-Deflect neighbour — the tax must not bleed onto other targets.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-t02";
const FRISKY_HUNTER = "unl-033-219"; // 4-cost 3-Might Calm unit: When you play me, play a 1 [Might] Bird unit token with [Deflect] here.
const IRON_BALLISTA = "ogn-017-298"; // gear: [Exhaust]: Deal 2 to a unit at a battlefield.
const RETREAT = "ogn-104-298"; // [Reaction] 1: Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted.
const BRUSH = "unl-t03"; // battlefield token: Bird, Cat, Dog, Poro, and Ivern units here have +1 [Might].
const BOLT = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

describe("Bird (unl-t02)", () => {
  test("a pre-placed Bird token: 1 Might, Deflect keyword, no domain, cost 0, flagged as a token", async () => {
    const game = await scenario().unit(P1, "base", CARD, "token-bird").build();
    expect(game.state("token-bird")).toMatchObject({ baseMight: 1, cardType: "unit", energyCost: 0, isToken: true, might: 1 });
    expect(game.state("token-bird").keywords).toContain("Deflect");
    expect(game.state("token-bird").domains).toEqual([]);
    expect(game.state("token-bird").powerCost).toEqual([]);
  });

  test("Deflect vs an opponent's spell: with a spare power (any domain, 809.1.c.1) they may choose it and pay; 1 damage kills it and it ceases to exist (186.1)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { calm: 1 } })
      .unit(P1, "base", CARD, "token-bird")
      .hand(P2, BOLT, "bolt")
      .build();
    await game.p2.cast("bolt", { targets: "token-bird" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.has("token-bird") && game.zoneOf("token-bird")).not.toBe("base");
    expect(game.p1.trash()).not.toContain("token-bird"); // a token never sits in the trash
  });

  test("Deflect negative space: an opponent with no power cannot choose the Bird at all, but CAN still bolt the plain unit beside it for the printed cost", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", CARD, "token-bird")
      .unit(P1, "base", { might: 1, name: "Plain" }, "plain")
      .hand(P2, BOLT, "bolt")
      .build();
    const atBird = await game.p2.try((p) => p.cast("bolt", { targets: "token-bird" }));
    expect(atBird.ok).toBe(false);
    expect(game.zoneOf("bolt")).toBe("hand");
    expect(game.p2.energy()).toBe(1);
    await game.p2.cast("bolt", { targets: "plain" });
    expect(game.p2.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("plain")).toBe("trash");
    expect(game.zoneOf("token-bird")).toBe("base");
  });

  test("Deflect only taxes opponents: its own controller bolts it for exactly 1 energy and no power", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", CARD, "token-bird").hand(P1, BOLT, "bolt").build();
    await game.p1.cast("bolt", { targets: "token-bird" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.has("token-bird") && game.zoneOf("token-bird")).not.toBe("base");
  });

  test("Deflect also taxes enemy ABILITIES (809.1.c): Iron Ballista's [Exhaust] shot cannot pick the Bird without a power, and the Bird survives", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "token-bird")
      .unit(P1, "bf1", { might: 3, name: "Plain" }, "plain")
      .gear(P2, IRON_BALLISTA, "ballista")
      .build();
    await game.p2.activate("ballista");
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick") {
        const offered = d.options.map((o) => o.card ?? o.key);
        expect(offered).toContain("plain");
        // Either the Bird is not offered at all, or naming it is refused for want of the [rainbow].
        const tryBird = offered.includes("token-bird") ? await game.p2.try((p) => p.pick("token-bird")) : { ok: false };
        expect(tryBird.ok).toBe(false);
        if (game.decision()?.kind === "pick") {
          await game.p2.pick("plain");
        }
      } else {
        await game.seat(d.seat).pass();
      }
    }
    expect(game.has("token-bird") && game.zoneOf("token-bird")).toBe("battlefield-bf1");
    expect(game.state("token-bird").damage).toBe(0);
    expect(game.state("plain").damage).toBe(2);
  });

  test("Deflect paid on an enemy ability: with one power the Ballista may shoot the Bird — the power is spent and the Bird is gone", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "token-bird")
      .gear(P2, IRON_BALLISTA, "ballista")
      .build();
    await game.p2.activate("ballista");
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick") {
        await game.p2.pick("token-bird");
      } else if (d.kind === "integer") {
        await game.p2.chooseX(d.min);
      } else {
        await game.seat(d.seat).pass();
      }
    }
    expect(game.has("token-bird") && game.zoneOf("token-bird")).not.toBe("battlefield-bf1");
    expect(game.p2.power()).toBe(0);
  });

  test("token nature (186.1): a friendly Retreat 'returns it to hand' for 1 energy flat — the Bird vanishes instead of reaching the hand", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", CARD, "token-bird").hand(P1, RETREAT, "retreat").build();
    await game.p1.cast("retreat", { targets: "token-bird" });
    expect(game.p1.energy()).toBe(0); // friendly: no Deflect tax
    await game.settle();
    expect(game.p1.hand()).not.toContain("token-bird");
    expect(game.p1.base()).not.toContain("token-bird");
    expect(game.zoneOf("retreat")).toBe("trash");
  });

  test.failing("BUG: Retreat on the Bird — 'its owner channels 1 rune exhausted' still happens for the vanished token's owner (183 / 186.1)", async () => {
    const control = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", { might: 1, name: "Plain" }, "plain").hand(P1, RETREAT, "retreat").build();
    await control.p1.cast("retreat", { targets: "plain" });
    await control.settle();
    expect(control.zoneOf("plain")).toBe("hand");
    expect(control.p1.runes({ ready: false })).toHaveLength(1);
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", CARD, "token-bird").hand(P1, RETREAT, "retreat").build();
    const runesBefore = game.p1.runes().length;
    await game.p1.cast("retreat", { targets: "token-bird" });
    await game.settle();
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
  });

  test("minted for real: Frisky Hunter played to a battlefield puts a 1-Might Deflect Bird token there, exhausted, under P1's control", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P1 })
      .hand(P1, FRISKY_HUNTER, "hunter")
      .build();
    await game.p1.play("hunter", { to: "bf1" });
    await game.settle({ policy: "first" });
    const birds = game.findAll({ name: "Bird" }).filter((id) => game.locationOf(id) !== undefined);
    expect(birds).toHaveLength(1);
    const bird = birds[0] as string;
    expect(game.state(bird)).toMatchObject({ controller: P1, isExhausted: true, isToken: true, location: "bf1", might: 1, owner: P1 });
    expect(game.state(bird).keywords).toContain("Deflect");
    expect(game.state(bird).domains).toEqual([]);
  });

  test("a minted Bird is Deflect-taxed too: next turn the opponent needs a power on top of the bolt's 1 energy to pick it off", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P1 })
      .hand(P1, FRISKY_HUNTER, "hunter")
      .hand(P2, BOLT, "bolt")
      .build();
    await game.p1.play("hunter", { to: "bf1" });
    await game.settle({ policy: "first" });
    const bird = game.findAll({ name: "Bird" }).find((id) => game.locationOf(id) === "bf1") as string;
    expect(bird).toBeDefined();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 1 });
    expect((await game.p2.try((p) => p.cast("bolt", { targets: bird }))).ok).toBe(false);
    await game.p2.do("addResources", { power: { mind: 1 } });
    await game.p2.cast("bolt", { targets: bird });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.has(bird) && game.locationOf(bird)).not.toBe("bf1");
  });

  test("a real unit in combat (185.2.d): a lone Bird defender deals its 1 and dies to a 2-Might attacker, who conquers", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "token-bird")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("token-bird").combatRole).toBe("defender");
    await game.settle();
    expect(game.has("token-bird") && game.locationOf("token-bird")).not.toBe("bf1");
    expect(game.zoneOf("raider")).toBe("battlefield-bf1"); // 1 < 2
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("the Bird TAG (187.7) — at a Brush battlefield ('Bird … units here have +1 [Might]') the Bird is 2 Might while a tagless 1-drop stays 1", async () => {
    const game = await scenario()
      .battlefield("brush", { controller: P1, def: BRUSH, inert: false })
      .unit(P1, "brush", CARD, "token-bird")
      .unit(P1, "brush", { might: 1, name: "Plain" }, "plain")
      .build();
    expect(game.state("plain").might).toBe(1);
    expect(game.state("token-bird").might).toBe(2);
  });

  test("card data matches rule 187.7 — unit, 1 Might, Deflect 1, no cost/domain AND the Bird tag", async () => {
    // Expected: tags: ["Bird"]. Actual: no tags on the definition.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", might: 1, name: "Bird" });
    expect(def?.energyCost ?? 0).toBe(0);
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.domain === undefined || (Array.isArray(def?.domain) && def.domain.length === 0) || def?.domain === "colorless").toBe(true);
    expect(def?.abilities).toEqual([{ keyword: "Deflect", type: "keyword", value: 1 }]);
    expect(def?.tags).toEqual(["Bird"]);
  });
});
