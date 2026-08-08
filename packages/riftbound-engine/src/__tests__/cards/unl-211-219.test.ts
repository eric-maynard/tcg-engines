/**
 * Forgotten Library — unl-211-219 · Battlefield (no cost, no domain)
 *
 *   While you control this battlefield, when you play a spell, if you spent [4] or more, [Predict].
 *   (Look at the top card of your Main Deck. You may recycle it.)
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. "when you play a spell" triggers on the spell's RESOLUTION (419.4.a) — the spell's own effect
 *      has already happened when the Library item goes on the chain; a COUNTERED spell was never
 *      played (419.4.a.1) and yields no Predict even though its cost was spent.
 *   2. "if you spent [4] or more" reads the ENERGY actually PAID for THAT spell (contrast 206, which
 *      is about printed cost): exactly [4] → Predict, [3] → nothing; [3] + a power pip is still only
 *      [3] energy; a [2] spell whose [Repeat] [2] was paid is [4] spent → Predict.
 *   3. "While you control this battlefield": only the CONTROLLER's spells count. The opponent's 4-cost
 *      spell does nothing for anyone; an UNCONTROLLED Library does nothing even for the player who
 *      brought the card; when P2 controls a Library card P1 owns, P2's spells Predict into P2's deck.
 *   4. [Predict] (436): the caster looks at THEIR top card and may recycle it (→ bottom) or decline
 *      (→ stays on top); it never draws; with an empty deck nothing happens and nobody Burns Out (436.4.a).
 *   5. Spells only — playing a 4-cost unit is not playing a spell.
 *   6. The Library item is a triggered ability on the chain: both players get priority before the look.
 *
 * Engine notes: the [4]-spent gate sits inside an `and` condition the trigger runner does not veto on,
 * so cheap spells Predict too; and an uncontrolled Library falls back to its card owner (BUG tests).
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-211-219";
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla deck marker
const WIND_WALL = "ogn-064-298"; // Reaction · 3 calm · Counter a spell.
const DESERTS_CALL = "sfd-031-221"; // Spell · 2 · [Repeat] [2] — play a 2-Might Sand Soldier token

/** Inline "Deal 1 to a unit" action spell of a given cost (keeps decks/hands untouched so Predict is observable). */
const bolt = (energyCost: number, powerCost?: string[]) => ({
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost,
  name: `Bolt ${energyCost}${powerCost ? "+p" : ""}`,
  timing: "action",
  ...(powerCost ? { powerCost } : {}),
});

