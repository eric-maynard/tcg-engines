/**
 * Rek'Sai, Swarm Queen — sfd-170-221 · Champion Unit (Rek'Sai) · Order · 5 energy + [order] · 5 Might
 *
 *   When I attack, you may reveal the top 2 cards of your Main Deck. You may banish one, then play
 *   it. If it is a unit, you may play it here. Recycle the rest.
 *
 * Head-judge notes — the tricky spots for this card:
 *  1. "When I attack" (383.4.e) fires only when a COMBAT opens with Rek'Sai as attacker: walking onto an
 *     empty enemy battlefield (a plain conquer) or DEFENDING never triggers it. The trigger lands on
 *     the combat chain before anyone acts in the showdown and before any damage.
 *  2. Two nested "you may": decline the reveal (deck untouched) vs reveal-then-decline (both revealed
 *     cards recycled to the bottom, nothing banished, 3rd card now on top). Exactly 2 are revealed.
 *  3. "banish one, then play it" is a full-price play (no discount): a 3-cost unit charges 3; with no
 *     energy it cannot end up on the board for free. Any card type may be the pick — a revealed spell
 *     (Incinerate) is cast, needs its target, resolves into the trash (not banishment).
 *  4. "If it is a unit, you may play it HERE" (355.2.b): the contested battlefield must be a legal
 *     destination; arriving mid-combat it becomes an attacker (464.2.c.3.a) and adds its Might —
 *     Rek'Sai 5 + Skulker 3 beats a 7-Might wall that Rek'Sai alone loses to. Base is the other option;
 *     either way it enters exhausted and the unpicked card is recycled.
 */

import { describe, expect, test } from "bun:test";
import type { Decision, Game, PickDecision } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-170-221";
const SKULKER = "ogn-175-298"; // vanilla 3-cost, 3-Might unit
const INCINERATE = "ogs-003-024"; // [Action] 2: deal 2 to a unit at a battlefield

function board(energy = 10, wall = 7) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: wall, name: "Wall" }, "wall")
    .unit(P1, "base", CARD, "reksai")
    .deck(P1, [SKULKER, INCINERATE, SKULKER], ["top", "spell", "third"]);
}

const isRevealPick = (d: Decision | null): d is PickDecision => d?.kind === "pick" && d.options.some((o) => o.key === "top" || o.key === "spell");

/** Attack bf1 with Rek'Sai, answer the "you may reveal", pass priority; returns the reveal-and-pick prompt if one appears. */
async function attack(game: Game, reveal: boolean): Promise<PickDecision | undefined> {
  await game.p1.move("reksai", "bf1");
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || isRevealPick(d)) {
      return d ?? undefined;
    }
    if (d.kind === "yes-no") {
      await game.seat(d.seat).answer(reveal && d.canAccept !== false);
    } else if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      return undefined;
    }
  }
  return undefined;
}

/** After picking a card to play: pass priority / answer prompts with `answers` until the showdown (or main phase) is reached; returns every pick seen. */
async function finishPlay(game: Game, answers: string[]): Promise<PickDecision[]> {
  const seen: PickDecision[] = [];
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context !== "chain")) {
      break;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "pick") {
      seen.push(d);
      const want = answers.find((a) => d.options.some((o) => o.key === a)) ?? d.options[0]!.key;
      await game.seat(d.seat).pick(want);
    } else if (d.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else {
      break;
    }
  }
  return seen;
}

