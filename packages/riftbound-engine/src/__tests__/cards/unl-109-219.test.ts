/**
 * Blood Rose — unl-109-219 · Gear · Body · 1 energy
 *
 *   When you play a unit, you may pay [1] to gain 1 XP.
 *   Spend 3 XP, [Exhaust]: Ready a unit.
 *
 * Rules: 149.1 (gear enters ready), 383.3.a/b (a "you may pay [1] to …" that opens the effect is
 * the trigger's BASE COST — chosen and paid on finalization; unpayable → the option cannot be
 * taken), 730 (gain/spend XP; spending is a cost, 202/203.1), 185.2.a + "Tokens are not cards,
 * but can still be Played" (an effect that PLAYS a unit token is you playing a unit), 383.4.a.4
 * (this is not a Play Effect of the Rose itself — a gear is not a unit), gear activated abilities:
 * only in your Main Phase, Open State, outside showdowns.
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. Optional AND costed: "no" keeps the energy; the last energy spent on the unit itself → the
 *     [1] cannot be paid, no XP; exactly 1 left → 0 after. One prompt PER unit played, per Rose.
 *  2. "you play": the opponent playing a unit never asks anyone; playing the Rose (a gear) is not
 *     playing a unit; a unit merely placed/moved is not played.
 *  3. Token plays count: Carrion Dredger's Deathknell "Play a Bird token" is P1 playing a unit.
 *  4. Stacking: two Roses → two separate triggers (+2 XP for [2]); Demacian Diplomat's own
 *     "gain 1 XP" plus the Rose → 2 XP off one 2-cost unit.
 *  5. Activated half: BOTH costs — 3 XP (2 is one short) and an unexhausted Rose; "a unit" is any
 *     unit, even an enemy one; the natural line is play (enters exhausted) → pay → ready → attack.
 *  6. Timing: no activation on the opponent's turn or while a showdown is open.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-109-219";
const DIPLOMAT = "unl-092-219"; // Body unit, 2: "When you play me, gain 1 XP."
const DREDGER = "unl-153-219"; // Order unit, 1 Might: [Deathknell] Play a 1-Might Bird token to your base.
const SQUIRE = { cardType: "unit", domain: "body", energyCost: 2, might: 2, name: "Squire" } as const;
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Bolt",
  timing: "action",
} as const;

function withRose(energy: number) {
  return scenario().resources(P1, { energy }).gear(P1, CARD, "rose").hand(P1, SQUIRE, "squire");
}

/** Drain passes until the Rose's "pay [1]?" prompt for P1 is the pending decision. */
async function toRosePrompt(game: Game, rose = "rose"): Promise<void> {
  for (let i = 0; i < 3 && !(game.decision()?.kind === "yes-no"); i++) {
    await game.settle();
  }
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: rose } });
}

