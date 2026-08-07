/**
 * Temporal Portal — sfd-078-221 · Gear · Mind · 3 energy
 *
 *   [rainbow], [Exhaust]: Give the next spell you play this turn [Repeat] equal to its cost.
 *   (You may pay the additional cost to repeat the spell's effect.)
 *
 * Head-judge checklist for this card:
 *  - Activation (377): cost = 1 power of ANY domain ([rainbow]) + exhausting the Portal; it is a
 *    normal ability → goes on the chain, own turn / Open state only (no [Action]/[Reaction]);
 *    exhausted or power-less → not activatable.
 *  - Effect (820, 206): the NEXT spell P1 plays this turn gains a Repeat instance whose cost equals
 *    that spell's printed cost — Energy AND Power (Premonition → [2][mind][mind][mind]). Paying it
 *    runs the effect twice as one chain item; not paying is allowed and still uses up the grant.
 *  - "next spell … this turn": only one spell; unused grant dies in the Expiration Step.
 *  - Stacking (820.1.c.2 / 820.3): a spell with printed Repeat (Downstage Dramatics) ends up with two
 *    payable instances → three executions; two Portals likewise give two instances.
 *  - Cost to play the gear: 3 energy, enters ready.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, Game } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-078-221";
const PREMONITION = "sfd-087-221"; // [Reaction] 2 + [mind]x3: Draw 3
const DOWNSTAGE = "unl-061-219"; // [Reaction] 2, Repeat [2]: Draw 1
/** A plain 2-cost Mind spell: draw 1. */
const STUDY = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 2,
  name: "Test Study",
  timing: "action",
} as const;

function board(power: Record<string, number> = { rainbow: 1 }, energy = 8) {
  return scenario().resources(P1, { energy, power }).gear(P1, CARD, "portal").hand(P1, STUDY, "study").hand(P1, STUDY, "study2");
}

const repeatOptions = (game: Game, spell: string) => game.p1.option("cast", spell)?.fields.find((f) => f.arg === "repeat")?.options ?? [];

async function openPortal(game: Game) {
  await game.p1.activate("portal");
  await game.settle();
}

