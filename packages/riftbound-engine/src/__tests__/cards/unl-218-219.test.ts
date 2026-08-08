/**
 * Valley of Idols — unl-218-219 · Battlefield
 *
 *   When a player plays a unit here, they may pay [1] to [Buff] it. (Give it a +1 [Might] buff if it
 *   doesn't have one.)
 *
 * Rules: 190.6.c (a battlefield ability that names "a player … they" is controlled by THAT player — they
 * put it on the chain, choose, and pay — regardless of who controls the battlefield), 444.2 (Pay inside an
 * effect is optional; not paying skips the rest), 359.2.c (a unit enters at the chosen location — "here"
 * means this battlefield only, not the base or another battlefield), 702 (a buff is a persistent +1 Might
 * marker, max one per unit — not a "this turn" modifier), 801 (Accelerate is an additional cost paid on
 * the play; the Valley's [1] comes on top, from what is left).
 *
 * Head-judge notes — the tricky spots for this card:
 *   1. WHERE: only a unit played to the Valley triggers it; the same unit played to base or to another
 *      controlled battlefield gets no offer.
 *   2. WHO pays: "they" = the player who played the unit; P2 playing at a P2-held Valley pays from P2's
 *      pool and P1 is never asked (190.6.c).
 *   3. WHEN the [1] is checked: after the unit's own cost (and Accelerate) has been paid — exactly-enough
 *      energy for the unit leaves nothing for the Valley (no buff, nothing owed); Kai'Sa for 4 + [1][fury]
 *      Accelerate + [1] Valley drains a 6-energy pool to 0 and she is ready AND buffed.
 *   4. Optional: declining keeps the energy and leaves the unit unbuffed.
 *   5. A buff, not a pump: it survives into later turns.
 *   Partner used: Kai'Sa, Survivor (ogn-039-298 · 4 · Accelerate [1][fury] · 4 Might).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-218-219";
const KAISA_SURVIVOR = "ogn-039-298";
const RECRUIT = { cardType: "unit", energyCost: 2, might: 2, name: "Idol Hopeful" };

/** P1's turn with `energy`; P1 controls the Valley (live text) and bf2; a 2-cost 2-Might Hopeful in hand. */
function board(energy = 4) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("valley", { controller: P1, def: CARD, inert: false })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "valley", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "bf2", { might: 2, name: "Other Holder" }, "holder2")
    .hand(P1, RECRUIT, "hopeful");
}

