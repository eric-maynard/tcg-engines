/**
 * Ripper's Bay — unl-214-219 · Battlefield · no domain · no cost
 *
 *   When a unit here is returned to a player's hand, that player may pay [1] to channel 1 rune exhausted.
 *
 * Rules: 190.6.c (a battlefield ability that names a specific player — "THAT PLAYER may" — is
 * controlled by that player, whoever controls the battlefield: they put it on the chain, they choose,
 * they pay), 383.3.a ("may" as the first part of the effect → decided during finalization; declining
 * removes the item), 355.10.c.1 ("pay [1] to …" is a cost inside the instruction), 430.2 ("channel 1
 * rune exhausted" — top rune of THAT player's rune deck enters exhausted), 108/124 (a card returns
 * to its OWNER's hand — so "that player" is the unit's owner, not necessarily its controller), 446.2
 * (returning to hand is a zone change, not a Move), 186.1 (a token "returned to hand" ceases to exist).
 *
 * Head-judge notes — the tricky situations for THIS card:
 *  1. Whose trigger: P1 Rebukes P2's unit off the Bay → it is P2 (the hand's owner) who is asked, who
 *     pays [1] and who channels; the caster and the Bay's controller get nothing.
 *  2. The [1] is real: with 0 energy that player cannot accept; declining costs nothing.
 *  3. Partner — Retreat ("Return a friendly unit to its owner's hand. Its owner channels 1 rune
 *     exhausted") on your own unit at the Bay: 1 exhausted rune from Retreat + 1 more from the Bay
 *     for [1] = two exhausted runes.
 *  4. "here" only: a unit bounced from base or from another battlefield never asks anyone anything.
 *  5. Owner ≠ controller: a P2-owned unit under P1's control at the Bay goes back to P2's hand, so P2
 *     is "that player".
 *  6. Zone change ≠ move: the Bay does not care about units MOVING home (Standard Move to base).
 *
 * Engine note: bounces leave the board through the `leave-board (cause: bounce)` event; nothing emits
 * the parsed `return-to-hand` trigger event, and the parsed trigger carries no `location: "here"` —
 * every positive clause below is a BUG test.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-214-219";
const REBUKE = "ogn-172-298"; // [Action] · 2 + chaos chaos · Return a unit at a battlefield to its owner's hand.
const RETREAT = "ogn-104-298"; // [Reaction] · 1 · Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted.

const bayItems = (game: Game) => game.chain().filter((i) => i.cardId === "bay" && i.triggered);

/** Pass priority for whoever holds it until a non-action prompt or the open main phase appears. */
async function passUntilPrompt(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main") {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

/** P1's turn: Rebuke in hand (2 + chaos chaos paid up); P2's Squatter sits on the Bay; P2 has `p2Energy`. */
function rebukeBoard(p2Energy = 2) {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 2 } })
    .resources(P2, { energy: p2Energy })
    .battlefield("bay", { controller: P2, def: CARD, inert: false, owner: P1 })
    .unit(P2, "bay", { might: 3, name: "Squatter" }, "squatter")
    .hand(P1, REBUKE, "rebuke");
}