describe("Temporal Portal (sfd-078-221)", () => {
  test("registry payload: one activated ability — cost [rainbow]+exhaust, effect 'NextSpellRepeat' for the controller this turn", async () => {
    const game = await board().build();
    expect(game.state("portal")).toMatchObject({ cardType: "gear", energyCost: 3, isReady: true, name: "Temporal Portal" });
    expect(peekDefaultCardPool()?.get(CARD)?.abilities).toEqual([
      {
        cost: { exhaust: true, power: ["rainbow"] },
        effect: { duration: "turn", keyword: "NextSpellRepeat", target: "controller", type: "grant-keyword" },
        type: "activated",
      },
    ]);
  });

  test("cost to play: 3 energy, enters the base ready; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "portal").build();
    await game.p1.play("portal");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("portal")).toBe("base");
    expect(game.state("portal").isReady).toBe(true);
    expect((await scenario().resources(P1, { energy: 2, power: { mind: 3 } }).hand(P1, CARD, "p").build()).p1.can("play", "p")).toBe(false);
  });

  test("activation: pays 1 power + exhausts, the ability goes on the chain (P2 may respond) and resolves; energy untouched", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "portal")).toBe(true);
    await game.p1.activate("portal");
    expect(game.p1.resources()).toEqual({ energy: 8, power: { rainbow: 0 } });
    expect(game.state("portal").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "portal", controller: P1, triggered: false })]);
    expect((game.decision() as ActionDecision).context).toBe("chain");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("[rainbow] is 'one power of any domain': a single [mind] power pays it; with no power or an exhausted Portal it is not activatable", async () => {
    const mind = await board({ mind: 1 }).build();
    expect(mind.p1.can("activate", "portal")).toBe(true);
    await mind.p1.activate("portal");
    expect(mind.p1.power()).toBe(0);
    expect(mind.state("portal").isExhausted).toBe(true);
    const broke = await board({}, 8).build();
    expect(broke.p1.can("activate", "portal")).toBe(false);
    const tapped = await scenario().resources(P1, { energy: 8, power: { rainbow: 2 } }).gear(P1, CARD, "portal", { exhausted: true }).hand(P1, STUDY, "study").build();
    expect(tapped.p1.can("activate", "portal")).toBe(false);
  });

  test("timing: no [Action]/[Reaction] on the ability — not on the opponent's turn, not onto an open chain", async () => {
    const opp = await board().active(P2).build();
    expect(opp.p1.can("activate", "portal")).toBe(false);
    const game = await board().build();
    await game.p1.cast("study");
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.p1.can("activate", "portal")).toBe(false);
    await game.settle();
    expect(game.p1.can("activate", "portal")).toBe(true);
  });

  test("without paying the Repeat the next spell plays normally (2 energy, one draw) — the grant never forces anything", async () => {
    const game = await board().build();
    await openPortal(game);
    const hand = game.p1.hand().length;
    await game.p1.cast("study");
    expect(game.p1.energy()).toBe(6);
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
  });

  test("'this turn': an unused grant expires with the turn — on P1's next turn Study offers no Repeat and the Portal is ready again", async () => {
    const game = await board().build();
    await openPortal(game);
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    expect(game.state("portal").isReady).toBe(true);
    expect(repeatOptions(game, "study")).not.toContain(1);
    const r = await game.p1.try((p) => p.cast("study", { repeat: 1 }));
    expect(r.ok).toBe(false);
  });

  test.failing("BUG: the next spell gains [Repeat] equal to its cost — Study (2) may be cast with repeat for 4 total and draws twice; the spell after it gets nothing", async () => {
    // Expected (820.1.d): after the Portal resolves, casting Study offers repeat=1 priced at Study's own
    // cost [2]; paying 2+2 leaves 4 energy and the single chain item draws 2. Study#2 afterwards has no
    // Repeat (grant consumed). Actual: the grant flag is set but no Repeat tier is ever offered.
    const game = await board().build();
    await openPortal(game);
    expect(repeatOptions(game, "study")).toContain(1);
    const hand = game.p1.hand().length;
    await game.p1.cast("study", { repeat: 1 });
    expect(game.p1.energy()).toBe(4);
    expect(game.chain()).toHaveLength(1); // 820.3.a: played once
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand - 1 + 2);
    expect(repeatOptions(game, "study2")).not.toContain(1);
  });

  test.failing("BUG: 'equal to its cost' includes Power (206) — Premonition's granted Repeat costs [2][mind][mind][mind]; paying it draws 6", async () => {
    // Expected: with 4 energy + 6 mind after activation, Premonition may be repeated once for its full
    // printed cost, ending at 0 energy / 0 mind with 6 cards drawn. Actual: no Repeat is offered.
    const game = await scenario().resources(P1, { energy: 4, power: { mind: 6, rainbow: 1 } }).gear(P1, CARD, "portal").hand(P1, PREMONITION, "premo").build();
    await openPortal(game);
    expect(repeatOptions(game, "premo")).toContain(1);
    await game.p1.cast("premo", { repeat: 1 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, rainbow: 0 } });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(6);
    // One short on power must not be allowed to repeat.
    const short = await scenario().resources(P1, { energy: 4, power: { mind: 5, rainbow: 1 } }).gear(P1, CARD, "portal").hand(P1, PREMONITION, "premo").build();
    await openPortal(short);
    expect((await short.p1.try((p) => p.cast("premo", { repeat: 1 }))).ok).toBe(false);
  });

  test.failing("BUG: stacks with printed Repeat (820.1.c.2/820.3) — Downstage Dramatics (Repeat [2]) gets a second instance: repeat=2 for 6 energy draws 3", async () => {
    // Expected: printed Repeat [2] + granted Repeat [2] = two instances, each payable once → repeat 0..2;
    // paying both costs 2+2+2 and the effect runs three times. Actual: only the printed tier exists (max 1).
    const game = await scenario().resources(P1, { energy: 6, power: { rainbow: 1 } }).gear(P1, CARD, "portal").hand(P1, DOWNSTAGE, "dd").build();
    expect(repeatOptions(game, "dd")).toEqual([1]); // before: just the printed one
    await openPortal(game);
    expect(repeatOptions(game, "dd")).toEqual(expect.arrayContaining([1, 2]));
    await game.p1.cast("dd", { repeat: 2 });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(3);
  });

  test.failing("BUG: two Portals activated the same turn give the next spell TWO Repeat instances (820.1.c.2) — Study repeat=2 for 6 draws 3", async () => {
    // Expected: each activation is its own grant → two instances on the next spell. Actual: the grant is
    // a per-player boolean and no tier is offered at all.
    const game = await scenario().resources(P1, { energy: 6, power: { rainbow: 2 } }).gear(P1, CARD, "portal").gear(P1, CARD, "portal2").hand(P1, STUDY, "study").build();
    await openPortal(game);
    await game.p1.activate("portal2");
    await game.settle();
    expect(repeatOptions(game, "study")).toEqual(expect.arrayContaining([1, 2]));
    await game.p1.cast("study", { repeat: 2 });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(3);
  });

  test("printed Repeat still works on its own next to a resting Portal (control: Downstage Dramatics repeat=1 for 4 draws 2)", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).gear(P1, CARD, "portal").hand(P1, DOWNSTAGE, "dd").build();
    expect(game.p1.can("activate", "portal")).toBe(false); // no power for the Portal
    await game.p1.cast("dd", { repeat: 1 });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.violations()).toEqual([]);
  });
});
