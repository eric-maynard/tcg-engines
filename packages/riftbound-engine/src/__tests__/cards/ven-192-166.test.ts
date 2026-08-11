/**
 * Curator of the Sands — ven-192-166 · Legend · Calm/Mind
 *
 *   When you play a unit, gear, or activated ability with Energy cost [7] or more, you may exhaust
 *   me to ready up to 2 runes.
 *
 * Rules: 383.4.a (play triggers go on the chain once the card is played), 206 / 206.1 (effects that
 * check a card's or an ABILITY's cost use its printed/base Energy cost, ignoring reductions — the
 * 206.1 example is this very card), 415 (Ready), "up to 2" (0–2 chosen on resolution), 174.x (a
 * legend exhausts as a cost and readies in its owner's Awaken step), 052 ("card" types: a spell is
 * neither a unit nor a gear nor an ability).
 *
 * Head-judge checklist (trickiest situations for THIS card):
 *  1. Threshold is on ENERGY cost only and is ≥ 7: a 7 fires, a 6 does not (even 6 + two power pips);
 *     the runes just tapped to pay for the 7-drop are exactly what gets readied → it nets [2] back.
 *  2. Base cost, not paid cost (206): Rhasa the Sunderer (printed 10) reduced to 6 by the trash still
 *     fires it; conversely nothing can pump a 6-drop into range.
 *  3. All three sources: a 7-cost UNIT, a 7-cost GEAR, and an ACTIVATED ABILITY whose energy cost is
 *     7 (206.1) — but never a 7-cost SPELL, and never the opponent's 7-drop.
 *  4. Optional + cost: a yes/no ask; "no" keeps the legend ready; an already-exhausted legend cannot
 *     pay so nothing readies; two 7-drops in one turn get one payoff (one exhaust).
 *  5. "up to 2 runes": with 3 exhausted exactly the 2 chosen ready; with 1 exhausted you ready 1.
 */

