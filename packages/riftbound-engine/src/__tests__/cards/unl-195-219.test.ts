/**
 * Green Father — unl-195-219 · Legend (Ivern) · Calm/Order
 *
 *   When you conquer or hold, you may exhaust me to replace that battlefield with a Brush
 *   battlefield token. (Bird, Cat, Dog, Poro, and Ivern units have +1 [Might] in Brush. It can be
 *   swapped back when scored.)
 *
 * Rules: 469 (Conquer = take control; Hold = control it at the start of YOUR Beginning Phase),
 * 382/383 (a legend's triggered ability is a chain item; "you may [cost] to …" is optional), 438
 * (Replace: create the token in the replaced card's place, inheriting statuses/control — 438.1; the
 * replaced card goes to Banishment "replaced, not banished" — 438.5; Swap Back — 438.7), 187.8 (Brush
 * token text), 174.x (a legend exhausts like any game object and readies in its owner's Awaken step).
 *
 * Head-judge checklist (trickiest situations for THIS card):
 *  1. The payoff is a REPLACE: after "yes" the conquered/held battlefield IS a Brush (same slot, same
 *     controller, same units standing on it), the printed battlefield card sits in banishment, and a
 *     Poro/Ivern there is immediately +1. The legend is exhausted as the price.
 *  2. Optional + cost: "no" leaves everything as is and the legend READY; an already-exhausted legend
 *     cannot pay, so nothing is replaced (and no dangling prompt).
 *  3. "When YOU conquer or hold": the opponent conquering fires nothing for you; a lost attack is not
 *     a conquer; the opponent's Beginning Phase is never your hold.
 *  4. "THAT battlefield": with two battlefields, conquering bf2 turns bf2 into Brush — bf1 is untouched.
 *  5. Hold path: the trigger sits on the chain in the Beginning Phase (phase holds), then Channel/Draw
 *     still happen; conquer path: it fires after combat with the point already scored.
 *  6. One legend, one exhaust: conquering two battlefields in a turn can Brush only one of them.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-195-219";
const STALWART_PORO = "ogn-052-298"; // Calm · 2 Might · [Shield] · Poro
const IVERN_FRIEND = "unl-177-219"; // Order · 6 · 6 Might · Ivern
const BRUSH = "unl-t03"; // Brush battlefield token

/** Settle until P1's "you may exhaust" prompt (asserting it came from the legend's trigger), answer it, settle again. */
async function answerTrigger(game: Game, yes: boolean): Promise<void> {
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await (yes ? game.p1.yes() : game.p1.no());
  await game.settle();
}

/** Implementation-agnostic view of "the battlefield `unit` is standing on". */
function battlefieldUnder(game: Game, unit: string): { id: string; name: string; controller: string | null | undefined } {
  const id = game.locationOf(unit) as string;
  return { controller: game.gameState.battlefields[id]?.controller, id, name: game.state(id).name };
}

