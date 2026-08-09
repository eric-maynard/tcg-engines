/**
 * Battle Mistress — sfd-203-221 · Legend (Sivir) · Body/Chaos
 *
 *   When you recycle a rune, you may exhaust me to play a Gold gear token exhausted.
 *   When one or more enemy units die, ready me.
 *
 * Rules: 164.2.b (a Basic Rune's own "Recycle this: [Reaction] — Add [C]" is the everyday way YOU
 * recycle a rune), 416/161.2.b (runes recycle to the Rune Deck), 383.3.a/b ("you may exhaust me
 * to…" = opt-in decided at finalization, and "exhaust me" is the trigger's COST, paid to put it on
 * the chain), 187.5 (Gold = domainless gear token with "[Reaction] Kill this, [Exhaust]: [Add]
 * [rainbow]"), 184.1 ("play … exhausted" overrides gear-enters-ready 149.1), 383 "one or more … die"
 * (one trigger per simultaneous batch), 740.1.a (enemy = controlled by an opponent), 315.1.b
 * (Awaken readies your permanents — the Gold is usable from your next turn).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. The rune's own Recycle-for-power ability IS "you recycle a rune" — that is the primary combo
 *     (rune → [C] AND a Gold). A card effect that makes you recycle a rune (Sigil of the Storm)
 *     counts too. Recycling a MAIN-DECK card (Called Shot) is NOT recycling a rune.
 *  2. "exhaust me" is a cost: an already-exhausted Mistress cannot accept; declining leaves her
 *     ready and mints nothing; accepting exhausts her before anyone can respond.
 *  3. The engine loop the card is built for: recycle (Gold, exhaust) → an enemy unit dies (ready)
 *     → recycle again (second Gold) — all in one turn.
 *  4. Ready trigger: enemy deaths on EITHER player's turn count (their raider dying on my wall);
 *     my own units dying do not; two enemy units dying together is ONE "one or more" trigger.
 *  5. The opponent recycling THEIR rune does nothing for me (and nothing for them).
 *  6. The Gold arrives exhausted: no [rainbow] this turn; after my next Awaken it can be cashed.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-203-221";
const SIGIL_OF_THE_STORM = "ogn-287-298"; // Battlefield: When you conquer here, you must recycle one of your runes.
const CALLED_SHOT = "sfd-122-221"; // [Action] 0 + Repeat[chaos]: Look at top 2 of your Main Deck. Draw one and recycle the other.
const FILLER = "ogn-175-298";

const goldOf = (game: Game, seat: "p1" | "p2") => game[seat].base().filter((id) => game.state(id).name === "Gold");

/** P1 (2 body runes) walks a 4-might unit onto the empty Sigil of the Storm → conquer → must recycle a rune. */
function sigilConquer(legendMeta?: { exhausted?: boolean }) {
  return scenario()
    .card("bm", { def: CARD, meta: legendMeta, owner: P1, zone: "legendZone" })
    .runes(P1, "body", 2)
    .battlefield("sigil", { controller: null, def: SIGIL_OF_THE_STORM, inert: false })
    .unit(P1, "base", { might: 4, name: "Axe" }, "axe");
}

/** Drive the Sigil line up to (and including) the "which rune" pick; stops at whatever comes next. */
async function conquerSigilAndRecycle(game: Game): Promise<void> {
  await game.p1.move("axe", "sigil");
  await game.settle(); // showdown passes, Sigil trigger resolves; forced picks are taken, a 2-way pick is asked
  if (game.decision()?.kind === "pick") {
    await game.p1.pick(game.p1.runes()[0] as string);
  }
}

