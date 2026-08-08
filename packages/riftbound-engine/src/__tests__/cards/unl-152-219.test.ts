/**
 * Black Rose Dignitary — unl-152-219 · Unit · Order · 3 energy (no power) · 2 Might
 *
 *   [Assault] (+1 [Might] while I'm an attacker.)
 *   [Deathknell][>] Channel 1 rune exhausted. (When I die, get the effect.)
 *
 * Rules: 807 (Assault X, X omitted = 1: +1 Might only WHILE holding the Attacker designation —
 * nothing on defense, nothing at rest), 808 (Deathknell = "When I die, [Effect]"; the trigger is the
 * permanent being killed AND sent to the trash — 808.1.d; a death that is REPLACED (Tactical Retreat's
 * heal/exhaust/recall "instead") removes the trigger — 808.1.d.1; each Deathknell instance triggers once
 * — 808.2), 428.1.a.1.b (dying to pay a COST is still dying), Channel ("channel 1 rune exhausted": the
 * top rune of the rune deck enters the pool exhausted; with an empty rune deck nothing happens),
 * 465.2.c.3 (combat damage assignment: lethal in full to one unit before the next).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. EXACTLY ONE rune per death: the registry lists Deathknell both as a keyword-with-effect and as an
 *     explicit die-trigger — the engine must not channel twice.
 *  2. Assault is attacker-only: 3 Might trading into a 3-Might defender, but a plain 2 when a 3-Might
 *     raider comes for it (the raider survives). At rest in base it reads 2.
 *  3. The channeled rune is EXHAUSTED: rune count +1, READY runes +0, rune deck −1; it cannot be tapped
 *     the turn it arrives.
 *  4. Death by any route counts — combat, an Order kill spell (Soul Harvest), being sacrificed to Cruel
 *     Patron — and it works on the opponent's turn too. Two Dignitaries dying in one combat → two runes.
 *  5. NOT a death: Tactical Retreat replacing the combat death (healed, exhausted, in base) → no rune.
 *  6. Empty rune deck: the Deathknell resolves harmlessly — no rune, no crash, no invariant violation.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-152-219";
const SOUL_HARVEST = "unl-159-219"; // Order Action 2+[order]: Kill a unit at a battlefield with 3 Might or less.
const TACTICAL_RETREAT = "unl-175-219"; // Order Reaction 2: friendly unit — next time it would die this turn, heal/exhaust/recall instead.
const CRUEL_PATRON = "ogn-208-298"; // Order 4: As an additional cost to play me, kill a friendly unit.

/** P1 attacks P2's bf1 (one defender of `foeMight`) with a ready Dignitary from base. */
function attackInto(foeMight: number) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: foeMight, name: "Foe" }, "foe")
    .unit(P1, "base", CARD, "brd");
}