describe("Green Father (unl-195-219)", () => {
  test("registry payload — an OPTIONAL conquer-or-hold trigger on the controller, costed [Exhaust], whose effect REPLACES that battlefield with a Brush token (not raw text)", async () => {
    // Expected: a structured replace-with-token effect naming the Brush battlefield token.
    // Actual: trigger/optional/cost parse fine but the effect is `{ type: "raw", text: "replace that battlefield …" }`.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Ivern", domain: ["calm", "order"], name: "Green Father" });
    const abilities = (def?.abilities ?? []) as { type: string; optional?: boolean; trigger?: unknown; condition?: unknown; effect: { type: string } }[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({ condition: { cost: { exhaust: true }, type: "pay-cost" }, optional: true, trigger: { event: "conquer-or-hold", on: "controller" }, type: "triggered" });
    expect(abilities[0]?.effect.type).not.toBe("raw");
    expect(JSON.stringify(abilities[0]?.effect)).toMatch(/brush|unl-t03/i);
  });

  test("'When you conquer': winning a combat conquers, scores, and puts ONE Green Father trigger on the chain; P1 is then asked whether to exhaust the legend", async () => {
    const game = await scenario().legend(P1, CARD, "gf").battlefield("bf1", { controller: P2 }).unit(P1, "base", { might: 3 }, "att").unit(P2, "bf1", { might: 1 }, "def").build();
    await game.p1.move("att", "bf1");
    const r = await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gf", controller: P1, triggered: true })]);
    expect(game.state("gf").isReady).toBe(true); // not paid yet
  });

  test("'yes' — the legend exhausts and THAT battlefield becomes a Brush token: same slot, still P1's, the attacker still on it, the printed battlefield in banishment (438.1/438.5)", async () => {
    // Expected: after yes → the battlefield under `att` is named "Brush", controlled by P1, one card (old bf1) in banishment.
    // Actual: the legend is exhausted but the raw effect does nothing — bf1 stays bf1, banishment empty.
    const game = await scenario().legend(P1, CARD, "gf").battlefield("bf1", { controller: P2 }).unit(P1, "base", { might: 3 }, "att").unit(P2, "bf1", { might: 1 }, "def").build();
    await game.p1.move("att", "bf1");
    await answerTrigger(game, true);
    expect(game.state("gf").isExhausted).toBe(true);
    expect(game.p1.points()).toBe(1);
    const bf = battlefieldUnder(game, "att");
    expect(bf.name).toBe("Brush");
    expect(bf.controller).toBe(P1);
    expect(game.cardsAt("banishment")).toHaveLength(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("the Brush pays off at once — a Stalwart Poro that conquered stands on Brush at 2 + 1 = 3 Might, the tagless ally beside it stays 3", async () => {
    // Expected: poro.might 3 (Poro tag, 187.8), grunt.might 3. Actual: no Brush is created, poro stays 2.
    const game = await scenario().legend(P1, CARD, "gf").battlefield("bf1", { controller: P2 }).unit(P1, "base", STALWART_PORO, "poro").unit(P1, "base", { might: 3, name: "Grunt" }, "grunt").unit(P2, "bf1", { might: 1 }, "def").build();
    await game.p1.move(["poro", "grunt"], "bf1");
    await answerTrigger(game, true);
    expect(battlefieldUnder(game, "poro").name).toBe("Brush");
    expect(game.state("poro").might).toBe(3);
    expect(game.state("grunt").might).toBe(3);
  });

  test("control for the payoff: on a REAL Brush battlefield (187.8) a Poro is +1, Ivern is +1, a tagless unit is not — this is what the replacement buys", async () => {
    const game = await scenario()
      .battlefield("brush", { controller: P1, def: BRUSH, inert: false })
      .unit(P1, "brush", STALWART_PORO, "poro")
      .unit(P1, "brush", IVERN_FRIEND, "ivern")
      .unit(P1, "brush", { might: 3, name: "Grunt" }, "grunt")
      .unit(P1, "base", STALWART_PORO, "homePoro")
      .build();
    expect(game.state("poro").might).toBe(3);
    expect(game.state("ivern").might).toBe(7);
    expect(game.state("grunt").might).toBe(3);
    expect(game.state("homePoro").might).toBe(2); // "here" only
  });

  test("optional — 'no': the legend stays READY, the battlefield is unchanged, banishment stays empty, and the point still counts", async () => {
    const game = await scenario().legend(P1, CARD, "gf").battlefield("bf1", { controller: P2 }).unit(P1, "base", { might: 3 }, "att").unit(P2, "bf1", { might: 1 }, "def").build();
    await game.p1.move("att", "bf1");
    await answerTrigger(game, false);
    expect(game.state("gf").isReady).toBe(true);
    expect(battlefieldUnder(game, "att")).toEqual({ controller: P1, id: "bf1", name: "bf1" });
    expect(game.cardsAt("banishment")).toEqual([]);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("cost unpayable: with the legend already exhausted a conquer replaces nothing and leaves no dangling prompt (accepting is impossible)", async () => {
    const game = await scenario()
      .card("gf", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3 }, "att")
      .build();
    await game.p1.move("att", "bf1");
    for (let i = 0; i < 4; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || d?.kind !== "yes-no") {
        break;
      }
      expect(d.canAccept).toBe(false);
      await game.p1.no();
    }
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(battlefieldUnder(game, "att").name).toBe("bf1");
    expect(game.cardsAt("banishment")).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("'When you HOLD': at the start of P1's turn the trigger sits on the chain during the Beginning Phase; the hold point is scored, and Channel (+2 runes) / Draw (+1) still follow", async () => {
    const game = await scenario().turn(2).active(P2).legend(P1, CARD, "gf").battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 3 }, "holder").build();
    const hand = game.p1.hand().length;
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gf", controller: P1, triggered: true })]);
    await answerTrigger(game, false);
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.state("gf").isReady).toBe(true);
  });

  test("hold + 'yes' — the held battlefield becomes Brush under the holder, the legend is exhausted for the rest of P1's turn", async () => {
    // Expected: Brush under `holder`, one card in banishment. Actual: only the exhaust happens.
    const game = await scenario().turn(2).active(P2).legend(P1, CARD, "gf").battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 3 }, "holder").build();
    await game.p2.endTurn();
    await answerTrigger(game, true);
    expect(game.phase()).toBe("main");
    expect(game.state("gf").isExhausted).toBe(true);
    expect(battlefieldUnder(game, "holder")).toMatchObject({ controller: P1, name: "Brush" });
    expect(game.cardsAt("banishment")).toHaveLength(1);
  });

  test("negative space — 'when YOU conquer or hold': the opponent conquering, P1 LOSING an attack, or the opponent's Beginning Phase never produce a Green Father prompt", async () => {
    const theirs = await scenario().active(P2).legend(P1, CARD, "gf").battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 1 }, "weak").unit(P2, "base", { might: 3 }, "raider").build();
    await theirs.p2.move("raider", "bf1");
    expect((await theirs.settle()).reason).toBe("open");
    expect(theirs.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(theirs.state("gf").isReady).toBe(true);

    const lost = await scenario().legend(P1, CARD, "gf").battlefield("bf1", { controller: P2 }).unit(P1, "base", { might: 1 }, "weak").unit(P2, "bf1", { might: 5 }, "wall").build();
    await lost.p1.move("weak", "bf1");
    expect((await lost.settle()).reason).toBe("open");
    expect(lost.zoneOf("weak")).toBe("trash");
    expect(lost.p1.points()).toBe(0);
    expect(lost.chain()).toEqual([]);

    const oppTurn = await scenario().turn(3).active(P1).legend(P1, CARD, "gf").battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 3 }, "holder").build();
    await oppTurn.advanceTurn(); // P1 ends → P2's beginning phase: not P1's hold
    expect(oppTurn.turnPlayer()).toBe(P2);
    expect(oppTurn.p1.points()).toBe(0);
    expect(oppTurn.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("'THAT battlefield' — with two battlefields, conquering bf2 turns bf2 into Brush and leaves bf1 (already P1's) exactly as printed", async () => {
    // Expected: Brush under `att` (was bf2); `keeper` still stands on plain "bf1". Actual: nothing is replaced.
    const game = await scenario()
      .legend(P1, CARD, "gf")
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2 }, "keeper")
      .unit(P1, "base", { might: 3 }, "att")
      .unit(P2, "bf2", { might: 1 }, "def")
      .build();
    await game.p1.move("att", "bf2");
    await answerTrigger(game, true);
    expect(battlefieldUnder(game, "att").name).toBe("Brush");
    expect(battlefieldUnder(game, "keeper")).toEqual({ controller: P1, id: "bf1", name: "bf1" });
  });

  test("one legend, one [Exhaust]: after paying for the first conquer, a second conquer the same turn cannot be paid for (no acceptable prompt), yet both points score", async () => {
    const game = await scenario()
      .legend(P1, CARD, "gf")
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { might: 3 }, "a")
      .unit(P1, "base", { might: 3 }, "b")
      .build();
    await game.p1.move("a", "bf1");
    await answerTrigger(game, true);
    expect(game.state("gf").isExhausted).toBe(true);
    expect(game.p1.points()).toBe(1);
    await game.p1.move("b", "bf2");
    for (let i = 0; i < 4; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || d?.kind !== "yes-no") {
        break;
      }
      expect(d.canAccept).toBe(false);
      await game.p1.no();
    }
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
