/**
 * Chemtech Cask — sfd-063-221 · Gear · Mind · 1 energy
 *
 *   When you play a spell on an opponent's turn, you may exhaust me to play a Gold gear token
 *   exhausted.
 *
 * Head-judge checklist for this card:
 *  - "on an opponent's turn" only: on your own turn a spell does nothing; the OPPONENT's own spells
 *    never count ("you play"). On their turn you can only get a spell in as a [Reaction] onto their
 *    chain or as an [Action]/[Reaction] with Focus in a showdown — both must trigger it.
 *  - "you may exhaust me" is a cost: an already-exhausted Cask cannot pay → no Gold; so at most one
 *    Gold per Cask per opponent turn (two spells → one Gold), but two Casks → two Gold off one spell.
 *    Declining leaves the Cask ready and makes nothing.
 *  - The Gold token (187.5) enters P1's base EXHAUSTED: it cannot be cashed the turn it arrives; it
 *    readies at P1's next Awaken and then sacrifices for [rainbow].
 *  - Timing (419.4.a / 359.3.e.10): "when you play a spell" triggers when the act of playing is
 *    completed by the spell's RESOLUTION (a countered spell never triggers it, 419.4.a.1); the
 *    trigger then sits above whatever is left of that chain and is answered before it continues.
 *  - Cost: 1 energy, gear enters ready (359.2.d).
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-063-221";
const PREMONITION = "sfd-087-221"; // Mind [Reaction] 2 + [mind]x3: Draw 3
const PUNCH_FIRST = "sfd-097-221"; // Body [Action] 1 + [body]x2: +5 Might this turn
/** The opponent's chain-opener: a plain slow spell. */
const SLOW = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Slow Draw",
  timing: "action",
} as const;

const golds = (game: Game, seat: "p1" | "p2" = "p1") => game[seat].base().filter((id) => game.state(id).name === "Gold");

/** P2's turn; P1 has `casks` ready Casks and two Premonitions with the resources for both. */
function oppTurn(casks = 1, caskMeta?: { exhausted?: boolean }) {
  const b = scenario().active(P2).resources(P1, { energy: 4, power: { mind: 6 } }).hand(P1, PREMONITION, "premo").hand(P1, PREMONITION, "premo2").hand(P2, SLOW, "slow").hand(P2, SLOW, "slow2");
  for (let i = 0; i < casks; i++) {
    b.gear(P1, CARD, i === 0 ? "cask" : `cask${i + 1}`, caskMeta);
  }
  return b;
}

/** P2 opens a chain with Slow Draw and passes; P1 answers with `spell`; drain to the Cask prompt (if any). */
async function respondWith(game: Game, spell: string, opener = "slow") {
  await game.p2.cast(opener);
  await game.p2.passPriority();
  expect(game.actingSeat()).toBe(P1);
  await game.p1.cast(spell);
  return game.settle();
}

