/**
 * The Academy — unl-216-219 · Battlefield
 *
 *   When you hold here, give your next spell this turn [Repeat] equal to its base cost.
 *   (You may pay the additional cost to repeat the spell's effect.)
 *
 * Rules: 383.4.d.2.b / 471.2.b (a battlefield's "When you hold here" is the HOLDER's Hold Effect,
 * chained in the Beginning Phase), 820 (Repeat: an optional additional cost paid as the spell is
 * played; each paid instance = one extra execution of the same chain item, 820.3/820.3.a; instances from
 * different sources are separately payable, 820.1.c.2), 206 ("base cost" = the printed Energy AND Power
 * cost, ignoring reductions), 317.2.c ("this turn" — an unused grant dies in the Expiration Step),
 * 101 ("next spell": exactly one spell, whether or not its Repeat is paid; a unit played in between is
 * not a spell).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. The grant is made in the Beginning Phase but only matters in the Main Phase: after the turn rolls
 *     in, P1's first spell offers a Repeat priced at that spell's own printed cost (Study 2 → +2;
 *     Premonition 2+[mind]×3 → +2+[mind]×3), one chain item, effect twice.
 *  2. "Next spell" is consumed by the first spell even if its Repeat is NOT paid; a unit played first does
 *     not consume it; the second spell of the turn never has it.
 *  3. "This turn": lose the Academy before your next turn and the old grant is simply gone.
 *  4. Stacking: Downstage Dramatics (printed Repeat [2]) ends up with two instances → repeat 2 → three
 *     draws; Blue Sentinel on the Academy doubles the hold effect → two granted instances on one spell.
 *  5. Partner: Marai Spire also held → the granted [2] tier costs [1].
 *  6. Hold only: conquering the Academy, or the opponent's Beginning Phase, grants nothing.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-216-219";
const PREMONITION = "sfd-087-221"; // [Reaction] 2 + [mind][mind][mind]: Draw 3.
const DOWNSTAGE = "unl-061-219"; // [Reaction] 2, Repeat [2]: Draw 1.
const MARAI_SPIRE = "sfd-211-221"; // While you control this battlefield, friendly [Repeat] costs cost [1] less.
const BLUE_SENTINEL = "unl-087-219"; // your hold effects for holding here trigger an additional time
/** Inline plain 2-cost spell: draw 1. */
const STUDY = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 2,
  name: "Quiet Study",
  timing: "action",
} as const;

const repeatMax = (game: Game, spell: string): number =>
  (game.p1.option("cast", spell)?.fields.find((f) => f.name === "repeatCount")?.max as number | undefined) ?? 0;

/** End of P2's turn 2; P1 controls the live Academy with a 3-Might Scholar on it and holds two Studies. */
function aboutToHold() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("academy", { controller: P1, def: CARD, inert: false, owner: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "academy", { might: 3, name: "Scholar" }, "scholar")
    .hand(P1, STUDY, "study")
    .hand(P1, STUDY, "study2");
}

/** Roll into P1's open Main Phase and set P1's pool to exactly `energy` (+ optional power), runes tapped out of the way. */
async function intoP1Main(game: Game, energy: number, power: Record<string, number> = {}) {
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("main");
  await game.p1.tapRunes(game.p1.runes({ ready: true }).length);
  await game.p1.do("addResources", { energy: energy - game.p1.energy(), power });
  expect(game.p1.energy()).toBe(energy);
}