import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-192-166";
const GEMLESS_SEVEN = { cardType: "unit", domain: "calm", energyCost: 7, might: 7, name: "Seven Drop" };
const SIX_DROP = { cardType: "unit", domain: "calm", energyCost: 6, might: 6, name: "Six Drop", powerCost: ["calm", "calm"] };
const SEVEN_GEAR = { abilities: [], cardType: "gear", domain: "mind", energyCost: 7, name: "Seven Gear" };
const SEVEN_SPELL = {
  abilities: [{ effect: { amount: 7, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 7,
  name: "Seven Bolt",
  timing: "action",
};
const BIG_LEVER = {
  abilities: [{ cost: { energy: 7 }, effect: { amount: 1, type: "draw" }, type: "activated" }],
  cardType: "gear",
  domain: "mind",
  energyCost: 1,
  name: "Big Lever",
  rulesText: "[7]: Draw 1.",
};
const RHASA = "ogn-195-298"; // Chaos · 10 + [chaos] · 6 Might · I cost [1] less for each card in your trash.
const FILLER = "ogn-175-298";

/** From the moment the trigger is on the chain: pass to resolution, say yes, choose `runes`, settle. Records what was asked. */
async function acceptAndReady(game: Game, runes: readonly string[]): Promise<Decision["kind"][]> {
  const seen: Decision["kind"][] = [];
  for (let i = 0; i < 8; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || !d || d.seat !== P1) {
      break;
    }
    seen.push(d.kind);
    if (d.kind === "yes-no") {
      await game.p1.yes();
    } else if (d.kind === "pick") {
      const keys = runes.filter((k) => d.options.some((o) => (o.card ?? o.key) === k)).slice(0, Math.max(1, d.max));
      await (keys.length > 0 ? game.p1.pick(...keys) : game.p1.decline());
    } else {
      break;
    }
  }
  return seen;
}

function sevenDropBoard(legendExhausted = false) {
  const b = legendExhausted
    ? scenario().card("cur", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
    : scenario().legend(P1, CARD, "cur");
  return b
    .rune(P1, "calm", { alias: "r1" })
    .rune(P1, "calm", { alias: "r2" })
    .rune(P1, "calm", { alias: "r3" })
    .runes(P1, "mind", 4)
    .hand(P1, GEMLESS_SEVEN, "seven");
}

describe("Curator of the Sands (ven-192-166)", () => {
  test("registry payload — ONE optional trigger over {unit | gear | activated ability} you play with energyCost ≥ 7, costed [Exhaust], readying up to 2 friendly runes", async () => {
    // Expected: a structured trigger with the ≥7 energy-cost condition, optional exhaust cost, and a `ready` effect over up-to-2 friendly runes.
    // Actual: `play-unit` on ANY friendly unit (no cost gate, no gear/ability branch), not optional, effect `raw`.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", domain: ["calm", "mind"], name: "Curator of the Sands" });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(1);
    const a = abilities[0] as { type: string; optional?: boolean; effect: { type: string }; trigger: unknown; condition?: unknown };
    expect(a.type).toBe("triggered");
    expect(a.optional).toBe(true);
    expect(a.effect).toMatchObject({ target: { quantity: { upTo: 2 }, type: "rune" }, type: "ready" });
    expect(JSON.stringify(a)).toMatch(/"exhaust":true/);
    expect(JSON.stringify(a)).toMatch(/7/); // the energy-cost threshold must survive the parse
    expect(JSON.stringify(a.trigger)).toMatch(/gear/);
  });

  test("a 7-cost unit paid with 7 runes → one Curator trigger → 'yes' exhausts the legend and readies exactly the 2 chosen runes (5 stay exhausted)", async () => {
    // Expected: yes/no ask, then a pick (max 2) over P1's exhausted runes; r1+r2 ready, legend exhausted.
    // Actual: a trigger item appears but resolves to nothing — no ask, nothing readied, legend ready.
    const game = await sevenDropBoard().build();
    await game.p1.tapRunes(7);
    await game.p1.play("seven");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cur", controller: P1, triggered: true })]);
    const asked = await acceptAndReady(game, ["r1", "r2"]);
    expect(asked).toContain("yes-no");
    expect(game.state("cur").isExhausted).toBe(true);
    expect(game.p1.runes({ ready: true }).sort()).toEqual(["r1", "r2"]);
    expect(game.p1.runes({ ready: false })).toHaveLength(5);
    expect(game.zoneOf("seven")).toBe("base");
    expect(game.chain()).toEqual([]);
  });

  test("it nets [2] back — the two readied runes tap again the same turn for fresh energy", async () => {
    const game = await sevenDropBoard().build();
    await game.p1.tapRunes(7);
    await game.p1.play("seven");
    await acceptAndReady(game, ["r1", "r2"]);
    await game.p1.tapRunes(2);
    expect(game.p1.energy()).toBe(2);
  });

  test("negative space — a SIX-cost unit (even with two power pips on top) is below [7]: NO Curator trigger is created at all", async () => {
    // Expected: the chain is empty right after the play. Actual: the parsed trigger fires on every friendly unit.
    const game = await scenario().legend(P1, CARD, "cur").resources(P1, { energy: 6, power: { calm: 2 } }).runes(P1, "calm", 3, { exhausted: true }).hand(P1, SIX_DROP, "six").build();
    await game.p1.play("six");
    expect(game.chain()).toEqual([]);
    expect((await game.settle()).reason).toBe("open");
    expect(game.state("cur").isReady).toBe(true);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
  });

  test("'… or GEAR': playing a 7-cost gear fires the trigger too and (on yes) readies 2 runes", async () => {
    // Expected: trigger + ask + 2 runes ready. Actual: gear plays create no Curator trigger.
    const game = await scenario().legend(P1, CARD, "cur").rune(P1, "mind", { alias: "r1" }).rune(P1, "mind", { alias: "r2" }).runes(P1, "calm", 5).hand(P1, SEVEN_GEAR, "gear7").build();
    await game.p1.tapRunes(7);
    await game.p1.play("gear7");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cur", triggered: true })]);
    await acceptAndReady(game, ["r1", "r2"]);
    expect(game.zoneOf("gear7")).toBe("base");
    expect(game.state("cur").isExhausted).toBe(true);
    expect(game.p1.runes({ ready: true }).sort()).toEqual(["r1", "r2"]);
  });

  test("'… or ACTIVATED ABILITY with Energy cost [7] or more' (206.1): using Big Lever's '[7]: Draw 1' fires the trigger and readies 2 of the runes that paid for it", async () => {
    // Expected: after activating (7 energy from 7 runes) a Curator trigger joins the chain; yes → 2 runes ready, and the draw still happens.
    // Actual: activated abilities never fire it.
    const game = await scenario().legend(P1, CARD, "cur").rune(P1, "mind", { alias: "r1" }).rune(P1, "mind", { alias: "r2" }).runes(P1, "calm", 5).gear(P1, BIG_LEVER, "lever").build();
    await game.p1.tapRunes(7);
    const hand = game.p1.hand().length;
    await game.p1.activate("lever");
    expect(game.p1.energy()).toBe(0);
    // rule 419.4.a (patch 2026-07-17, ruling 802009794e24c451) — "play … an activated
    // ability" is completed by its RESOLUTION, so at activation only the Lever's own
    // ability is on the chain; the Curator's trigger joins once that has resolved.
    expect(game.chain().some((i) => i.cardId === "cur" && i.triggered)).toBe(false);
    await acceptAndReady(game, ["r1", "r2"]);
    expect(game.chain().some((i) => i.cardId === "cur" && i.triggered)).toBe(false);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.state("cur").isExhausted).toBe(true);
    expect(game.p1.runes({ ready: true }).sort()).toEqual(["r1", "r2"]);
  });

  test("base cost, not paid cost (206) — Rhasa the Sunderer (printed 10) reduced to 6 by four trash cards still fires the trigger", async () => {
    // Expected: Rhasa costs 6 + [chaos] to play here, yet its Energy cost IS 10 → trigger → yes → 2 runes ready.
    // Actual: the trigger item exists (it fires on any unit) but nothing is asked or readied.
    const b = scenario().legend(P1, CARD, "cur").resources(P1, { power: { chaos: 1 } }).rune(P1, "calm", { alias: "r1" }).rune(P1, "calm", { alias: "r2" }).runes(P1, "mind", 4).hand(P1, RHASA, "rhasa");
    for (let i = 0; i < 4; i++) {
      b.trash(P1, FILLER);
    }
    const game = await b.build();
    await game.p1.tapRunes(6);
    expect(game.p1.can("play", "rhasa")).toBe(true);
    await game.p1.play("rhasa");
    expect(game.p1.energy()).toBe(0);
    const asked = await acceptAndReady(game, ["r1", "r2"]);
    expect(asked).toContain("yes-no");
    expect(game.zoneOf("rhasa")).toBe("base");
    expect(game.p1.runes({ ready: true }).sort()).toEqual(["r1", "r2"]);
  });

  test("negative space — a 7-cost SPELL is neither unit, gear nor ability: no Curator trigger, legend untouched", async () => {
    const game = await scenario().legend(P1, CARD, "cur").resources(P1, { energy: 7 }).runes(P1, "calm", 3, { exhausted: true }).unit(P2, "base", { might: 9 }, "foe").hand(P1, SEVEN_SPELL, "bolt").build();
    await game.p1.cast("bolt", { targets: "foe" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["bolt"]);
    expect((await game.settle()).reason).toBe("open");
    expect(game.state("foe").damage).toBe(7);
    expect(game.state("cur").isReady).toBe(true);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
  });

  test("negative space — 'when YOU play': the opponent's 7-drop creates no trigger for P1's Curator", async () => {
    const game = await scenario().active(P2).legend(P1, CARD, "cur").resources(P2, { energy: 7 }).runes(P1, "calm", 3, { exhausted: true }).hand(P2, GEMLESS_SEVEN, "theirs").build();
    await game.p2.play("theirs");
    expect(game.chain().some((i) => i.cardId === "cur")).toBe(false);
    expect((await game.settle()).reason).toBe("open");
    expect(game.zoneOf("theirs")).toBe("base");
    expect(game.state("cur").isReady).toBe(true);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
  });

  test("cost unpayable — with the legend already exhausted a 7-drop readies nothing and leaves no acceptable prompt behind", async () => {
    const game = await sevenDropBoard(true).build();
    await game.p1.tapRunes(7);
    await game.p1.play("seven");
    for (let i = 0; i < 6; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || !d || d.seat !== P1) {
        break;
      }
      if (d.kind === "yes-no") {
        expect(d.canAccept).toBe(false);
        await game.p1.no();
      } else if (d.kind === "pick") {
        await game.p1.decline();
      } else {
        break;
      }
    }
    expect(game.zoneOf("seven")).toBe("base");
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("optional — the 7-drop produces a yes/no ASK; answering 'no' keeps the legend ready and every rune exhausted", async () => {
    // Expected: an explicit "you may exhaust me" ask that can be declined. Actual: no ask is ever produced.
    const game = await sevenDropBoard().build();
    await game.p1.tapRunes(7);
    await game.p1.play("seven");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.state("cur").isReady).toBe(true);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.chain()).toEqual([]);
  });

  test("'up to 2' with a single exhausted rune — ready that one; the other six were never tapped and stay ready (7/7 ready afterwards)", async () => {
    // Expected: pay 7 from the pool with only r1 exhausted → yes → r1 readies → all 7 runes ready. Actual: r1 stays exhausted.
    const game = await scenario().legend(P1, CARD, "cur").resources(P1, { energy: 7 }).rune(P1, "calm", { alias: "r1", exhausted: true }).runes(P1, "mind", 6).hand(P1, GEMLESS_SEVEN, "seven").build();
    await game.p1.play("seven");
    await acceptAndReady(game, ["r1"]);
    expect(game.state("cur").isExhausted).toBe(true);
    expect(game.p1.runes({ ready: false })).toEqual([]);
    expect(game.p1.runes({ ready: true })).toHaveLength(7);
  });
});
