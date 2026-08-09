/**
 * Master of Shadows — ven-191-166 · Legend (Zed) · Fury/Chaos
 *
 *   When you banish a card you own, empower me.
 *   [Action][>] Disempower me, [Exhaust]: Discard 1, then draw 1.
 *
 * Rules: 427 (Banish = put a card into Banishment from anywhere — board, trash, deck, chain; Flow's
 * "then banish it" and "banish a card from a trash" both qualify), 411.4 ("when YOU banish" = a banish
 * you are responsible for) + 127.1 ("a card you OWN" = from your deck, wherever it currently is and
 * whoever controls it), 441 (Empowered is a binary, durable status; empowering the empowered does
 * nothing), 442 (Disempower as a COST: only payable while Empowered), 381 + 806.1.b ([Action] on an
 * activated ability: your turn in an Open State, or any showdown while you hold Focus — never in a
 * Closed State, that needs [Reaction]), 422 (Discard: hand → trash), 359.3.e.14 ("Discard 1, then
 * draw 1" are sequenced but not linked — an empty hand discards nothing and still draws).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. All costs up front: the moment it is activated the legend is already disempowered AND
 *     exhausted while the discard/draw waits on the chain for P2's response; afterwards neither half
 *     of the cost is available again this turn (and Awaken only fixes the exhaust half).
 *  2. Order inside the effect: discard FIRST (chosen from the current hand), THEN draw — a one-card
 *     hand is a forced discard and you end with exactly the drawn card; hand size is otherwise flat.
 *  3. [Action] ≠ [Reaction]: usable with Focus in the opponent's showdown, but not in their open main
 *     phase, not before they pass Focus, and not on top of their spell chain.
 *  4. The empower trigger keys on RESPONSIBILITY + OWNERSHIP: my Flow spell banishing itself → yes; my
 *     Gust Monk banishing a card out of MY trash → yes, out of THEIR trash → no; their Wind and Ghosts
 *     banishing my unit → no (I own it, but they banished it).
 *  5. Engine status: the activated half is fully wired; the engine emits no `banish` game event, so
 *     the empower trigger never fires — pinned as BUG tests (Flow, Gust Monk, and the full loop).
 */

import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-191-166";
const BRITTLE_STEEL = "ven-003-166"; // Fury spell 2+[fury]: Kill a gear. [Flow] [4][fury] (play from trash, then banish it)
const GUST_MONK = "ven-101-166"; // Chaos unit 2 (+[1] optional): if paid, banish a card from ANY trash to give a unit Assault 2
const WIND_AND_GHOSTS = "ven-106-166"; // Chaos [Action] 3+[chaos]: unit at a bf — ≤3 Might → banish it, else bounce
const BALLISTA = "ogn-017-298"; // a plain gear for Brittle Steel to kill
const FILLER = "ogn-175-298";

/** P1's turn; the legend placed with the given statuses; hand h1,h2; deck d1,d2 on top. */
function withLegend(meta: { empowered?: boolean; exhausted?: boolean } = { empowered: true }) {
  return scenario()
    .card("mos", { def: CARD, meta, owner: P1, zone: "legendZone" })
    .hand(P1, FILLER, "h1")
    .hand(P1, FILLER, "h2")
    .deck(P1, [FILLER, FILLER], ["d1", "d2"]);
}

const activations = (game: Game) => game.p1.legal().map((o) => o.key).filter((k) => k.startsWith("activateAbility:mos"));

