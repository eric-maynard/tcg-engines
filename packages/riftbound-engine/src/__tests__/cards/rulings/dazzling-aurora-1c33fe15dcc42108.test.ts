/**
 * Ruling 1c33fe15dcc42108 — Dazzling Aurora (OGN-160 → ogn-160-298) · Gear "At the end of your turn, reveal cards
 *   from the top of your Main Deck until you reveal a unit and banish it. Play it, ignoring its cost, and recycle the rest."
 *   × Temporal Breach (VEN-066 → ven-066-166) · Spell [2][mind] "[Hidden] Banish a unit, then its owner plays it to
 *     the same location, ignoring its cost."
 *   × Brynhir Thundersong (ogn-026-298) · "When you play me, opponents can't play cards this turn."
 *   (ruling also lists Thrill of the Hunt unl-184-219 as the analogous non-hidden line.)
 *
 * Q: Opponent has Aurora; I have Brynhir and a hidden Temporal Breach. Can I Breach-replay Brynhir in response to
 *    Aurora's end-of-turn trigger to stop the unit from being played?
 * A: Yes — if Brynhir is AT the battlefield where Breach is hidden (811.1.d.2: a hidden spell picks targets there).
 *    Breach (Reaction, [0] from facedown) resolves above Aurora, replays Brynhir, her trigger resolves first → the
 *    opponent can't play cards; Aurora then reveals/banishes the unit but "play it" is skipped, rest recycled.
 *    A hidden Breach cannot reach a Brynhir in base.
 * Rules: 811.1.b/811.6 (hidden → Reaction, cost ignored), 811.1.d.2, 336 (LIFO), 419.4.a.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const TEMPORAL_BREACH = "ven-066-166";
const BRYNHIR = "ogn-026-298";
const DISCIPLINE = "ogn-058-298"; // P2's Reaction in hand — the "can P2 still play cards?" witness; also the deck's top (non-unit) card
const SHIPYARD_SKULKER = "ogn-175-298"; // the first unit Aurora will reveal

/**
 * P2's turn (P2 owns Aurora). P1 controls bf1 with Temporal Breach facedown there since an earlier turn.
 * `brynhirAt` places Brynhir at bf1 (with nothing else) or in P1's base (a 2-Might Holder keeps bf1).
 * P2's deck: Discipline on top, then Shipyard Skulker. P2 holds a Discipline with [2] to try to play later.
 */
function board(brynhirAt: "bf1" | "base") {
  const s = scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, brynhirAt, BRYNHIR, "brynhir")
    .facedown(P1, "bf1", TEMPORAL_BREACH, "breach")
    .gear(P2, DAZZLING_AURORA, "aurora")
    .deck(P2, [DISCIPLINE, SHIPYARD_SKULKER], ["topSpell", "deckUnit"])
    .hand(P2, DISCIPLINE, "p2disc")
    .resources(P2, { energy: 2 });
  return brynhirAt === "base" ? s.unit(P1, "bf1", { might: 2, name: "Holder" }, "holder") : s;
}

/** P2 ends the turn → Aurora's trigger is on the chain; P2 passes so P1 holds priority. */
async function auroraTriggers(brynhirAt: "bf1" | "base"): Promise<Game> {
  const game = await board(brynhirAt).build();
  await game.p2.endTurn();
  expect(game.phase()).toBe("ending");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P2, triggered: true })]);
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