describe("The Academy (unl-216-219)", () => {
  test("registry payload: one hold-here trigger granting the controller a this-turn 'NextSpellRepeat'", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "The Academy" });
    expect(def?.abilities).toEqual([
      {
        effect: { duration: "turn", keyword: "NextSpellRepeat", target: "controller", type: "grant-keyword" },
        trigger: { event: "hold", on: { controller: "friendly", location: "here" } },
        type: "triggered",
      },
    ]);
  });

  test("holding: 1 point and the Academy's trigger on the chain under P1 in the Beginning Phase; before that, Study has no Repeat at all", async () => {
    const game = await aboutToHold().build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "academy", controller: P1, triggered: true })]);
    const cold = await scenario().resources(P1, { energy: 8 }).hand(P1, STUDY, "study").build();
    expect(repeatMax(cold, "study")).toBe(0);
    expect((await cold.p1.try((p) => p.cast("study", { repeat: 1 }))).ok).toBe(false);
  });

  test("the payoff: in the Main Phase P1's next spell (Study, 2) offers Repeat priced at its own cost — 2 + 2 = 4 paid, ONE chain item, two draws", async () => {
    const game = await aboutToHold().build();
    await intoP1Main(game, 8);
    expect(repeatMax(game, "study")).toBe(1);
    const hand0 = game.p1.hand().length;
    await game.p1.cast("study", { repeat: 1 });
    expect(game.p1.energy()).toBe(4);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "study", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 2);
    expect(game.violations()).toEqual([]);
  });

  test("'next spell' only: after the repeated Study, Study#2 the same turn has no Repeat (plain 2, one draw)", async () => {
    const game = await aboutToHold().build();
    await intoP1Main(game, 8);
    await game.p1.cast("study", { repeat: 1 });
    await game.settle();
    expect(repeatMax(game, "study2")).toBe(0);
    const hand0 = game.p1.hand().length;
    await game.p1.cast("study2");
    expect(game.p1.energy()).toBe(2);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
  });

  test("the grant is used up by the next spell even when its Repeat is NOT paid: Study cast plain (2), then Study#2 offers nothing", async () => {
    const game = await aboutToHold().build();
    await intoP1Main(game, 8);
    expect(repeatMax(game, "study")).toBe(1);
    await game.p1.cast("study");
    expect(game.p1.energy()).toBe(6);
    await game.settle();
    expect(repeatMax(game, "study2")).toBe(0);
    expect((await game.p1.try((p) => p.cast("study2", { repeat: 1 }))).ok).toBe(false);
  });

  test("a UNIT is not a spell: playing a unit first does not consume the grant — the Study after it still repeats", async () => {
    const game = await aboutToHold().hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Freshman" }, "freshman").build();
    await intoP1Main(game, 8);
    await game.p1.play("freshman", { to: "base" });
    await game.settle();
    expect(game.zoneOf("freshman")).toBe("base");
    expect(repeatMax(game, "study")).toBe(1);
    await game.p1.cast("study", { repeat: 1 });
    expect(game.p1.energy()).toBe(8 - 1 - 4);
  });

  test("'equal to its base cost' includes Power (206): Premonition (2 + [mind]×3) repeats for another 2 + [mind]×3 → 6 cards; one mind short → no Repeat offered", async () => {
    const game = await aboutToHold().hand(P1, PREMONITION, "premo").build();
    await intoP1Main(game, 4, { mind: 6 });
    expect(repeatMax(game, "premo")).toBe(1);
    const hand0 = game.p1.hand().length;
    await game.p1.cast("premo", { repeat: 1 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 6);
    const short = await aboutToHold().hand(P1, PREMONITION, "premo").build();
    await intoP1Main(short, 4, { mind: 5 });
    expect(short.p1.can("cast", "premo")).toBe(true);
    expect(repeatMax(short, "premo")).toBe(0);
  });

  test("stacks with printed Repeat (820.1.c.2): Downstage Dramatics gets a second instance → repeat 2 for 2+2+2 = 6, three draws", async () => {
    const game = await aboutToHold().hand(P1, DOWNSTAGE, "dd").build();
    await intoP1Main(game, 6);
    expect(repeatMax(game, "dd")).toBe(2);
    const hand0 = game.p1.hand().length;
    await game.p1.cast("dd", { repeat: 2 });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 3);
  });

  test("'this turn': hold, cast nothing, walk the Scholar home (Academy lost at cleanup) — on P1's next turn there is no hold and Study has no Repeat", async () => {
    const game = await aboutToHold().build();
    await intoP1Main(game, 8);
    expect(repeatMax(game, "study")).toBe(1); // the grant is live now
    await game.p1.move("scholar", "base");
    await game.settle();
    expect(game.gameState.battlefields.academy?.controller).toBe(null);
    const pts = game.p1.points();
    await game.advanceTurn(); // → P2
    expect(game.gameState.nextSpellRepeat?.[P1] ?? 0).toBe(0); // expired with P1's turn
    await intoP1Main(game, 8); // → P1 again, nothing to hold
    expect(game.p1.points()).toBe(pts);
    expect(repeatMax(game, "study")).toBe(0);
    expect((await game.p1.try((p) => p.cast("study", { repeat: 1 }))).ok).toBe(false);
  });

  test("hold only — conquering the empty Academy grants nothing: the Study cast right after has no Repeat", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8 })
      .battlefield("academy", { controller: null, def: CARD, inert: false, owner: P1 })
      .unit(P1, "base", { might: 3, name: "Scholar" }, "scholar")
      .hand(P1, STUDY, "study")
      .build();
    await game.p1.move("scholar", "academy");
    await game.settle();
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(repeatMax(game, "study")).toBe(0);
  });

  test("only YOUR hold: across the opponent's turn start nothing is granted to anyone (P2's spell on P2's turn has no Repeat)", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .resources(P2, { energy: 8 })
      .battlefield("academy", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "academy", { might: 3 }, "scholar")
      .hand(P2, STUDY, "theirs")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.points()).toBe(0);
    await game.p2.tapRunes(game.p2.runes({ ready: true }).length);
    await game.p2.do("addResources", { energy: 8 - game.p2.energy() });
    expect(game.p2.option("cast", "theirs")?.fields.find((f) => f.name === "repeatCount")?.max ?? 0).toBe(0);
    expect(game.gameState.nextSpellRepeat?.[P1] ?? 0).toBe(0);
  });

  test("partner — Marai Spire also held by P1: the granted [2] Repeat tier costs [1] → Study + Repeat = 3 (2 hold points)", async () => {
    const game = await aboutToHold()
      .battlefield("spire", { controller: P1, def: MARAI_SPIRE, inert: false, owner: P1 })
      .unit(P1, "spire", { might: 3, name: "Keeper" }, "keeper")
      .build();
    await intoP1Main(game, 8);
    expect(game.p1.points()).toBe(2);
    await game.p1.cast("study", { repeat: 1 });
    expect(game.p1.energy()).toBe(5);
    await game.settle();
  });

  test("partner — Blue Sentinel on the Academy: the hold effect triggers twice → the next spell carries TWO granted instances (repeat 2 → Study for 6, three draws)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("academy", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "academy", BLUE_SENTINEL, "sentinel")
      .hand(P1, STUDY, "study")
      .build();
    await game.p2.endTurn();
    expect(game.chain().filter((i) => i.cardId === "academy")).toHaveLength(2);
    await game.settle();
    await game.p1.tapRunes(game.p1.runes({ ready: true }).length);
    await game.p1.do("addResources", { energy: 6 - game.p1.energy() });
    expect(repeatMax(game, "study")).toBe(2);
    const hand0 = game.p1.hand().length;
    await game.p1.cast("study", { repeat: 2 });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 3);
  });
});