/** P1's turn; P1 controls the Library (a unit sits there); P2 has a 5-Might dummy in base to shoot at; P1's deck top is a, then b. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { calm: 2, mind: 2 } })
    .resources(P2, { energy: 6, power: { calm: 2 } })
    .battlefield("lib", { controller: P1, def: CARD, inert: false, owner: P1 })
    .unit(P1, "lib", { might: 2, name: "Librarian" }, "sitter")
    .unit(P2, "base", { might: 5, name: "Dummy" }, "dummy")
    .deck(P1, [FILLER, FILLER], ["a", "b"]);
}

/** Pass priority around until a non-action prompt or the open main phase. */
async function passAll(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main" || !d.passKey) {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

describe("Forgotten Library (unl-211-219)", () => {
  test("registry payload: a play-spell trigger for the controller, gated on [control this battlefield AND ≥4 energy spent on the spell], effect Predict 1", async () => {
    const game = await board().build();
    expect(game.state("lib")).toMatchObject({ cardType: "battlefield", name: "Forgotten Library", zone: "battlefieldRow" });
    expect(peekDefaultCardPool()?.get(CARD)?.abilities).toEqual([
      {
        condition: { conditions: [{ type: "while-control-battlefield" }, { amount: 4, type: "spell-energy-spent" }], type: "and" },
        effect: { amount: 1, type: "predict" },
        trigger: { event: "play-spell", on: "controller" },
        type: "triggered",
      },
    ]);
  });

  test("sequence with a [4] spell: Bolt resolves FIRST (Dummy takes 1), THEN the Library item is on the chain under P1 with priority for both, THEN P1 is shown exactly their own top card", async () => {
    const game = await board().hand(P1, bolt(4), "bolt4").build();
    await game.p1.cast("bolt4", { targets: "dummy" });
    expect(game.p1.energy()).toBe(2);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Bolt 4 resolves
    expect(game.state("dummy").damage).toBe(1);
    expect(game.zoneOf("bolt4")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lib", controller: P1, name: "Forgotten Library", triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", max: 1, seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["a"]);
  });

  test("Predict — recycling: 'a' goes to the BOTTOM of P1's deck, 'b' becomes the top card, nothing is drawn, P2's deck untouched", async () => {
    const game = await board().hand(P1, bolt(4), "bolt4").build();
    const p2Top = game.p2.deck()[0];
    await game.p1.cast("bolt4", { targets: "dummy" });
    const hand0 = game.p1.hand().length;
    await passAll(game);
    await game.p1.pick("a");
    await game.settle();
    expect(game.p1.deck()[0]).toBe("b");
    expect(game.p1.deck().at(-1)).toBe("a");
    expect(game.p1.hand()).toHaveLength(hand0); // Predict never draws
    expect(game.p1.hand()).not.toContain("a");
    expect(game.p2.deck()[0]).toBe(p2Top);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("Predict — declining keeps 'a' on top (then 'b'); play returns to P1's main phase", async () => {
    const game = await board().hand(P1, bolt(4), "bolt4").build();
    await game.p1.cast("bolt4", { targets: "dummy" });
    await passAll(game);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.decline();
    await game.settle();
    expect(game.p1.deck().slice(0, 2)).toEqual(["a", "b"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test.failing("BUG: a spell you spent only [3] on does NOT Predict — Bolt 3 resolves and play goes straight back to the main phase (engine Predicts on any own spell)", async () => {
    // Expected: threshold not met → no Library item, no reveal-and-pick. Actual: the `spell-energy-spent`
    // clause nested in the `and` condition is never evaluated, so a Predict prompt appears.
    const game = await board().hand(P1, bolt(3), "bolt3").build();
    await game.p1.cast("bolt3", { targets: "dummy" });
    expect(game.p1.energy()).toBe(3);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("dummy").damage).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test.failing("BUG: [4] means ENERGY — a spell paid [3] + one power pip spent only [3] and does not Predict (engine Predicts)", async () => {
    const game = await board().hand(P1, bolt(3, ["mind"]), "bolt3p").build();
    await game.p1.cast("bolt3p", { targets: "dummy" });
    expect(game.p1.resources()).toMatchObject({ energy: 3, power: { mind: 1 } });
    await passAll(game);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.deck().slice(0, 2)).toEqual(["a", "b"]);
  });

  test("'spent', not printed cost: Desert's Call ([2]) with its [Repeat] [2] paid is [4] spent → two Sand Soldiers, then Predict", async () => {
    const game = await board().hand(P1, DESERTS_CALL, "call").build();
    await game.p1.cast("call", { repeat: 1 });
    expect(game.p1.energy()).toBe(2); // 2 + 2
    game.script(P1, ["base", "base"]); // token destinations, if asked
    await passAll(game);
    for (let i = 0; i < 4 && game.decision()?.kind === "pick" && (game.decision() as { source?: { cardId?: string } }).source?.cardId !== "lib"; i++) {
      await game.settle({ maxSteps: 1, policy: "first" });
      await passAll(game);
    }
    expect(game.p1.units("base").filter((u) => u.startsWith("token-"))).toHaveLength(2);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "lib" } });
    await game.p1.pick("a");
    await game.settle();
    expect(game.p1.deck()[0]).toBe("b");
  });

  test("419.4.a.1 — a COUNTERED spell was never played: P2 Wind Walls Bolt 4 → no damage, no Library item, no Predict, though P1's [4] is gone", async () => {
    const game = await board().hand(P1, bolt(4), "bolt4").hand(P2, WIND_WALL, "ww").build();
    await game.p1.cast("bolt4", { targets: "dummy" });
    await game.p1.passPriority(); // 312.1 — P2 may now react
    await game.p2.cast("ww", { targets: "bolt4" });
    await passAll(game);
    expect(game.zoneOf("bolt4")).toBe("trash");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.state("dummy").damage).toBe(0);
    expect(game.p1.energy()).toBe(2);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.deck().slice(0, 2)).toEqual(["a", "b"]);
  });

  test("only the CONTROLLER's spells: P2 controls the Library (card owned by P1); P1's own [4] spell on P1's turn triggers nothing for either player", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { mind: 2 } })
      .battlefield("lib", { controller: P2, def: CARD, inert: false, owner: P1 })
      .unit(P2, "lib", { might: 2 }, "theirSitter")
      .unit(P2, "base", { might: 5 }, "dummy")
      .deck(P1, [FILLER, FILLER], ["a", "b"])
      .deck(P2, [FILLER, FILLER], ["x", "y"])
      .hand(P1, bolt(4), "bolt4")
      .build();
    await game.p1.cast("bolt4", { targets: "dummy" });
    await passAll(game);
    expect(game.state("dummy").damage).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.deck().slice(0, 2)).toEqual(["a", "b"]);
    expect(game.p2.deck().slice(0, 2)).toEqual(["x", "y"]);
  });

  test("'you' follows CONTROL, not ownership: P2 controls P1's Library card and casts a [4] spell on P2's turn → the item is P2's and P2 Predicts P2's own deck", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 6, power: { mind: 2 } })
      .battlefield("lib", { controller: P2, def: CARD, inert: false, owner: P1 })
      .unit(P2, "lib", { might: 2 }, "theirSitter")
      .unit(P1, "base", { might: 5 }, "myDummy")
      .deck(P1, [FILLER, FILLER], ["a", "b"])
      .deck(P2, [FILLER, FILLER], ["x", "y"])
      .hand(P2, bolt(4), "bolt4")
      .build();
    await game.p2.cast("bolt4", { targets: "myDummy" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lib", controller: P2, triggered: true })]);
    await passAll(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["x"]);
    await game.p2.pick("x");
    await game.settle();
    expect(game.p2.deck()[0]).toBe("y");
    expect(game.p2.deck().at(-1)).toBe("x");
    expect(game.p1.deck().slice(0, 2)).toEqual(["a", "b"]);
  });

  test.failing("BUG: an UNCONTROLLED Library does nothing even for the player who brought the card — P1 (owner, not controller) casts Bolt 4 → no Predict (engine falls back to the owner and Predicts)", async () => {
    // Expected: "While you control this battlefield" is false for everybody → no trigger. Actual: with
    // controller null the trigger scan attributes the card to its owner P1 and the Predict prompt appears.
    const game = await scenario()
      .resources(P1, { energy: 6, power: { mind: 2 } })
      .battlefield("lib", { controller: null, def: CARD, inert: false, owner: P1 })
      .unit(P2, "base", { might: 5 }, "dummy")
      .deck(P1, [FILLER, FILLER], ["a", "b"])
      .hand(P1, bolt(4), "bolt4")
      .build();
    await game.p1.cast("bolt4", { targets: "dummy" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("dummy").damage).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("spells only: playing a 4-cost UNIT while controlling the Library triggers nothing", async () => {
    const game = await board().hand(P1, { cardType: "unit", domain: "mind", energyCost: 4, might: 3, name: "Scholar" }, "scholar").build();
    await game.p1.play("scholar", { to: "base" });
    expect(game.p1.energy()).toBe(2);
    await game.settle();
    expect(game.zoneOf("scholar")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.deck().slice(0, 2)).toEqual(["a", "b"]);
  });

  test("436.4.a — Predict with an EMPTY Main Deck: the spell still resolves, nothing throws, no prompt, no Burn Out point for anyone", async () => {
    const game = await scenario()
      .fillDecks(false)
      .resources(P1, { energy: 6, power: { mind: 2 } })
      .battlefield("lib", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "lib", { might: 2 }, "sitter")
      .unit(P2, "base", { might: 5 }, "dummy")
      .hand(P1, bolt(4), "bolt4")
      .build();
    expect(game.p1.deck()).toEqual([]);
    await game.p1.cast("bolt4", { targets: "dummy" });
    await game.settle();
    expect(game.state("dummy").damage).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.isOver()).toBe(false);
  });

  test("inert control: with the Library's abilities stripped the same Bolt 4 just resolves — so every prompt above came from the printed text", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { mind: 2 } })
      .battlefield("lib", { controller: P1, def: CARD, inert: true, owner: P1 })
      .unit(P1, "lib", { might: 2 }, "sitter")
      .unit(P2, "base", { might: 5 }, "dummy")
      .deck(P1, [FILLER, FILLER], ["a", "b"])
      .hand(P1, bolt(4), "bolt4")
      .build();
    await game.p1.cast("bolt4", { targets: "dummy" });
    await game.settle();
    expect(game.state("dummy").damage).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.deck().slice(0, 2)).toEqual(["a", "b"]);
  });
});
