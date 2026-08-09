/**
 * Virtuoso — unl-181-219 · Legend (Jhin) · Fury/Mind
 *
 *   When you play a spell, if you spent [4] or more, you may banish it. Then, if there are four
 *   spells banished with me, put each in its trash, channel 4 runes, and draw 1.
 *
 * Rules: 419.4.a (a "when you play a spell" trigger fires when the spell finishes RESOLVING — by then
 * the spell is in its owner's trash, 359.3.d, so "banish it" moves it trash → banishment), 419.4.a.1
 * (countered → never triggers), 135 / 202 ("spent [4]" = ENERGY actually paid for THAT spell: cost
 * reductions lower it, a paid [Repeat] raises it, Power pips never count — contrast rule 206
 * "costs", which reads the printed value), 402.1 ("you may": the controller may decline; the item
 * leaves the chain), 394–397 (Linked Abilities: "spells banished WITH ME" counts only spells this
 * ability banished, never spells exiled by anything else), 190.6 ("you" = the legend's controller).
 *
 * Head-judge notes — the tricky situations for THIS card:
 *  1. "it" is the SPELL just played — never a unit. The whole card is a slow engine that exiles your
 *     own big spells and cashes the fourth in for 4 runes + a card.
 *  2. Spent vs costs: Sky Splitter ([8], reduced by your best Might) paid for 3 does NOT qualify;
 *     Downstage Dramatics ([2] + Repeat [2]) paid for 4 DOES; a [3]+[mind] spell does not (3 energy).
 *  3. Exactly-four payoff: with three already banished with Virtuoso, the fourth acceptance sends all
 *     four to trash, channels 4 runes and draws 1 — and a spell some other effect banished is not
 *     counted toward the four.
 *  4. Negative space: [3] spent → no trigger at all; opponent's [6] spell → nothing; countered → nothing;
 *     declining → the spell simply stays in trash.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-181-219";
const SKY_SPLITTER = "ogn-014-298"; // [Action] 8 + [fury], reduced by your highest Might: deal 5 to a unit at a bf
const DOWNSTAGE = "unl-061-219"; // [Reaction] 2, [Repeat] [2]: draw 1
const WIND_WALL = "ogn-064-298"; // [Reaction] 3 + [calm][calm]: counter a spell

/** Inline Mind "Draw 1" spell with a chosen energy (and optional power) cost. */
const study = (energyCost: number, powerCost: string[] = []) => ({
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost,
  name: `Study ${energyCost}`,
  powerCost,
  timing: "action",
});

function board(legendMeta?: Record<string, unknown>) {
  return scenario()
    .resources(P1, { energy: 10, power: { mind: 2, fury: 1 } })
    .card("jhin", { def: CARD, meta: legendMeta, owner: P1, zone: "legendZone" })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Bystander" }, "bystander")
    .unit(P1, "base", { might: 2, name: "Stagehand" }, "stagehand");
}

/** Cast, let the spell resolve (both pass), and report whether Virtuoso then asked its "you may". */
async function castAndSeeOffer(game: Game, spell: string, opts: Parameters<Game["p1"]["cast"]>[1] = {}): Promise<boolean> {
  await game.p1.cast(spell, opts);
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d) {
      return false;
    }
    if (d.kind === "yes-no" && d.seat === P1) {
      return true;
    }
    if (d.kind === "action" && d.context === "main") {
      return false;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else {
      return false;
    }
  }
  return false;
}

