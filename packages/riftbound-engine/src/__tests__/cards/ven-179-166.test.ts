/**
 * Rengar, Trophy Hunter — ven-179-166 · Champion Unit (Rengar) · Body · 5 energy + [body] · 6 Might
 *
 *   [Ambush]
 *   I can be played to a battlefield where there are enemy units.
 *
 * (VEN reprint of unl-120-219 with the errata'd [Ambush] keyword and no reminder text.)
 *
 * Head-judge notes — the tricky spots for this card:
 *  1. Two INDEPENDENT permissions. Line 2 is a play-LOCATION permission (355.2): at normal unit timing
 *     (your turn, open state) Rengar may be put onto a battlefield that holds enemy units even with no
 *     friendly unit there and whoever controls it. It does NOT grant Reaction timing.
 *  2. [Ambush] (822.1.b) = "may be played to a battlefield where you control units" + "[Reaction]
 *     while being played there". So on the opponent's turn / in a showdown the ONLY legal destination
 *     is a battlefield where P1 already has units — not base, not an enemy-only battlefield.
 *  3. Arriving at a battlefield with enemy units makes it Contested → a combat is staged once the
 *     state is open; 6 Might into a 3-Might holder kills it and conquers (P1 scores).
 *  4. Ambushed in mid-combat as a defender he adds 6 Might to the defence; the attacker still gets to
 *     assign its damage (units played enter exhausted but still deal/take combat damage).
 *  5. Negative space: an enemy-controlled battlefield with NO enemy units is not opened up; an
 *     open/uncontrolled empty battlefield is never a unit play destination.
 *  6. Cost 5 + [body] is paid in full whichever permission is used; as a champion he can also be
 *     played from the Champion Zone with the same destinations.
 */

import { describe, expect, test } from "bun:test";
import type { SeatHandle } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-179-166";

const destinations = (seat: SeatHandle, verb = "play", card = "rengar") =>
  ((seat.option(verb, card)?.fields.find((f) => f.arg === "to" || f.name === "location")?.options as string[] | undefined) ?? []).toSorted();

/** P1's turn, 5 energy + 1 body; P2 holds bf1 with a 3-Might Guard; bf2 is P2's but empty; bf3 uncontrolled. */
function ownTurn() {
  return scenario()
    .resources(P1, { energy: 5, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .hand(P1, CARD, "rengar");
}

/** P2's turn; P1 holds bf1 with a 2-Might Scout, P2 holds bf2 with a Sentry and has a 5-Might Raider in base. */
function oppTurn() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 5, power: { body: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "bf2", { might: 2, name: "Sentry" }, "sentry")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P1, CARD, "rengar");
}

