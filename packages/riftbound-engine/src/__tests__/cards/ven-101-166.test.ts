/**
 * Gust Monk — ven-101-166 · Unit · Chaos · 2 energy · 2 Might
 *
 *   You may pay [1] as an additional cost to play me.
 *   When you play me, if you paid the additional cost, banish a card from any trash to give a unit
 *   [Assault 2] this turn. (+2 [Might] while it's an attacker.)
 *
 * Head-judge notes — the tricky situations for THIS card:
 *   1. Optional additional cost (356.2.b): declared as the Monk is played, +[1] on top of the base [2] → 3 total.
 *      With exactly 2 energy the plain play is legal but the paid variant is not; the [1] never replaces the [2].
 *   2. "if you paid the additional cost" sits right after the condition → part of the trigger condition
 *      (383.2.a.1): unpaid, NOTHING goes on the chain. Paid: the Monk is on the board at once, the trigger rides
 *      the chain and P2 gets priority before any Assault exists.
 *   3. "banish a card from any trash TO give …" is a cost within instructions at the start of the effect
 *      (383.3.b): ANY trash (yours or the opponent's — e.g. exile their Flow spell so it can never be Flowed),
 *      the banished card goes to its OWNER's banishment; with every trash empty the cost is unpayable and no
 *      Assault is granted even though [1] was paid.
 *   4. "a unit": any unit, either side, any location — the Monk itself included. Assault 2 "this turn" is a
 *      turn-scoped grant: it sums with printed Assault (807.2: Daring Poro → Assault 3), only adds Might while
 *      attacking (a 2-Might ally + Assault 2 beats a 3-Might defender), and is gone after the turn ends.
 *   5. Registry: additional-cost-option [1] is parsed; the trigger's effect is still `raw` text → effect BUGs.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-101-166";
const DARING_PORO = "ogn-210-298"; // 2-cost Order unit, [Assault] (1)
const BRITTLE_STEEL = "ven-003-166"; // Fury spell with [Flow] — a card worth exiling from the enemy trash
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla trash fodder

/** P1: `energy`, Monk in hand, a ready 2-Might ally in base, a Daring Poro, fodder in P1's trash, Brittle Steel in P2's trash; P2 holds bf1 with a 3-Might unit. */
function board(energy = 3) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P1, "base", DARING_PORO, "poro")
    .unit(P2, "bf1", { might: 3, name: "Defender" }, "def")
    .trash(P1, FILLER, "myJunk")
    .trash(P2, BRITTLE_STEEL, "theirFlow")
    .hand(P1, CARD, "monk");
}

/** Answer P1's prompts (yes / wanted picks in whatever order they come) until none apply. */
async function drive(game: Game, wants: string[]): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.seat !== P1) {
      return;
    }
    if (d.kind === "yes-no") {
      await game.p1.yes();
    } else if (d.kind === "pick") {
      const want = wants.find((w) => d.options.some((o) => o.card === w || o.key === w));
      if (want === undefined) {
        return;
      }
      wants.splice(wants.indexOf(want), 1);
      await game.p1.pick(want);
    } else {
      return;
    }
  }
}

/** Play the Monk paying [1], banish `banished`, give Assault 2 to `unit`, resolve everything. */
async function paidPlay(game: Game, banished: string, unit: string): Promise<void> {
  const wants = [banished, unit];
  await game.p1.play("monk", { payOptional: true });
  for (let i = 0; i < 3; i++) {
    await drive(game, wants);
    await game.settle();
  }
}

const assaultOf = (game: Game, unit: string) =>
  game
    .state(unit)
    .grantedKeywords.filter((k) => k.keyword === "Assault")
    .reduce((n, k) => n + (k.value ?? 1), 0);