describe("Virtuoso (unl-181-219)", () => {
  test("registry payload — the optional play-spell trigger (spent ≥ 4) must banish the SPELL ('it') and carry the 'four banished with me → trash them, channel 4, draw 1' follow-up; the parse banishes 'a unit' and drops the follow-up", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Jhin", name: "Virtuoso" });
    const [ability] = (def?.abilities ?? []) as { type: string; optional?: boolean; trigger?: unknown; condition?: unknown; effect?: unknown }[];
    expect(ability).toMatchObject({ condition: { amount: 4, type: "spell-energy-spent" }, optional: true, trigger: { event: "play-spell", on: "controller" }, type: "triggered" });
    const effect = JSON.stringify(ability?.effect);
    expect(effect).not.toContain('"target":{"type":"unit"}');
    expect(effect).toMatch(/trigger-source|triggering-card|"it"|played-card/);
    expect(effect).toContain("channel");
    expect(effect).toContain("draw");
  });

  test("timing + 'you may': a [4] spell resolves first (draw happens, spell in trash), THEN Virtuoso's trigger is a chain item asking P1 yes/no; declining leaves the spell in trash and touches nothing", async () => {
    const game = await board().hand(P1, study(4), "s4").build();
    await game.p1.cast("s4");
    expect(game.p1.energy()).toBe(6);
    expect(game.chain().map((c) => c.cardId)).toEqual(["s4"]); // no trigger yet (419.4.a)
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("s4")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jhin", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("s4")).toBe("trash");
    expect(game.zoneOf("stagehand")).toBe("base");
    expect(game.zoneOf("bystander")).toBe("battlefield-bf1");
    expect(game.p1.banishment()).toEqual([]);
  });

  test("accepting banishes IT — the spell moves trash → banishment and no unit is touched; the engine instead asks for a unit and banishes that", async () => {
    // Expected: s4 in P1's banishment, both units where they were, no further prompt.
    // Actual: a "choose a target" pick over the units appears and the spell stays in trash.
    const game = await board().hand(P1, study(4), "s4").build();
    expect(await castAndSeeOffer(game, "s4")).toBe(true);
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("stagehand")).toBe("base");
    expect(game.zoneOf("bystander")).toBe("battlefield-bf1");
    expect(game.zoneOf("s4")).toBe("banishment");
  });

  test("threshold: spending only [3] raises no trigger at all — no chain item, no question, spell to trash", async () => {
    const game = await board().hand(P1, study(3), "s3").build();
    expect(await castAndSeeOffer(game, "s3")).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("s3")).toBe("trash");
    expect(game.p1.energy()).toBe(7);
  });

  test("Power is not Energy: a [3]+[mind] spell (4 'resources', 3 energy spent) does not trigger", async () => {
    const game = await board().hand(P1, study(3, ["mind"]), "s3m").build();
    expect(await castAndSeeOffer(game, "s3m")).toBe(false);
    expect(game.p1.resources().power.mind).toBe(1);
    expect(game.zoneOf("s3m")).toBe("trash");
  });

  test("SPENT, not printed (contrast rule 206): Sky Splitter [8] reduced to 3 by a 5-Might ally does not trigger", async () => {
    const game = await board().unit(P1, "base", { might: 5, name: "Diva" }, "diva").hand(P1, SKY_SPLITTER, "sky").build();
    expect(await castAndSeeOffer(game, "sky", { targets: "bystander" })).toBe(false);
    expect(game.p1.energy()).toBe(7); // 10 − (8 − 5)
    expect(game.zoneOf("bystander")).toBe("trash"); // the spell itself worked
    expect(game.zoneOf("sky")).toBe("trash");
  });

  test("SPENT includes a paid [Repeat]: Downstage Dramatics for 2+2 triggers the offer; cast plainly for 2 it does not", async () => {
    const paid = await board().hand(P1, DOWNSTAGE, "dd").build();
    expect(await castAndSeeOffer(paid, "dd", { repeat: 1 })).toBe(true);
    expect(paid.p1.energy()).toBe(6);
    expect(paid.p1.hand()).toHaveLength(2); // drew twice before the trigger asks
    await paid.p1.no();

    const plain = await board().hand(P1, DOWNSTAGE, "dd").build();
    expect(await castAndSeeOffer(plain, "dd")).toBe(false);
    expect(plain.p1.energy()).toBe(8);
  });

  test("'you': the opponent resolving a [6] spell on their turn asks Virtuoso's controller nothing", async () => {
    const game = await board().active(P2).resources(P2, { energy: 6 }).hand(P2, study(6), "theirs").build();
    await game.p2.cast("theirs");
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("countered (Wind Wall): the [4] spell never resolves, so Virtuoso never triggers (419.4.a.1)", async () => {
    const game = await board().resources(P2, { energy: 3, power: { calm: 2 } }).hand(P1, study(4), "s4").hand(P2, WIND_WALL, "ww").build();
    await game.p1.cast("s4");
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("ww", { targets: "s4" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p1.hand()).toEqual([]); // no draw: countered
    expect(game.zoneOf("s4")).toBe("trash");
    expect(game.p1.banishment()).toEqual([]);
  });

  test("the fourth spell banished with Virtuoso cashes in — all four go to their trash, P1 channels 4 runes and draws 1; the engine has no follow-up clause", async () => {
    // Three spells were already banished by Virtuoso (linked via the legend's tracking list). Casting
    // and accepting on a fourth must: empty the linked exile into trash, runes 0 → 4, hand +1 (on top
    // of Study's own draw). Actual: a unit-banish prompt; nothing is channeled or drawn.
    const game = await board({ exiledByThis: ["b1", "b2", "b3"] })
      .banishment(P1, study(5), "b1")
      .banishment(P1, study(6), "b2")
      .banishment(P1, study(7), "b3")
      .banishment(P1, study(9), "stray") // exiled by something else — not "with me" (397)
      .hand(P1, study(4), "s4")
      .build();
    expect(game.p1.runes()).toHaveLength(0);
    expect(await castAndSeeOffer(game, "s4")).toBe(true);
    await game.p1.yes();
    await game.settle();
    expect(game.p1.runes()).toHaveLength(4);
    expect(game.zoneOf("s4")).toBe("trash");
    expect(game.zoneOf("b1")).toBe("trash");
    expect(game.zoneOf("b2")).toBe("trash");
    expect(game.zoneOf("b3")).toBe("trash");
    expect(game.zoneOf("stray")).toBe("banishment");
    expect(game.p1.hand()).toHaveLength(2); // Study's draw + Virtuoso's draw
    expect(game.zoneOf("stagehand")).toBe("base");
  });
});