describe("Master of Shadows (ven-191-166)", () => {
  test("registry payload: Legend (Fury/Chaos) — #0 triggered: you banish a card you own → empower self; #1 activated [Action]: cost {disempower self, exhaust} → discard 1 then draw 1", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", domain: ["fury", "chaos"], name: "Master of Shadows" });
    expect(def?.abilities).toEqual([
      { effect: { target: "self", type: "empower" }, trigger: { event: "banish", on: "controller" }, type: "triggered" },
      {
        cost: { disempower: "self", exhaust: true },
        effect: { amount: 1, then: { amount: 1, type: "draw" }, type: "discard" },
        timing: "action",
        type: "activated",
      },
    ]);
  });

  test("Empowered + ready, zero resources: activating pays BOTH costs at once (disempowered, exhausted), puts one ability on the chain and gives P2 priority; on resolution I choose the discard from my whole hand, it hits the trash, THEN I draw the top card — hand size flat", async () => {
    const game = await withLegend().build();
    expect(game.state("mos")).toMatchObject({ isEmpowered: true, isReady: true });
    expect(activations(game)).toEqual(["activateAbility:mos#1"]);
    await game.p1.activate("mos");
    expect(game.state("mos")).toMatchObject({ isEmpowered: false, isExhausted: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mos", controller: P1, triggered: false, type: "ability" })]);
    expect(game.p1.hand()).toEqual(["h1", "h2"]); // nothing yet
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1 });
    expect(d.options.map((o) => o.card).sort()).toEqual(["h1", "h2"]);
    expect(game.p1.deck()[0]).toBe("d1"); // the draw has not happened before the discard
    await game.p1.pick("h2");
    await game.settle();
    expect(game.p1.trash()).toEqual(["h2"]);
    expect([...game.p1.hand()].sort()).toEqual(["d1", "h1"]);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(activations(game)).toEqual([]); // disempowered AND exhausted now
    expect(game.violations()).toEqual([]);
  });

  test("cost gates: NOT Empowered → no ability offered (nothing to disempower, 442); Empowered but EXHAUSTED → not offered; both fine → offered even with an empty pool", async () => {
    expect(activations(await withLegend({}).build())).toEqual([]);
    expect((await withLegend({}).build()).p1.can("activate", "mos")).toBe(false);
    expect(activations(await withLegend({ empowered: true, exhausted: true }).build())).toEqual([]);
    expect(activations(await withLegend({ empowered: true }).build())).toEqual(["activateAbility:mos#1"]);
  });

  test("a ONE-card hand is a forced discard: h1 goes, then d1 is drawn — I end holding exactly the new card", async () => {
    const game = await scenario().card("mos", { def: CARD, meta: { empowered: true }, owner: P1, zone: "legendZone" }).hand(P1, FILLER, "h1").deck(P1, [FILLER], ["d1"]).build();
    await game.p1.activate("mos");
    await game.settle(); // both pass; the single legal discard is taken
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("h1");
      await game.settle();
    }
    expect(game.p1.trash()).toEqual(["h1"]);
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("EMPTY hand: still activatable (discard is effect, not cost); nothing is discarded and the 'then draw 1' still happens (359.3.e.14 — not a linked instruction)", async () => {
    const game = await scenario().card("mos", { def: CARD, meta: { empowered: true }, owner: P1, zone: "legendZone" }).deck(P1, [FILLER], ["d1"]).build();
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.can("activate", "mos")).toBe(true);
    await game.p1.activate("mos");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.state("mos")).toMatchObject({ isEmpowered: false, isExhausted: true });
  });

  test("[Action] timing on the OPPONENT's turn: nothing in their open main phase, nothing in their showdown before Focus is passed, offered once I hold Focus — and it resolves mid-showdown (discard + draw) before combat", async () => {
    const game = await withLegend()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 2, name: "Poker" }, "poker")
      .build();
    expect(activations(game)).toEqual([]); // P2's Neutral Open: no priority for me
    await game.p2.move("poker", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(activations(game)).toEqual([]); // no Focus yet
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(activations(game)).toEqual(["activateAbility:mos#1"]);
    await game.p1.activate("mos");
    expect(game.state("mos")).toMatchObject({ isEmpowered: false, isExhausted: true });
    game.script(P1, ["h1"]);
    await game.settle();
    expect(game.p1.trash()).toEqual(["h1"]);
    expect([...game.p1.hand()].sort()).toEqual(["d1", "h2"]);
    expect(game.zoneOf("poker")).toBe("trash"); // combat still happened: 2 into 3
    expect(game.turnPlayer()).toBe(P2);
  });

  test("[Action] is not [Reaction] (813 vs 806): holding priority on the opponent's spell chain (a Closed State) does NOT unlock the ability", async () => {
    const PING = {
      abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
      cardType: "spell",
      domain: "fury",
      energyCost: 1,
      name: "Ping",
      timing: "action",
    } as const;
    const game = await withLegend().active(P2).resources(P2, { energy: 1 }).unit(P1, "base", { might: 3 }, "target").hand(P2, PING, "ping").build();
    await game.p2.cast("ping", { targets: "target" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(activations(game)).toEqual([]);
    expect((await game.p1.try((p) => p.activate("mos", 1))).ok).toBe(false);
    expect(game.state("mos")).toMatchObject({ isEmpowered: true, isReady: true });
  });

  test("across turns: Empowered persists untouched through both players' turns (441 — a status, no duration); after use, Awaken re-readies the legend but it stays disempowered, so the ability is NOT back", async () => {
    const idle = await withLegend().build();
    await idle.advanceTurn();
    await idle.advanceTurn();
    expect(idle.turnPlayer()).toBe(P1);
    expect(idle.state("mos")).toMatchObject({ isEmpowered: true, isReady: true });
    expect(activations(idle)).toEqual(["activateAbility:mos#1"]);

    const used = await withLegend().build();
    await used.p1.activate("mos");
    used.script(P1, ["h1"]);
    await used.settle();
    await used.advanceTurn();
    await used.advanceTurn();
    expect(used.turnPlayer()).toBe(P1);
    expect(used.state("mos")).toMatchObject({ isEmpowered: false, isReady: true });
    expect(activations(used)).toEqual([]);
  });

  test("'When you banish a card you own' — resolving Brittle Steel for its Flow cost banishes MY spell by MY hand → the legend becomes Empowered", async () => {
    // Expected: after the Flow copy resolves and is banished (829.1.b.1) the trigger fires (a chain
    // item or an immediate status flip) and Master of Shadows reads isEmpowered: true. Actual: the
    // engine emits no `banish` game event, so nothing triggers and the legend stays un-empowered.
    const game = await scenario()
      .resources(P1, { energy: 4, power: { fury: 1 } })
      .legend(P1, CARD, "mos")
      .gear(P2, BALLISTA, "theirs")
      .trash(P1, BRITTLE_STEEL, "steel")
      .build();
    expect(game.state("mos").isEmpowered).toBe(false);
    await game.p1.cast("steel", { flow: true, targets: "theirs" });
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.zoneOf("steel")).toBe("banishment");
    await game.settle();
    expect(game.state("mos").isEmpowered).toBe(true);
    expect(game.state("mos").isReady).toBe(true); // empowering never exhausts
  });

  test.failing("BUG: Gust Monk (paid) banishing a card out of MY trash is me banishing a card I own → Empowered", async () => {
    // Expected: pick "mine" from the any-trash prompt → it lands in banishment → legend Empowered.
    // Actual: the banish happens but no trigger event exists, so isEmpowered stays false.
    const game = await monkBoard().build();
    await game.p1.play("monk", { payOptional: true });
    expect(game.p1.energy()).toBe(0); // 2 + the optional [1]
    await driveMonk(game, "mine");
    expect(game.zoneOf("mine")).toBe("banishment");
    expect(game.state("mos").isEmpowered).toBe(true);
  });

  test("negative space — Gust Monk banishing a card out of the OPPONENT's trash: I banished it, but I don't OWN it → no empower", async () => {
    const game = await monkBoard().build();
    await game.p1.play("monk", { payOptional: true });
    await driveMonk(game, "theirs");
    expect(game.zoneOf("theirs")).toBe("banishment");
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.state("mos").isEmpowered).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("negative space — the OPPONENT's Wind and Ghosts banishing MY 3-Might unit: a card I own, but THEY banished it (411.4) → no empower", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3, power: { chaos: 1 } })
      .legend(P1, CARD, "mos")
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Shade" }, "shade")
      .hand(P2, WIND_AND_GHOSTS, "wag")
      .build();
    await game.p2.cast("wag", { targets: "shade" });
    await game.settle();
    expect(game.zoneOf("shade")).toBe("banishment");
    expect(game.state("shade").owner).toBe(P1);
    expect(game.state("mos").isEmpowered).toBe(false);
    expect(game.chain()).toEqual([]);
  });

  test("the printed loop in one turn — Flow-banish my own spell (→ Empowered), then, still on my turn, [Action] Disempower + Exhaust to discard 1 and draw 1", async () => {
    // Expected: after the Flow banish the ability key appears; using it leaves the legend disempowered +
    // exhausted, h1 in the trash and d1 in hand. Actual: never Empowered, so the ability never unlocks.
    const game = await scenario()
      .resources(P1, { energy: 4, power: { fury: 1 } })
      .legend(P1, CARD, "mos")
      .gear(P2, BALLISTA, "theirs")
      .trash(P1, BRITTLE_STEEL, "steel")
      .hand(P1, FILLER, "h1")
      .deck(P1, [FILLER], ["d1"])
      .build();
    await game.p1.cast("steel", { flow: true, targets: "theirs" });
    await game.settle();
    await game.settle();
    expect(activations(game)).toEqual(["activateAbility:mos#1"]);
    await game.p1.activate("mos");
    game.script(P1, ["h1"]);
    await game.settle();
    expect(game.state("mos")).toMatchObject({ isEmpowered: false, isExhausted: true });
    expect(game.p1.trash()).toEqual(["h1"]);
    expect(game.p1.hand()).toEqual(["d1"]);
  });
});

/** P1: legend, 3 energy, Gust Monk in hand, one card in each trash, a friendly unit for the Assault. */
function monkBoard() {
  return scenario()
    .resources(P1, { energy: 3 })
    .legend(P1, CARD, "mos")
    .trash(P1, FILLER, "mine")
    .trash(P2, FILLER, "theirs")
    .unit(P1, "base", { might: 2, name: "Pupil" }, "pupil")
    .hand(P1, GUST_MONK, "monk");
}

/** Drive Gust Monk's play trigger: pick `fromTrash` for the banish, the pupil (or anything) for the Assault, pass priority otherwise. */
async function driveMonk(game: Game, fromTrash: string): Promise<void> {
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      return;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else if (d.kind === "pick") {
      const keys = d.options.map((o) => o.card ?? o.key);
      const want = keys.includes(fromTrash) ? fromTrash : keys.includes("pupil") ? "pupil" : (keys[0] as string);
      await game.seat(d.seat).pick(want);
    } else if (d.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else {
      return;
    }
  }
}
