/**
 * Ruling 4cb386866e38ed40 — Unlicensed Armory (OGN-023 → ogn-023-298) · Gear · [2] fury
 *     "Discard 1, [Exhaust]: Choose a friendly unit. The next time it would die this turn, you may pay [fury] to heal it, exhaust
 *      it, and recall it instead."
 *   × Zhonya's Hourglass (OGN-077) / The Boss (OGN-269) — the other "instead" savers the question lumps in.
 *
 * Q: Do "instead" save effects (Armory's payment, Zhonya's, Sett legend) open a chain that can be reacted to?
 * A: No. Replacement effects don't use the chain. The Armory's ACTIVATION (discard + exhaust) is a normal chain item and can be
 *    responded to; but once the unit has the protection, paying [fury] to save it simply replaces the death — no new chain,
 *    no reaction window. Optional replacements ask their controller and take the cost at the moment they would apply.
 * Rules: 370–372 (replacement effects, "instead", optional + cost paid on application), 377.3/419 (activations use the chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UNLICENSED_ARMORY = "ogn-023-298";

/** Inline P1 action spell: deal 3 to a unit (lethal for the 2-Might Grunt). */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};
/** Inline P2 reaction, only to prove P2 COULD act whenever it actually gets priority. */
const TWITCH = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 0,
  name: "Test Twitch",
  timing: "reaction",
};

/**
 * P1's turn. P1: ready Unlicensed Armory, 2-Might Grunt at P1's bf1, a Junk card to discard, Bolt in hand; [1] + 1 fury.
 * P2 holds a free Reaction so "P2 had a window" is observable as P2 being the acting seat with a castable card.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .gear(P1, UNLICENSED_ARMORY, "armory")
    .unit(P1, "bf1", { might: 2, name: "Grunt" }, "grunt")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, { cardType: "unit", energyCost: 5, might: 5, name: "Junk" }, "junk")
    .hand(P1, BOLT, "bolt")
    .hand(P2, TWITCH, "twitch");
}

/** Activate the Armory (discard Junk), name the Grunt, and resolve the activation completely. */
async function shieldGrunt(): Promise<Game> {
  const game = await board().build();
  const asksNow = game.p1.option("activate", "armory")?.fields.some((f) => f.name === "targets") === true;
  await game.p1.activate("armory", 0, asksNow ? { discard: "junk", targets: "grunt" } : { answers: ["grunt"], discard: "junk" });
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options.some((o) => (o.card ?? o.key) === "junk") ? "junk" : "grunt");
    } else {
      break;
    }
  }
  return game;
}

describe("Ruling 4cb386866e38ed40 — the Armory's activation is on the chain, its 'pay [fury] … instead' save is not", () => {
  test("the ACTIVATION uses the chain: Armory exhausted, Junk discarded, an Armory item on the chain and P2 receives priority (a real reaction window)", async () => {
    const game = await shieldGrunt();
    expect(game.state("armory").isExhausted).toBe(true);
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "armory", controller: P1 })]);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "twitch")).toBe(true);
  });

  test("the SAVE does not: when the protected Grunt takes lethal damage P1 is asked the optional [fury] payment directly (a replacement prompt sourced from the Armory, nothing new on the chain, not P2's priority)…", async () => {
    const game = await shieldGrunt();
    await game.settle(); // activation resolves
    expect(game.chain()).toEqual([]);
    await game.p1.cast("bolt", { targets: "grunt" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Bolt resolves → Grunt would die
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    expect(d?.source?.cardId).toBe("armory");
    expect(game.chain().some((c) => c.cardId === "armory")).toBe(false);
    expect(game.zoneOf("grunt")).toBe("battlefield-bf1"); // not dead, not yet saved — the event is being replaced right now
  });

  test("…and answering YES pays [fury] and heals/exhausts/recalls the Grunt at once — P2 never gets priority in between; the game goes straight back to P1's open main phase", async () => {
    const game = await shieldGrunt();
    await game.settle();
    await game.p1.cast("bolt", { targets: "grunt" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    // Immediately after the replacement: no chain, no P2 window — the next decision is P1's main phase.
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("grunt")).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.p2.hand()).toEqual(["twitch"]); // P2's reaction was never castable during the save
    expect(game.violations()).toEqual([]);
  });

  test("optional: answering NO lets the Grunt die and keeps the [fury]", async () => {
    const game = await shieldGrunt();
    await game.settle();
    await game.p1.cast("bolt", { targets: "grunt" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.p1.power("fury")).toBe(1);
  });
});
