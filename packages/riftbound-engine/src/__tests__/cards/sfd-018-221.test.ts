/**
 * Void Hatchling — sfd-018-221 · Unit · Fury · 2 energy · 2 might
 *
 *   If you would reveal cards from a deck, look at the top card first. You may recycle it.
 *   Then reveal those cards.
 *
 * Head-judge notes (trickiest situations for this card):
 *  - A replacement effect (369/370: "would"): it wraps YOUR reveal-from-a-deck events only. Blind
 *    Fury makes each OPPONENT reveal, so your own Hatchling does nothing there — but an opponent's
 *    Hatchling lets THEM look/recycle before your Blind Fury sees their top card (controller matters,
 *    not whose spell it is).
 *  - "look" is private and happens BEFORE the reveal; "you may recycle it" is optional. Declining
 *    leaves the same card to be revealed; accepting sends it to the bottom (403) and the reveal then
 *    shows the next card(s) — e.g. Apprentice Smith now finds the gear that was second from top.
 *  - Only while on the board (in hand/trash it is not active). It never fires on the opponent's
 *    reveals from their deck on their own triggers.
 *  - One-card deck: look, recycle (it is still the only/top card), reveal it — no burn out (431.1.c).
 *  - Look at ONE card even when several will be revealed; two Hatchlings → two look/recycle steps.
 */

import { describe, expect, test } from "bun:test";
import type { Decision, Game, Seat } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-018-221";
const APPRENTICE_SMITH = "sfd-041-221"; // "When I move, reveal the top card of your Main Deck. If it's a gear, draw it. Otherwise, recycle it."
const BLIND_FURY = "ogn-025-298"; // 4 + [fury][fury]: each opponent reveals their top card; choose one, banish & play it free; recycle the rest
const GEAR = "ogn-120-298"; // Seal of Insight — a gear
const UNIT = "ogn-175-298"; // Shipyard Skulker — a plain unit (not a gear)

/** P1: Hatchling + Smith in base, deck = [UNIT "top", GEAR "gear", UNIT "d3", …filler]. */
function smithBoard(hatchlingZone: "base" | "hand" = "base") {
  const b = scenario().battlefield("bf1", { controller: null }).unit(P1, "base", APPRENTICE_SMITH, "smith").deck(P1, [UNIT, GEAR, UNIT], ["top", "gear", "d3"]);
  return hatchlingZone === "base" ? b.unit(P1, "base", CARD, "vh") : b.hand(P1, CARD, "vh");
}

/** Answer the Hatchling's "you may recycle it" prompt for `seat`, whichever shape the engine gives it. */
async function answerLook(game: Game, seat: Seat, recycle: boolean): Promise<void> {
  const d = game.decision() as Decision;
  expect(d?.seat).toBe(seat);
  expect(["yes-no", "pick"]).toContain(d.kind);
  const h = game.seat(seat);
  if (d.kind === "yes-no") {
    await (recycle ? h.yes() : h.no());
  } else if (d.kind === "pick") {
    await (recycle ? h.pick(d.options[0]?.key as string) : h.decline());
  }
}