describe("Valley of Idols (unl-218-219)", () => {
  test("registry payload — the trigger must be restricted to units played HERE and the buff must land on the PLAYED unit, paid for with [1] by that player", async () => {
    // Expected: trigger { event: play-unit, on: any-player, location: here }, optional pay-[1] cost, effect buff
    // targeting the triggering unit. Actual: no `here` restriction at all and `effect.target` is "self"
    // (the battlefield), so the printed text is not what the payload says.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Valley of Idols" });
    const abilities = (def?.abilities ?? []) as { type: string; optional?: boolean; trigger?: Record<string, unknown>; effect?: Record<string, unknown>; condition?: Record<string, unknown> }[];
    expect(abilities).toHaveLength(1);
    const [a] = abilities;
    expect(a).toMatchObject({ optional: true, trigger: { event: "play-unit", on: "any-player" }, type: "triggered" });
    expect(JSON.stringify(a?.condition ?? a?.effect)).toMatch(/"energy":1/); // pay [1]
    expect(a?.effect?.type).toBe("buff");
    expect(a?.trigger?.location).toBe("here");
    expect(a?.effect?.target).not.toBe("self");
  });

  test("P1 plays a 2-cost unit to the Valley with 4 energy → P1 is offered 'pay [1] to buff'; yes → 1 energy left, the Hopeful is buffed to 3", async () => {
    // Expected: yes/no for P1 sourced from the Valley; accepting deducts 1 more and buffs the new unit.
    // Actual: no prompt ever appears; the unit sits at 2 Might unbuffed with 2 energy floating.
    const game = await board(4).build();
    await game.p1.play("hopeful", { to: "valley" });
    expect(game.p1.energy()).toBe(2); // the unit's own cost is paid first
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "valley" } });
    await game.p1.yes();
    await game.settle();
    expect(game.locationOf("hopeful")).toBe("valley");
    expect(game.p1.energy()).toBe(1);
    expect(game.state("hopeful")).toMatchObject({ baseMight: 2, isBuffed: true, might: 3 });
    expect(game.state("holder").isBuffed).toBe(false); // "it" = the played unit, nobody else
    expect(game.state("valley").isBuffed).toBe(false);
  });

  test("'they may' — P1 is asked and declines: energy stays at 2, the Hopeful stays an unbuffed 2", async () => {
    // Expected: the offer appears and `no` leaves everything as is. Actual: the offer never appears.
    const game = await board(4).build();
    await game.p1.play("hopeful", { to: "valley" });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.p1.energy()).toBe(2);
    expect(game.state("hopeful")).toMatchObject({ isBuffed: false, might: 2 });
  });

  test("negative: 'here' only — the same unit played to P1's BASE gets no offer (2 energy left, unbuffed)", async () => {
    const game = await board(4).build();
    await game.p1.play("hopeful", { to: "base" });
    await game.settle();
    expect(game.zoneOf("hopeful")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(2);
    expect(game.state("hopeful").isBuffed).toBe(false);
  });

  test("negative: 'here' only — played to ANOTHER battlefield P1 controls (bf2) gets no offer either", async () => {
    const game = await board(4).build();
    await game.p1.play("hopeful", { to: "bf2" });
    await game.settle();
    expect(game.locationOf("hopeful")).toBe("bf2");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(2);
    expect(game.state("hopeful").isBuffed).toBe(false);
  });

  test("exactly enough for the unit and nothing for the Valley (2 energy, 2-cost unit): no payable offer, no buff, pool at 0 (444.2)", async () => {
    const game = await board(2).build();
    await game.p1.play("hopeful", { to: "valley" });
    const d = game.decision();
    // Either no offer at all or an offer that cannot be accepted — never a free buff, never negative energy.
    expect(d?.kind !== "yes-no" || d.canAccept === false).toBe(true);
    if (d?.kind === "yes-no") {
      await game.p1.no();
    }
    await game.settle();
    expect(game.locationOf("hopeful")).toBe("valley");
    expect(game.p1.energy()).toBe(0);
    expect(game.state("hopeful").isBuffed).toBe(false);
  });

  test("'a player … they' (190.6.c) — P2 playing a unit at a P2-held Valley on P2's turn is the one asked and the one paying; P1's pool is untouched", async () => {
    // Expected: yes/no for P2; yes → P2 4−2−1 = 1, unit buffed; P1 keeps 3. Actual: no prompt, no buff.
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3 })
      .resources(P2, { energy: 4 })
      .battlefield("valley", { controller: P2, def: CARD, inert: false })
      .unit(P2, "valley", { might: 2, name: "Their Holder" }, "theirHolder")
      .hand(P2, RECRUIT, "theirHopeful")
      .build();
    await game.p2.play("theirHopeful", { to: "valley" });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.yes();
    await game.settle();
    expect(game.p2.energy()).toBe(1);
    expect(game.p1.energy()).toBe(3);
    expect(game.state("theirHopeful")).toMatchObject({ controller: P2, isBuffed: true, might: 3 });
  });

  test("stacks on top of Accelerate — Kai'Sa to the Valley for 4 + [1][fury] (Accelerate) + [1] (Valley) empties a 6-energy pool: ready, buffed, 5 Might", async () => {
    // Expected: 6 → 2 (cost) → 1 (Accelerate) → 0 (Valley); Kai'Sa ready and buffed (4+1). Actual: no
    // Valley offer — she is a ready, unbuffed 4 with 1 energy floating.
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 1 } })
      .battlefield("valley", { controller: P1, def: CARD, inert: false })
      .unit(P1, "valley", { might: 2, name: "Holder" }, "holder")
      .hand(P1, KAISA_SURVIVOR, "kaisa")
      .build();
    await game.p1.play("kaisa", { accelerate: true, to: "valley" });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.locationOf("kaisa")).toBe("valley");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.state("kaisa")).toMatchObject({ baseMight: 4, isBuffed: true, isExhausted: false, might: 5 });
  });

  test("it is a BUFF, not a pump — the +1 survives into later turns (still a buffed 3 on P1's next turn)", async () => {
    // Expected: buffed now and two turn-passes later. Actual: never buffed.
    const game = await board(4).build();
    await game.p1.play("hopeful", { to: "valley" });
    expect(game.decision()?.kind).toBe("yes-no");
    await game.p1.yes();
    await game.settle();
    expect(game.state("hopeful")).toMatchObject({ isBuffed: true, might: 3 });
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.locationOf("hopeful")).toBe("valley");
    expect(game.state("hopeful")).toMatchObject({ isBuffed: true, might: 3 });
  });

  test("negative: with the Valley inert the play is plain — proves any offer comes from the Valley's text (and the board is otherwise sound)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("valley", { controller: P1, def: CARD, inert: true })
      .unit(P1, "valley", { might: 2 }, "holder")
      .hand(P1, RECRUIT, "hopeful")
      .build();
    await game.p1.play("hopeful", { to: "valley" });
    await game.settle();
    expect(game.locationOf("hopeful")).toBe("valley");
    expect(game.state("hopeful")).toMatchObject({ isBuffed: false, isExhausted: true, might: 2 });
    expect(game.p1.energy()).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