describe("Rengar, Trophy Hunter (ven-179-166)", () => {
  test("card data: 5-cost + [body] Body champion unit, 6 Might, tagged Rengar, printed [Ambush]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 5, isChampion: true, might: 6, powerCost: ["body"], tags: ["Rengar"] });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toMatchObject({ keyword: "Ambush", type: "keyword" });
    const game = await ownTurn().build();
    expect(game.state("rengar").keywords).toContain("Ambush");
  });

  test("line 2 must parse to a structured play-location permission (enemy-units battlefield), not raw text", async () => {
    // Expected: a static like { effect: { type: "grant-keyword", keyword: "CanPlayToEnemyBattlefield" } } or a
    // play-restriction/allowed-location shape. Actual: { type: "static", effect: { type: "raw", text: "…" } }.
    const def = (await loadDefaultCardPool()).get(CARD);
    const second = (def?.abilities?.[1] ?? {}) as { type?: string; effect?: { type?: string } };
    expect(second.type).toBe("static");
    expect(second.effect?.type).not.toBe("raw");
    expect(JSON.stringify(second)).toMatch(/enemy/i);
  });

  test("cost & baseline: 5 energy + 1 body to base, enters exhausted at 6 Might; 4 energy or the wrong power colour cannot play him", async () => {
    const game = await ownTurn().build();
    await game.p1.play("rengar", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("rengar")).toBe("base");
    expect(game.state("rengar")).toMatchObject({ isExhausted: true, might: 6 });
    const short = await scenario().resources(P1, { energy: 4, power: { body: 2 } }).hand(P1, CARD, "rengar").build();
    expect(short.p1.can("play", "rengar")).toBe(false);
    const offColour = await scenario().resources(P1, { energy: 5, power: { fury: 1 } }).hand(P1, CARD, "rengar").build();
    expect(offColour.p1.can("play", "rengar")).toBe(false);
  });

  test("'I can be played to a battlefield where there are enemy units' — enemy-held bf1 (Guard there, no friendly unit) is a legal destination on my turn", async () => {
    // Expected (355.2 + card text): destinations include battlefield-bf1. Actual: only base is offered
    // because the permission reached the engine as raw text.
    const game = await ownTurn().build();
    expect(destinations(game.p1)).toContain("battlefield-bf1");
    const r = await game.p1.try((p) => p.play("rengar", { to: "bf1" }));
    expect(r.ok).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  });

  test("full line-2 flow — played onto the Guard's battlefield he contests it, the staged combat is 6 into 3: Guard dies, Rengar conquers bf1 and P1 scores 1", async () => {
    // Expected: after the play settles, guard in trash, rengar at bf1, bf1 controller P1, P1 points 1.
    // Actual: the play to bf1 is rejected (destination not offered).
    const game = await ownTurn().build();
    await game.p1.play("rengar", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("rengar")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("rengar").damage).toBe(0); // healed in the combat cleanup
  });

  test("negative space on my turn: P2's EMPTY bf2 (no enemy units) and the uncontrolled empty bf3 are never destinations; base always is", async () => {
    const game = await ownTurn().build();
    const dests = destinations(game.p1);
    expect(dests).toContain("base");
    expect(dests).not.toContain("battlefield-bf2");
    expect(dests).not.toContain("battlefield-bf3");
    expect((await game.p1.try((p) => p.play("rengar", { to: "bf2" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.play("rengar", { to: "bf3" }))).ok).toBe(false);
    expect(game.zoneOf("rengar")).toBe("hand");
  });

  test("[Ambush] gives no window in the opponent's neutral open state (310.1.a): nothing to play before P2 acts", async () => {
    const game = await oppTurn().build();
    expect(game.p1.can("play", "rengar")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "rengar")).toBe(false);
  });

  test("[Ambush] as a Reaction in P2's showdown at bf1 (where my Scout is): the ONLY destination is bf1 — not base, not P2's Sentry-held bf2", async () => {
    const game = await oppTurn().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("play", "rengar")).toBe(true);
    expect(destinations(game.p1)).toEqual(["battlefield-bf1"]);
    expect((await game.p1.try((p) => p.play("rengar", { to: "base" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.play("rengar", { to: "bf2" }))).ok).toBe(false);
  });

  test("[Ambush] mid-combat: Rengar joins the defence for the full 5 + [body]; defenders 2 + 6 kill the 5-Might Raider, Rengar survives (healed), P1 keeps bf1 and P2 scores nothing", async () => {
    const game = await oppTurn().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.play("rengar", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.locationOf("rengar")).toBe("bf1"); // a permanent: lands at once, exhausted
    expect(game.state("rengar").isExhausted).toBe(true);
    await game.settle(); // both pass focus → combat damage (P2 assigns its 5 among Scout/Rengar) → resolution
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("rengar")).toBe("bf1");
    expect(game.state("rengar").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("negative space: the same raid WITHOUT the ambush — the 5-Might Raider kills the lone 2-Might Scout and P2 conquers bf1", async () => {
    const game = await oppTurn().build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  test("[Ambush] in a Closed state on my own turn: while my spell is on the chain, Rengar may still be played — but only to bf1 where my unit is, not to base", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { body: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
      .hand(P1, "ogn-004-298", "cleave") // Cleave: 1-cost Action spell, keeps a chain open
      .hand(P1, CARD, "rengar")
      .build();
    expect(destinations(game.p1)).toEqual(["base", "battlefield-bf1"]); // open state: normal destinations
    await game.p1.cast("cleave", { targets: "scout" });
    expect(game.chain()).toHaveLength(1);
    expect(game.actingSeat()).toBe(P1);
    expect(destinations(game.p1)).toEqual(["battlefield-bf1"]);
    await game.p1.play("rengar", { to: "bf1" });
    expect(game.locationOf("rengar")).toBe("bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("cleave")).toBe("trash");
  });

  test("from the Champion Zone the same line-2 permission applies — playChampion may target the Guard's bf1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { body: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
      .champion(P1, CARD, "rengar")
      .build();
    expect(game.p1.can("playChampion")).toBe(true);
    const r = await game.p1.try((p) => p.playChampion("bf1"));
    expect(r.ok).toBe(true);
    expect(game.locationOf("rengar")).toBe("bf1");
  });
});
