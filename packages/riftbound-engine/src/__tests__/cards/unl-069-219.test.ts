/**
 * Sprite Burst — unl-069-219 · Spell · Mind · 5 energy (no power) · standard timing (no [Action]/[Reaction])
 *
 *   Play two ready 3 [Might] Sprite unit tokens with [Temporary]. (Kill each at the start of its
 *   controller's Beginning Phase, before scoring.)
 *
 * Head-judge notes — the tricky spots for this card:
 *   1. TWO separate token plays: each Sprite gets its own destination (base or a battlefield YOU control,
 *      never an enemy/uncontrolled one), so they may split; both enter READY (184.1) although units
 *      normally enter exhausted; each is a real 3-Might domainless unit token (187.2) costing 0 (185.3.a.1).
 *   2. [Temporary] (816) fires at the start of the CONTROLLER's Beginning Phase — the opponent's turn
 *      start leaves them alone — and "before scoring" matters: Sprites that are the only thing holding a
 *      battlefield die first, control lapses (190.4.c) and the Hold point is NOT scored (469.2). A real unit
 *      in the same seat would have scored — the control case proves the setup.
 *   3. 186.1: dead tokens cease to exist — they never show up in the trash.
 *   4. No [Action]: not castable in a showdown even with Focus, nor on the opponent's turn; 4 energy is short.
 *   5. Ready 3-Might bodies can swing the same turn: both Sprites move out and conquer a 5-Might holder together.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-069-219";

const sprites = (game: Game, ids: string[]) => ids.filter((id) => game.state(id).isToken && game.state(id).name === "Sprite");

function board(energy = 5) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 5, name: "Foe" }, "foe")
    .hand(P1, CARD, "sb");
}

/** Cast Sprite Burst and answer the two destination prompts. */
async function burst(game: Game, first: string, second: string): Promise<void> {
  await game.p1.cast("sb");
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  await game.p1.pick(first);
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  await game.p1.pick(second);
  await game.settle();
}

