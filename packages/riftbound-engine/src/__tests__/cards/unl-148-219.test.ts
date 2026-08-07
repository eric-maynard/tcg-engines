/**
 * Cursed Sarcophagus — unl-148-219 · Gear · Chaos · 4 energy + [chaos]
 *
 *   When you play this, banish all units from your trash.
 *   [Exhaust]: Play a unit banished with this. (You must pay its costs.)
 *
 * Rules: 149.1 / 359.2.d (gear enters the base READY), 383 (the play trigger goes on the chain
 * and resolves once), 395–397 (Linked abilities: "banished with this" = only objects the linked
 * trigger banished — not units already in banishment, not units banished by anything else),
 * 377 (activated ability: pay [Exhaust], put it on the chain; no [Reaction] → own turn, open
 * state only), 349/356 ("play a unit … pay its costs" is a full play: cost paid, unit enters the
 * base exhausted per 143.4), 318 (exhausted permanents ready in their controller's Awaken step).
 *
 * Head-judge checklist (trickiest situations for THIS card):
 *  1. Scope of the trigger: ALL units, but only from YOUR trash — spells/gear in your trash and
 *     every card in the opponent's trash stay put; an empty trash is a harmless no-op.
 *  2. One-shot: a unit that dies AFTER the Sarcophagus resolved goes to the trash as usual and is
 *     never "banished with this" (so it can't be replayed by it either).
 *  3. Linkage (397): a unit that was already in banishment before the trigger is not offered by
 *     the [Exhaust] ability; only t1/t2 banished by THIS trigger are.
 *  4. "You must pay its costs": the replayed unit's energy is deducted; a unit you cannot afford
 *     is not a legal pick; the unit enters the base exhausted like any played unit.
 *  5. [Exhaust] economics: gear enters ready so it can be used the turn it lands; once exhausted it
 *     cannot be activated again until your next Awaken; never on the opponent's turn.
 *  6. Cost: 4 + [chaos]; 3 energy + chaos is not enough.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-148-219";
const SKULKER = "ogn-175-298"; // Shipyard Skulker — Chaos unit, 3 energy, 3 Might, no text
const HEXTECH_RAY = "ogn-009-298"; // a spell to leave lying in the trash
const BIGGIE = { cardType: "unit", domain: "chaos", energyCost: 7, might: 7, name: "Biggie" } as const;

function stocked(energy = 10) {
  return scenario()
    .resources(P1, { energy, power: { chaos: 3 } })
    .trash(P1, SKULKER, "t1")
    .trash(P1, BIGGIE, "t2")
    .trash(P1, HEXTECH_RAY, "tSpell")
    .trash(P2, SKULKER, "theirDead")
    .banishment(P1, SKULKER, "already")
    .hand(P1, CARD, "sarc");
}

/** Play the Sarcophagus and let its trigger resolve. */
async function playAndResolve(game: Game) {
  await game.p1.play("sarc");
  await game.settle();
}

/** Activate [Exhaust] and walk the chain until a P1 pick appears (or the ability is gone). */
async function activateUntilPick(game: Game) {
  await game.p1.activate("sarc");
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (!d || d.kind === "pick" || (d.kind === "action" && d.context === "main")) {
      break;
    }
    await game.acting().pass();
  }
  return game.decision();
}

