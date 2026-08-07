/**
 * Public Execution — ven-154-166 · Spell · Body/Order · 2 energy + [rainbow] (body/order hybrid pip)
 *
 *   Choose a friendly unit. Kill an enemy unit with less Might than it.
 *   [Flow] [5][rainbow][rainbow] (You may play this from your trash for its Flow cost. Then banish it.)
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. TWO targets chosen at play time, in text order: a FRIENDLY unit (the yardstick) and an ENEMY unit whose
 *     Might is strictly LESS than the yardstick's. Equal Might is not "less". No location restriction —
 *     units in either base qualify on both sides.
 *  2. Legality needs a valid PAIR: no friendly unit → unplayable; friendly units present but every enemy is
 *     at least as big → unplayable (355: a spell with no legal targets for a required choice can't be played).
 *  3. Might is CURRENT Might (710): a pumped 2-Might friendly at 5 can execute a 4.
 *  4. 359.3.e — the "less Might than it" requirement is re-checked on resolution: if the victim is pumped in
 *     response to match/exceed the yardstick, the kill is not executed (spell still resolves to trash).
 *  5. Flow (829): from the TRASH the cost is 5 energy + 2 rainbow INSTEAD of 2 + 1 (alternate cost), same
 *     timing (standard speed only), and the card is banished afterwards instead of returning to the trash.
 *  6. Engine note: hybrid/rainbow pips are paid from `power.rainbow`.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-154-166";
const DISCIPLINE = "ogn-058-298"; // [Reaction] · 2 · Give a unit +2 Might this turn. Draw 1.

/** P1: 4-Might Ally in base; P2: Small(3) + Big(6) at bf1, Twin(4) + Runt(2) in base; the spell in hand AND a second copy in trash. */
function board(res: { energy: number; power?: Record<string, number> } = { energy: 9, power: { rainbow: 3 } }) {
  return scenario()
    .resources(P1, res)
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 4, name: "Ally" }, "ally")
    .unit(P2, "bf1", { might: 3, name: "Small" }, "small")
    .unit(P2, "bf1", { might: 6, name: "Big" }, "big")
    .unit(P2, "base", { might: 4, name: "Twin" }, "twin")
    .unit(P2, "base", { might: 2, name: "Runt" }, "runt")
    .hand(P1, CARD, "pe")
    .trash(P1, CARD, "peTrash");
}

const targetOptions = (game: Game, card: string) => game.p1.option("cast", card)?.fields.find((f) => f.arg === "targets")?.options;

