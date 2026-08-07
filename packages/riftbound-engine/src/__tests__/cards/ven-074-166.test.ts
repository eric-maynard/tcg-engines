/**
 * Legion Marauder — ven-074-166 · Unit · Body · 2 energy · 2 Might
 *
 *   [Empower] — [1] or [body] (Pay either cost: Empower me. Use only if not Empowered.)
 *   [Empowered][>] I have +1 [Might].
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. [Empower] is an activated ability (827.1.c.1) with an EITHER/OR cost (827.1.c.2): exactly one of
 *     {1 energy} / {1 body power} is paid — never both, never neither; with only one half affordable that
 *     half is the cost; a non-body pip (fury) cannot stand in for [body].
 *  2. It is a chain item (377.3), only on my turn in an Open state (381 / 145.2), and switched off while
 *     Empowered (827.1.c.1) — including on later turns, because Empowered persists (no end-of-turn clear).
 *  3. No [Exhaust] in the cost: a just-played (exhausted) Marauder can Empower immediately — 3 energy total
 *     on turn = a 3-Might body.
 *  4. [Empowered][>] +1 is a dependent passive (828.1.c): counts in combat (3 beats a 2, plain 2 trades).
 *  5. Partners: Guttural Roar (+2 / +4 "instead" if Empowered → 7 this turn, 3 next turn); Risen Altar
 *     battlefield makes the [1]-or-[body] Empower cost free for units there.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-074-166";
const GUTTURAL_ROAR = "ven-072-166"; // Body Action, 2: +2 Might this turn, +4 instead if the unit is Empowered
const RISEN_ALTAR = "ven-163-166"; // Battlefield: [Empower] costs of your units here cost [1] or [rainbow] less

function marauder(pool: { energy?: number; power?: Record<string, number> }) {
  return scenario().resources(P1, pool).unit(P1, "base", CARD, "lm");
}

describe("Legion Marauder (ven-074-166)", () => {
  test("Parsed abilities should be an activated [Empower] with an either/or cost ([1] | [body]) PLUS the while-empowered +1 static", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 2, might: 2 });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities.find((a) => a.type === "static")).toMatchObject({ condition: { type: "while-empowered" }, effect: { amount: 1, type: "modify-might" } });
    const act = abilities.find((a) => a.type === "activated") as { effect?: { type?: string } } | undefined;
    expect(act).toBeDefined();
    expect(act?.effect?.type).toBe("empower");
    const costJson = JSON.stringify(act);
    expect(costJson).toContain('"energy":1');
    expect(costJson).toContain("body");
  });

  test("cost: 2 energy, enters the base exhausted at 2 Might, not Empowered; 1 energy is short", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "lm").build();
    await game.p1.play("lm");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("lm")).toMatchObject({ isEmpowered: false, isExhausted: true, might: 2, zone: "base" });
    expect((await scenario().resources(P1, { energy: 1, power: { body: 1 } }).hand(P1, CARD, "lm").build()).p1.can("play", "lm")).toBe(false);
  });

  test("[Empowered][>] +1: an Empowered Marauder is 3 Might (base 2); a plain one beside it stays 2", async () => {
    const game = await scenario().unit(P1, "base", CARD, "lm", { empowered: true }).unit(P1, "base", CARD, "plain").build();
    expect(game.state("lm")).toMatchObject({ baseMight: 2, isEmpowered: true, might: 3 });
    expect(game.state("plain")).toMatchObject({ isEmpowered: false, might: 2 });
  });

  test("[Empower] paid with [1]: 1 energy and no power → activatable; energy goes to 0, the ability is a chain item, and it resolves to an Empowered 3-Might unit", async () => {
    const game = await marauder({ energy: 1 }).build();
    expect(game.p1.can("activate", "lm")).toBe(true);
    await game.p1.activate("lm");
    expect(game.p1.resources().energy).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lm", triggered: false })]);
    await game.settle();
    expect(game.state("lm")).toMatchObject({ isEmpowered: true, isExhausted: false, might: 3 });
  });

  test("[Empower] paid with [body]: 0 energy + 1 body power → activatable; the body pip is spent and it resolves to 3 Might", async () => {
    const game = await marauder({ energy: 0, power: { body: 1 } }).build();
    expect(game.p1.can("activate", "lm")).toBe(true);
    await game.p1.activate("lm");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.state("lm").might).toBe(3);
  });

  test("'either' means exactly one half — with 1 energy AND 1 body available, activating spends a total of exactly 1 resource, never both", async () => {
    const game = await marauder({ energy: 1, power: { body: 1 } }).build();
    // rule 357.2: both halves are payable, so the activation names which one.
    await game.p1.activate("lm", 0, { params: { costOptionIndex: 0 } });
    const r = game.p1.resources();
    expect(r.energy + (r.power.body ?? 0)).toBe(1);
    await game.settle();
    expect(game.state("lm").isEmpowered).toBe(true);
  });

  test("rule 357.2 — with BOTH halves affordable the player chooses which cost to pay: choosing [body] spends the body pip and leaves energy alone", async () => {
    const game = await marauder({ energy: 2, power: { body: 1 } }).build();
    const opt = game.p1.legal().find((o) => o.key === "activateAbility:lm#0");
    expect(opt?.variantCount).toBe(2);
    expect(opt?.fields.find((f) => f.arg === "costOptionIndex")?.options).toEqual([0, 1]);
    await game.p1.activate("lm", 0, { params: { costOptionIndex: 1 } });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { body: 0 } });
    await game.settle();
    expect(game.state("lm").isEmpowered).toBe(true);

    const other = await marauder({ energy: 2, power: { body: 1 } }).build();
    await other.p1.activate("lm", 0, { params: { costOptionIndex: 0 } });
    expect(other.p1.resources()).toEqual({ energy: 1, power: { body: 1 } });
  });

  test("negative space — nothing to pay with, or only a FURY pip, or already Empowered, or the opponent's turn: not activatable", async () => {
    expect((await marauder({ energy: 0 }).build()).p1.can("activate", "lm")).toBe(false);
    expect((await marauder({ energy: 0, power: { fury: 1 } }).build()).p1.can("activate", "lm")).toBe(false);
    const already = await scenario().resources(P1, { energy: 1, power: { body: 1 } }).unit(P1, "base", CARD, "lm", { empowered: true }).build();
    expect(already.p1.can("activate", "lm")).toBe(false);
    const theirTurn = await scenario().active(P2).resources(P1, { energy: 1, power: { body: 1 } }).unit(P1, "base", CARD, "lm").build();
    expect(theirTurn.p1.can("activate", "lm")).toBe(false);
  });

  test("Multi-step — 3 energy on turn: play (2), Empower the still-exhausted Marauder (1), end with a 3-Might Empowered unit; next turn it is still 3 and [Empower] stays off", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "lm").build();
    await game.p1.play("lm");
    await game.settle();
    await game.p1.activate("lm");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("lm")).toMatchObject({ isEmpowered: true, isExhausted: true, might: 3 });
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.tapRune();
    expect(game.state("lm")).toMatchObject({ isEmpowered: true, isReady: true, might: 3 });
    expect(game.p1.can("activate", "lm")).toBe(false);
  });

  test("Empowered persists across turns on its own: two turn-advances later still Empowered at 3 Might", async () => {
    const game = await scenario().unit(P1, "base", CARD, "lm", { empowered: true }).build();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.state("lm")).toMatchObject({ isEmpowered: true, might: 3 });
  });

  test("the +1 counts in combat: an Empowered Marauder (3) attacking a 2-Might defender kills it and conquers; a plain one (2 v 2) trades and scores nothing", async () => {
    const emp = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "lm", { empowered: true }).unit(P2, "bf1", { might: 2 }, "def").build();
    await emp.p1.move("lm", "bf1");
    await emp.settle();
    expect(emp.zoneOf("def")).toBe("trash");
    expect(emp.zoneOf("lm")).toBe("battlefield-bf1");
    expect(emp.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(emp.p1.points()).toBe(1);
    const plain = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "lm").unit(P2, "bf1", { might: 2 }, "def").build();
    await plain.p1.move("lm", "bf1");
    await plain.settle();
    expect(plain.zoneOf("def")).toBe("trash");
    expect(plain.zoneOf("lm")).toBe("trash");
    expect(plain.p1.points()).toBe(0);
  });

  test("partner — Guttural Roar on an Empowered Marauder gives +4 'instead' (3 → 7 this turn), back to 3 next turn; on a plain one only +2 (2 → 4)", async () => {
    // Actual: Guttural Roar's "+4 instead if Empowered" rider is not applied (Empowered gets +2 → 5).
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .unit(P1, "base", CARD, "lm", { empowered: true })
      .unit(P1, "base", CARD, "plain")
      .hand(P1, GUTTURAL_ROAR, "roar1")
      .hand(P1, GUTTURAL_ROAR, "roar2")
      .build();
    await game.p1.cast("roar2", { targets: "plain" });
    await game.settle();
    expect(game.state("plain").might).toBe(4);
    await game.p1.cast("roar1", { targets: "lm" });
    await game.settle();
    expect(game.state("lm").might).toBe(7);
    await game.advanceTurn();
    expect(game.state("lm").might).toBe(3);
    expect(game.state("plain").might).toBe(2);
  });

  test("partner — at Risen Altar ('[Empower] costs of your units here cost [1] or [rainbow] less') the Marauder Empowers for free: 0 energy, 0 power → activatable, resolves to 3 Might", async () => {
    const game = await scenario()
      .battlefield("altar", { controller: P1, def: RISEN_ALTAR, inert: false })
      .unit(P1, "altar", CARD, "lm")
      .unit(P1, "base", CARD, "away") // not "here": still needs [1] or [body]
      .build();
    expect(game.p1.can("activate", "away")).toBe(false);
    expect(game.p1.can("activate", "lm")).toBe(true);
    await game.p1.activate("lm");
    await game.settle();
    expect(game.state("lm")).toMatchObject({ isEmpowered: true, might: 3 });
    expect(game.p1.resources().energy).toBe(0);
  });
});