describe("Black Rose Dignitary (unl-152-219)", () => {
  test("registry payload: Assault 1 + Deathknell whose effect is channel 1 exhausted (keyword and its die-trigger); 3-cost order unit, 2 Might, no power", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 3, might: 2, name: "Black Rose Dignitary" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      { keyword: "Assault", type: "keyword", value: 1 },
      { effect: { amount: 1, exhausted: true, type: "channel" }, keyword: "Deathknell", type: "keyword" },
      { effect: { amount: 1, exhausted: true, type: "channel" }, trigger: { event: "die", on: "self" }, type: "triggered" },
    ]);
  });

  test("cost: 3 energy, no power; enters the base exhausted as a 2-Might unit (Assault is dormant at rest) carrying both keywords; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "brd").build();
    await game.p1.play("brd");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("brd")).toMatchObject({ baseMight: 2, isExhausted: true, might: 2, zone: "base" });
    expect(game.state("brd").keywords).toEqual(expect.arrayContaining(["Assault", "Deathknell"]));
    expect(game.chain()).toEqual([]);
    expect((await scenario().resources(P1, { energy: 2, power: { order: 2 } }).hand(P1, CARD, "b").build()).p1.can("play", "b")).toBe(false);
  });

  test("Assault on offence: into a 3-Might defender the Dignitary fights at 3 → both die; its Deathknell then channels EXACTLY ONE rune, exhausted (pool 0 → 1, ready 0, rune deck 12 → 11)", async () => {
    const game = await attackInto(3).build();
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.p1.runeDeck()).toHaveLength(12);
    await game.p1.move("brd", "bf1");
    expect(game.state("brd").might).toBe(3); // attacker designation is on during the combat showdown
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash"); // took 3 — only possible with Assault
    expect(game.zoneOf("brd")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.p1.runeDeck()).toHaveLength(11);
    expect(game.p1.energy()).toBe(0); // channeling is not energy
    expect(game.gameState.battlefields.bf1?.controller ?? null).not.toBe(P1); // nobody left to conquer
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("Assault wins fights a vanilla 2 would lose: into a 2-Might defender the 3-Might Dignitary kills it, survives the 2 damage and conquers — no death, no rune", async () => {
    const game = await attackInto(2).build();
    await game.p1.move("brd", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("brd")).toBe("bf1");
    expect(game.state("brd")).toMatchObject({ damage: 0, might: 2 }); // designation gone after combat → back to 2
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.runes()).toHaveLength(0);
  });

  test("Assault is attacker-ONLY: defending against a 3-Might raider the Dignitary is a plain 2 — it dies, the raider survives and conquers; the Deathknell still channels for P1 on P2's turn", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "brd")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("brd").might).toBe(2);
    await game.settle();
    expect(game.zoneOf("brd")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bf1"); // took only 2 < 3
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.p2.runes()).toHaveLength(0); // MY Deathknell, my rune
  });

  test("the channeled rune is exhausted NOW but is an ordinary rune later: it cannot be tapped this turn, and after the turn cycle P1 has it ready plus the 2 newly channeled", async () => {
    const game = await attackInto(3).build();
    await game.p1.move("brd", "bf1");
    await game.settle();
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.can("tapRune")).toBe(false);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1: awaken readies, channel 2 more
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.p1.runes({ ready: true })).toHaveLength(3);
  });

  test("killed by a spell (my own Soul Harvest on my 2-Might Dignitary at a battlefield): dies → channel 1 exhausted", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "brd")
      .hand(P1, SOUL_HARVEST, "harvest")
      .build();
    await game.p1.cast("harvest", { targets: "brd" });
    await game.settle();
    expect(game.zoneOf("brd")).toBe("trash");
    expect(game.zoneOf("harvest")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.p1.runeDeck()).toHaveLength(11);
  });

  test("dying to pay a COST is dying (428.1.a.1.b): sacrificing the Dignitary to Cruel Patron channels 1 exhausted and the Patron lands", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).unit(P1, "base", CARD, "brd").hand(P1, CRUEL_PATRON, "patron").build();
    await game.p1.play("patron", { sacrifice: "brd" });
    await game.settle();
    expect(game.zoneOf("brd")).toBe("trash");
    expect(game.zoneOf("patron")).toBe("base");
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
  });

  test("two Dignitaries die in ONE combat (3+3 into a 6: the 6 dies, its 6 damage is 3 lethal + 3 lethal) → two Deathknells → two exhausted runes; bf1 ends up empty and unconquered", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
      .unit(P1, "base", CARD, "brd")
      .unit(P1, "base", CARD, "brd2")
      .build();
    await game.p1.move(["brd", "brd2"], "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("brd")).toBe("trash");
    expect(game.zoneOf("brd2")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.p1.runeDeck()).toHaveLength(10);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
  });

  test("808.1.d.1 — NOT a death: Tactical Retreat cast with Focus before the 2-vs-5 combat replaces the Dignitary's death (healed, exhausted, back in base) → no rune is channeled", async () => {
    const game = await attackInto(5).resources(P1, { energy: 2 }).hand(P1, TACTICAL_RETREAT, "retreat").build();
    await game.p1.move("brd", "bf1");
    expect(game.actingSeat()).toBe(P1); // attacker holds Focus
    await game.p1.cast("retreat", { targets: "brd" });
    await game.settle();
    expect(game.zoneOf("retreat")).toBe("trash");
    expect(game.zoneOf("brd")).toBe("base");
    expect(game.state("brd")).toMatchObject({ damage: 0, isExhausted: true, might: 2 });
    expect(game.p1.trash()).toEqual(["retreat"]);
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.p1.runeDeck()).toHaveLength(12);
    expect(game.locationOf("foe")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("empty rune deck: the Dignitary dies, the Deathknell resolves with nothing to channel — no rune, no crash, no violations", async () => {
    const game = await attackInto(3).fillDecks({ main: 10, runes: 0 }).build();
    expect(game.p1.runeDeck()).toHaveLength(0);
    await game.p1.move("brd", "bf1");
    await game.settle();
    expect(game.zoneOf("brd")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
