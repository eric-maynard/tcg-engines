/**
 * Hall of Legends — sfd-210-221 · Battlefield
 *
 *   When you conquer here, you may pay [1] to ready your legend.
 *
 * Rules: 469.1 (Conquer = gaining control of a battlefield you have not scored this turn — by winning
 * a combat, 466.5.d, OR by walking onto an empty one, 348.2.a.1), 383.4.c.2.b + 471.2.a ("When you
 * conquer HERE" triggers only at the conquered battlefield, for the conquering player), 190.6.b (a
 * battlefield ability is controlled by the player it addresses — deck ownership of the card is
 * irrelevant), 204.3.a ("you may pay [1] to …": the [1] is the trigger's cost, paid to FINALIZE the item
 * on the chain; the ready happens on resolution), 415.1.b (readying something ready does nothing),
 * 383.4.d (Hold ≠ Conquer).
 *
 * Head-judge corner cases for THIS card:
 *  1. The payoff loop: exhaust my legend for its ability, conquer here, pay [1], legend is ready and its
 *     [Exhaust] ability is legal again the same turn.
 *  2. Cost edge: with 0 energy the "you may pay" cannot be accepted (canAccept=false); declining is free.
 *  3. Both conquer routes trigger it: combat win AND walk-in onto an uncontrolled Hall.
 *  4. Negative space: conquering a DIFFERENT battlefield; HOLDING the Hall at start of turn; losing the
 *     combat here (the opponent keeps it) — none of these trigger it for me.
 *  5. Symmetry: when P2 conquers a Hall whose card P1 owns, P2 is asked, P2 pays, P2's legend readies.
 *  6. The energy leaves the pool at finalize (before anyone gets priority), the legend readies only when
 *     the item resolves — observable in the priority window in between.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, passivePolicy, scenario } from "../../harness";

const CARD = "sfd-210-221";
const BOUNTY_HUNTER = "ogn-267-298"; // legend · [Exhaust]: Give a unit [Ganking] this turn.

/** P1 (3 energy, exhausted Bounty Hunter legend) has a 4-Might Raider in base; bf1 = live Hall held by P2's 1-Might Pawn; bf2 inert, P2's. */
function board(energy = 3) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P2 })
    .battlefield("bf2", { controller: P2 })
    .card("leg", { def: BOUNTY_HUNTER, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
    .card("theirLeg", { def: BOUNTY_HUNTER, meta: { exhausted: true }, owner: P2, zone: "legendZone" })
    .unit(P2, "bf1", { might: 1, name: "Pawn" }, "pawn")
    .unit(P2, "bf2", { might: 1, name: "Pawn Two" }, "pawn2")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider");
}

/** Pass focus/priority for everyone until a non-action prompt (the Hall's yes/no) or the open main phase. */
async function untilPrompt(game: Game): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main") {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

const hallItems = (game: Game) => game.chain().filter((c) => c.cardId === "bf1" && c.triggered);

describe("Hall of Legends (sfd-210-221)", () => {
  test("winning the combat here conquers (+1 point) and asks ME 'pay [1]?' with one P1-controlled triggered item on the chain", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await untilPrompt(game);
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    expect(hallItems(game)).toEqual([expect.objectContaining({ controller: P1, name: "Hall of Legends" })]);
    expect(game.state("leg").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(3);
  });

  test("204.3.a — accepting pays the [1] at once (finalize), the legend readies only when the item resolves; afterwards its [Exhaust] ability is legal again", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "leg")).toBe(false); // exhausted legend
    await game.p1.move("raider", "bf1");
    await untilPrompt(game);
    await game.p1.yes();
    expect(game.p1.energy()).toBe(2); // paid
    expect(game.state("leg").isExhausted).toBe(true); // not yet resolved
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    await game.settle();
    expect(game.state("leg").isReady).toBe(true);
    expect(game.state("theirLeg").isExhausted).toBe(true); // "YOUR legend" only
    expect(game.p1.can("activate", "leg")).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("the full loop: exhaust Bounty Hunter (Ganking on Raider) → conquer the Hall → pay [1] → Bounty Hunter is ready and activatable again this turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P1 })
      .legend(P1, BOUNTY_HUNTER, "leg")
      .unit(P2, "bf1", { might: 1, name: "Pawn" }, "pawn")
      .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p1.activate("leg", 0, { answers: ["raider"] });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("raider");
      await game.settle();
    }
    expect(game.state("leg").isExhausted).toBe(true);
    expect(game.state("raider").keywords).toContain("Ganking");
    await game.p1.move("raider", "bf1");
    await untilPrompt(game);
    await game.p1.yes();
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.state("leg").isReady).toBe(true);
    expect(game.p1.can("activate", "leg")).toBe(true);
  });

  test("declining is free: no energy spent, legend stays exhausted, the conquer itself stands", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await untilPrompt(game);
    await game.p1.no();
    await game.settle();
    expect(game.p1.energy()).toBe(3);
    expect(game.state("leg").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(hallItems(game)).toEqual([]);
  });

  test("cost edge — 0 energy: the offer cannot be accepted (canAccept=false, 'yes' is rejected); answering 'no' moves on with the legend still exhausted", async () => {
    const game = await board(0).build();
    await game.p1.move("raider", "bf1");
    await untilPrompt(game);
    expect(game.decision()).toMatchObject({ canAccept: false, kind: "yes-no", seat: P1 });
    expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
    await game.p1.no();
    await game.settle();
    expect(game.state("leg").isExhausted).toBe(true);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("348.2.a.1 — walking onto an UNCONTROLLED Hall is also a conquer here: same offer, pay, legend readies", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: null, def: CARD, inert: false, owner: P2 })
      .card("leg", { def: BOUNTY_HUNTER, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .unit(P1, "base", { might: 2, name: "Walker" }, "walker")
      .build();
    await game.p1.move("walker", "bf1");
    await untilPrompt(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.energy()).toBe(0);
    expect(game.state("leg").isReady).toBe(true);
  });

  test("negative space — 'here': conquering bf2 while the Hall is bf1 scores a point but offers nothing", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf2");
    await game.settle();
    expect(game.zoneOf("pawn2")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(3);
    expect(game.state("leg").isExhausted).toBe(true);
  });

  // BUG — expected (383.4.c.2.b / 471.2.a): "conquer HERE" — while I already control the Hall (bf1),
  // conquering bf2 must not offer the Hall's pay-to-ready. Actual: the `on:"controller"` matcher only
  // compares the conquering player with the Hall's controller and ignores `location:"here"`, so it fires.
  test("'When you conquer HERE' fires for the Hall's controller conquering a DIFFERENT battlefield (471.2.a)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P2 })
      .battlefield("bf2", { controller: P2 })
      .card("leg", { def: BOUNTY_HUNTER, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .unit(P1, "bf1", { might: 1, name: "Garrison" }, "garrison")
      .unit(P2, "bf2", { might: 1, name: "Pawn Two" }, "pawn2")
      .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p1.move("raider", "bf2");
    await untilPrompt(game);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(hallItems(game)).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("negative space — HOLDING the Hall at the start of my turn scores but is not a conquer: no offer at all across the turn start", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P2 })
      .card("leg", { def: BOUNTY_HUNTER, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .build();
    let asked = 0;
    await game.advanceTurn({
      policy: (d, g) => {
        if (d.kind === "yes-no") {
          asked += 1;
          return { kind: "yes-no", value: false };
        }
        return passivePolicy(d, g);
      },
    });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1); // the hold
    expect(asked).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("negative space — LOSING the combat here: P2 keeps the Hall, nobody conquered, nobody is asked", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .resources(P2, { energy: 3 })
      .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P1 })
      .card("leg", { def: BOUNTY_HUNTER, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .card("theirLeg", { def: BOUNTY_HUNTER, meta: { exhausted: true }, owner: P2, zone: "legendZone" })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 1, name: "Scout" }, "scout")
      .build();
    await game.p1.move("scout", "bf1");
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.energy()).toBe(3);
    expect(game.state("theirLeg").isExhausted).toBe(true); // defending successfully is not conquering
  });

  test("symmetry — P2 conquers a Hall whose card P1 owns: P2 is asked, P2 pays [1], P2's legend readies; P1's legend and energy are untouched", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3 })
      .resources(P2, { energy: 3 })
      .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P1 })
      .card("leg", { def: BOUNTY_HUNTER, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .card("theirLeg", { def: BOUNTY_HUNTER, meta: { exhausted: true }, owner: P2, zone: "legendZone" })
      .unit(P1, "bf1", { might: 1, name: "Pawn" }, "pawn")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await untilPrompt(game);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
    expect(hallItems(game)).toEqual([expect.objectContaining({ controller: P2 })]);
    await game.p2.yes();
    await game.settle();
    expect(game.p2.points()).toBe(1);
    expect(game.p2.energy()).toBe(2);
    expect(game.state("theirLeg").isReady).toBe(true);
    expect(game.p1.energy()).toBe(3);
    expect(game.state("leg").isExhausted).toBe(true);
  });

  test("registry payload: one optional conquer-here trigger for the controller, gated by a pay-cost of 1 energy, readying the friendly legend", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Hall of Legends" });
    expect(def?.abilities).toEqual([
      {
        condition: { cost: { energy: 1 }, type: "pay-cost" },
        effect: { target: { controller: "friendly", type: "legend" }, type: "ready" },
        optional: true,
        trigger: { event: "conquer", location: "here", on: "controller" },
        type: "triggered",
      },
    ]);
  });
});