describe("Chemtech Cask (sfd-063-221)", () => {
  test("registry payload: optional triggered ability — on controller's spell during opponent's turn, exhaust-cost, create exhausted Gold gear token", async () => {
    const game = await oppTurn().build();
    expect(game.state("cask")).toMatchObject({ cardType: "gear", energyCost: 1, isReady: true, name: "Chemtech Cask" });
    expect(peekDefaultCardPool()?.get(CARD)?.abilities).toEqual([
      {
        condition: { cost: { exhaust: true }, type: "pay-cost" },
        effect: { ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" },
        optional: true,
        trigger: { event: "play-spell", on: "controller", restrictions: [{ type: "during-turn", whose: "opponent" }] },
        type: "triggered",
      },
    ]);
  });

  test("cost: 1 energy to play; as a gear it enters the base READY (359.2.d); 0 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "cask").build();
    await game.p1.play("cask");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("cask")).toBe("base");
    expect(game.state("cask").isReady).toBe(true);
    expect((await scenario().resources(P1, { energy: 0, power: { mind: 2 } }).hand(P1, CARD, "c").build()).p1.can("play", "c")).toBe(false);
  });

  test("opponent's turn, P1 reacts with Premonition: asked 'exhaust Cask?', yes → Cask exhausted, one EXHAUSTED Gold token in P1's base", async () => {
    const game = await oppTurn().build();
    const stop = await respondWith(game, "premo");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 3 } });
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.state("cask").isExhausted).toBe(true);
    const g = golds(game);
    expect(g).toHaveLength(1);
    expect(game.state(g[0] as string)).toMatchObject({ cardType: "gear", controller: P1, isExhausted: true, isToken: true, name: "Gold" });
    expect(golds(game, "p2")).toEqual([]);
    expect(game.p1.hand()).toHaveLength(1 + 3); // premo2 + drew 3
    expect(game.turnPlayer()).toBe(P2);
  });

  test("priority is exclusive (312.2) — while P2 still holds priority over its own Slow Draw, P1's [Reaction] must not yet be legal", async () => {
    // Expected: right after P2 finalizes Slow Draw, P2 has priority; P1 may react only once P2 passes.
    // Actual: both seats have priority-class moves at once (singleDecisionCursor invariant fires).
    const game = await oppTurn().build();
    await game.p2.cast("slow");
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.can("cast", "premo")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("'you may': declining keeps the Cask ready and creates nothing", async () => {
    const game = await oppTurn().build();
    await respondWith(game, "premo");
    expect(game.decision()?.kind).toBe("yes-no");
    await game.p1.no();
    await game.settle();
    expect(game.state("cask").isReady).toBe(true);
    expect(golds(game)).toEqual([]);
  });

  test("negative space: a spell on your OWN turn never triggers it", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { mind: 3 } }).gear(P1, CARD, "cask").hand(P1, PREMONITION, "premo").build();
    await game.p1.cast("premo");
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.p1.hand()).toHaveLength(3);
    expect(game.state("cask").isReady).toBe(true);
    expect(golds(game)).toEqual([]);
  });

  test("negative space: the OPPONENT playing spells on their turn is not 'you play' — no prompt, no Gold", async () => {
    const game = await oppTurn().build();
    await game.p2.cast("slow");
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.state("cask").isReady).toBe(true);
    expect(golds(game)).toEqual([]);
  });

  test("the exhaust is a cost: an already-exhausted Cask cannot pay, so no Gold can be made", async () => {
    const game = await oppTurn(1, { exhausted: true }).build();
    const stop = await respondWith(game, "premo");
    if (stop.reason === "unanswered" && game.decision()?.kind === "yes-no") {
      expect(game.decision()).toMatchObject({ canAccept: false, kind: "yes-no", seat: P1 });
      await game.p1.no();
      await game.settle();
    }
    expect(golds(game)).toEqual([]);
    expect(game.p1.hand()).toHaveLength(4); // the spell itself still resolved
  });

  test("two spells in the same opponent turn: the first exhausts the Cask, the second cannot — exactly one Gold", async () => {
    const game = await oppTurn().build();
    await respondWith(game, "premo");
    await game.p1.yes();
    // Slow Draw is still on the chain; P1 reacts again with the second Premonition.
    for (let i = 0; i < 6 && !(game.actingSeat() === P1 && game.p1.can("cast", "premo2")); i++) {
      await game.acting().pass();
    }
    await game.p1.cast("premo2");
    const stop = await game.settle();
    if (stop.reason === "unanswered" && game.decision()?.kind === "yes-no") {
      expect(game.decision()).toMatchObject({ canAccept: false, seat: P1 });
      await game.p1.no();
      await game.settle();
    }
    expect(golds(game)).toHaveLength(1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  });

  test("two Casks, one spell: each triggers separately → two prompts, two exhausted Casks, two Gold", async () => {
    const game = await oppTurn(2).build();
    await respondWith(game, "premo");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.state("cask").isExhausted).toBe(true);
    expect(game.state("cask2").isExhausted).toBe(true);
    expect(golds(game)).toHaveLength(2);
  });

  test("the Gold arrives exhausted: not cashable now; after P1's next Awaken it (and the Cask) ready and Gold sacrifices for [rainbow]", async () => {
    const game = await oppTurn().build();
    await respondWith(game, "premo");
    await game.p1.yes();
    await game.settle();
    const gold = golds(game)[0] as string;
    expect(game.p1.can("activate", gold)).toBe(false);
    await game.advanceToTurnOf(P1);
    expect(game.state("cask").isReady).toBe(true);
    expect(game.state(gold).isReady).toBe(true);
    expect(game.p1.can("activate", gold)).toBe(true);
    await game.p1.activate(gold);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.p1.base()).not.toContain(gold);
  });

  test("an [Action] spell cast with Focus in a showdown on the opponent's turn also counts (Punch First on the defender → Gold)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1, power: { body: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .gear(P1, CARD, "cask")
      .hand(P1, PUNCH_FIRST, "pf")
      .build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("pf", { targets: "guard" });
    game.script(P1, ["yes"]);
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
      await game.settle();
    }
    expect(game.state("cask").isExhausted).toBe(true);
    expect(golds(game)).toHaveLength(1);
    expect(game.zoneOf("raider")).toBe("trash"); // 7 ≥ 4 — the spell still did its job
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("419.4.a / 359.3.e.10 — 'When you play a spell' triggers when the act of playing is COMPLETED BY THE SPELL'S RESOLUTION: no Cask prompt while Premonition sits on the chain; it appears once Premonition has resolved (hand +3), still inside P2's chain (Slow Draw underneath)", async () => {
    // (An earlier reading — trigger created as the spell is put on the chain, citing 359.3.b / 206.1 —
    // is contradicted by 419.4.a, 419.4.a.1 "countered → will not trigger" and the 359.3.e.10 example
    // "the unit's ability still triggers as the spell resolves".)
    const game = await oppTurn().build();
    await game.p2.cast("slow");
    await game.p2.passPriority();
    await game.p1.cast("premo");
    expect(game.chain().map((c) => c.cardId)).toEqual(["slow", "premo"]);
    expect(game.decision()?.kind).toBe("action"); // no trigger yet — nothing to finalize
    await game.p1.passPriority();
    await game.p2.passPriority(); // Premonition resolves → NOW the Cask trigger is created and finalized (its "you may exhaust")
    expect(game.zoneOf("premo")).toBe("trash");
    expect(game.p1.hand().sort()).toHaveLength(1 + 3);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.zoneOf("slow")).toBe("chain"); // still P2's chain: the Gold arrives before Slow Draw resolves
    await game.p1.yes();
    expect(game.state("cask").isExhausted).toBe(true);
    await game.settle();
    expect(golds(game)).toHaveLength(1);
  });
});