describe("Gust Monk (ven-101-166)", () => {
  test("registry payload: 2-cost 2-Might chaos unit; an optional additional-cost-option of [1]; a play-self trigger gated on paid-additional-cost", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 2, might: 2, name: "Gust Monk" });
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({ effect: { additionalCost: ":rb_energy_1:", optional: true, type: "additional-cost-option" }, type: "static" });
    expect(def?.abilities?.[1]).toMatchObject({ condition: { type: "paid-additional-cost" }, trigger: { event: "play-self" }, type: "triggered" });
  });

  test("registry payload — the trigger's effect should model 'banish a card from any trash' (cost) → grant Assault 2 this turn to a unit, not raw text", async () => {
    // Expected: a structured effect mentioning banish (any trash) and a keyword grant {Assault, 2, turn}. Actual: {type: "raw"}.
    const trig = (await loadDefaultCardPool()).get(CARD)?.abilities?.[1] as { effect: { type: string } };
    expect(trig.effect.type).not.toBe("raw");
    expect(JSON.stringify(trig.effect)).toMatch(/banish/i);
    expect(JSON.stringify(trig.effect)).toMatch(/Assault/);
  });

  test("plain play: 2 energy, the Monk lands in base exhausted at 2 Might, NO trigger on the chain, both trashes untouched", async () => {
    const game = await board(3).build();
    await game.p1.play("monk", { payOptional: false });
    expect(game.p1.energy()).toBe(1);
    expect(game.zoneOf("monk")).toBe("base");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("monk")).toMatchObject({ isExhausted: true, might: 2 });
    expect(game.zoneOf("myJunk")).toBe("trash");
    expect(game.zoneOf("theirFlow")).toBe("trash");
    expect(assaultOf(game, "ally")).toBe(0);
  });

  test("cost gate: 1 energy → unplayable; exactly 2 → plain play only (paid variant rejected); 3 → the paid variant deducts all 3", async () => {
    expect((await board(1).build()).p1.can("play", "monk")).toBe(false);
    const two = await board(2).build();
    expect(two.p1.can("play", "monk")).toBe(true);
    const paid = await two.p1.try((p) => p.play("monk", { payOptional: true }));
    expect(paid.ok).toBe(false);
    expect(two.zoneOf("monk")).toBe("hand");
    const three = await board(3).build();
    await three.p1.play("monk", { payOptional: true });
    expect(three.p1.energy()).toBe(0);
    expect(three.zoneOf("monk")).toBe("base");
  });

  test("paid: the Monk is on the board immediately and its play trigger waits on the chain under P1's control; P2 gets priority before anything is granted", async () => {
    const game = await board(3).build();
    await game.p1.play("monk", { payOptional: true });
    await drive(game, ["myJunk", "ally"]); // any finalization-time prompts
    expect(game.zoneOf("monk")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "monk", controller: P1, triggered: true })]);
    expect(assaultOf(game, "ally")).toBe(0);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("paid → banish MY trash card (to my banishment) and give the ally Assault 2 this turn; gone after the turn ends", async () => {
    // Expected: myJunk in P1's banishment, ally.grantedKeywords = [{Assault, 2, turn}], cleared next turn. Actual: raw no-op.
    const game = await board(3).build();
    await paidPlay(game, "myJunk", "ally");
    expect(game.zoneOf("myJunk")).toBe("banishment");
    expect(game.p1.banishment()).toContain("myJunk");
    expect(game.state("ally").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 2 }]);
    expect(game.state("ally").might).toBe(2); // Assault adds nothing outside an attack
    await game.advanceTurn();
    expect(game.state("ally").grantedKeywords).toEqual([]);
  });

  test("'any trash' — the ENEMY's Brittle Steel can be banished (into ITS OWNER's banishment), denying their Flow", async () => {
    const game = await board(3).build();
    await paidPlay(game, "theirFlow", "ally");
    expect(game.zoneOf("theirFlow")).toBe("banishment");
    expect(game.p2.banishment()).toContain("theirFlow");
    expect(game.p1.banishment()).not.toContain("theirFlow");
    expect(assaultOf(game, "ally")).toBe(2);
  });

  test("Assault 2 matters in combat — the 2-Might ally attacks a 3-Might defender as a 4, kills it and conquers bf1", async () => {
    const game = await board(3).build();
    await paidPlay(game, "myJunk", "ally");
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("negative space: WITHOUT the grant the same 2-Might ally dies to the 3-Might defender and bf1 stays P2's", async () => {
    const game = await board(3).build();
    await game.p1.play("monk", { payOptional: false });
    await game.settle();
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.locationOf("def")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("Assault sums (807.2) — Daring Poro ([Assault]) given Assault 2 attacks as 2 + 3 = 5", async () => {
    const game = await board(3).unit(P2, "bf1", { might: 1, name: "Chump" }, "chump").build();
    await paidPlay(game, "myJunk", "poro");
    expect(assaultOf(game, "poro")).toBe(2); // the grant; the printed [Assault] is in keywords
    expect(game.state("poro").keywords).toContain("Assault");
    await game.p1.move("poro", "bf1");
    await game.settle();
    // 5 attacking Might vs defenders 3 + 1: both defenders die, the Poro (2 Might, takes 4) dies too — but the kill count proves the 5.
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("chump")).toBe("trash");
  });

  test("'a unit' has no side restriction — an ENEMY unit (or the Monk itself) is a legal recipient", async () => {
    const game = await board(3).build();
    await paidPlay(game, "myJunk", "def");
    expect(assaultOf(game, "def")).toBe(2);
    expect(game.zoneOf("myJunk")).toBe("banishment");
  });

  test("every trash empty: paying [1] still costs 3, but the banish cost is unpayable → no Assault is granted to anyone", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, CARD, "monk")
      .build();
    await game.p1.play("monk", { payOptional: true });
    expect(game.p1.energy()).toBe(0);
    for (let i = 0; i < 3; i++) {
      await drive(game, ["ally", "monk"]);
      await game.settle();
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(assaultOf(game, "ally")).toBe(0);
    expect(assaultOf(game, "monk")).toBe(0);
    expect(game.p1.banishment()).toEqual([]);
  });
});