describe("Public Execution (ven-154-166)", () => {
  test("affordability from hand: 2 energy + 1 rainbow → castable; 1 energy, or no rainbow pip → not castable", async () => {
    expect((await board({ energy: 2, power: { rainbow: 1 } }).build()).p1.can("cast", "pe")).toBe(true);
    expect((await board({ energy: 1, power: { rainbow: 1 } }).build()).p1.can("cast", "pe")).toBe(false);
    expect((await board({ energy: 2 }).build()).p1.can("cast", "pe")).toBe(false);
  });

  // BUG — expected: two play-time choices in text order [friendly yardstick, enemy victim]; casting deducts
  // 2 energy + 1 rainbow and the smaller enemy dies. Actual: the parsed spell has a single "enemy unit"
  // target with no Might comparison, so the [ally, small] pair is rejected outright.
  test("cast [Ally(4) → Small(3)]: pays 2 energy + 1 rainbow, one chain item, Small is killed, Big untouched, spell to trash", async () => {
    const game = await board().build();
    await game.p1.cast("pe", { targets: ["ally", "small"] });
    expect(game.p1.resources()).toEqual({ energy: 7, power: { rainbow: 2 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pe", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
    expect(game.zoneOf("ally")).toBe("base"); // the yardstick is only measured, never harmed
    expect(game.zoneOf("pe")).toBe("trash");
  });

  // BUG — expected: with the lone 4-Might Ally as yardstick, only enemies with Might < 4 are legal victims:
  // Small(3) and Runt(2) — not Twin(4, equal is not less) and not Big(6). Actual: every enemy unit is offered.
  test("legal pairs are exactly [ally,small] and [ally,runt] — equal (Twin 4) and bigger (Big 6) enemies are not offered and are rejected", async () => {
    const game = await board().build();
    const pairs = targetOptions(game, "pe");
    expect(pairs).toHaveLength(2);
    expect(pairs).toEqual(expect.arrayContaining([["ally", "small"], ["ally", "runt"]]));
    expect((await game.p1.try((p) => p.cast("pe", { targets: ["ally", "twin"] }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("pe", { targets: ["ally", "big"] }))).ok).toBe(false);
    expect(game.zoneOf("pe")).toBe("hand");
  });

  // BUG — expected: an enemy unit sitting in ITS BASE is as legal as one at a battlefield (no location word
  // on the card). Actual: rejected because the two-target form does not exist.
  test("no location restriction — [Ally(4) → Runt(2) in the enemy base] kills the Runt", async () => {
    const game = await board().build();
    await game.p1.cast("pe", { targets: ["ally", "runt"] });
    await game.settle();
    expect(game.zoneOf("runt")).toBe("trash");
    expect(game.p2.units("base")).toEqual(["twin"]);
  });

  // BUG — expected (355): with NO friendly unit there is no yardstick, so the spell cannot be played at all
  // even though enemy units exist. Actual: castable (only an enemy target is required).
  test("no friendly unit on the board → not castable", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { rainbow: 3 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Small" }, "small")
      .hand(P1, CARD, "pe")
      .build();
    expect(game.p1.can("cast", "pe")).toBe(false);
  });

  // BUG — expected: friendly units exist but every enemy has AT LEAST as much Might as the biggest friendly →
  // no legal pair → not castable. Actual: castable against any enemy.
  test("friendly 3 vs enemies 3 and 5 → no enemy has LESS Might → not castable", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { rainbow: 3 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .unit(P2, "bf1", { might: 3, name: "Peer" }, "peer")
      .unit(P2, "bf1", { might: 5, name: "Big" }, "big")
      .hand(P1, CARD, "pe")
      .build();
    expect(game.p1.can("cast", "pe")).toBe(false);
  });

  // BUG — expected (710): CURRENT Might is compared — a printed-2 friendly carrying +3 this turn (5) may
  // execute the 4-Might Twin. Actual: two-target form rejected.
  test("current Might counts — a 2-Might friendly at +3 (5) executes Twin(4)", async () => {
    const game = await board().unit(P1, "base", { might: 2, name: "Pumped" }, "pumped", { mightModifier: 3 }).build();
    expect(game.state("pumped").might).toBe(5);
    await game.p1.cast("pe", { targets: ["pumped", "twin"] });
    await game.settle();
    expect(game.zoneOf("twin")).toBe("trash");
  });

  // BUG — expected (359.3.e.2 / .4 / .5): P2 answers with Discipline on Small (3 → 5 ≥ Ally's 4); when Public Execution
  // resolves its victim no longer has less Might than the yardstick, so the kill is skipped; the spell still
  // goes to the trash and P2 drew 1 off Discipline. Actual: two-target form rejected.
  test("victim pumped in response to ≥ the yardstick → the kill is not executed (spell still resolves to trash)", async () => {
    const game = await board().resources(P2, { energy: 2 }).hand(P2, DISCIPLINE, "disc").build();
    await game.p1.cast("pe", { targets: ["ally", "small"] });
    await game.p1.passPriority();
    await game.p2.cast("disc", { targets: "small" });
    await game.settle();
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("small")).toMatchObject({ might: 5, zone: "battlefield-bf1" });
    expect(game.zoneOf("pe")).toBe("trash");
  });

  test("Flow affordability from the trash: exactly 5 energy + 2 rainbow (the alternate cost REPLACES 2+[rainbow]); 4 energy or a single rainbow → not castable", async () => {
    const ok = await board({ energy: 5, power: { rainbow: 2 } }).build();
    expect(ok.p1.can("cast", "peTrash")).toBe(true);
    expect(ok.p1.option("cast", "peTrash")?.fields.find((f) => f.arg === "flow")?.options).toEqual([true]);
    expect((await board({ energy: 4, power: { rainbow: 2 } }).build()).p1.can("cast", "peTrash")).toBe(false);
    expect((await board({ energy: 5, power: { rainbow: 1 } }).build()).p1.can("cast", "peTrash")).toBe(false);
  });

  // BUG — expected (829): Flow from the trash for 5 + 2 rainbow with the same two choices; Small dies; the
  // card is BANISHED (not back to the trash) and cannot be Flowed again. Actual: two-target form rejected.
  test("Flow — cast from trash for 5 energy + 2 rainbow, kills Small, then is banished and no longer castable", async () => {
    const game = await board({ energy: 5, power: { rainbow: 2 } }).build();
    await game.p1.cast("peTrash", { flow: true, targets: ["ally", "small"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.zoneOf("peTrash")).toBe("chain");
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.zoneOf("peTrash")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("peTrash");
    expect(game.p1.can("cast", "peTrash")).toBe(false);
  });

  test("timing (829.1.b.2): standard speed — neither the hand copy nor the Flow-able trash copy is castable on the opponent's turn or inside a showdown", async () => {
    const opp = await board().active(P2).build();
    expect(opp.p1.can("cast", "pe")).toBe(false);
    expect(opp.p1.can("cast", "peTrash")).toBe(false);
    const sd = await board().build();
    await sd.p1.move("ally", "bf1");
    expect(sd.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(sd.p1.can("cast", "pe")).toBe(false);
    expect(sd.p1.can("cast", "peTrash")).toBe(false);
  });

  test("registry payload — costs: 2 energy + one rainbow pip, dual domain, standard timing, and Flow [5][rainbow][rainbow] as the second ability", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: ["body", "order"], energyCost: 2, name: "Public Execution", powerCost: ["rainbow"], timing: "standard" });
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[1]).toEqual({ cost: { energy: 5, power: ["rainbow", "rainbow"] }, keyword: "Flow", type: "keyword" });
  });

  // BUG (parse) — expected: the spell ability names BOTH a friendly-unit choice and an enemy-unit kill gated
  // on "less Might than" the friendly one. Actual: `{type:"kill", target:{type:"unit", controller:"enemy"}}`
  // — the yardstick and the comparison were dropped, so any enemy unit can be executed.
  test("registry payload — main ability must carry the friendly yardstick and the Might comparison", async () => {
    const pool = await loadDefaultCardPool();
    const main = JSON.stringify(pool.get(CARD)?.abilities?.[0] ?? {});
    expect(main).toContain('"type":"kill"');
    expect(main).toContain('"controller":"enemy"');
    expect(main).toContain('"controller":"friendly"');
    expect(main).toMatch(/less|lt"|lessThan/i);
  });
});
