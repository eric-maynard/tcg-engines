/**
 * Core rules — the single leave-play / die choke point (`operations/leave-board.ts`)
 * and last-known information (LKI).
 *
 * Rules covered (riftbound-rules ids):
 *   124.1          zone change to a non-board zone stops tracking every temporary modification
 *   186.1          a token put into a non-board zone ceases to exist right after arriving
 *   428.1 / 428.1.a.1.b / 428.1.a.2   active and passive kills are both deaths; note location,
 *                  attributes and other relevant information before completing the kill
 *   457.1 / 719.5  attachments detach when the top-most card leaves the board
 *   740.2.a        alone = no OTHER friendly unit at the same location (read before the event)
 *   370.1.a.2      units killed by one action die simultaneously
 *   383.3.d        "your [Deathknell] effects trigger an additional time" read from the pre-event board
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

function spell(name: string, effect: Record<string, unknown>, energyCost = 0) {
  return { abilities: [{ effect, timing: "action", type: "spell" }], cardType: "spell", energyCost, name, timing: "action" };
}

/** "Kill all units at a battlefield." — one instruction, one simultaneous batch. */
const WIPE_BF = spell("Wipe", { target: { location: "battlefield", quantity: "all", type: "unit" }, type: "kill" });
/** "Deal 3 to all units at battlefields." */
const QUAKE = spell("Quake", { amount: 3, target: { location: "battlefield", quantity: "all", type: "unit" }, type: "damage" });
/** "Kill a unit." */
const KILL = spell("Kill", { target: { type: "unit" }, type: "kill" });
/** "Deal 5 to a unit." */
const BOLT = spell("Bolt", { amount: 5, target: { type: "unit" }, type: "damage" });
/** "Play a 1-Might Recruit unit token to your base." */
const MAKE_RECRUIT = spell("Make Recruit", { location: "base", token: { might: 1, name: "Recruit", type: "unit" }, type: "create-token" });

const LONELY_PORO = "sfd-036-221"; // [Deathknell] — If I died alone, draw 1.
const KARTHUS = "ogn-236-298"; // Your [Deathknell] effects trigger an additional time.
/** Unit · 2 Might · [Deathknell] Draw 1. (parser shape: keyword + its synthesized trigger) */
const DK_DRAWER = {
  abilities: [
    { effect: { amount: 1, type: "draw" }, keyword: "Deathknell", type: "keyword" },
    { effect: { amount: 1, type: "draw" }, trigger: { event: "die", on: "self" }, type: "triggered" },
  ],
  cardType: "unit",
  energyCost: 0,
  keywords: ["Deathknell"],
  might: 2,
  name: "Filler Deathknell Drawer",
};
/** Unit · 3 Might · "When another friendly unit dies, draw 1." */
const MOURNER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "die", on: "friendly-other-units" }, type: "triggered" }],
  cardType: "unit",
  energyCost: 0,
  might: 3,
  name: "Filler Mourner",
};

describe("740.2.a / 370.1.a.2 — 'died alone' is judged on the board as it was BEFORE the simultaneous kill", () => {
  test("two friendly Lonely Poros at the same battlefield killed by ONE instruction: neither died alone → no draws", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", LONELY_PORO, "a")
      .unit(P1, "bf1", LONELY_PORO, "b")
      .hand(P2, WIPE_BF, "wipe")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p2.cast("wipe");
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  test("the same two Poros dying together to lethal damage in one cleanup (passive kill) also draw nothing", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", LONELY_PORO, "a")
      .unit(P1, "bf1", LONELY_PORO, "b")
      .hand(P2, QUAKE, "quake")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p2.cast("quake");
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  test("contrast: a single Poro with only an ENEMY neighbour died alone → draws 1; the die event carries the LKI payload", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", LONELY_PORO, "a", { buffed: true })
      .unit(P2, "bf1", { might: 5, name: "Enemy" }, "e")
      .hand(P2, KILL, "kill")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p2.cast("kill", { targets: "a" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "a", controller: P1, triggered: true })]);
    const [item] = game.gameState.interaction?.chain?.items ?? [];
    expect((item as { triggerEvent?: unknown } | undefined)?.triggerEvent).toMatchObject({
      cardId: "a",
      cause: "kill",
      controller: P1,
      diedAt: "battlefield-bf1",
      killSource: "spell",
      killedBy: P2,
      owner: P1,
      type: "die",
      wasAlone: true,
      wasBuffed: true,
    });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });
});