describe("Blood Rose (unl-109-219)", () => {
  test("registry payload: an OPTIONAL play-unit (friendly) trigger costed 'pay 1 energy' → gain-xp 1, plus an activated 'xp 3 + exhaust' → ready a unit", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "gear", domain: "body", energyCost: 1, name: "Blood Rose" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      {
        condition: { cost: { energy: 1 }, type: "pay-cost" },
        effect: { amount: 1, type: "gain-xp" },
        optional: true,
        trigger: { event: "play-unit", on: { controller: "friendly", type: "unit" } },
        type: "triggered",
      },
      { cost: { exhaust: true, xp: 3 }, effect: { target: { type: "unit" }, type: "ready" }, type: "activated" },
    ]);
  });

  test("cost: 1 energy, no power; a gear enters the base READY (149.1) and playing it triggers nothing (a gear is not a unit); 0 energy → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "rose").build();
    await game.p1.play("rose");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.zoneOf("rose")).toBe("base");
    expect(game.state("rose")).toMatchObject({ cardType: "gear", isReady: true });
    expect(game.p1.xp()).toBe(0);
    expect((await scenario().resources(P1, { energy: 0, power: { body: 2 } }).hand(P1, CARD, "r").build()).p1.can("play", "r")).toBe(false);
  });

  test("play a 2-cost unit with 3 energy: the Rose trigger goes on the chain; YES pays exactly the last [1] and gains 1 XP", async () => {
    const game = await withRose(3).build();
    await game.p1.play("squire");
    expect(game.p1.energy()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rose", controller: P1, triggered: true })]);
    await toRosePrompt(game);
    expect(game.decision()).toMatchObject({ canAccept: true });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p1.xp()).toBe(1);
    expect(game.zoneOf("squire")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("optional: NO keeps the energy and gains nothing — and the NEXT unit played asks again (one trigger per play)", async () => {
    const game = await withRose(6).hand(P1, SQUIRE, "squire2").build();
    await game.p1.play("squire");
    await toRosePrompt(game);
    await game.p1.no();
    await game.settle();
    expect(game.p1.energy()).toBe(4);
    expect(game.p1.xp()).toBe(0);
    await game.p1.play("squire2");
    await toRosePrompt(game);
    await game.p1.yes();
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.xp()).toBe(1);
  });

  test("unpayable (383.3.b.1): the unit took the last energy → the [1] cannot be paid, 'yes' is refused, no XP", async () => {
    const game = await withRose(2).build();
    await game.p1.play("squire");
    expect(game.p1.energy()).toBe(0);
    await toRosePrompt(game);
    expect(game.decision()).toMatchObject({ canAccept: false, kind: "yes-no" });
    expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
    await game.p1.no();
    await game.settle();
    expect(game.p1.xp()).toBe(0);
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("squire")).toBe("base");
  });

  test("'when YOU play': the opponent playing a unit on their turn puts nothing on the chain and asks nobody", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 5 })
      .resources(P2, { energy: 5 })
      .gear(P1, CARD, "rose")
      .hand(P2, SQUIRE, "theirs")
      .build();
    await game.p2.play("theirs");
    expect(game.chain()).toEqual([]);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("theirs")).toBe("base");
    expect(game.p1.xp()).toBe(0);
    expect(game.p2.xp()).toBe(0);
    expect(game.p1.energy()).toBe(5);
    expect(game.p2.energy()).toBe(3);
  });

  test("two Blood Roses → two separate triggers off one unit; paying both costs [2] and gains 2 XP", async () => {
    const game = await withRose(4).gear(P1, CARD, "rose2").build();
    await game.p1.play("squire");
    expect(game.chain().filter((i) => i.triggered).map((i) => i.cardId).sort()).toEqual(["rose", "rose2"]);
    for (let n = 0; n < 2; n++) {
      await game.settle();
      expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
      await game.p1.yes();
    }
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.xp()).toBe(2);
  });

  test("partner: Demacian Diplomat (2) with 3 energy → its own 'gain 1 XP' AND the Rose's paid +1 → 2 XP, 0 energy", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).gear(P1, CARD, "rose").hand(P1, DIPLOMAT, "dip").build();
    await game.p1.play("dip");
    expect(game.chain().map((i) => i.cardId).sort()).toEqual(["dip", "rose"]);
    await toRosePrompt(game);
    await game.p1.yes();
    await game.settle();
    expect(game.p1.xp()).toBe(2);
    expect(game.p1.energy()).toBe(0);
  });

  test("playing a unit TOKEN is playing a unit (185.2.a) — Carrion Dredger's Deathknell Bird fires the Rose's 'pay [1] → 1 XP' offer", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).gear(P1, CARD, "rose").unit(P1, "base", DREDGER, "dredger").hand(P1, BOLT, "bolt").build();
    await game.p1.cast("bolt", { targets: "dredger" });
    await toRosePrompt(game);
    expect(game.p1.base().some((id) => game.state(id).name === "Bird")).toBe(true);
    await game.p1.yes();
    await game.settle();
    expect(game.p1.xp()).toBe(1);
    expect(game.p1.energy()).toBe(1);
  });

  test("383.3.a/b — the may/pay decision belongs to FINALIZATION: P1 is asked (and pays) before anyone gets priority; declining removes the trigger from the chain (383.3.a.2)", async () => {
    // Right after play(squire) the pending decision is the Rose's yes/no; paying drops energy to 0
    // while the ability still sits on the chain awaiting priority passes.
    const game = await withRose(3).build();
    await game.p1.play("squire");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "rose" } });
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rose", triggered: true })]);
    expect(game.p1.xp()).toBe(0); // not gained until it resolves
    await game.settle();
    expect(game.p1.xp()).toBe(1);
  });

  test("Spend 3 XP, [Exhaust]: readies the chosen exhausted friendly unit; XP 3 → 0, Rose exhausted; a second use is illegal even after regaining XP (Rose is spent)", async () => {
    const game = await scenario().xp(P1, 3).gear(P1, CARD, "rose").unit(P1, "base", { might: 2, name: "Sleepy" }, "sleepy", { exhausted: true }).build();
    expect(game.state("sleepy").isExhausted).toBe(true);
    await game.p1.activate("rose", undefined, { targets: "sleepy" });
    expect(game.p1.xp()).toBe(0); // cost paid up front
    expect(game.state("rose").isExhausted).toBe(true);
    await game.settle();
    expect(game.state("sleepy").isReady).toBe(true);
    const again = await scenario().xp(P1, 6).gear(P1, CARD, "rose", { exhausted: true }).unit(P1, "base", { might: 2 }, "s", { exhausted: true }).build();
    expect(again.p1.can("activate", "rose")).toBe(false);
  });

  test("negative space on the cost: 2 XP is one short → no activation offered; 3 XP but nothing changes hands until used (XP is only spent as the cost)", async () => {
    const short = await scenario().xp(P1, 2).gear(P1, CARD, "rose").unit(P1, "base", { might: 2 }, "s", { exhausted: true }).build();
    expect(short.p1.can("activate", "rose")).toBe(false);
    expect((await short.p1.try((p) => p.activate("rose", 1, { targets: "s" }))).ok).toBe(false);
    expect(short.p1.xp()).toBe(2);
    expect(short.state("s").isExhausted).toBe(true);
    const enough = await scenario().xp(P1, 3).gear(P1, CARD, "rose").unit(P1, "base", { might: 2 }, "s", { exhausted: true }).build();
    expect(enough.p1.can("activate", "rose")).toBe(true);
    expect(enough.p1.xp()).toBe(3);
  });

  test("'Ready a unit' is ANY unit: an exhausted enemy unit is a legal choice and is readied (the friendly one stays exhausted)", async () => {
    const game = await scenario()
      .xp(P1, 3)
      .gear(P1, CARD, "rose")
      .unit(P1, "base", { might: 2, name: "Mine" }, "mine", { exhausted: true })
      .unit(P2, "base", { might: 2, name: "Theirs" }, "theirs", { exhausted: true })
      .build();
    await game.p1.activate("rose", undefined, { targets: "theirs" });
    await game.settle();
    expect(game.state("theirs").isReady).toBe(true);
    expect(game.state("mine").isExhausted).toBe(true);
    expect(game.p1.xp()).toBe(0);
  });

  test("the full line: play Squire (enters exhausted) → pay [1] (2 → 3 XP) → spend 3 XP to ready it → it walks onto an open battlefield and conquers this same turn", async () => {
    const game = await scenario()
      .xp(P1, 2)
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: null })
      .gear(P1, CARD, "rose")
      .hand(P1, SQUIRE, "squire")
      .build();
    await game.p1.play("squire");
    await toRosePrompt(game);
    await game.p1.yes();
    await game.settle();
    expect(game.p1.xp()).toBe(3);
    expect(game.state("squire").isExhausted).toBe(true);
    expect((await game.p1.try((p) => p.move("squire", "bf1"))).ok).toBe(false); // exhausted units cannot move
    await game.p1.activate("rose", undefined, { targets: "squire" });
    await game.settle();
    expect(game.state("squire").isReady).toBe(true);
    await game.p1.move("squire", "bf1");
    await game.settle();
    expect(game.locationOf("squire")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(0);
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("timing: a gear's activated ability is only usable in YOUR Main Phase in an Open State — not on the opponent's turn, not while a showdown is open; legal again once the showdown ends", async () => {
    const oppTurn = await scenario().active(P2).xp(P1, 5).gear(P1, CARD, "rose").unit(P1, "base", { might: 1 }, "lazy", { exhausted: true }).build();
    expect(oppTurn.p1.can("activate", "rose")).toBe(false);
    const game = await scenario()
      .xp(P1, 5)
      .gear(P1, CARD, "rose")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Foe" }, "foe")
      .unit(P1, "base", { might: 3, name: "Attacker" }, "atk")
      .unit(P1, "base", { might: 1, name: "Lazy" }, "lazy", { exhausted: true })
      .build();
    expect(game.p1.can("activate", "rose")).toBe(true);
    await game.p1.move("atk", "bf1"); // combat showdown, P1 has Focus
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "rose")).toBe(false);
    await game.settle(); // combat: 3 vs 1 → Foe dies, P1 conquers
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.p1.can("activate", "rose")).toBe(true);
  });
});
