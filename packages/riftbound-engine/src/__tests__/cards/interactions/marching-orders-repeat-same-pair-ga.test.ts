/**
 * Interaction: Marching Orders (sfd-114-221) · Spell · Body · 3 · Action · [Repeat] [3]
 *     "Choose a friendly unit anywhere and an enemy unit at a battlefield. They deal damage equal to their Mights to
 *      each other."
 *   × Guardian Angel (sfd-051-221) · Equipment · Calm · 2 · +1 Might — appends "If I would die, kill Guardian Angel
 *     instead. Heal me, exhaust me, and recall me."
 *   × Flash (ogs-011-024) · Spell · Chaos · 2 · Reaction — "Move up to 2 friendly units to base."
 *
 * Rules: 820.1.d.1 / 820.2.a / 820.3.a (Repeat = execute the instructions one more time inside the SAME chain item;
 * the choices for each execution may be the same pair), 820.1.c.1 (the Repeat cost is an additional cost paid at
 * play — never refunded), 321 / 142.4.a / 323.5 (no Cleanup — hence no death — while an item is resolving; lethal
 * damage kills in the ONE Cleanup afterwards), 370.1.a.1 / 373 (Guardian Angel is a would-DIE replacement, consulted
 * once at that Cleanup), 417.6.b.3 (the units are the damage sources), 359.3.e.2 / 359.3.e.5 / 359.3.e.10 (a target
 * moved to base no longer meets "at a battlefield" → instructions about it are not followed; the spell still counts
 * as played). FIXER-PRIMER "Multi-execution damage vs replacements": death replacements are NOT applied between
 * executions.
 *
 * Question — P1's turn, 6 energy. P1's vanilla F (4) sits in base wearing Guardian Angel (→ 5). P2: E (5) at bf1,
 * E2 (3) at bf2, Flash in hand.
 *  (a) P1 casts Marching Orders paying Repeat, both executions = (F, E); no response. Exec 1: F 5/5, E 5/5; exec 2
 *      (both still legal, F still 5 Might — nothing died in between): F 10/5, E 10/5. One Cleanup: E dies; F would
 *      die → GA applied once: GA killed, F healed / exhausted / stays in base at 4 Might.
 *  (b) P2 responds with Flash moving E to base: E is illegal for BOTH executions, "each other" cannot be performed
 *      one-sided → no damage at all, GA untouched, E safe in base; the [3]+[3] stay spent; Marching Orders → trash.
 *  (c) Executions (F, E) then (F, E2), P2 Flashes only E2: exec 1 resolves fully, exec 2 is ignored → E dies, F is
 *      saved by GA (4 Might, exhausted, base), E2 untouched in base.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MARCHING_ORDERS = "sfd-114-221";
const GUARDIAN_ANGEL = "sfd-051-221";
const FLASH = "ogs-011-024";

/** P1's turn 2, 6 energy. F (4) + Guardian Angel in P1's base; P2's E (5) at bf1, E2 (3) at bf2, Flash + 2 energy. */
function board() {
  return scenario()
    .resources(P1, { energy: 6 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 4, name: "Fighter F" }, "f", { equippedWith: ["ga"] } as Record<string, unknown>)
    .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "f" } as Record<string, unknown>, owner: P1, zone: "base" })
    .unit(P2, "bf1", { might: 5, name: "Enemy E" }, "e")
    .unit(P2, "bf2", { might: 3, name: "Enemy E2" }, "e2")
    .hand(P1, MARCHING_ORDERS, "mo")
    .hand(P2, FLASH, "flash");
}

/** P1 casts Marching Orders with Repeat paid and both executions on (F, E). */
async function castSamePairTwice(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("mo", { repeat: 1, targets: ["f", "e"] });
  return game;
}