describe("124.1 — a killed permanent is a NEW object in the trash: nothing temporary survives (both kill paths)", () => {
  for (const [label, SPELL] of [
    ["kill instruction (active)", KILL],
    ["lethal damage (passive / SBA)", BOLT],
  ] as const) {
    test(`${label}: exhausted + buffed + stunned + damaged + +2 this turn → trash copy reads printed Might, 0 damage, no flags, no stale counter`, async () => {
      const game = await scenario()
        .active(P2)
        .unit(P1, "base", { might: 3, name: "Victim" }, "v", { buffed: true, damage: 1, exhausted: true, mightModifier: 2, stunned: true })
        .hand(P2, SPELL, "s")
        .build();
      expect(game.state("v").might).toBe(6);
      await game.p2.cast("s", { targets: "v" });
      await game.settle();
      expect(game.zoneOf("v")).toBe("trash");
      const st = game.state("v");
      expect(st.might).toBe(3);
      expect(st.damage).toBe(0);
      expect(st.isBuffed).toBe(false);
      expect(st.isStunned).toBe(false);
      expect(st.isExhausted).toBe(false);
      expect((st.meta as { __counters?: { damage?: number } }).__counters?.damage ?? 0).toBe(0);
      expect(game.violations()).toEqual([]);
    });
  }
});

describe("457.1 / 719.5 — attachments detach when the bearer leaves; the Equipment stays on the board (recalled to base)", () => {
  const SWORD = { cardType: "equipment", mightBonus: 2, name: "Filler Sword" };

  test("bearer killed by lethal damage at a battlefield: Sword → owner's base, unattached; bearer in trash lists no attachments", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Bearer" }, "u", { equippedWith: ["sw"] })
      .gear(P1, SWORD, "sw", { attachedTo: "u" })
      .hand(P2, BOLT, "bolt")
      .build();
    expect(game.state("u").might).toBe(4);
    await game.p2.cast("bolt", { targets: "u" });
    await game.settle();
    expect(game.zoneOf("u")).toBe("trash");
    expect(game.zoneOf("sw")).toBe("base");
    expect(game.state("sw").attachedTo).toBeUndefined();
    expect(game.state("u").attachments).toEqual([]);
  });

  test("bearer killed by an instruction: same detach", async () => {
    const game = await scenario()
      .active(P2)
      .unit(P1, "base", { might: 2, name: "Bearer" }, "u", { equippedWith: ["sw"] })
      .gear(P1, SWORD, "sw", { attachedTo: "u" })
      .hand(P2, KILL, "kill")
      .build();
    await game.p2.cast("kill", { targets: "u" });
    await game.settle();
    expect(game.zoneOf("u")).toBe("trash");
    expect(game.zoneOf("sw")).toBe("base");
    expect(game.state("sw").attachedTo).toBeUndefined();
    expect(game.state("u").attachments).toEqual([]);
  });
});

describe("186.1 / 428.1.a.1.b — a killed token fires its death for listeners, then ceases to exist", () => {
  test("Recruit token killed by an instruction: Mourner draws 1, the token is nowhere, trash unchanged", async () => {
    const game = await scenario()
      .unit(P1, "base", MOURNER, "m")
      .hand(P1, MAKE_RECRUIT, "mk")
      .hand(P1, KILL, "kill")
      .build();
    await game.p1.cast("mk");
    await game.settle();
    const tok = game.p1.units("base").find((id) => game.state(id).isToken);
    expect(tok).toBeDefined();
    const hand0 = game.p1.hand().length;
    const trash0 = game.p1.trash().length;
    await game.p1.cast("kill", { targets: tok as string });
    await game.settle();
    expect(game.has(tok as string)).toBe(false);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1); // cast Kill (−1), Mourner drew (+1)
    expect(game.p1.trash()).toHaveLength(trash0 + 1); // only the Kill spell
    expect(game.violations()).toEqual([]);
  });
});

describe("383.3.d / 370.1.a.2 — a trigger doubler dying in the same batch still doubles its batch-mates' Deathknells", () => {
  test("Karthus + a Deathknell drawer wiped together at one battlefield: the drawer's Deathknell triggers twice → 2 cards", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", KARTHUS, "karthus")
      .unit(P1, "bf1", DK_DRAWER, "dk")
      .hand(P2, WIPE_BF, "wipe")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p2.cast("wipe");
    await game.settle();
    expect(game.zoneOf("karthus")).toBe("trash");
    expect(game.zoneOf("dk")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
  });

  test("contrast: Karthus killed FIRST by a separate instruction no longer doubles a later death → 1 card", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", KARTHUS, "karthus")
      .unit(P1, "bf1", DK_DRAWER, "dk")
      .hand(P2, KILL, "k1")
      .hand(P2, KILL, "k2")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p2.cast("k1", { targets: "karthus" });
    await game.settle();
    await game.p2.cast("k2", { targets: "dk" });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });
});