describe("Ripper's Bay (unl-214-219)", () => {
  test("registry payload (shape): an OPTIONAL return-to-hand trigger with a pay-[1] cost whose effect channels 1 rune EXHAUSTED", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Ripper's Bay" });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      condition: { cost: { energy: 1 }, type: "pay-cost" },
      effect: { amount: 1, exhausted: true, type: "channel" },
      optional: true,
      trigger: { event: "return-to-hand" },
      type: "triggered",
    });
  });

  // BUG (parse) — expected: the trigger is scoped to units HERE (like every other "…here" battlefield
  // trigger, e.g. `{ event, location: "here", … }`). Actual: `{ event: "return-to-hand", on: "any" }`
  // with no location at all, so — once the event exists — a bounce anywhere would fire it.
  test("parsed trigger drops 'here' — it must carry a location restriction to this battlefield", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def?.abilities?.[0]).toMatchObject({ trigger: { location: "here" } });
  });

  // BUG — expected (190.6.c / 383.3.a): after Rebuke resolves the Squatter is in P2's hand, a "Ripper's
  // Bay" item is pending and P2 — "that player" — is asked to pay [1]; accepting deducts 1 from P2 and,
  // on resolution, P2 has one more rune and it is EXHAUSTED (430.2). P1 (caster, card owner) pays and
  // channels nothing. Actual: Rebuke resolves and the game returns to P1's open main phase; no trigger.
  test("Rebuke on the enemy unit here → its owner (P2) may pay [1] and channels 1 rune exhausted; the caster gets nothing", async () => {
    const game = await rebukeBoard(2).build();
    await game.p1.cast("rebuke", { targets: "squatter" });
    await passUntilPrompt(game);
    expect(game.zoneOf("squatter")).toBe("hand");
    expect(game.p2.hand()).toContain("squatter");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    expect(bayItems(game)).toEqual([expect.objectContaining({ controller: P2, name: "Ripper's Bay" })]);
    await game.p2.yes();
    await game.settle();
    expect(game.p2.energy()).toBe(1);
    expect(game.p2.runes()).toHaveLength(1);
    expect(game.p2.runes({ ready: false })).toHaveLength(1);
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } }); // only Rebuke's own cost
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // BUG — expected: the same prompt appears and P2 declines → no energy spent, no rune. Actual: no prompt
  // is ever raised (the decline outcome happens to coincide, but the clause is untestable without it).
  test("declining the Bay's offer costs that player nothing and channels nothing (383.3.a)", async () => {
    const game = await rebukeBoard(2).build();
    await game.p1.cast("rebuke", { targets: "squatter" });
    await passUntilPrompt(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.no();
    await game.settle();
    expect(game.p2.energy()).toBe(2);
    expect(game.p2.runes()).toHaveLength(0);
    expect(game.chain()).toEqual([]);
  });

  test("the [1] is a real cost: a player with 0 energy whose unit is bounced off the Bay ends with no rune and no debt", async () => {
    const game = await rebukeBoard(0).build();
    await game.p1.cast("rebuke", { targets: "squatter" });
    await passUntilPrompt(game);
    const d = game.decision();
    if (d?.kind === "yes-no") {
      expect(d.seat).toBe(P2);
      expect((await game.p2.try((p) => p.yes())).ok).toBe(false);
      await game.p2.no();
    }
    await game.settle();
    expect(game.zoneOf("squatter")).toBe("hand");
    expect(game.p2.energy()).toBe(0);
    expect(game.p2.runes()).toHaveLength(0);
  });

  // BUG — expected: Retreat returns Mine to P1's hand and P1 channels 1 exhausted (Retreat's own text);
  // the Bay then offers P1 one more for [1] → P1 ends on 2 runes, both exhausted, with 3 − 1 − 1 = 1
  // energy. Actual: only Retreat's rune arrives (1 exhausted rune, 2 energy left).
  test("partner Retreat on your own unit here — Retreat's exhausted rune PLUS the Bay's paid one = two exhausted runes", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bay", { controller: P1, def: CARD, inert: false, owner: P2 })
      .unit(P1, "bay", { might: 3, name: "Mine" }, "mine")
      .hand(P1, RETREAT, "retreat")
      .build();
    await game.p1.cast("retreat", { targets: "mine" });
    await passUntilPrompt(game);
    expect(game.zoneOf("mine")).toBe("hand");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runes({ ready: false })).toHaveLength(2);
  });

  test("control for the partner line: Retreat alone (unit here, Bay inert) gives exactly ONE exhausted rune and costs only Retreat's [1]", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bay", { controller: P1, def: CARD, inert: true })
      .unit(P1, "bay", { might: 3, name: "Mine" }, "mine")
      .hand(P1, RETREAT, "retreat")
      .build();
    await game.p1.cast("retreat", { targets: "mine" });
    await game.settle();
    expect(game.zoneOf("mine")).toBe("hand");
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.state(game.p1.runes()[0] as string).isExhausted).toBe(true);
  });

  test("'here' only — a friendly unit Retreated from BASE while the Bay is live: nobody is asked, just Retreat's single rune", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bay", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "bay", { might: 3, name: "Anchor" }, "anchor")
      .unit(P1, "base", { might: 2, name: "Homebody" }, "homebody")
      .hand(P1, RETREAT, "retreat")
      .script(P1, [], { strict: true })
      .script(P2, [], { strict: true })
      .build();
    await game.p1.cast("retreat", { targets: "homebody" });
    await game.settle();
    expect(game.zoneOf("homebody")).toBe("hand");
    expect(bayItems(game)).toEqual([]);
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.energy()).toBe(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("'here' only — Rebuke on an enemy unit at a DIFFERENT battlefield: it goes home to hand and its owner is offered nothing", async () => {
    const game = await rebukeBoard(2)
      .battlefield("plain", { controller: P2 })
      .unit(P2, "plain", { might: 2, name: "Elsewhere" }, "elsewhere")
      .script(P2, [], { strict: true })
      .build();
    await game.p1.cast("rebuke", { targets: "elsewhere" });
    await game.settle();
    expect(game.zoneOf("elsewhere")).toBe("hand");
    expect(game.locationOf("squatter")).toBe("bay");
    expect(bayItems(game)).toEqual([]);
    expect(game.p2.energy()).toBe(2);
    expect(game.p2.runes()).toHaveLength(0);
  });

  // BUG — expected (108 / 190.6.c): the unit returns to its OWNER's hand, so the owner (P2) is "that
  // player" even though P1 controlled the unit and controls the Bay: P2 is asked, pays, channels.
  // Actual: no trigger at all.
  test("owner ≠ controller — a P2-owned unit under P1's control bounced from the Bay makes P2 'that player'", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 2 } })
      .resources(P2, { energy: 1 })
      .battlefield("bay", { controller: P1, def: CARD, inert: false, owner: P1 })
      .card("borrowed", { controller: P1, def: { cardType: "unit", might: 2, name: "Borrowed" }, owner: P2, zone: "bay" })
      .hand(P1, REBUKE, "rebuke")
      .build();
    expect(game.state("borrowed")).toMatchObject({ controller: P1, owner: P2, zone: "battlefield-bay" });
    await game.p1.cast("rebuke", { targets: "borrowed" });
    await passUntilPrompt(game);
    expect(game.p2.hand()).toContain("borrowed");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.yes();
    await game.settle();
    expect(game.p2.energy()).toBe(0);
    expect(game.p2.runes({ ready: false })).toHaveLength(1);
    expect(game.p1.runes()).toHaveLength(0);
  });

  test("zone change ≠ Move (446.2): a unit taking the Standard Move from the Bay back to base triggers nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bay", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "bay", { might: 3, name: "Walker" }, "walker")
      .script(P1, [], { strict: true })
      .build();
    await game.p1.move("walker", "base");
    await game.settle();
    expect(game.locationOf("walker")).toBe("base");
    expect(bayItems(game)).toEqual([]);
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.p1.energy()).toBe(2);
  });

  test("a unit KILLED here is not 'returned to hand' either: combat death at the Bay offers nothing to anyone", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .resources(P2, { energy: 2 })
      .battlefield("bay", { controller: P2, def: CARD, inert: false, owner: P2 })
      .unit(P2, "bay", { might: 2, name: "Guard" }, "guard")
      .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
      .script(P1, [], { strict: true })
      .script(P2, [], { strict: true })
      .build();
    await game.p1.move("raider", "bay");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(bayItems(game)).toEqual([]);
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.p2.runes()).toHaveLength(0);
    expect(game.p2.energy()).toBe(2);
  });
});