describe("Sprite Burst (unl-069-219)", () => {
  test("costs 5 energy; puts TWO ready 3-Might domainless Sprite unit tokens with [Temporary] into the base; spell → trash; 4 energy is not enough", async () => {
    const game = await board().build();
    await game.p1.cast("sb");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sb", controller: P1, triggered: false })]);
    expect(sprites(game, game.p1.units())).toHaveLength(0); // nothing before resolution
    await game.settle();
    await game.p1.pick("base");
    await game.settle();
    await game.p1.pick("base");
    await game.settle();
    const toks = sprites(game, game.p1.base());
    expect(toks).toHaveLength(2);
    for (const t of toks) {
      expect(game.state(t)).toMatchObject({ baseMight: 3, cardType: "unit", controller: P1, energyCost: 0, isReady: true, isToken: true, might: 3, owner: P1 });
      expect(game.state(t).keywords).toContain("Temporary");
      expect(game.state(t).domains).toEqual([]);
      expect(game.state(t).powerCost).toEqual([]);
    }
    expect(sprites(game, game.p2.units())).toHaveLength(0);
    expect(game.zoneOf("sb")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
    expect((await board(4).build()).p1.can("cast", "sb")).toBe(false);
  });

  test("each token picks its own destination — base or a battlefield you CONTROL (bf1); the enemy bf2 and the empty bf3 are never offered; the pair may split", async () => {
    const game = await board().build();
    await game.p1.cast("sb");
    await game.settle();
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["base", "battlefield-bf1"]);
    expect((await game.p1.try((p) => p.pick("battlefield-bf2"))).ok).toBe(false);
    expect((await game.p1.try((p) => p.pick("battlefield-bf3"))).ok).toBe(false);
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    await game.p1.pick("base");
    await game.settle();
    expect(sprites(game, game.p1.units("bf1"))).toHaveLength(1);
    expect(sprites(game, game.p1.base())).toHaveLength(1);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 }); // own bf: no showdown
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("[Temporary]: both Sprites survive the OPPONENT's turn start and are killed at the start of P1's next Beginning Phase; as tokens they cease to exist (not in any trash, 186.1)", async () => {
    const game = await board().build();
    await burst(game, "base", "base");
    const toks = sprites(game, game.p1.base());
    expect(toks).toHaveLength(2);
    await game.advanceTurn(); // → P2's turn: P2's Beginning Phase is not the controller's
    expect(game.turnPlayer()).toBe(P2);
    expect(sprites(game, game.p1.base())).toHaveLength(2);
    await game.advanceTurn(); // → P1's turn: killed in the Beginning Phase
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(sprites(game, game.p1.units())).toHaveLength(0);
    for (const t of toks) {
      expect(game.p1.trash()).not.toContain(t);
      expect(game.has(t) ? game.zoneOf(t) : "gone").not.toBe("base");
    }
    expect(game.p1.trash()).toEqual(["sb"]);
  });

  test("'before scoring': two Sprites alone on bf3 conquer it now (+1), but die BEFORE the Hold on P1's next turn — control lapses and no Hold point is scored", async () => {
    const game = await board().build();
    await burst(game, "base", "base");
    const toks = sprites(game, game.p1.base());
    await game.p1.move(toks, "bf3"); // ready tokens can take the Standard Move right away
    await game.settle();
    expect(game.gameState.battlefields.bf3?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1); // conquer
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(sprites(game, game.p1.units())).toHaveLength(0);
    expect(game.p1.points()).toBe(2); // +1 for holding bf1 (Holder) only — nothing for bf3
    expect(game.gameState.battlefields.bf3?.controller).toBeNull();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("control for 'before scoring': the same line with a REAL 3-Might unit parked on bf3 does score the Hold (conquer 1 + hold bf1 + hold bf3 = 3)", async () => {
    const game = await board().unit(P1, "base", { might: 3, name: "Sticky" }, "sticky").build();
    await game.p1.move("sticky", "bf3");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.locationOf("sticky")).toBe("bf3");
    expect(game.p1.points()).toBe(3);
  });

  test("ready bodies fight this turn: both Sprites march from base into P2's bf2 and their 3+3 kills the 5-Might Foe; one Sprite survives the 5 back and conquers", async () => {
    const game = await board().build();
    await burst(game, "base", "base");
    const toks = sprites(game, game.p1.base());
    await game.p1.move(toks, "bf2");
    expect(game.state(toks[0]!).combatRole).toBe("attacker");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash"); // 6 ≥ 5
    // Foe's 5 must be assigned lethally in order: 3 kills one Sprite, the remaining 2 < 3 on the other.
    expect(sprites(game, game.p1.units("bf2"))).toHaveLength(1);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.trash()).toEqual(["sb"]); // the dead Sprite token is simply gone
  });

  test("timing: no [Action]/[Reaction] — not castable on the opponent's turn, nor inside a showdown even while holding Focus, nor with a spell already on the chain", async () => {
    const oppTurn = await board().active(P2).build();
    expect(oppTurn.p1.can("cast", "sb")).toBe(false);

    const showdown = await board().unit(P1, "base", { might: 1, name: "Poke" }, "poke").build();
    await showdown.p1.move("poke", "bf2");
    expect(showdown.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // P1 has Focus
    expect(showdown.p1.can("cast", "sb")).toBe(false);

    const chain = await board()
      .hand(P1, { abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }], cardType: "spell", domain: "mind", energyCost: 0, name: "Cantrip", timing: "action" }, "cantrip")
      .build();
    await chain.p1.cast("cantrip");
    expect(chain.p1.can("cast", "sb")).toBe(false);
    await chain.settle();
    expect(chain.p1.can("cast", "sb")).toBe(true);
  });

  test("the tokens are P1's even with no battlefield to offer: with zero controlled battlefields both Sprites simply land in the base", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).battlefield("bf2", { controller: P2 }).unit(P2, "bf2", { might: 5 }, "foe").hand(P1, CARD, "sb").build();
    await game.p1.cast("sb");
    await game.settle({ policy: "first" }); // a lone "base" destination may be forced or asked — either way take it
    expect(sprites(game, game.p1.base())).toHaveLength(2);
    expect(sprites(game, [...game.p1.units("bf2"), ...game.p2.units()])).toHaveLength(0);
    expect(game.zoneOf("sb")).toBe("trash");
  });

  test("registry payload: a 5-cost Mind spell at standard speed whose single effect plays 2 READY 3-Might 'Sprite' unit tokens carrying [Temporary]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "mind", energyCost: 5, name: "Sprite Burst" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.timing ?? "standard").toBe("standard"); // printed text has no [Action]/[Reaction] line
    expect(def?.abilities).toEqual([
      {
        effect: { amount: 2, ready: true, token: { keywords: ["Temporary"], might: 3, name: "Sprite", type: "unit" }, type: "create-token" },
        type: "spell",
      },
    ]);
  });
});