// ===========================================================================
// Every other leave path runs through the same choke point
// ===========================================================================

/** Unit · 2 Might · [Temporary] [Deathknell] Draw 1. */
const FLEETING = {
  abilities: [
    { keyword: "Temporary", type: "keyword" },
    { effect: { amount: 1, type: "draw" }, keyword: "Deathknell", type: "keyword" },
    { effect: { amount: 1, type: "draw" }, trigger: { event: "die", on: "self" }, type: "triggered" },
  ],
  cardType: "unit",
  energyCost: 0,
  keywords: ["Temporary", "Deathknell"],
  might: 2,
  name: "Filler Fleeting",
};
/** Unit · 2 Might · "Kill this: Draw 1." + [Deathknell] Draw 1. */
const MARTYR = {
  abilities: [
    { cost: { kill: "self" }, effect: { amount: 1, type: "draw" }, type: "activated" },
    { effect: { amount: 1, type: "draw" }, keyword: "Deathknell", type: "keyword" },
    { effect: { amount: 1, type: "draw" }, trigger: { event: "die", on: "self" }, type: "triggered" },
  ],
  cardType: "unit",
  energyCost: 0,
  keywords: ["Deathknell"],
  might: 2,
  name: "Filler Martyr",
};
/** "Banish a unit." / "Return a unit to its owner's hand." */
const BANISH = spell("Banish", { target: { type: "unit" }, type: "banish" });
const BOUNCE = spell("Bounce", { target: { type: "unit" }, type: "return-to-hand" });

describe("728.1.b / 428.1 — the Beginning-Phase [Temporary] kill is a death through the choke point", () => {
  test("a buffed, damaged Temporary Deathknell unit: killed at its controller's next Beginning Phase, Deathknell draws, trash copy is reset, Mourner sees it die", async () => {
    const game = await scenario()
      .active(P2)
      .unit(P1, "base", FLEETING, "f", { buffed: true, exhausted: true })
      .unit(P1, "base", MOURNER, "m")
      .build();
    const hand0 = game.p1.hand().length;
    await game.advanceTurn(); // → P1's turn: Beginning Phase kills the Temporary unit
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("f")).toBe("trash");
    expect(game.state("f").isBuffed).toBe(false);
    expect(game.state("f").isExhausted).toBe(false);
    // Deathknell (+1) and Mourner (+1) resolved inside the Beginning Phase, then the Draw Phase (+1).
    expect(game.p1.hand()).toHaveLength(hand0 + 3);
    expect(game.violations()).toEqual([]);
  });

  test("a Temporary TOKEN ceases to exist after its death is published (186.1) — Mourner still draws", async () => {
    const game = await scenario()
      .active(P1)
      .unit(P1, "base", MOURNER, "m")
      .hand(P1, spell("Make Temp", { location: "base", token: { keywords: ["Temporary"], might: 1, name: "Spriteling", type: "unit" }, type: "create-token" }), "mk")
      .build();
    await game.p1.cast("mk");
    await game.settle();
    const tok = game.p1.units("base").find((id) => game.state(id).isToken);
    expect(tok).toBeDefined();
    await game.advanceTurn(); // → P2
    expect(game.has(tok as string)).toBe(true);
    const hand0 = game.p1.hand().length;
    await game.advanceTurn(); // → P1: token killed
    expect(game.has(tok as string)).toBe(false);
    expect(game.p1.hand()).toHaveLength(hand0 + 2); // Mourner + Draw Phase
  });
});

describe("428.1.a.1 — a kill paid as an activation COST is an Active Kill: Deathknell and listeners fire, the card resets", () => {
  test("'Kill this: Draw 1' on a Deathknell unit → ability (+1), Deathknell (+1) and Mourner (+1) all resolve", async () => {
    const game = await scenario()
      .unit(P1, "base", MARTYR, "y", { buffed: true })
      .unit(P1, "base", MOURNER, "m")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.activate("y", 0);
    expect(game.zoneOf("y")).toBe("trash");
    expect(game.state("y").isBuffed).toBe(false);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 + 3);
    expect(game.violations()).toEqual([]);
  });
});

