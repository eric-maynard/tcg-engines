/**
 * Downwell — sfd-147-221 · Spell · Chaos · 8 energy + [chaos][chaos] · (no timing keyword)
 *
 *   Return all units and gear to their owners' hands.
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  - "all units and gear" is programmatic, NOT targeting (355.10.d): nothing is chosen on cast, an
 *    empty board is still a legal cast (359.3.e.10), and "can't be chosen by enemy spells" units
 *    (Ruin Runner, sfd-105-221) are swept anyway.
 *  - OWNERS' hands (rule 108): a stolen unit goes home to its owner; tokens (unit Recruits, Gold
 *    gear tokens) cease to exist instead (186.1); attached Equipment is gear too (150.4) and comes
 *    off its unit — both cards land in hand separately, might bonuses gone (124.1 new object).
 *  - Aftermath cleanup: every battlefield is now empty → uncontrolled (323.6), and a facedown card
 *    at a battlefield its owner no longer controls is put in the owner's trash (323.7).
 *  - Bounce ≠ death: Deathknell (Ferrous Forerunner, sfd-021-221) must not trigger.
 *  - Timing: no [Action]/[Reaction] → only on your own turn in an Open state; not inside a
 *    showdown, not as a response. A Reaction played in response (Gust) resolves first and Downwell
 *    still sweeps everything that is left (no fizzle — it has no targets).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-147-221";
const RUIN_RUNNER = "sfd-105-221"; // "I can't be chosen by enemy spells and abilities." 5 Might
const DORANS_BLADE = "sfd-095-221"; // Equipment, +2 Might while attached
const GOLD = "sfd-t03"; // Gold — gear token
const FORERUNNER = "sfd-021-221"; // Deathknell — play two 3-Might Mech tokens
const GUST = "ogn-169-298"; // [Reaction] return a ≤3-Might unit at a battlefield to its owner's hand
const LEGEND = "ogn-251-298";

function res(energy = 8, power: Record<string, number> = { chaos: 2 }) {
  return scenario().resources(P1, { energy, power }).hand(P1, CARD, "dw");
}

function fullBoard() {
  return res()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .legend(P1, LEGEND, "legend")
    .rune(P1, "chaos", { alias: "rune1" })
    .unit(P1, "bf1", { might: 2, name: "AllyBf" }, "allyBf")
    .unit(P1, "base", { might: 4, name: "AllyHome" }, "allyHome", { damage: 2 })
    .unit(P2, "bf2", { might: 3, name: "FoeBf" }, "foeBf", { buffed: true })
    .unit(P2, "base", { might: 1, name: "FoeHome" }, "foeHome")
    .gear(P1, { name: "My Trinket" }, "myGear")
    .gear(P2, { name: "Their Trinket" }, "theirGear");
}

describe("Downwell (sfd-147-221)", () => {
  test("cost: 8 energy + [chaos][chaos] deducted on cast, it waits on the chain as a spell, then goes to the owner's trash; 7 energy or 1 chaos is not enough", async () => {
    const game = await fullBoard().build();
    expect(game.p1.option("cast", "dw")?.fields).toEqual([]); // nothing to choose (355.10.d)
    await game.p1.cast("dw");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("dw")).toBe("chain");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dw", controller: P1, triggered: false, type: "spell" })]);
    await game.settle();
    expect(game.zoneOf("dw")).toBe("trash");
    expect((await res(7).unit(P2, "base", { might: 1 }, "u").build()).p1.can("cast", "dw")).toBe(false);
    expect((await res(8, { chaos: 1 }).unit(P2, "base", { might: 1 }, "u").build()).p1.can("cast", "dw")).toBe(false);
  });

  test("returns EVERY unit (both players, base and battlefields, damaged or buffed) and EVERY gear to hand; legend and runes stay", async () => {
    const game = await fullBoard().build();
    await game.p1.cast("dw");
    await game.settle();
    expect(game.p1.hand().sort()).toEqual(["allyBf", "allyHome", "myGear"]);
    expect(game.p2.hand().sort()).toEqual(["foeBf", "foeHome", "theirGear"]);
    expect(game.p1.units()).toEqual([]);
    expect(game.p2.units()).toEqual([]);
    expect(game.p1.gear()).toEqual([]);
    expect(game.p2.gear()).toEqual([]);
    expect(game.zoneOf("legend")).toBe("legendZone");
    expect(game.zoneOf("rune1")).toBe("runePool");
    // 124.1: a card in hand is a new object — damage / buffs are gone.
    expect(game.state("allyHome")).toMatchObject({ damage: 0, isBuffed: false, zone: "hand" });
    expect(game.state("foeBf")).toMatchObject({ damage: 0, isBuffed: false, zone: "hand" });
    expect(game.violations()).toEqual([]);
  });

  test("aftermath (323.6): with no units left every battlefield becomes uncontrolled — nobody scores from it and points are unchanged", async () => {
    const game = await fullBoard().points(P1, 3).points(P2, 4).build();
    await game.p1.cast("dw");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.gameState.battlefields.bf2?.controller).toBeNull();
    expect(game.p1.points()).toBe(3);
    expect(game.p2.points()).toBe(4);
  });

  test("'owners' hands' (rule 108): a unit P1 controls but P2 owns goes to P2's hand", async () => {
    const game = await res()
      .card("stolen", { controller: P1, def: { cardType: "unit", might: 3, name: "Stolen" }, owner: P2, zone: "base" })
      .build();
    expect(game.p1.units()).toEqual(["stolen"]);
    await game.p1.cast("dw");
    await game.settle();
    expect(game.p2.hand()).toEqual(["stolen"]);
    expect(game.p1.hand()).toEqual([]);
  });

  test("tokens do not go to a hand — a Recruit unit token and a Gold gear token simply cease to exist (186.1)", async () => {
    const game = await res()
      .unit(P2, "base", { might: 1, name: "Recruit" }, "token-recruit-1")
      .gear(P1, GOLD, "token-gold-1")
      .unit(P1, "base", { might: 2, name: "Real" }, "real")
      .build();
    expect(game.state("token-recruit-1").isToken).toBe(true);
    expect(game.state("token-gold-1").isToken).toBe(true);
    await game.p1.cast("dw");
    await game.settle();
    expect(game.has("token-recruit-1")).toBe(false);
    expect(game.has("token-gold-1")).toBe(false);
    expect(game.p1.hand()).toEqual(["real"]);
    expect(game.p2.hand()).toEqual([]);
  });

  test("attached Equipment is gear: unit and blade both return to their owner's hand, detached, and the +2 Might is gone", async () => {
    const game = await res()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Wielder" }, "wielder", { equippedWith: ["blade"] })
      .gear(P2, DORANS_BLADE, "blade", { attachedTo: "wielder" })
      .build();
    expect(game.state("wielder").might).toBe(5);
    await game.p1.cast("dw");
    await game.settle();
    expect(game.p2.hand().sort()).toEqual(["blade", "wielder"]);
    expect(game.state("blade").attachedTo).toBeUndefined();
    expect(game.state("wielder").attachments).toEqual([]);
    expect(game.state("wielder").might).toBe(3);
  });

  test("not targeted (355.10.d): Ruin Runner ('can't be chosen by enemy spells') is still returned", async () => {
    const game = await res().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", RUIN_RUNNER, "rr").build();
    await game.p1.cast("dw");
    await game.settle();
    expect(game.zoneOf("rr")).toBe("hand");
    expect(game.p2.hand()).toEqual(["rr"]);
  });

  test("an empty board is still a legal cast: it resolves doing nothing and goes to the trash (359.3.e.10)", async () => {
    const game = await res().build();
    expect(game.p1.can("cast", "dw")).toBe(true);
    await game.p1.cast("dw");
    await game.settle();
    expect(game.zoneOf("dw")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.p1.hand()).toEqual([]);
  });

  test("bounce is not death: a Deathknell unit (Ferrous Forerunner) returns to hand without making Mech tokens", async () => {
    const game = await res().unit(P2, "base", FORERUNNER, "ff").build();
    await game.p1.cast("dw");
    await game.settle();
    expect(game.zoneOf("ff")).toBe("hand");
    expect(game.chain()).toHaveLength(0);
    expect(game.p2.base()).toEqual([]);
    expect(game.p2.trash()).toEqual([]);
  });

  test("323.6/323.7 aftermath: your facedown card at a battlefield you no longer control is put in your trash", async () => {
    const game = await res()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
      .facedown(P1, "bf1", GUST, "hidden")
      .build();
    expect(game.zoneOf("hidden")).toBe("facedown-bf1");
    await game.p1.cast("dw");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.zoneOf("hidden")).toBe("trash");
    expect(game.p1.hand()).toEqual(["guard"]);
  });

  test("timing: no [Action]/[Reaction] — not castable on the opponent's turn, nor inside a showdown on your own turn, nor in response to another chain item", async () => {
    const oppTurn = await res().active(P2).unit(P2, "base", { might: 1 }, "u").build();
    expect(oppTurn.p1.can("cast", "dw")).toBe(false);

    const showdown = await res().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 5 }, "def").unit(P1, "base", { might: 1 }, "atk").build();
    await showdown.p1.move("atk", "bf1");
    expect(showdown.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(showdown.p1.can("cast", "dw")).toBe(false);

    const chainOpen = await res(9)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2 }, "small")
      .hand(P1, GUST, "gust")
      .build();
    await chainOpen.p1.cast("gust", { targets: "small" });
    expect(chainOpen.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(chainOpen.p1.can("cast", "dw")).toBe(false);
  });

  test("a Reaction in response resolves first (Gust saves nothing — its unit is just bounced earlier); Downwell then still sweeps everything left", async () => {
    const game = await res()
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Small" }, "small")
      .unit(P2, "bf1", { might: 6, name: "Big" }, "big")
      .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
      .hand(P2, GUST, "gust")
      .build();
    await game.p1.cast("dw");
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "small" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dw", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("small")).toBe("hand");
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
    await game.settle(); // Downwell resolves
    expect(game.p2.hand().sort()).toEqual(["big", "small"]);
    expect(game.p1.hand()).toEqual(["mine"]);
    expect(game.zoneOf("dw")).toBe("trash");
    expect(game.zoneOf("gust")).toBe("trash");
  });

  test("parsed abilities match the printed text: one spell ability returning ALL permanents (units + gear) to hand; the card's timing class is 'standard'", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "chaos", energyCost: 8, powerCost: ["chaos", "chaos"], timing: "standard" });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({
      effect: { target: { quantity: "all", type: "permanent" }, type: "return-to-hand" },
      type: "spell",
    });
  });

  test("the parsed spell ability carries no ability-level timing because the printed text has no [Action] keyword (card-level timing is 'standard')", async () => {
    // Expected: no ability-level `timing: "action"` (rulesText is authoritative, 155 / 159.2.a.1).
    // Actual: abilities[0].timing === "action" — dead data today, but a silent mis-parse.
    const pool = await loadDefaultCardPool();
    const ability = (pool.get(CARD)?.abilities ?? [])[0] as { timing?: string } | undefined;
    expect(ability?.timing).not.toBe("action");
  });
});
