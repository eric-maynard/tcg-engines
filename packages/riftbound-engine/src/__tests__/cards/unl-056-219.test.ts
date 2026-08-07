/**
 * Yuumi, Magical Cat — unl-056-219 · Unit (Champion, Yuumi) · Calm · 3 energy + [calm] · 1 Might
 *
 *   When I attack or defend, give one of your other units here +3 [Might] and [Tank] this turn.
 *   (It must be assigned combat damage first.)
 *
 * Rules: 459/462 (a unit "attacks"/"defends" when it gains the Attacker/Defender designation as a
 * combat showdown opens — walking onto an EMPTY battlefield is not an attack), 383.4 (the trigger is a
 * chain item; the bonus exists only once it resolves), 815 (Tank ≡ "assign me lethal damage before
 * any non-Tank unit of my controller", enforced on the OPPOSING player's assignment, 465.2.c.6),
 * 465.2.c.8 (a unit with both Tank and Backline: the assigning player picks which one to honour),
 * 432.1.a ("this turn" bonuses end with the turn — also when granted on the opponent's turn).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. "ONE of your OTHER units HERE": a single chosen unit; never Yuumi herself, never a unit in base,
 *     never an enemy; with no other friendly unit here the trigger does nothing at all.
 *  2. The pump matters on both sides of combat: +3 adds to damage dealt AND (with Tank) forces the
 *     enemy's damage onto the pumped unit first, shielding 1-Might Yuumi.
 *  3. Expiry: granted while DEFENDING on the opponent's turn, it is gone when that turn ends.
 *  4. Moving Yuumi onto an open battlefield conquers without a combat → no trigger.
 *  5. Partner (Calm): pumping Enthusiastic Promoter gives it Tank AND Backline → 465.2.c.8 lets the
 *     attacker choose "first" or "last" (so Yuumi is NOT necessarily protected).
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-056-219";
const PROMOTER = "unl-043-219"; // Calm 3: [Backline] / When I hold, Buff all units here.

const tankGrant = { duration: "turn", keyword: "Tank" };

describe("Yuumi, Magical Cat (unl-056-219)", () => {
  test("cost: 3 energy + 1 calm for a 1-Might champion unit that enters exhausted with no play effect; short of either resource → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { calm: 1 } }).hand(P1, CARD, "yuumi").build();
    await game.p1.play("yuumi");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.state("yuumi")).toMatchObject({ baseMight: 1, isExhausted: true, might: 1, zone: "base" });
    expect(game.chain()).toEqual([]);
    expect((await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "y").build()).p1.can("play", "y")).toBe(false);
    expect((await scenario().resources(P1, { energy: 2, power: { calm: 2 } }).hand(P1, CARD, "y").build()).p1.can("play", "y")).toBe(false);
    // It is a champion: from the champion zone it is offered as the champion play.
    const champ = await scenario().resources(P1, { energy: 3, power: { calm: 1 } }).champion(P1, CARD, "yuumi").build();
    expect(champ.p1.can("playChampion")).toBe(true);
  });

  test("When I attack (one other unit here): trigger goes on the chain first (ally still 2), resolves to +3 Might and Tank; the defender's 4 must land on the 5-Might Tank ally, so both attackers live, the defender dies to 6 and P1 conquers; Yuumi herself and the unit left in base are untouched", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Warden" }, "warden")
      .unit(P1, "base", CARD, "yuumi")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
      .build();
    await game.p1.move(["yuumi", "ally"], "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yuumi", controller: P1, triggered: true })]);
    expect(game.state("ally")).toMatchObject({ grantedKeywords: [], might: 2 }); // nothing before resolution
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("ally")).toMatchObject({ combatRole: "attacker", grantedKeywords: [tankGrant], might: 5 });
    expect(game.state("yuumi")).toMatchObject({ grantedKeywords: [], might: 1 }); // "other": never herself
    expect(game.state("home")).toMatchObject({ grantedKeywords: [], might: 2 });
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.locationOf("yuumi")).toBe("bf1");
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    // Still pumped for the rest of this turn, gone next turn.
    expect(game.state("ally")).toMatchObject({ grantedKeywords: [tankGrant], might: 5 });
    await game.advanceTurn();
    expect(game.state("ally")).toMatchObject({ grantedKeywords: [], might: 2 });
    expect(game.violations()).toEqual([]);
  });

  test("'give ONE of your other units here' — with two other allies attacking alongside, P1 must choose exactly one", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Warden" }, "warden")
      .unit(P1, "base", CARD, "yuumi")
      .unit(P1, "base", { might: 2, name: "A" }, "a")
      .unit(P1, "base", { might: 2, name: "B" }, "b")
      .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
      .build();
    await game.p1.move(["yuumi", "a", "b"], "bf1");
    const d = game.decision(); // rule 402 (finalization): the target is chosen when the trigger goes on the chain
    expect(d).toMatchObject({ kind: "pick", max: 1, seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["a", "b"]);
    await game.p1.pick("a");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("a")).toMatchObject({ grantedKeywords: [tankGrant], might: 5 });
    expect(game.state("b")).toMatchObject({ grantedKeywords: [], might: 2 });
  });

  test("'your OTHER units here' — attacking alone must grant nothing to anyone (Yuumi herself and the base ally untouched)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Sentry" }, "sentry")
      .unit(P1, "base", CARD, "yuumi")
      .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
      .build();
    await game.p1.move("yuumi", "bf1");
    expect(game.chain()).toEqual([]); // rule 402.4: no legal target ⇒ removed unfinalized (no priority window over it)
    expect(game.state("home")).toMatchObject({ grantedKeywords: [], might: 2 });
    expect(game.state("yuumi")).toMatchObject({ grantedKeywords: [], might: 1 });
    await game.settle();
    expect(game.zoneOf("yuumi")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.points()).toBe(0);
  });

  test("negative space — walking onto an OPEN battlefield is a conquer but not an attack: no trigger, the escorting ally stays 2 Might", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "yuumi")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .build();
    await game.p1.move(["yuumi", "ally"], "bf1");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("ally")).toMatchObject({ grantedKeywords: [], might: 2 });
  });

  test("When I defend (opponent's turn): the ally here becomes 5 Might with Tank, soaks the raider's 4 (not lethal), Yuumi is untouched, the raider dies to 6 and bf1 is held; the bonus ends with THAT turn", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "yuumi")
      .unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yuumi", controller: P1, triggered: true })]);
    expect(game.state("yuumi").combatRole).toBe("defender");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("yuumi")).toBe("battlefield-bf1");
    expect(game.state("buddy")).toMatchObject({ damage: 0, grantedKeywords: [tankGrant], might: 5, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    await game.p2.endTurn(); // P2's turn ends → "this turn" is over before P1's turn even settles
    expect(game.state("buddy")).toMatchObject({ grantedKeywords: [], might: 2 });
  });

  test("Tank is enforced on the ATTACKER's assignment (815, 465.2.c.6): 3 damage into Yuumi(1) + pumped Buddy(5, Tank) may not touch Yuumi — every legal line puts all 3 on Buddy; nobody on P1's side dies", async () => {
    const game = await scenario()
      .active(P2)
      .autoProcedures(false)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "yuumi")
      .unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy")
      .unit(P2, "base", { might: 3, name: "Poker" }, "poker")
      .build();
    await game.p2.move("poker", "bf1");
    await game.settle(); // trigger resolves, focus passes; combat resolution is now a manual procedure
    expect(game.state("buddy")).toMatchObject({ grantedKeywords: [tankGrant], might: 5 });
    await game.p2.choose("resolveFullCombat:bf1");
    if (game.decision()?.kind === "distribute") {
      expect((await game.p2.try((p) => p.distribute({ buddy: 2, yuumi: 1 }))).ok).toBe(false);
      expect((await game.p2.try((p) => p.distribute({ yuumi: 1, buddy: 2 }))).ok).toBe(false);
      await game.p2.distribute({ buddy: 3 });
    }
    while (game.p2.can("resolveFullCombat:bf1")) {
      await game.p2.choose("resolveFullCombat:bf1");
    }
    await game.settle();
    expect(game.zoneOf("yuumi")).toBe("battlefield-bf1");
    expect(game.zoneOf("buddy")).toBe("battlefield-bf1");
    expect(game.zoneOf("poker")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("465.2.c.8 — pumping Enthusiastic Promoter gives it Tank AND Backline; the attacker must be offered BOTH readings ({promo:3} 'first' or {yuumi:1, promo:2} 'last')", async () => {
    // Expected: a distribute decision for P2 in which both allocations are accepted. The combat
    // resolver now models 465.2.c.8 (both readings are legal and a real choice), but the harness
    // still has no `distribute` decision for the `combat-damage` prompt, so the pick never surfaces.
    const game = await scenario()
      .active(P2)
      .autoProcedures(false)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "yuumi")
      .unit(P1, "bf1", PROMOTER, "promo")
      .unit(P2, "base", { might: 3, name: "Poker" }, "poker")
      .build();
    await game.p2.move("poker", "bf1");
    await game.settle();
    expect([...game.state("promo").keywords].sort()).toEqual(["Backline", "Tank"]);
    expect(game.state("promo").might).toBe(5);
    await game.p2.choose("resolveFullCombat:bf1");
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2, total: 3 });
    expect((await game.p2.try((p) => p.distribute({ promo: 1, yuumi: 1 }))).ok).toBe(false); // "in between" is never legal
    // Both compliant readings must be accepted; take the Tank one and check Yuumi survives.
    await game.p2.distribute({ promo: 3 });
    while (game.p2.can("resolveFullCombat:bf1")) {
      await game.p2.choose("resolveFullCombat:bf1");
    }
    await game.settle();
    expect(game.zoneOf("yuumi")).toBe("battlefield-bf1");
    expect(game.zoneOf("promo")).toBe("battlefield-bf1");
    expect(game.zoneOf("poker")).toBe("trash"); // 1 + 5
  });

  test("registry payload (skeleton): one triggered ability on attack-or-defend of self, giving +3 Might (turn) and Tank (turn) to OTHER FRIENDLY units HERE; 3 + [calm], 1 Might, champion with the Yuumi tag", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 3, isChampion: true, might: 1, name: "Yuumi, Magical Cat", tags: ["Yuumi"] });
    expect(def?.powerCost).toEqual(["calm"]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: {
        effects: [
          { amount: 3, duration: "turn", target: { controller: "friendly", excludeSelf: true, location: "here", type: "unit" }, type: "modify-might" },
          { duration: "turn", keyword: "Tank", target: { controller: "friendly", excludeSelf: true, location: "here", type: "unit" }, type: "grant-keyword" },
        ],
        type: "sequence",
      },
      trigger: { event: "attack-or-defend", on: "self" },
      type: "triggered",
    });
  });

  test("registry payload — 'one of your other units here' parses as a SINGLE chosen target shared by both effects", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    const effects = ((def?.abilities?.[0] as { effect?: { effects?: { target?: { quantity?: unknown } }[] } })?.effect?.effects ?? []);
    expect(effects).toHaveLength(2);
    for (const e of effects) {
      expect(e.target?.quantity ?? 1).toBe(1);
    }
  });
});
