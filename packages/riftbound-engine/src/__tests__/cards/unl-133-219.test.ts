/**
 * Blast Cone — unl-133-219 · Gear · Chaos · 4 energy + 1 [chaos]
 *
 *   When you play this, you may move an enemy unit.
 *   When you move an enemy unit, you may exhaust this to [Stun] it. (It doesn't deal combat damage this turn.)
 *
 * Rules: 149.1 (gear enters READY), 383.4.a (play effect → chain), 383.3.a ("you may"), 420 / 355.4
 * ("move an enemy unit": the mover picks the unit and a destination it can actually move to — never
 * where it already is), 450 (the moved unit contests its destination for ITS controller), 383.1 +
 * 359.3.f.4 ("When YOU move an enemy unit": the acting player is Blast Cone's controller and the unit is
 * an enemy — an opponent's own Standard Move, or me moving my own unit, is not it), 355.10.c.1
 * ("exhaust this to …" is a cost inside the effect: unpayable while already exhausted → no stun),
 * 423.1 (Stunned: contributes no Might in the combat damage step, 423.1.b; cleared at end of turn,
 * 423.1.a.2; still needs full lethal to die, 423.1.c).
 *
 * Head-judge checklist for THIS card:
 *  1. The two abilities chain: the play trigger's own move IS "you move an enemy unit", so a second
 *     trigger follows and (if the fresh, ready Cone is exhausted) stuns the very unit just moved.
 *  2. The stun matters in a fight: drag a 4-Might Bruiser onto my battlefield held by a 2-Might unit —
 *     stunned, it deals 0, fails to kill, and is sent home; unstunned, the same line kills my unit and
 *     conquers for the opponent.
 *  3. Cost gate: an already-exhausted Cone cannot pay "exhaust this" — the move still happens, no stun.
 *  4. Scope: the opponent walking their own unit, or me moving MY unit, never triggers it; another of MY
 *     effects moving an enemy (Charm) does.
 *  5. Declining either "you may" leaves everything else intact; the stun wears off at end of turn.
 */

import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-133-219";
const CHARM = "ogn-043-298"; // Calm spell 1 + [calm]: "Move an enemy unit."

const cards = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []);
const keys = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []);

/** Play the Cone, pass to its play trigger, accept it, choose `unit` (if asked) and send it to `dest`. Stops at the stun prompt. */
async function playAndMove(game: Game, unit: string, dest: string): Promise<void> {
  await game.p1.play("bc");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bc", controller: P1, triggered: true })]);
  // rule 402 (finalization): the "you may" and its target are asked at once, before priority
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "bc" } });
  await game.p1.yes();
  const d = game.decision();
  if (d?.kind === "pick" && d.semantics === "target") {
    await game.p1.pick(unit);
  }
  const r = await game.settle();
  expect(r.decision).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", source: { cardId: unit } });
  await game.p1.pick(dest);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "bc" } });
}

/** Open a staged combat if the engine left it as a turn-player option, then resolve everything. */
async function fight(game: Game, bf: string): Promise<void> {
  await game.settle();
  if (game.p1.can("startShowdown")) {
    await game.p1.choose(`startShowdown:${bf}`);
  }
  await game.settle();
  await game.settle();
}