describe("427.1 / 124.1 / 186.1 — banish and bounce leave without dying: reset, no Deathknell, tokens cease", () => {
  test("banish a buffed, damaged Deathknell unit wearing a Sword: banishment holds a fresh card, Sword back in base unattached, no draw", async () => {
    const SWORD = { cardType: "equipment", mightBonus: 2, name: "Filler Sword" };
    const game = await scenario()
      .active(P2)
      .unit(P1, "base", DK_DRAWER, "d", { buffed: true, damage: 1, equippedWith: ["sw"] })
      .gear(P1, SWORD, "sw", { attachedTo: "d" })
      .unit(P1, "base", MOURNER, "m")
      .hand(P2, BANISH, "ban")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p2.cast("ban", { targets: "d" });
    await game.settle();
    expect(game.zoneOf("d")).toBe("banishment");
    expect(game.state("d").isBuffed).toBe(false);
    expect(game.state("d").damage).toBe(0);
    expect(game.state("d").attachments).toEqual([]);
    expect(game.zoneOf("sw")).toBe("base");
    expect(game.state("sw").attachedTo).toBeUndefined();
    expect(game.p1.hand()).toHaveLength(hand0); // not a death
    expect(game.chain()).toEqual([]);
  });

  test("bounce a stunned, exhausted unit: the hand copy is ready, unstunned, printed Might", async () => {
    const game = await scenario()
      .active(P2)
      .unit(P1, "base", { might: 3, name: "Victim" }, "v", { exhausted: true, mightModifier: 2, stunned: true })
      .hand(P2, BOUNCE, "b")
      .build();
    await game.p2.cast("b", { targets: "v" });
    await game.settle();
    expect(game.zoneOf("v")).toBe("hand");
    expect(game.state("v").isExhausted).toBe(false);
    expect(game.state("v").isStunned).toBe(false);
    expect(game.state("v").might).toBe(3);
  });
});

// ===========================================================================
// Single damage store (counter bag = store, meta.damage = mirror)
// ===========================================================================

describe("520 / 124.1 — one damage store: every writer keeps the counter and its mirror identical", () => {
  const HEAL2 = spell("Mend", { amount: 2, target: { type: "unit" }, type: "heal" });
  const PING3 = spell("Ping3", { amount: 3, target: { type: "unit" }, type: "damage" });
  const readStores = (game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>, id: string) => {
    const meta = game.state(id).meta as { damage?: number; __counters?: { damage?: number } };
    return { counter: meta.__counters?.damage ?? 0, mirror: meta.damage ?? 0 };
  };

  test("seeded damage, spell damage and a heal all agree in both stores (2 → 5 → 3)", async () => {
    const game = await scenario()
      .unit(P1, "base", { might: 7, name: "Big" }, "big", { damage: 2 })
      .hand(P1, PING3, "ping")
      .hand(P1, HEAL2, "mend")
      .build();
    expect(readStores(game, "big")).toEqual({ counter: 2, mirror: 2 });
    await game.p1.cast("ping", { targets: "big" });
    await game.settle();
    expect(readStores(game, "big")).toEqual({ counter: 5, mirror: 5 });
    expect(game.state("big").damage).toBe(5);
    await game.p1.cast("mend", { targets: "big" });
    await game.settle();
    expect(readStores(game, "big")).toEqual({ counter: 3, mirror: 3 });
    await game.p1.endTurn();
    await game.settle();
    expect(readStores(game, "big")).toEqual({ counter: 0, mirror: 0 }); // 317.2.b heal
  });

  test("sandbox `addDamage` that reaches lethal is a passive kill through the choke point: Deathknell fires, trash copy has no damage", async () => {
    const game = await scenario().unit(P1, "base", DK_DRAWER, "d").build();
    const hand0 = game.p1.hand().length;
    await game.p1.do("addDamage", { amount: 2, cardId: "d", playerId: P1 });
    expect(game.zoneOf("d")).toBe("trash");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(readStores(game, "d")).toEqual({ counter: 0, mirror: 0 });
  });

  test("sandbox `killUnit` is an active kill: Deathknell fires and the buff is gone in the trash", async () => {
    const game = await scenario().unit(P1, "base", DK_DRAWER, "d", { buffed: true }).build();
    const hand0 = game.p1.hand().length;
    await game.p1.do("killUnit", { cardId: "d", playerId: P1 });
    expect(game.zoneOf("d")).toBe("trash");
    expect(game.state("d").isBuffed).toBe(false);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });
});
