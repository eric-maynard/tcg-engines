/**
 * Guardian of the Passage — sfd-035-221 · Unit · Calm · 6 energy (no power) · 6 Might
 *
 *   When I hold, you may return a unit or gear from your trash to your hand.
 *
 * Rules: 469.2 / 383.4.d (Hold: keep control of a battlefield during YOUR Beginning Phase → 1
 * point; Hold Effects trigger only for units AT the held battlefield), 383.3.a ("you may" as the
 * first words → opt-in), 137 (Equipment is gear), own trash only ("your trash").
 *
 * Judge's corner — trickiest situations for this card:
 *  - The choice set: units AND gear (incl. Equipment) from YOUR trash — never spells, runes or
 *    anything in the opponent's trash.
 *  - "you may": declining must leave the trash untouched and still score the hold point.
 *  - Empty / spell-only trash: the trigger still goes on the chain but does nothing.
 *  - Guardian in base while another unit holds → no trigger (383.4.d.2); opponent's Beginning
 *    Phase → no trigger; two Guardians at two held battlefields → two separate triggers.
 *  - 383.3.a: the opt-in is made when the trigger is finalized, before anyone gets priority.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-035-221";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit
const MASK = "ogn-060-298"; // Mask of Foresight — calm gear
const LONG_SWORD = "sfd-022-221"; // Equipment (a gear subtype)
const CLEAVE = "ogn-004-298"; // a spell — must NOT be offered

/** P2 is about to end the turn; P1 holds bf1 with the Guardian on it and a mixed trash. */
function holding() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", CARD, "gp")
    .trash(P1, SKULKER, "tunit")
    .trash(P1, MASK, "tgear")
    .trash(P1, LONG_SWORD, "tequip")
    .trash(P1, CLEAVE, "tspell")
    .trash(P2, SKULKER, "eunit");
}

describe("Guardian of the Passage (sfd-035-221)", () => {
  test("cost: 6 energy, no power, 6 Might, enters exhausted; unaffordable at 5 energy", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "gp").build();
    await game.p1.play("gp");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("gp")).toBe("base");
    expect(game.state("gp")).toMatchObject({ baseMight: 6, isExhausted: true, might: 6 });
    const poor = await scenario().resources(P1, { energy: 5, power: { calm: 3 } }).hand(P1, CARD, "gp").build();
    expect(poor.p1.can("play", "gp")).toBe(false);
  });

  test("When I hold: trigger goes on the chain in the Beginning Phase; accepting offers exactly your trash's units + gear (incl. Equipment)", async () => {
    const game = await holding().build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gp", controller: P1, triggered: true })]);
    expect(game.p1.points()).toBe(1); // the hold point itself
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "gp" } });
    await game.p1.yes();
    await game.settle(); // rule 383.3.a — accepted at finalization; the pick comes at resolution
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card).sort() : [];
    expect(offered).toEqual(["tequip", "tgear", "tunit"]); // no spell, nothing from P2's trash
    await game.p1.pick("tunit");
    await game.settle();
    expect(game.zoneOf("tunit")).toBe("hand");
    expect(game.p1.hand()).toContain("tunit");
    expect(game.zoneOf("tgear")).toBe("trash");
    expect(game.zoneOf("eunit")).toBe("trash");
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([]);
  });

  test("a gear (and an Equipment) can be the returned card", async () => {
    const game = await holding().build();
    await game.p2.endTurn();
    await game.settle();
    await game.p1.yes();
    await game.settle();
    await game.p1.pick("tequip");
    await game.settle();
    expect(game.zoneOf("tequip")).toBe("hand");
    expect(game.zoneOf("tunit")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["tgear", "tspell", "tunit"]);
  });

  test("'you may': declining returns nothing, the chain clears and the hold point stays", async () => {
    const game = await holding().build();
    await game.p2.endTurn();
    await game.settle();
    await game.p1.no();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.trash().sort()).toEqual(["tequip", "tgear", "tspell", "tunit"]);
    expect(game.p1.hand()).toHaveLength(1); // just the draw-phase card
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
  });

  test("spell-only trash: nothing is offered and nothing leaves the trash, the turn proceeds to main", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "gp")
      .trash(P1, CLEAVE, "tspell")
      .build();
    await game.p2.endTurn();
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
      await game.settle();
    }
    expect(game.decision()?.kind).toBe("action");
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("tspell")).toBe("trash");
    expect(game.p1.hand()).toEqual(expect.not.arrayContaining(["tspell"]));
    expect(game.p1.points()).toBe(1);
  });

  test("no hold trigger while the Guardian sits in base and another unit holds (383.4.d.2)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "grunt")
      .unit(P1, "base", CARD, "gp")
      .trash(P1, SKULKER, "tunit")
      .build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("tunit")).toBe("trash");
  });

  test("only YOUR hold: the opponent's Beginning Phase does nothing for a Guardian on your battlefield", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "gp")
      .trash(P1, SKULKER, "tunit")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("tunit")).toBe("trash");
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("an uncontrolled battlefield is not held: Guardian standing on a battlefield nobody controls triggers nothing", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: null })
      .unit(P1, "bf1", CARD, "gp")
      .trash(P1, SKULKER, "tunit")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(game.zoneOf("tunit")).toBe("trash");
  });

  test("two Guardians on two held battlefields: two triggers, two cards back, two hold points", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", CARD, "gp1")
      .unit(P1, "bf2", CARD, "gp2")
      .trash(P1, SKULKER, "tunit")
      .trash(P1, MASK, "tgear")
      .build();
    await game.p2.endTurn();
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["gp1", "gp2"]);
    // rule 402 (finalization): each trigger's opt-in and choice are made as it goes on the chain, before any priority
    for (let i = 0; i < 2; i++) {
      expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
      await game.p1.yes();
      const d = game.decision();
      if (d?.kind === "pick") {
        // both triggers finalize while the trash still holds both cards — choose a different card for each
        await game.p1.pick(i === 0 ? "tunit" : "tgear");
      }
    }
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("tunit")).toBe("hand");
    expect(game.zoneOf("tgear")).toBe("hand");
    expect(game.p1.points()).toBe(2);
  });

  test("the returned unit is a fresh card in hand: it can be played again this turn for its normal cost", async () => {
    const game = await holding().build();
    await game.p2.endTurn();
    await game.settle();
    await game.p1.yes();
    await game.settle();
    await game.p1.pick("tunit");
    await game.settle();
    await game.p1.do("addResources", { energy: 3 }); // Skulker costs 3
    await game.p1.play("tunit", { to: "base" });
    await game.settle();
    expect(game.zoneOf("tunit")).toBe("base");
    expect(game.state("tunit")).toMatchObject({ damage: 0, isExhausted: true });
  });

  test("the opt-in ('you may' as first words) is decided at finalization, before any player receives priority (383.3.a)", async () => {
    // Expected: right after the hold trigger is created P1 is asked yes/no; only an accepted
    // trigger sits on the chain for responses. Actual: both players get a priority window
    // first and the yes/no is asked on resolution.
    const game = await holding().build();
    await game.p2.endTurn();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "gp" } });
  });

  test("parsed ability shape matches the printed text (optional hold trigger → return unit/gear from trash to hand)", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 6, might: 6 });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { target: { location: "trash" }, type: "return-to-hand" },
      optional: true,
      trigger: { event: "hold", on: "self" },
      type: "triggered",
    });
  });
});
