/**
 * Brittle Steel — ven-003-166 · Spell · Fury · 2 energy + [fury]
 *
 *   Kill a gear.
 *   [Flow] [4][fury] (You may play this from your trash for its Flow cost. Then banish it.)
 *
 * Head-judge notes (the tricky spots this file pins down):
 *   1. "a gear" is ANY gear — friendly or enemy — and Equipment is still gear (150.4), even while
 *      attached to a unit at a battlefield. Units / legends are never legal picks.
 *   2. No gear on the board → the spell has no legal choice and cannot be played at all (355.8),
 *      neither from hand nor via Flow.
 *   3. Flow is an ALTERNATE cost paid from the trash (829.1.c.1); the resolved Flow copy is
 *      banished instead of returning to the trash (829.1.b.1). A hand cast goes to the trash and
 *      is then itself Flow-able later in the same turn.
 *   4. Flow does not change timing (829.1.b.2): no [Action]/[Reaction] → not playable on the
 *      opponent's turn or while a chain is open, even from the trash.
 *   5. Only the owner plays it from THEIR trash; an opponent with fury power gets nothing.
 *   6. Partner: Scrapheap (ogn-182-298) "When this is … killed, draw 1" — killing the enemy's
 *      Scrapheap makes ITS controller draw, not the caster.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-003-166";
const BALLISTA = "ogn-017-298"; // Iron Ballista — plain gear
const SCRAPHEAP = "ogn-182-298"; // gear: when killed, draw 1
const DIRK = "sfd-009-221"; // Serrated Dirk — Equipment, Equip [fury]

function board(energy = 2, fury = 1) {
  return scenario()
    .resources(P1, { energy, power: { fury } })
    .battlefield("bf1", { controller: null })
    .gear(P2, BALLISTA, "theirs")
    .gear(P1, BALLISTA, "mine")
    .unit(P2, "bf1", { might: 3, name: "Bystander" }, "foe")
    .hand(P1, CARD, "steel");
}

describe("Brittle Steel (ven-003-166)", () => {
  test("registry payload: a kill-a-gear spell clause plus Flow [4][fury]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", energyCost: 2, powerCost: ["fury"], timing: "standard" });
    expect(def?.abilities).toEqual([
      { effect: { target: { type: "gear" }, type: "kill" }, type: "spell" },
      { cost: { energy: 4, power: ["fury"] }, keyword: "Flow", type: "keyword" },
    ]);
  });

  test("from hand: pays 2 energy + 1 fury, kills the chosen enemy gear, spell ends in the trash", async () => {
    const game = await board().build();
    await game.p1.cast("steel", { targets: "theirs" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("steel")).toBe("chain");
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.zoneOf("mine")).toBe("base");
    expect(game.zoneOf("steel")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("targets: both players' gear are offered, units are not; own gear is a legal (if unwise) pick", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "steel")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual(expect.arrayContaining([["theirs"], ["mine"]]));
    expect(targets).toHaveLength(2);
    const bad = await game.p1.try((p) => p.cast("steel", { targets: "foe" }));
    expect(!bad.ok && bad.error.code).toBe("ILLEGAL_ARGS");
    await game.p1.cast("steel", { targets: "mine" });
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash");
  });

  test("Equipment is gear (150.4): an attached Serrated Dirk at a battlefield can be killed; the unit stays", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .resources(P2, { power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Wielder" }, "wielder")
      .gear(P2, DIRK, "dirk")
      .hand(P1, CARD, "steel")
      .active(P2)
      .build();
    await game.p2.do("equipCard", { equipmentId: "dirk", unitId: "wielder" });
    await game.settle();
    expect(game.state("dirk").attachedTo).toBe("wielder");
    await game.advanceToTurnOf(P1); // rune pools emptied at end of turn — refill P1's by hand
    await game.p1.do("addResources", { energy: 2, power: { fury: 1 } });
    await game.p1.cast("steel", { targets: "dirk" });
    await game.settle();
    expect(game.zoneOf("dirk")).toBe("trash");
    expect(game.zoneOf("wielder")).toBe("battlefield-bf1");
    expect(game.state("wielder").attachments).toEqual([]);
  });

  test("no gear anywhere → not playable from hand (355.8); cost alone is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 9, power: { fury: 3 } }).unit(P2, "base", { might: 1 }).hand(P1, CARD, "steel").build();
    expect(game.p1.can("cast", "steel")).toBe(false);
  });

  test("cost gate: 1 energy + fury, or 2 energy without fury → not legal", async () => {
    expect((await board(1, 1).build()).p1.can("cast", "steel")).toBe(false);
    expect((await board(2, 0).build()).p1.can("cast", "steel")).toBe(false);
    expect((await board(2, 1).build()).p1.can("cast", "steel")).toBe(true);
  });

  test("Flow: from the trash it costs [4][fury], kills a gear, and is then BANISHED (829.1.b.1)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { fury: 1 } })
      .gear(P2, BALLISTA, "theirs")
      .trash(P1, CARD, "steel")
      .build();
    expect(game.p1.can("cast", "steel")).toBe(true);
    await game.p1.cast("steel", { flow: true, targets: "theirs" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.zoneOf("steel")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("steel");
  });

  test("Flow cost gate: 3 energy + fury with the spell in trash → not legal; the hand cost (2) does not apply from trash", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).gear(P2, BALLISTA, "theirs").trash(P1, CARD, "steel").build();
    expect(game.p1.can("cast", "steel")).toBe(false);
    const noGear = await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).trash(P1, CARD, "steel").build();
    expect(noGear.p1.can("cast", "steel")).toBe(false); // 355.8 applies to the Flow play too
  });

  test("hand cast → trash → Flow it again the same turn for [4][fury]; second copy of the effect, then banished", async () => {
    const game = await board(6, 2).build();
    await game.p1.cast("steel", { targets: "theirs" });
    await game.settle();
    expect(game.zoneOf("steel")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1 } });
    expect(game.p1.can("cast", "steel")).toBe(true);
    await game.p1.cast("steel", { flow: true, targets: "mine" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.zoneOf("steel")).toBe("banishment");
  });

  test("timing (829.1.b.2): no [Action]/[Reaction] — not playable from hand or trash on the opponent's turn, nor in response on a chain", async () => {
    const oppTurn = await scenario()
      .active(P2)
      .resources(P1, { energy: 6, power: { fury: 2 } })
      .gear(P2, BALLISTA, "theirs")
      .hand(P1, CARD, "inHand")
      .trash(P1, CARD, "inTrash")
      .build();
    expect(oppTurn.p1.can("cast", "inHand")).toBe(false);
    expect(oppTurn.p1.can("cast", "inTrash")).toBe(false);
    // Own turn but Closed state: P1 casts one copy; while it sits on the chain the trash copy is not offered.
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 2 } })
      .gear(P2, BALLISTA, "theirs")
      .gear(P2, SCRAPHEAP, "heap")
      .hand(P1, CARD, "inHand")
      .trash(P1, CARD, "inTrash")
      .build();
    await game.p1.cast("inHand", { targets: "theirs" });
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.can("cast", "inTrash")).toBe(false);
  });

  test("only the OWNER may Flow it: P2 with [4][fury] cannot play P1's trashed Brittle Steel", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 4, power: { fury: 1 } })
      .gear(P1, BALLISTA, "mine")
      .trash(P1, CARD, "steel")
      .build();
    expect(game.p2.can("cast", "steel")).toBe(false);
    expect(game.p2.legal().some((o) => o.card === "steel")).toBe(false);
  });

  test("partner — Scrapheap: killing the enemy's Scrapheap makes ITS controller draw 1, not the caster", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .gear(P2, SCRAPHEAP, "heap")
      .hand(P1, CARD, "steel")
      .build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("steel", { targets: "heap" });
    await game.settle();
    expect(game.zoneOf("heap")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p1.hand()).toHaveLength(p1Hand - 1); // only the spell left the hand
  });
});