describe("Void Hatchling (sfd-018-221)", () => {
  test("parsed abilities — a `reveal` replacement whose look step is an OPTIONAL recycle of exactly the top card ('you may')", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 2, might: 2 });
    expect(def?.abilities).toHaveLength(1);
    const ability = def?.abilities?.[0] as { type: string; replaces: string; replacement: { type: string; effects: { type: string; amount?: number }[] } };
    expect(ability).toMatchObject({ replaces: "reveal", type: "replacement" });
    expect(ability.replacement.effects.map((e) => e.type)).toEqual(["look", "reveal"]);
    expect(ability.replacement.effects[0]).toMatchObject({ amount: 1, from: "deck", type: "look" });
    // "You MAY recycle it": the look step must carry an optional/may marker, otherwise the recycle is forced.
    expect(JSON.stringify(ability.replacement.effects[0])).toMatch(/optional|may/i);
  });

  test("cost: 2 energy for a 2-might unit that enters the base exhausted; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "vh").build();
    await game.p1.play("vh");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("vh")).toBe("base");
    expect(game.state("vh")).toMatchObject({ isExhausted: true, might: 2 });
    expect((await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "vh").build()).p1.can("play", "vh")).toBe(false);
  });

  test("Smith's reveal with Hatchling out — P1 first looks at 'top' and recycles it; the reveal then hits the gear underneath, which Smith draws", async () => {
    // Expected: a P1 prompt while Smith's trigger resolves; yes → "top" to the bottom, "gear" revealed → hand, "d3" new top.
    // Actual: no `reveal` replacement exists in the engine; "top" is revealed and recycled, the gear stays buried.
    const game = await smithBoard().build();
    await game.p1.move("smith", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "smith", triggered: true })]);
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    await answerLook(game, P1, true);
    await game.settle();
    expect(game.p1.hand()).toEqual(["gear"]);
    const deck = game.p1.deck();
    expect(deck[0]).toBe("d3");
    expect(deck[deck.length - 1]).toBe("top");
    expect(game.zoneOf("vh")).toBe("base");
  });

  test("'you MAY recycle it' — declining leaves 'top' in place, so Smith reveals that non-gear and recycles it; the gear is now on top, hand empty", async () => {
    const game = await smithBoard().build();
    await game.p1.move("smith", "bf1");
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    await answerLook(game, P1, false);
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
    const deck = game.p1.deck();
    expect(deck[0]).toBe("gear");
    expect(deck[deck.length - 1]).toBe("top");
  });

  test("negative space: with the Hatchling still in HAND nothing is looked at — Smith reveals 'top' (a unit) and recycles it, no prompt", async () => {
    const game = await smithBoard("hand").build();
    await game.p1.move("smith", "bf1");
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.p1.hand()).toEqual(["vh"]);
    const deck = game.p1.deck();
    expect(deck[0]).toBe("gear");
    expect(deck[deck.length - 1]).toBe("top");
  });

  test("negative space: the OPPONENT revealing from their deck (their Smith moves on their turn) gives my Hatchling nothing to do", async () => {
    const seen: string[] = [];
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "vh")
      .unit(P2, "base", APPRENTICE_SMITH, "theirSmith")
      .deck(P2, [UNIT, GEAR], ["p2top", "p2gear"])
      .deck(P1, [GEAR], ["myTop"])
      .build();
    await game.p2.move("theirSmith", "bf1");
    const stop = await game.settle({
      policy: (d) => {
        seen.push(`${d.seat}:${d.kind}`);
        return d.kind === "action" && d.passKey ? { key: d.passKey, kind: "action" } : undefined;
      },
    });
    expect(stop.reason).toBe("open");
    expect(seen.filter((s) => !s.endsWith(":action"))).toEqual([]); // nobody was prompted for anything
    expect(game.p1.deck()[0]).toBe("myTop"); // my deck untouched
    const p2deck = game.p2.deck();
    expect(p2deck[0]).toBe("p2gear");
    expect(p2deck[p2deck.length - 1]).toBe("p2top");
  });

  test("Blind Fury cast BY the Hatchling's controller: the opponents do the revealing, so P1 gets no look at (or recycle of) anyone's top card", async () => {
    const seen: string[] = [];
    const game = await scenario()
      .resources(P1, { energy: 4, power: { fury: 2 } })
      .unit(P1, "base", CARD, "vh")
      .hand(P1, BLIND_FURY, "blind")
      .deck(P1, [GEAR, UNIT], ["myTop", "my2"])
      .deck(P2, [UNIT, GEAR], ["p2top", "p2gear"])
      .build();
    await game.p1.cast("blind");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle({
      policy: (d) => {
        seen.push(`${d.seat}:${d.kind}:${d.prompt}`);
        if (d.kind === "action" && d.passKey) return { key: d.passKey, kind: "action" };
        if (d.kind === "pick" && d.options.length > 0) return { keys: [d.options[0]!.key], kind: "pick" };
        return undefined;
      },
    });
    // No yes/no and nothing mentioning recycle/look was ever put to P1 about a TOP card of P1's own deck.
    expect(seen.some((s) => s.startsWith(`${P1}:yes-no`))).toBe(false);
    expect(seen.some((s) => /recycle/i.test(s) && s.startsWith(P1))).toBe(false);
    expect(game.p1.deck().slice(0, 2)).toEqual(["myTop", "my2"]);
  });

  test("Blind Fury cast by the OPPONENT of a Hatchling: the Hatchling's controller (P2) looks at their top card and may recycle it BEFORE it is revealed to P1", async () => {
    // Expected: after both pass on Blind Fury, the first prompt belongs to P2 (look/recycle). P2 recycles "p2top", so the card
    // Blind Fury reveals (and P1 may banish/play) is "p2gear"; "p2top" is safe on the bottom. Actual: P2 is never asked.
    const game = await scenario()
      .resources(P1, { energy: 4, power: { fury: 2 } })
      .unit(P2, "base", CARD, "theirVh")
      .hand(P1, BLIND_FURY, "blind")
      .deck(P2, [UNIT, GEAR, UNIT], ["p2top", "p2gear", "p2d3"])
      .build();
    await game.p1.cast("blind");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d?.kind === "yes-no" || d?.kind === "pick").toBe(true);
    expect(d?.seat).toBe(P2);
    await answerLook(game, P2, true);
    const deck = game.p2.deck();
    expect(deck[deck.length - 1]).toBe("p2top");
    // Whatever P1 now gets to choose from, it is not the recycled card.
    const next = game.decision();
    if (next?.kind === "pick") {
      expect(next.options.map((o) => o.card ?? o.key)).not.toContain("p2top");
    }
    expect(game.zoneOf("p2top")).toBe("mainDeck");
  });

  test("declining the optional recycle does NOT cancel the reveal it replaced — Void Rush still reveals the top 2 (rule 359.3.e / 424)", async () => {
    // "You may recycle it. THEN reveal those cards." — declining only skips the recycle;
    // the replaced reveal-and-pick must still happen, with the untouched top two cards.
    const VOID_RUSH = "sfd-188-221";
    const game = await scenario()
      .resources(P1, { energy: 9, power: { rainbow: 1 } })
      .unit(P1, "base", CARD, "vh")
      .hand(P1, VOID_RUSH, "vr")
      .deck(P1, [UNIT, UNIT, UNIT], ["top", "second", "third"])
      .build();
    await game.p1.cast("vr");
    let sawLook = false;
    let offered: (string | undefined)[] = [];
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else if (d.kind === "yes-no" && d.seat === P1) {
        sawLook = true;
        await game.p1.no();
      } else if (d.kind === "pick" && d.seat === P1) {
        if (d.semantics === "from-revealed" && d.options.length >= 2) {
          offered = d.options.map((o) => o.card);
          await game.p1.decline();
        } else {
          sawLook = true;
          await game.p1.decline();
        }
      } else {
        break;
      }
    }
    expect(sawLook).toBe(true);
    expect(offered).toEqual(["top", "second"]);
    expect(game.p1.hand().sort()).toEqual(["second", "top"]);
    expect(game.p1.deck()[0]).toBe("third");
  });

  test("one-card deck — look at it, recycle it (it is still the top card), then reveal it: Smith draws the lone gear, no burn out", async () => {
    const game = await scenario()
      .fillDecks(false)
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "vh")
      .unit(P1, "base", APPRENTICE_SMITH, "smith")
      .deck(P1, [GEAR], ["only"])
      .build();
    expect(game.p1.deck()).toEqual(["only"]);
    await game.p1.move("smith", "bf1");
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    await answerLook(game, P1, true);
    await game.settle();
    expect(game.p1.hand()).toEqual(["only"]);
    expect(game.p1.deck()).toEqual([]);
    expect(game.isOver()).toBe(false);
    expect(game.p2.points()).toBe(0); // nobody burned out
  });

  test("two Hatchlings — two separate look/recycle steps before the single reveal (recycle twice digs two cards deep)", async () => {
    // Deck [top(unit), d2(unit), gear]. Recycle at both prompts → Smith reveals "gear" and draws it.
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "vh1")
      .unit(P1, "base", CARD, "vh2")
      .unit(P1, "base", APPRENTICE_SMITH, "smith")
      .deck(P1, [UNIT, UNIT, GEAR], ["top", "d2", "gear"])
      .build();
    await game.p1.move("smith", "bf1");
    expect((await game.settle()).reason).toBe("unanswered");
    await answerLook(game, P1, true);
    expect((await game.settle()).reason).toBe("unanswered");
    await answerLook(game, P1, true);
    await game.settle();
    expect(game.p1.hand()).toEqual(["gear"]);
    const deck = game.p1.deck();
    expect(deck.slice(-2)).toEqual(["top", "d2"]);
  });
});