describe("Battle Mistress (sfd-203-221)", () => {
  test("registry payload: two triggered abilities — optional recycle-rune → exhaust-cost → exhausted Gold token; enemy-units die → ready self", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Sivir", domain: ["body", "chaos"], name: "Battle Mistress" });
    expect(def?.abilities).toEqual([
      {
        condition: { cost: { exhaust: true }, type: "pay-cost" },
        effect: { ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" },
        optional: true,
        trigger: { event: "recycle", on: { cardType: "card", controller: "friendly", filter: "rune" } },
        type: "triggered",
      },
      {
        effect: { target: "self", type: "ready" },
        // rule 423.1 — "one or more … die" is batched: one trigger per simultaneous batch.
        trigger: { event: "die", on: { batched: true, cardType: "unit", controller: "enemy" } },
        type: "triggered",
      },
    ]);
  });

  test("recycling a rune (Sigil of the Storm makes me): asked 'exhaust me?'; yes → exhausted at once, trigger on the chain, then an EXHAUSTED Gold gear token in my base", async () => {
    const game = await sigilConquer().build();
    await conquerSigilAndRecycle(game);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.runes()).toHaveLength(1); // one rune went back to the rune deck
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    // 383.3.b: the exhaust is the cost — paid on finalization, before anyone may respond.
    expect(game.state("bm").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bm", controller: P1, triggered: true })]);
    expect(goldOf(game, "p1")).toHaveLength(0);
    await game.settle();
    const gold = goldOf(game, "p1");
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0] as string)).toMatchObject({ cardType: "gear", controller: P1, isExhausted: true, isToken: true, name: "Gold" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // an effect-recycle adds no power
    expect(game.violations()).toEqual([]);
  });

  test("the Gold arrives exhausted (no rainbow this turn); after my next Awaken it is ready and cashes for [rainbow], ceasing to exist", async () => {
    const game = await sigilConquer().build();
    await conquerSigilAndRecycle(game);
    await game.p1.yes();
    await game.settle();
    const gold = goldOf(game, "p1")[0] as string;
    expect(game.p1.can("activate", gold)).toBe(false); // [Exhaust] is part of its cost
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state(gold).isExhausted).toBe(false);
    expect(game.state("bm").isExhausted).toBe(false); // Awaken readied the legend too
    await game.p1.activate(gold);
    await game.settle();
    expect(game.zoneOf(gold)).toBe("gone");
    expect(game.p1.power("rainbow")).toBe(1);
  });

  test("'you may': declining leaves the Mistress ready, removes the trigger, and mints no Gold — the rune is still recycled", async () => {
    const game = await sigilConquer().build();
    await conquerSigilAndRecycle(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.state("bm").isExhausted).toBe(false);
    expect(game.chain()).toHaveLength(0);
    expect(goldOf(game, "p1")).toHaveLength(0);
    expect(game.p1.runes()).toHaveLength(1);
  });

  test("'exhaust me' is a cost: an already-exhausted Mistress cannot accept — no Gold", async () => {
    const game = await sigilConquer({ exhausted: true }).build();
    expect(game.state("bm").isExhausted).toBe(true);
    await conquerSigilAndRecycle(game);
    const d = game.decision();
    if (d?.kind === "yes-no") {
      expect(d.canAccept).toBe(false);
      const t = await game.p1.try((p) => p.yes());
      if (!t.ok) {
        await game.p1.no();
      }
    }
    await game.settle();
    expect(goldOf(game, "p1")).toHaveLength(0);
    expect(game.state("bm").isExhausted).toBe(true);
    expect(game.p1.runes()).toHaveLength(1);
  });

  test.failing("BUG: a Basic Rune's own 'Recycle this: Add [C]' (164.2.b) is 'you recycle a rune' but fires no trigger — the recycle → Gold → kill → ready → recycle loop", async () => {
    // Expected: recycleRune → +1 body AND the "exhaust me?" prompt; yes → Gold #1. A second recycle
    // while exhausted cannot be accepted. Killing an enemy unit readies her; a third recycle → Gold #2.
    // Actual: the recycleRune move emits no `recycle` event, so no prompt ever appears.
    const game = await scenario()
      .legend(P1, CARD, "bm")
      .runes(P1, "body", 3)
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 4, name: "Axe" }, "axe")
      .unit(P2, "bf1", { might: 2, name: "Wall" }, "wall")
      .build();
    await game.p1.recycleRune();
    expect(game.p1.power("body")).toBe(1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.state("bm").isExhausted).toBe(true);
    expect(goldOf(game, "p1")).toHaveLength(1);

    await game.p1.recycleRune(); // exhausted: cannot pay the cost again
    if (game.decision()?.kind === "yes-no") {
      const t = await game.p1.try((p) => p.yes());
      if (!t.ok) {
        await game.p1.no();
      }
    }
    await game.settle();
    expect(goldOf(game, "p1")).toHaveLength(1);
    expect(game.p1.power("body")).toBe(2);

    await game.p1.move("axe", "bf1"); // Wall dies → ready me
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.state("bm").isExhausted).toBe(false);

    await game.p1.recycleRune();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(goldOf(game, "p1")).toHaveLength(2);
    expect(game.p1.power("body")).toBe(3);
  });

  test.failing("BUG: recycling a MAIN-DECK card (Called Shot: 'draw one and recycle the other') is not recycling a rune, yet the Mistress asks to exhaust", async () => {
    // Expected: after the Called Shot pick nothing from Battle Mistress — no yes/no, no chain item, no Gold.
    // Actual: the generic `recycle` event matches her trigger; the `filter: "rune"` is ignored.
    const game = await scenario()
      .legend(P1, CARD, "bm")
      .resources(P1, { energy: 0 })
      .hand(P1, CALLED_SHOT, "shot")
      .deck(P1, [FILLER, FILLER], ["top1", "top2"])
      .build();
    await game.p1.cast("shot");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("top1");
    expect(game.zoneOf("top1")).toBe("hand");
    expect(game.zoneOf("top2")).toBe("mainDeck");
    const d = game.decision();
    expect(d?.kind === "yes-no" && d.seat === P1).toBe(false);
    expect(game.chain().some((c) => c.cardId === "bm")).toBe(false);
    await game.settle({ policy: "first" });
    expect(game.state("bm").isExhausted).toBe(false);
    expect(goldOf(game, "p1")).toHaveLength(0);
  });

  test("the OPPONENT recycling their rune (their Sigil conquer) is not 'you recycle': no prompt for anyone, my Mistress untouched, no Gold anywhere", async () => {
    const game = await scenario()
      .active(P2)
      .legend(P1, CARD, "bm")
      .runes(P2, "fury", 2)
      .battlefield("sigil", { controller: null, def: SIGIL_OF_THE_STORM, inert: false })
      .unit(P2, "base", { might: 4, name: "Their Axe" }, "theirs")
      .build();
    await game.p2.move("theirs", "sigil");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p2.pick(game.p2.runes()[0] as string);
    }
    await game.settle();
    expect(game.p2.points()).toBe(1);
    expect(game.p2.runes()).toHaveLength(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.state("bm").isExhausted).toBe(false);
    expect(goldOf(game, "p1")).toHaveLength(0);
    expect(goldOf(game, "p2")).toHaveLength(0);
  });

  test("ready trigger — an enemy unit dies to my attack on my turn: the exhausted Mistress readies", async () => {
    const game = await scenario()
      .card("bm", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 4, name: "Axe" }, "axe")
      .unit(P2, "bf1", { might: 3, name: "Wall" }, "wall")
      .build();
    expect(game.state("bm").isExhausted).toBe(true);
    await game.p1.move("axe", "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.state("bm").isExhausted).toBe(false);
  });

  test("ready trigger — on the OPPONENT's turn their raider dies on my wall: still 'an enemy unit died' → ready", async () => {
    const game = await scenario()
      .active(P2)
      .card("bm", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4, name: "Wall" }, "wall")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("wall")).toBe("bf1");
    expect(game.state("bm").isExhausted).toBe(false);
  });

  test("negative space — only MY unit dies (3 into 5): no enemy died, the Mistress stays exhausted; a mutual kill (3 v 3 — an enemy died too) does ready her", async () => {
    const lose = await scenario()
      .card("bm", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "Axe" }, "axe")
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .build();
    await lose.p1.move("axe", "bf1");
    await lose.settle();
    expect(lose.zoneOf("axe")).toBe("trash");
    expect(lose.state("bm").isExhausted).toBe(true);

    const trade = await scenario()
      .card("bm", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "Axe" }, "axe")
      .unit(P2, "bf1", { might: 3, name: "Wall" }, "wall")
      .build();
    await trade.p1.move("axe", "bf1");
    await trade.settle();
    expect(trade.zoneOf("axe")).toBe("trash");
    expect(trade.zoneOf("wall")).toBe("trash");
    expect(trade.state("bm").isExhausted).toBe(false);
  });

  test("'one or more enemy units die' — two defenders killed in the same combat put TWO ready-triggers on the chain; rules say one per batch", async () => {
    // Expected: one Battle Mistress chain item after the combat damage kills both walls at once.
    // Actual: one `die` event per unit → two triggered items (each readies her; harmless today, but
    // observable and wrong for anything that counts or copies triggers).
    const game = await scenario()
      .card("bm", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 8, name: "Big Axe" }, "axe")
      .unit(P2, "bf1", { might: 2, name: "Wall One" }, "w1")
      .unit(P2, "bf1", { might: 2, name: "Wall Two" }, "w2")
      .autoProcedures(false)
      .build();
    await game.p1.move("axe", "bf1");
    for (let i = 0; i < 20; i++) {
      if (game.chain().some((c) => c.cardId === "bm")) {
        break;
      }
      const d = game.decision();
      if (!d) {
        break;
      }
      if (d.kind === "distribute" && d.defaultAllocation) {
        await game.seat(d.seat).distribute(d.defaultAllocation);
      } else if (d.kind === "order") {
        await game.seat(d.seat).order([]);
      } else if (d.kind === "action") {
        const key = d.passKey ?? d.options.find((o) => o.verb !== "concede")?.key;
        await game.act(d.seat, { key: key as string, kind: "action" });
      } else {
        break;
      }
    }
    expect(game.zoneOf("w1")).toBe("trash");
    expect(game.zoneOf("w2")).toBe("trash");
    expect(game.chain().filter((c) => c.cardId === "bm" && c.triggered)).toHaveLength(1);
    await game.settle();
    expect(game.state("bm").isExhausted).toBe(false);
  });
});