describe("setup / play-time choices (820.2.a, 355.5)", () => {
  test("F in BASE is a legal 'friendly unit anywhere' and wears Guardian Angel (4 + 1 = 5 Might); the enemy role offers only units AT A BATTLEFIELD; with Repeat the same pair may be named for both executions", async () => {
    const game = await board().build();
    expect(game.state("f")).toMatchObject({ attachments: ["ga"], baseMight: 4, might: 5, zone: "base" });
    expect(game.state("ga").attachedTo).toBe("f");
    const targets = game.p1.option("cast", "mo")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(targets).toContainEqual(["f", "e"]);
    expect(targets).toContainEqual(["f", "e2"]);
    expect(targets).toContainEqual(["f", "e", "f", "e2"]); // different pairs per execution
    expect((targets as string[][]).every((t) => t[0] === "f" && t[1] !== "f")).toBe(true); // F is never the enemy role
    expect(game.p1.option("cast", "mo")?.fields.find((f) => f.arg === "repeat")?.options).toEqual([1]);
  });

  test("casting with Repeat costs 3 + [3] = all 6 energy up front (820.1.c.1); the chain item is ONE spell naming (F, E)", async () => {
    const game = await castSamePairTwice();
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mo", controller: P1, targets: ["f", "e"], triggered: false, type: "spell" })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });
});

describe("(a) same pair twice, no response — both fights land, then ONE Cleanup consults Guardian Angel once (321, 142.4.a, 373)", () => {
  test("no prompt interrupts the resolution (GA is not asked/applied between the executions): after both pass the chain is empty and P1 is back in the main phase", async () => {
    const game = await castSamePairTwice();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("outcome: E (10 marked on 5) dies to P2's trash; F would die → Guardian Angel is killed to P1's trash INSTEAD, F is healed to 0, exhausted, still in base, back to 4 Might with nothing attached", async () => {
    const game = await castSamePairTwice();
    await game.settle();
    expect(game.zoneOf("e")).toBe("trash");
    expect(game.p2.trash()).toContain("e");
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["ga", "mo"]);
    expect(game.state("f")).toMatchObject({ attachments: [], damage: 0, isExhausted: true, might: 4, zone: "base" });
    expect(game.zoneOf("e2")).toBe("battlefield-bf2");
    expect(game.state("e2").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("discriminator: had GA fired 'between' the fights, F (then 4 Might, GA gone) would have taken a second lethal 5 and DIED — instead F is alive, i.e. GA was consumed exactly once for two 'lethal' hits", async () => {
    const game = await castSamePairTwice();
    await game.settle();
    expect(game.has("f")).toBe(true);
    expect(game.zoneOf("f")).toBe("base");
    expect(game.p1.trash()).not.toContain("f");
    expect(game.p1.units("base")).toEqual(["f"]);
  });
});

describe("(b) P2 Flashes E to base in response — E is illegal for both executions, nothing is dealt (359.3.e.2 / .e.5 / .e.10)", () => {
  async function flashedE(): Promise<Game> {
    const game = await castSamePairTwice();
    await game.p1.passPriority();
    expect(game.p2.can("cast", "flash")).toBe(true);
    await game.p2.cast("flash", { targets: ["e"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["mo", "flash"]);
    return game;
  }

  test("Flash resolves first (LIFO): E is in P2's base, undamaged, while Marching Orders is still on the chain naming (F, E)", async () => {
    const game = await flashedE();
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("e")).toBe("base");
    expect(game.state("e").damage).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mo", targets: ["f", "e"] })]);
    expect(game.zoneOf("flash")).toBe("trash");
  });

  // BUG: the `fight` effect does not re-check "an enemy unit AT A BATTLEFIELD" as it resolves — F and the flashed E
  // still trade 5/5 twice, E dies in base and Guardian Angel is burnt. Expected (359.3.e.2/.e.5): E in base is an
  // illegal target for both executions; "deal damage to EACH OTHER" cannot be performed with one legal party, so
  // neither unit is dealt anything and GA stays attached.
  test("Marching Orders then resolves with NO effect: F 0 damage / 5 Might / GA still attached / ready, E 0 damage in base, nobody in a trash but the two spells", async () => {
    const game = await flashedE();
    await game.settle();
    expect(game.state("e")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("f")).toMatchObject({ attachments: ["ga"], damage: 0, isExhausted: false, might: 5, zone: "base" });
    expect(game.zoneOf("ga")).toBe("base");
    expect(game.p1.trash()).toEqual(["mo"]);
    expect(game.p2.trash()).toEqual(["flash"]);
  });

  test("either way the spell counts as played and resolved: Marching Orders → P1's trash, chain empty, NOTHING refunded (P1 0 energy, P2 0 energy), P1's open main phase (820.3.a, 820.1.c.1)", async () => {
    const game = await flashedE();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("mo")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.p1.energy()).toBe(0);
    expect(game.p2.energy()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("e2")).toBe("battlefield-bf2"); // never involved
  });
});

describe("(c) executions (F, E) then (F, E2); P2 Flashes only E2 — exec 1 resolves, exec 2 is ignored", () => {
  async function flashedE2(): Promise<Game> {
    const game = await board().build();
    await game.p1.cast("mo", { repeat: 1, targets: ["f", "e", "f", "e2"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mo", targets: ["f", "e", "f", "e2"] })]);
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["e2"] });
    return game;
  }

  test("exec 1 lands in full: E (5 on 5) dies to P2's trash; F took lethal 5 → Guardian Angel saves it once (GA → P1's trash, F healed, exhausted, in base at 4 Might)", async () => {
    const game = await flashedE2();
    await game.settle();
    expect(game.zoneOf("e")).toBe("trash");
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.state("f")).toMatchObject({ attachments: [], damage: 0, isExhausted: true, might: 4, zone: "base" });
    expect(game.zoneOf("mo")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
  });

  // BUG: same missing legality re-check as (b) — the flashed E2 still fights F in exec 2 and dies in base.
  // Expected (359.3.e.2/.e.5, 820.1.d.2): E2 in base is illegal, exec 2's instruction is ignored, E2 untouched.
  test("E2 (moved to base) is untouched — 0 damage, still on the board in P2's base; P2's trash holds only Flash and E", async () => {
    const game = await flashedE2();
    await game.settle();
    expect(game.state("e2")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.p2.trash().sort()).toEqual(["e", "flash"]);
    expect(game.violations()).toEqual([]);
  });
});