/** P1 holds bf1 with Small (2); P2 has Bruiser (4) at home and Far (3) on bf2; the Cone is in P1's hand with exact cost. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Small" }, "small")
    .unit(P2, "base", { might: 4, name: "Bruiser" }, "bruiser")
    .unit(P2, "bf2", { might: 3, name: "Far" }, "far")
    .hand(P1, CARD, "bc");
}

describe("Blast Cone (unl-133-219)", () => {
  test("registry payload: an optional play-self trigger moving an ENEMY unit to a chosen destination, and an optional 'you move an enemy unit' trigger with an exhaust-self cost that stuns the moved unit", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "gear", domain: "chaos", energyCost: 4, name: "Blast Cone", powerCost: ["chaos"] });
    expect(def?.abilities).toEqual([
      {
        effect: { target: { controller: "enemy", type: "unit" }, to: "choose", type: "move" },
        optional: true,
        trigger: { event: "play-self" },
        type: "triggered",
      },
      {
        condition: { cost: { exhaust: true }, type: "pay-cost" },
        effect: { target: { type: "trigger-source" }, type: "stun" },
        optional: true,
        trigger: { event: "move", on: { actor: "controller", cardType: "unit", controller: "enemy" } },
        type: "triggered",
      },
    ]);
  });

  test("cost: 4 energy + 1 chaos; the gear lands in base READY (149.1) with its play trigger on the chain; 4 alone, 3 + chaos, or a fury power is not enough", async () => {
    const game = await board().build();
    await game.p1.play("bc");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.state("bc")).toMatchObject({ cardType: "gear", isReady: true, zone: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bc", triggered: true })]);
    for (const r of [{ energy: 4 }, { energy: 3, power: { chaos: 1 } }, { energy: 4, power: { fury: 1 } }]) {
      expect((await scenario().resources(P1, r).unit(P2, "base", { might: 1 }, "u").hand(P1, CARD, "bc").build()).p1.can("play", "bc")).toBe(false);
    }
  });

  test("play trigger: only ENEMY units are offered (Bruiser, Far — never Small); Bruiser from P2's base may go to bf1 or bf2 but not stay in base; it arrives still P2's and contests bf1 for P2 (450)", async () => {
    const game = await board().build();
    await game.p1.play("bc");
    await game.p1.yes(); // rule 402 (finalization)
    const pick = game.decision();
    expect(pick).toMatchObject({ kind: "pick", seat: P1, semantics: "target" });
    expect(cards(pick)).toEqual(["bruiser", "far"]);
    await game.p1.pick("bruiser");
    await game.settle();
    expect(keys(game.decision())).toEqual(["battlefield-bf1", "battlefield-bf2"]);
    await game.p1.pick("battlefield-bf1");
    expect(game.state("bruiser")).toMatchObject({ controller: P2, owner: P2, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
  });

  test("the abilities chain: the play trigger's move raises 'exhaust this to Stun it' — yes exhausts the fresh Cone and stuns exactly the moved unit", async () => {
    const game = await board().build();
    await playAndMove(game, "bruiser", "battlefield-bf1");
    expect(game.state("bc").isReady).toBe(true); // cost not yet paid
    await game.p1.yes();
    expect(game.state("bc").isExhausted).toBe(true); // rule 383.3.b.1: the exhaust cost is paid on "yes"
    await game.settle();
    expect(game.state("bruiser").isStunned).toBe(true);
    expect(game.state("far").isStunned).toBe(false);
    expect(game.state("small").isStunned).toBe(false);
  });

  test("the stun in combat (423.1.b): the stunned 4-Might Bruiser attacking my 2-Might Small deals nothing, fails, and is sent home unhurt; P1 keeps bf1 and P2 scores nothing", async () => {
    const game = await board().build();
    await playAndMove(game, "bruiser", "battlefield-bf1");
    await game.p1.yes();
    await fight(game, "bf1");
    expect(game.state("small")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("bruiser")).toMatchObject({ damage: 0, zone: "base" }); // 2 < 4: survives, recalled as the failed attacker
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("control line — declining the stun: the same Bruiser kills Small (4 ≥ 2) and conquers bf1 for P2; the Cone stays ready", async () => {
    const game = await board().build();
    await playAndMove(game, "bruiser", "battlefield-bf1");
    await game.p1.no();
    expect(game.state("bruiser").isStunned).toBe(false);
    await fight(game, "bf1");
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.locationOf("bruiser")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.state("bc").isReady).toBe(true);
  });

  test("declining the play trigger: nobody moves, no stun prompt follows, the Cone sits ready in base and P1 is back in an open main phase", async () => {
    const game = await board().build();
    await game.p1.play("bc");
    await game.settle();
    await game.p1.no();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.locationOf("bruiser")).toBe("base");
    expect(game.locationOf("far")).toBe("bf2");
    expect(game.state("bc")).toMatchObject({ isReady: true, zone: "base" });
    expect(game.state("bruiser").isStunned).toBe(false);
  });

  test("partner — Charm: with a ready Cone on the board, MY spell moving an enemy unit triggers it; yes → Cone exhausted, the charmed unit stunned in P2's base", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P2, "bf1", { might: 3, name: "Far" }, "far")
      .gear(P1, CARD, "bc")
      .hand(P1, CHARM, "charm")
      .build();
    expect(game.state("bc").isReady).toBe(true);
    await game.p1.cast("charm", { targets: "far" });
    const dest = await game.settle();
    expect(dest.decision).toMatchObject({ kind: "pick", semantics: "destination" });
    await game.p1.pick("base");
    expect(game.locationOf("far")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bc", controller: P1, triggered: true })]);
    // rule 402 (finalization): the stun trigger asks as soon as the move happens
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, canAccept: true });
    await game.p1.yes();
    expect(game.state("bc").isExhausted).toBe(true);
    await game.settle();
    expect(game.state("far")).toMatchObject({ controller: P2, isStunned: true, zone: "base" });
  });

  test("cost gate (355.10.c.1): an already-EXHAUSTED Cone cannot pay 'exhaust this' — the trigger may be raised but 'yes' is not legal, the unit still moves and is not stunned", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P2, "bf1", { might: 3, name: "Far" }, "far")
      .gear(P1, CARD, "bc", { exhausted: true })
      .hand(P1, CHARM, "charm")
      .build();
    await game.p1.cast("charm", { targets: "far" });
    await game.settle();
    await game.p1.pick("base");
    const r = await game.settle();
    if (r.reason === "unanswered") {
      expect(r.decision).toMatchObject({ canAccept: false, kind: "yes-no", seat: P1 });
      expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
      await game.p1.no();
      await game.settle();
    }
    expect(game.locationOf("far")).toBe("base");
    expect(game.state("far").isStunned).toBe(false);
    expect(game.state("bc").isExhausted).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("scope — 'when YOU move an ENEMY unit': the opponent's own Standard Move on their turn, and my Standard Move of my own unit on mine, raise nothing", async () => {
    const theirs = await scenario().active(P2).battlefield("bf1", { controller: P2 }).unit(P2, "base", { might: 3 }, "walker").gear(P1, CARD, "bc").build();
    await theirs.p2.move("walker", "bf1");
    expect(theirs.chain()).toEqual([]);
    expect((await theirs.settle()).reason).toBe("open");
    expect(theirs.state("walker").isStunned).toBe(false);
    expect(theirs.state("bc").isReady).toBe(true);
    const mine = await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "base", { might: 3 }, "mine").unit(P2, "base", { might: 1 }, "foe").gear(P1, CARD, "bc").build();
    await mine.p1.move("mine", "bf1");
    expect(mine.chain()).toEqual([]);
    expect((await mine.settle()).reason).toBe("open");
    expect(mine.state("mine").isStunned).toBe(false);
    expect(mine.state("bc").isReady).toBe(true);
  });

  test("'this turn' (423.1.a.2): the stun is gone once the turn ends, and the Cone readies in P1's next Awaken", async () => {
    const game = await board().build();
    await playAndMove(game, "bruiser", "battlefield-bf2"); // park it with Far on P2's own battlefield: no combat
    await game.p1.yes();
    await game.settle();
    expect(game.state("bruiser")).toMatchObject({ isStunned: true, zone: "battlefield-bf2" });
    await game.advanceTurn(); // → P2
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("bruiser").isStunned).toBe(false);
    expect(game.state("bc").isExhausted).toBe(true); // still — it readies on P1's turn
    await game.advanceTurn(); // → P1
    expect(game.state("bc").isReady).toBe(true);
  });
});