describe("Rek'Sai, Swarm Queen (sfd-170-221)", () => {
  test("registry payload: 5-cost [order] 5-Might Rek'Sai champion; one optional self-ATTACK trigger that reveals 2 from the deck with an optional pick that is PLAYED (rest recycled)", async () => {
    const game = await scenario().hand(P1, CARD, "reksai").build();
    expect(game.state("reksai")).toMatchObject({ baseMight: 5, cardType: "unit", energyCost: 5, name: "Rek'Sai, Swarm Queen" });
    expect(game.state("reksai").powerCost).toEqual(["order"]);
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ isChampion: true, tags: ["Rek'Sai"] });
    expect(def?.abilities).toEqual([
      {
        effect: { amount: 2, from: "deck", onPicked: "play", optional: true, type: "look" },
        optional: true,
        trigger: { event: "attack", on: "self" },
        type: "triggered",
      },
    ]);
  });

  test("cost: 5 energy + [order]; enters the base exhausted with 5 Might; unaffordable without the order pip or at 4 energy", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { order: 1 } }).hand(P1, CARD, "reksai").build();
    await game.p1.play("reksai");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.state("reksai")).toMatchObject({ isExhausted: true, might: 5, zone: "base" });
    expect(game.chain()).toEqual([]); // playing her is not attacking
    expect((await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "r").build()).p1.can("play", "r")).toBe(false);
    expect((await scenario().resources(P1, { energy: 4, power: { order: 2 } }).hand(P1, CARD, "r").build()).p1.can("play", "r")).toBe(false);
  });

  test("attacking a defended battlefield: the trigger is on the combat chain before any damage; accepting reveals exactly the top 2 (declinable pick), never the 3rd", async () => {
    const game = await board().build();
    const pick = await attack(game, true);
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.state("wall").damage).toBe(0);
    expect(pick).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(pick!.options.map((o) => o.key).sort()).toEqual(["spell", "top"]);
  });

  test("pick the unit → it is PLAYED at full price (3 energy), enters exhausted; choosing base puts it there; the other revealed card goes to the BOTTOM, the 3rd is now on top; nothing stays banished", async () => {
    const game = await board().build();
    await attack(game, true);
    await game.p1.pick("top");
    await finishPlay(game, ["base"]);
    expect(game.p1.energy()).toBe(7); // rule 355.2 → 357: paid once the location is chosen
    expect(game.zoneOf("top")).toBe("base");
    expect(game.state("top").isExhausted).toBe(true);
    expect(game.p1.deck()[0]).toBe("third");
    expect(game.p1.deck().at(-1)).toBe("spell");
    expect(game.p1.banishment()).toEqual([]);
    // Combat then resolves without the Skulker: Rek'Sai 5 into a 7 wall dies, the wall holds.
    await game.settle();
    expect(game.zoneOf("reksai")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("'If it is a unit, you may play it HERE' — the contested battlefield must be offered; played there the Skulker attacks too: 5 + 3 kill the 7-Might wall and P1 conquers", async () => {
    // Expected (355.2.b, 464.2.c.3.a): destination options include battlefield-bf1; Skulker fights.
    // Actual: only "base" is offered, so Rek'Sai attacks alone and dies.
    const game = await board().build();
    await attack(game, true);
    await game.p1.pick("top");
    const picks = await finishPlay(game, ["battlefield-bf1"]);
    const dest = picks.find((p) => p.options.some((o) => o.key === "base"));
    expect(dest?.options.map((o) => o.key)).toContain("battlefield-bf1");
    expect(game.zoneOf("top")).toBe("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.locationOf("top")).toBe("bf1");
  });

  test("first 'you may': declining the reveal leaves the deck exactly as it was and combat just happens", async () => {
    const game = await board().build();
    const pick = await attack(game, false);
    expect(pick).toBeUndefined();
    await game.settle();
    expect(game.p1.deck().slice(0, 3)).toEqual(["top", "spell", "third"]);
    expect(game.p1.energy()).toBe(10);
    expect(game.zoneOf("reksai")).toBe("trash"); // 5 into 7
  });

  test("second 'you may': reveal but decline to play → BOTH revealed cards are recycled to the bottom, the 3rd card is on top, nothing is banished or paid", async () => {
    const game = await board().build();
    const pick = await attack(game, true);
    expect(pick).toBeDefined();
    await game.p1.decline();
    await game.settle();
    const deck = game.p1.deck();
    expect(deck[0]).toBe("third");
    expect(deck.slice(-2).sort()).toEqual(["spell", "top"]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.base()).not.toContain("top");
    expect(game.p1.energy()).toBe(10);
  });

  test("'banish one, then play it' covers non-units: the revealed Incinerate is cast (2 energy) at the wall, resolves into the TRASH, and the softened wall (2 dmg) then trades with Rek'Sai", async () => {
    const game = await board().build();
    await attack(game, true);
    await game.p1.pick("spell");
    expect(game.p1.energy()).toBe(8);
    await finishPlay(game, ["wall"]);
    expect(game.state("wall").damage).toBe(2);
    expect(game.zoneOf("spell")).toBe("trash");
    expect(game.p1.deck().at(-1)).toBe("top"); // the unpicked unit was recycled
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash"); // 2 + 5 ≥ 7
    expect(game.zoneOf("reksai")).toBe("trash"); // and 7 ≥ 5 back
  });

  test("no discount: with 0 energy the 3-cost Skulker can never end up on the board for free (419.2.a)", async () => {
    const game = await board(0).build();
    const pick = await attack(game, true);
    if (pick?.options.some((o) => o.key === "top")) {
      await game.p1.try((p) => p.pick("top"));
      await game.p1.try(() => finishPlay(game, ["base"]));
    }
    await game.settle();
    expect(game.zoneOf("top")).not.toBe("base");
    expect(game.zoneOf("top")).not.toBe("battlefield-bf1");
    expect(game.p1.energy()).toBe(0);
  });

  test("negative space: moving onto an EMPTY enemy battlefield is a conquer, not an attack — no prompt, deck untouched, P1 takes bf1", async () => {
    const game = await scenario().resources(P1, { energy: 10 }).battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "reksai").deck(P1, [SKULKER, INCINERATE], ["top", "spell"]).build();
    await game.p1.move("reksai", "bf1");
    expect(game.chain().some((c) => c.cardId === "reksai")).toBe(false);
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.deck().slice(0, 2)).toEqual(["top", "spell"]);
  });

  test("negative space: DEFENDING is not attacking — when P2 attacks Rek'Sai's battlefield nothing of hers triggers", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 10 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "reksai")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .deck(P1, [SKULKER, INCINERATE], ["top", "spell"])
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.chain().some((c) => c.cardId === "reksai")).toBe(false);
    expect(game.decision()?.kind).not.toBe("yes-no");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("reksai")).toBe("bf1");
    expect(game.p1.deck().slice(0, 2)).toEqual(["top", "spell"]);
  });

  test("edge: with a single card left in the Main Deck only that card is revealed and offered", async () => {
    const game = await scenario()
      .fillDecks(false)
      .resources(P1, { energy: 10 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 7, name: "Wall" }, "wall")
      .unit(P1, "base", CARD, "reksai")
      .deck(P1, [SKULKER], ["only"])
      .build();
    await game.p1.move("reksai", "bf1");
    let pick: PickDecision | undefined;
    for (let i = 0; i < 12 && !pick; i++) {
      const d = game.decision()!;
      if (d.kind === "pick") {
        pick = d;
      } else if (d.kind === "yes-no") {
        await game.p1.yes();
      } else if (d.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(pick?.options.map((o) => o.key)).toEqual(["only"]);
    await game.p1.decline();
    await game.settle();
    expect(game.p1.deck()).toEqual(["only"]);
  });
});