/** Pass priority back and forth until `card` has left the chain (or a non-priority prompt appears). */
async function resolveTop(game: Game, card: string): Promise<void> {
  for (let i = 0; i < 6 && game.chain().some((c) => c.cardId === card); i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling 1c33fe15dcc42108 — hidden Temporal Breach + Brynhir vs Dazzling Aurora's end-of-turn play", () => {
  test("Brynhir at the Breach battlefield: P1 may play Breach from facedown as a Reaction to Aurora's trigger, for [0]", async () => {
    const game = await auroraTriggers("bf1");
    expect(game.p1.can("reveal", "breach")).toBe(true);
    expect(game.p1.energy()).toBe(0);
    await game.p1.reveal("breach", { answers: ["brynhir"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["aurora", "breach"]);
    expect(game.p1.energy()).toBe(0); // hidden → base cost ignored
  });

  test("Breach resolves first: Brynhir is banished and replayed at bf1; her play trigger lands ABOVE Aurora's and resolves → P2 can no longer play cards", async () => {
    const game = await auroraTriggers("bf1");
    expect(game.p2.legal().some((o) => o.card === "p2disc")).toBe(false); // (P2 has no priority right now)
    await game.p1.reveal("breach", { answers: ["brynhir"] });
    await resolveTop(game, "breach"); // Breach resolves
    expect(game.zoneOf("breach")).toBe("trash");
    expect(game.zoneOf("brynhir")).toBe("battlefield-bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["aurora", "brynhir"]);
    expect(game.chain()[1]).toMatchObject({ controller: P1, triggered: true });
    // Before Brynhir's trigger resolves P2 could still respond with a card…
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "p2disc")).toBe(true);
    await game.p2.passPriority(); // Brynhir's trigger resolves
    expect(game.chain().map((c) => c.cardId)).toEqual(["aurora"]);
    // …afterwards P2 holds priority under Aurora but may not play cards this turn.
    for (let i = 0; i < 2 && game.actingSeat() !== P2; i++) {
      await game.acting().passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "p2disc")).toBe(false);
  });

  test("Aurora then resolves: the revealed unit is banished but NOT played (impossible), the non-unit is recycled; turn passes to P1", async () => {
    const game = await auroraTriggers("bf1");
    await game.p1.reveal("breach", { answers: ["brynhir"] });
    await game.settle();
    expect(game.zoneOf("deckUnit")).toBe("banishment");
    expect(game.p2.units()).toEqual([]); // nothing entered P2's board
    expect(game.zoneOf("topSpell")).toBe("mainDeck");
    expect(game.p2.deck().at(-1)).toBe("topSpell"); // recycled to the bottom
    expect(game.zoneOf("brynhir")).toBe("battlefield-bf1");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control (no Breach): Aurora's trigger resolves normally — Skulker is banished then PLAYED to P2's board, Discipline recycled", async () => {
    const game = await auroraTriggers("bf1");
    await game.settle();
    expect(["base", "bf1", "bf2"]).toContain(game.locationOf("deckUnit") as string);
    expect(game.state("deckUnit").controller).toBe(P2);
    expect(game.p2.deck().at(-1)).toBe("topSpell");
    expect(game.zoneOf("breach")).toBe("facedown-bf1");
  });

  test("the catch (811.1.d.2): with Brynhir in BASE, the hidden Breach can only choose the unit at its battlefield — Brynhir is never offered, P2 keeps playing cards, and Aurora's unit IS played", async () => {
    const game = await auroraTriggers("base");
    expect(game.p1.can("reveal", "breach")).toBe(true); // Holder at bf1 is a legal object
    await game.p1.reveal("breach", { answers: ["brynhir"] }); // the queued "brynhir" is never a legal answer…
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.key)).not.toContain("brynhir");
      expect(d.options.map((o) => o.key)).toEqual(["holder"]);
      await game.p1.pick("holder");
    }
    expect(game.pendingScript(P1)).toBe(1); // …so it was left unconsumed (Holder was the forced/only choice)
    game.clearScript(P1);
    await resolveTop(game, "breach"); // Breach resolves on Holder
    expect(game.zoneOf("breach")).toBe("trash");
    expect(game.zoneOf("brynhir")).toBe("base"); // untouched
    expect(game.zoneOf("holder")).toBe("battlefield-bf1"); // banished and replayed in place
    for (let i = 0; i < 2 && game.actingSeat() !== P2; i++) {
      await game.acting().passPriority();
    }
    expect(game.p2.can("cast", "p2disc")).toBe(true); // no Brynhir lock
    await game.settle();
    expect(["base", "bf1", "bf2"]).toContain(game.locationOf("deckUnit") as string); // Aurora played it
    expect(game.state("deckUnit").controller).toBe(P2);
    expect(game.turnPlayer()).toBe(P1);
  });
});