describe("Cursed Sarcophagus (unl-148-219)", () => {
  test("cost: 4 energy + 1 chaos; the gear enters the base READY (149.1) with its play trigger on the chain; 3 energy is not enough", async () => {
    const game = await stocked(4).build();
    await game.p1.play("sarc");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 2 } });
    expect(game.zoneOf("sarc")).toBe("base");
    expect(game.state("sarc").isReady).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sarc", controller: P1, triggered: true })]);
    const poor = await stocked(3).build();
    expect(poor.p1.can("play", "sarc")).toBe(false);
    const noChaos = await scenario().resources(P1, { energy: 9 }).hand(P1, CARD, "sarc").build();
    expect(noChaos.p1.can("play", "sarc")).toBe(false);
  });

  test("'banish all units from YOUR trash': both of my dead units go to banishment; my trashed spell and the opponent's dead unit stay in the trash", async () => {
    const game = await stocked().build();
    await playAndResolve(game);
    expect(game.zoneOf("t1")).toBe("banishment");
    expect(game.zoneOf("t2")).toBe("banishment");
    expect(game.zoneOf("tSpell")).toBe("trash");
    expect(game.zoneOf("theirDead")).toBe("trash");
    expect(game.p1.trash()).toEqual(["tSpell"]);
    expect(game.p1.banishment().sort()).toEqual(["already", "t1", "t2"]);
    expect(game.violations()).toEqual([]);
  });

  test("empty trash: the Sarcophagus still resolves onto the board and nothing is banished", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { chaos: 1 } }).trash(P2, SKULKER, "theirDead").hand(P1, CARD, "sarc").build();
    await playAndResolve(game);
    expect(game.zoneOf("sarc")).toBe("base");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.zoneOf("theirDead")).toBe("trash");
    expect(game.decision()?.kind).toBe("action");
  });

  test("one-shot trigger: a unit of mine that dies AFTER the Sarcophagus resolved goes to the trash, not to banishment", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 1, name: "Doomed" }, "doomed")
      .hand(P1, CARD, "sarc")
      .build();
    await playAndResolve(game);
    await game.p1.move("doomed", "bf1");
    await game.settle();
    expect(game.zoneOf("doomed")).toBe("trash");
    expect(game.p1.banishment()).toEqual([]);
  });

  test("[Exhaust]: usable the turn it lands (gear enters ready) — activating exhausts it and puts an activated ability on the chain; it cannot be activated again while exhausted", async () => {
    const game = await stocked().build();
    await playAndResolve(game);
    expect(game.p1.can("activate", "sarc")).toBe(true);
    await game.p1.activate("sarc");
    expect(game.state("sarc").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sarc", controller: P1, triggered: false })]);
    await game.settle({ policy: "first" });
    expect(game.state("sarc").isExhausted).toBe(true);
    expect(game.p1.can("activate", "sarc")).toBe(false);
  });

  test("no [Reaction]/[Action]: not activatable on the opponent's turn; readies again in my Awaken step and is offered on my turn", async () => {
    const game = await scenario().active(P2).gear(P1, CARD, "sarc", { exhausted: true }).build();
    expect(game.p1.can("activate", "sarc")).toBe(false);
    await game.advanceTurn(); // → P1's turn: Awaken readies it
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("sarc").isReady).toBe(true);
    expect(game.p1.can("activate", "sarc")).toBe(true);
    await game.advanceTurn(); // → P2's turn, gear ready but not my turn
    expect(game.state("sarc").isReady).toBe(true);
    expect(game.p1.can("activate", "sarc")).toBe(false);
  });

  test("[Exhaust] resolves into a choice among only the units banished WITH THIS — the unit that was already in banishment is never offered (397)", async () => {
    // rule 397: `already` was in banishment before the trigger, so it is not linked to this card.
    // Of the two linked units only `t1` is offered: with 6 energy left the 7-cost Biggie is not
    // payable and "you must pay its costs" filters it out (see the 3-energy case below).
    const game = await stocked().build();
    await playAndResolve(game);
    const d = await activateUntilPick(game);
    expect(d?.kind).toBe("pick");
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["t1"]);
    expect(offered).not.toContain("already");
  });

  test("playing the chosen unit — Shipyard Skulker's 3 energy is paid ('you must pay its costs'), it leaves banishment and enters my base exhausted (143.4)", async () => {
    // Expected: energy 6 → 3, t1 in base, exhausted, 3 Might; t2 still banished. Actual: no-op.
    const game = await stocked().build();
    await playAndResolve(game);
    expect(game.p1.energy()).toBe(6);
    await activateUntilPick(game);
    await game.p1.pick("t1");
    await game.settle();
    expect(game.zoneOf("t1")).toBe("base");
    expect(game.state("t1")).toMatchObject({ isExhausted: true, might: 3 });
    expect(game.p1.energy()).toBe(3);
    expect(game.zoneOf("t2")).toBe("banishment");
    expect(game.p1.units("base")).toContain("t1");
  });

  test("'you must pay its costs' — with only 3 energy left the 7-cost Biggie is not a legal pick, the 3-cost Skulker is", async () => {
    // Expected: after paying 4 for the gear (7 → 3), the pick offers t1 only. Actual: no pick.
    const game = await stocked(7).build();
    await playAndResolve(game);
    expect(game.p1.energy()).toBe(3);
    const d = await activateUntilPick(game);
    expect(d?.kind).toBe("pick");
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toEqual(["t1"]);
  });

  test("registry payload: a play-self trigger banishing ALL units from the trash, plus an [Exhaust]-cost activated ability", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "gear", domain: "chaos", energyCost: 4, powerCost: ["chaos"] });
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { target: { location: "trash", quantity: "all", type: "unit" }, type: "banish" },
      trigger: { event: "play-self" },
      type: "triggered",
    });
    expect(def?.abilities?.[1]).toMatchObject({ cost: { exhaust: true }, type: "activated" });
  });

  test("the activated ability's effect should be a structured 'play a unit from banishment (banished with this), paying its costs' — not raw text", async () => {
    // Expected: effect { type: "play", from: "banishment", target: unit linked to this, payCost: true }
    // (or equivalent). Actual: { type: "raw", text: "Play a unit banished with this." }.
    const def = (await loadDefaultCardPool()).get(CARD);
    const activated = def?.abilities?.[1] as { effect?: { type?: string } } | undefined;
    expect(activated?.effect?.type).not.toBe("raw");
    const json = JSON.stringify(activated?.effect);
    expect(json).toContain('"play"');
    expect(json).toContain("banish");
  });
});
