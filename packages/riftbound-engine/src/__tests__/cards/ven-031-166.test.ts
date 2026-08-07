/**
 * Twilight Shroud — ven-031-166 · Spell · Calm · 1 energy
 *
 *   Give a friendly unit +1 [Might] this turn. It can't be chosen by enemy spells and abilities
 *   this turn.
 *   [Flow] [2] (You may play this from your trash for its Flow cost. Then banish it.)
 *
 * Head-judge checklist for this card:
 *  - No [Action]/[Reaction]: a standard-speed spell — only on your own turn in a Neutral Open state.
 *    Flow does NOT change that (829.1.b.2): the trash copy is equally uncastable on the opponent's
 *    turn / in a showdown. So the protection has to be set up BEFORE you attack.
 *  - "friendly unit" only: enemy units are never legal; no friendly unit → not playable.
 *  - "can't be chosen by ENEMY spells and abilities": the opponent's targeted spell (an [Action] cast
 *    with Focus in your showdown) and the opponent's targeted TRIGGERED ability (a "When I defend,
 *    deal 3 to an enemy unit here" defender) must both skip it — while your own spells still may
 *    choose it, and non-targeting effects ("deal 2 to ALL enemy units") still hit it.
 *  - Both halves are "this turn": next turn the +1 and the protection are gone and the opponent can
 *    pick it off on their own turn.
 *  - Flow (829): from the TRASH for [2] (an alternate cost replacing the [1]), resolves normally, then
 *    is BANISHED instead of returning to the trash — so each copy Flows at most once; a hand-cast copy
 *    lands in the trash and can be Flowed later the same turn.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-031-166";
/** Opponent's targeted [Action] removal. */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Bolt",
  rulesText: "[Action] Deal 3 to a unit.",
  timing: "action",
} as const;
/** Opponent's NON-targeting sweep. */
const WAVE = {
  abilities: [{ effect: { amount: 2, target: { controller: "enemy", quantity: "all", type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Wave",
  rulesText: "[Action] Deal 2 to all enemy units.",
  timing: "action",
} as const;
/** Opponent's defender with a targeted triggered ability. */
const THORNBACK = {
  abilities: [{ effect: { amount: 3, target: { controller: "enemy", location: "here", type: "unit" }, type: "damage" }, trigger: { event: "defend", on: "self" }, type: "triggered" }],
  cardType: "unit",
  might: 1,
  name: "Thornback",
  rulesText: "When I defend, deal 3 to an enemy unit here.",
} as const;

/** P1's turn: 2-Might "ally" + 2-Might "buddy" in base, Shroud in hand (1 energy); P2 holds bf1 with a 5-Might blocker and has a Bolt. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
    .unit(P2, "bf1", { might: 5, name: "Blocker" }, "blocker")
    .hand(P1, CARD, "shroud")
    .hand(P2, BOLT, "bolt");
}

async function shroudAlly(game: Game): Promise<void> {
  await game.p1.cast("shroud", { targets: "ally" });
  await game.settle();
}

const targetsOf = (game: Game, seat: "p1" | "p2", card: string) => game[seat].option("cast", card)?.fields.find((f) => f.arg === "targets")?.options;

describe("Twilight Shroud (ven-031-166)", () => {
  test("registry payload: standard-speed spell — [+1 Might this turn to a friendly unit, then Untargetable this turn] + Flow [2]", async () => {
    const game = await scenario().hand(P1, CARD, "shroud").build();
    expect(game.state("shroud")).toMatchObject({ cardType: "spell", energyCost: 1, name: "Twilight Shroud", powerCost: [] });
    const def = peekDefaultCardPool()?.get(CARD) as unknown as { timing?: string; abilities: { type: string; keyword?: string; cost?: unknown; effect?: { type: string; effects?: Record<string, unknown>[] } }[] };
    expect(def.timing).toBe("standard");
    expect(def.abilities).toHaveLength(2);
    expect(def.abilities[0]?.type).toBe("spell");
    expect(def.abilities[0]?.effect?.type).toBe("sequence");
    expect(def.abilities[0]?.effect?.effects).toEqual([
      expect.objectContaining({ amount: 1, duration: "turn", target: { controller: "friendly", type: "unit" }, type: "modify-might" }),
      expect.objectContaining({ duration: "turn", keyword: "Untargetable", type: "grant-keyword" }),
    ]);
    expect(def.abilities[1]).toEqual({ cost: { energy: 2 }, keyword: "Flow", type: "keyword" });
  });

  test("cost & targets: 1 energy; only FRIENDLY units are offered (enemy blocker is not); no friendly unit → not playable; 0 energy → not playable", async () => {
    const game = await board().build();
    expect(targetsOf(game, "p1", "shroud")).toEqual(expect.arrayContaining([["ally"], ["buddy"]]));
    expect(targetsOf(game, "p1", "shroud")).toHaveLength(2);
    expect((await game.p1.try((p) => p.cast("shroud", { targets: "blocker" }))).ok).toBe(false);
    await game.p1.cast("shroud", { targets: "ally" });
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("shroud")).toBe("chain");
    expect((await scenario().resources(P1, { energy: 1 }).unit(P2, "base", { might: 1 }, "foe").hand(P1, CARD, "s").build()).p1.can("cast", "s")).toBe(false);
    expect((await scenario().resources(P1, { energy: 0 }).unit(P1, "base", { might: 1 }, "a").hand(P1, CARD, "s").build()).p1.can("cast", "s")).toBe(false);
  });

  test("resolves: the chosen unit gets +1 Might and Untargetable for the turn; the other friendly unit gets nothing; the spell goes to the trash", async () => {
    const game = await board().build();
    await shroudAlly(game);
    expect(game.state("ally")).toMatchObject({ grantedKeywords: [{ duration: "turn", keyword: "Untargetable" }], might: 3 });
    expect(game.state("buddy")).toMatchObject({ grantedKeywords: [], might: 2 });
    expect(game.state("blocker").grantedKeywords).toEqual([]);
    expect(game.zoneOf("shroud")).toBe("trash");
  });

  test("enemy SPELL can't choose it: in the ensuing showdown P2's Bolt may pick Buddy but not the shrouded Ally", async () => {
    const game = await board().build();
    await shroudAlly(game);
    await game.p1.move(["ally", "buddy"], "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.passFocus();
    expect(game.actingSeat()).toBe(P2);
    expect(targetsOf(game, "p2", "bolt")).toEqual(expect.arrayContaining([["buddy"], ["blocker"]]));
    expect(targetsOf(game, "p2", "bolt")).not.toContainEqual(["ally"]);
    expect((await game.p2.try((p) => p.cast("bolt", { targets: "ally" }))).ok).toBe(false);
    await game.p2.cast("bolt", { targets: "buddy" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("buddy")).toBe("trash");
    expect(game.state("ally")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
  });

  test("your OWN spells may still choose it (only ENEMY spells are locked out)", async () => {
    const game = await board().hand(P1, BOLT, "mybolt").build();
    await shroudAlly(game);
    expect(targetsOf(game, "p1", "mybolt")).toEqual(expect.arrayContaining([["ally"], ["buddy"], ["blocker"]]));
  });

  test("enemy ABILITY can't choose it: a 'When I defend, deal 3 to an enemy unit here' defender finds no legal target — the shrouded 3-Might attacker survives, wins and conquers", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).battlefield("bf1", { controller: P2 }).unit(P1, "base", { might: 2, name: "Ally" }, "ally").unit(P2, "bf1", THORNBACK, "thorn").hand(P1, CARD, "shroud").build();
    await shroudAlly(game);
    await game.p1.move("ally", "bf1");
    expect(game.chain()).toEqual([]); // rule 402.4: no legal target ⇒ removed unfinalized
    await game.settle();
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
    expect(game.zoneOf("thorn")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("negative control: WITHOUT the Shroud that same defender trigger picks the lone attacker and kills it before combat", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", { might: 2, name: "Ally" }, "ally").unit(P2, "bf1", THORNBACK, "thorn").build();
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("thorn")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("Untargetable is not immunity: P2's non-targeting 'deal 2 to ALL enemy units' still damages the shrouded unit", async () => {
    const game = await board().hand(P2, WAVE, "wave").build();
    await shroudAlly(game);
    await game.p1.move("ally", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("wave");
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("ally").damage).toBe(2); // 3 Might → survives with 2 marked
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
    expect(game.zoneOf("buddy")).toBe("trash"); // the unshrouded 2-Might Buddy in base dies to the same sweep
    expect(game.zoneOf("blocker")).toBe("battlefield-bf1"); // "enemy" from P2's side: its own unit is untouched
  });

  test("'this turn': next turn the +1 and the protection are gone and P2 can Bolt it on their own turn", async () => {
    const game = await board().build();
    await shroudAlly(game);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("ally")).toMatchObject({ grantedKeywords: [], might: 2 });
    expect(targetsOf(game, "p2", "bolt")).toContainEqual(["ally"]);
    await game.p2.cast("bolt", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
  });

  test("timing: standard speed — neither the hand copy nor a Flow-able trash copy is castable on the opponent's turn or during a showdown (829.1.b.2)", async () => {
    const opp = await scenario().active(P2).resources(P1, { energy: 3 }).unit(P1, "base", { might: 2 }, "ally").hand(P1, CARD, "inHand").trash(P1, CARD, "inTrash").build();
    expect(opp.p1.can("cast", "inHand")).toBe(false);
    expect(opp.p1.can("cast", "inTrash")).toBe(false);
    const sd = await scenario().resources(P1, { energy: 3 }).battlefield("bf1", { controller: P2 }).unit(P1, "base", { might: 2 }, "ally").unit(P2, "bf1", { might: 5 }, "blocker").hand(P1, CARD, "inHand").trash(P1, CARD, "inTrash").build();
    await sd.p1.move("ally", "bf1");
    expect(sd.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(sd.p1.can("cast", "inHand")).toBe(false);
    expect((await sd.p1.try((p) => p.cast("inTrash", { flow: true, targets: "ally" }))).ok).toBe(false);
  });

  test("Flow: from the trash for [2] (not [1]) — same effect, then BANISHED instead of trashed, and it cannot be Flowed again", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).unit(P1, "base", { might: 2 }, "ally").trash(P1, CARD, "shroud").build();
    expect(game.p1.option("cast", "shroud")?.fields.find((f) => f.arg === "flow")?.options).toEqual([true]);
    await game.p1.cast("shroud", { flow: true, targets: "ally" });
    expect(game.p1.energy()).toBe(1);
    expect(game.zoneOf("shroud")).toBe("chain");
    await game.settle();
    expect(game.state("ally")).toMatchObject({ grantedKeywords: [{ duration: "turn", keyword: "Untargetable" }], might: 3 });
    expect(game.zoneOf("shroud")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("shroud");
    expect(game.p1.can("cast", "shroud")).toBe(false);
  });

  test("Flow needs the full [2]: with 1 energy the trash copy is not castable (the printed [1] does not apply from the trash)", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", { might: 2 }, "ally").trash(P1, CARD, "shroud").build();
    expect(game.p1.can("cast", "shroud")).toBe(false);
    expect((await game.p1.try((p) => p.cast("shroud", { flow: true, targets: "ally" }))).ok).toBe(false);
    expect(game.zoneOf("shroud")).toBe("trash");
  });

  test("hand cast for [1] goes to the trash, from where the same copy Flows for [2] later that turn onto another unit — 3 energy total, both units end at 3 Might, card banished", async () => {
    const game = await board().resources(P1, { energy: 3 }).build();
    await shroudAlly(game);
    expect(game.zoneOf("shroud")).toBe("trash");
    expect(game.p1.energy()).toBe(2);
    await game.p1.cast("shroud", { flow: true, targets: "buddy" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("ally").might).toBe(3);
    expect(game.state("buddy")).toMatchObject({ grantedKeywords: [{ duration: "turn", keyword: "Untargetable" }], might: 3 });
    expect(game.zoneOf("shroud")).toBe("banishment");
    expect(game.violations()).toEqual([]);
  });
});
