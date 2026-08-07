/**
 * Pickpocket — sfd-074-221 · Unit · Mind · 3 energy (no power) · 3 might
 *
 *   When you play me, you may kill a gear with Energy cost no more than [1]. If you do, play a
 *   Gold gear token exhausted.
 *
 * Head-judge notes — the tricky situations for this card:
 *   1. "a gear with Energy cost no more than [1]": ANY player's gear (no "friendly"/"enemy"), judged
 *      on printed ENERGY cost only (a [0]+power Seal qualifies; a [2] Scrapheap does not — and
 *      wrongly killing Scrapheap would even hand its owner a card). Equipment is gear (150.4), attached
 *      or not; tokens (Gold, cost 0) are gear too — including your own.
 *   2. "you may … If you do": optional on resolution; the Gold token is played only if a gear was
 *      actually killed — no legal/no chosen gear ⇒ no Gold.
 *   3. The Gold token is played to PICKPOCKET'S CONTROLLER's base, exhausted (179: token controller =
 *      controller of the creating ability), even when the killed gear was the opponent's.
 *   4. The token is a real Gold (187.5 / sfd-t03): once it readies on a later turn its
 *      "Kill this, [Exhaust]: [Add] [rainbow]" works.
 *   5. Cost/legality: exactly 3 energy; 2 is not enough; the trigger rides the chain after the unit lands.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-074-221";
const ORB = "ogn-090-298"; // Orb of Regret — gear, 1 energy
const SEAL = "ogn-120-298"; // Seal of Insight — gear, 0 energy + [mind]
const SCRAPHEAP = "ogn-182-298"; // gear, 2 energy: "When this is played, discarded, or killed, draw 1."
const DIRK = "sfd-009-221"; // Serrated Dirk — Equipment, 1 energy
const GOLD = "sfd-t03"; // Gold gear token, 0 energy

function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .hand(P1, CARD, "pp")
    .gear(P2, ORB, "orb")
    .gear(P2, SEAL, "seal")
    .gear(P1, GOLD, "myGold");
}

type G = Awaited<ReturnType<ReturnType<typeof board>["build"]>>;

/** Play Pickpocket, let the trigger resolve, accept the "you may", and (if asked) choose `target`. */
async function playAndSteal(game: G, target?: string) {
  await game.p1.play("pp");
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  await game.settle();
  if (target !== undefined && game.decision()?.kind === "pick") {
    await game.p1.pick(target);
    await game.settle();
  }
}

function goldTokens(game: G, seat: "p1" | "p2") {
  return game[seat].gear().filter((id) => id !== "myGold" && game.state(id).name === "Gold");
}

describe("Pickpocket (sfd-074-221)", () => {
  test("parsed ability should keep the 'Energy cost no more than [1]' filter on the kill target and gate Gold on 'if you do'", async () => {
    // Expected: kill target {type:"gear", filter/costAtMost: 1 …} and a conditional keyed on the kill having happened.
    // Actual: target is a bare {type:"gear"} (any cost) and the condition is "paid-additional-cost".
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 3, might: 3, name: "Pickpocket" });
    const ab = (def?.abilities ?? []) as { type: string; optional?: boolean; trigger?: { event: string }; effect?: { type: string; effects?: Record<string, unknown>[] } }[];
    expect(ab).toHaveLength(1);
    expect(ab[0]).toMatchObject({ optional: true, trigger: { event: "play-self" }, type: "triggered" });
    const [kill, then] = ab[0]?.effect?.effects ?? [];
    expect(kill).toMatchObject({ target: { type: "gear" }, type: "kill" });
    expect(JSON.stringify(kill?.target)).toMatch(/"(energyCost|cost|maxCost|costAtMost)"/); // some ≤1 energy filter must exist
    expect(then).toMatchObject({ then: { ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" }, type: "conditional" });
    expect((then?.condition as { type?: string } | undefined)?.type).not.toBe("paid-additional-cost");
  });

  test("cost: 3 energy for a 3-might unit into base; the optional play trigger goes on the chain; 2 energy is not enough", async () => {
    const game = await board().build();
    await game.p1.play("pp");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("pp")).toBe("base");
    expect(game.state("pp").might).toBe(3);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pp", controller: P1, triggered: true })]);
    expect(game.zoneOf("orb")).toBe("base"); // nothing dies before resolution
    const poor = await board().resources(P1, { energy: 2 }).build();
    expect(poor.p1.can("play", "pp")).toBe(false);
  });

  test("accept → kill an ENEMY 1-cost gear (Orb): Orb to its owner's trash, an exhausted Gold token appears in MY base, none for them", async () => {
    const game = await board().build();
    await playAndSteal(game, "orb");
    expect(game.zoneOf("orb")).toBe("trash");
    expect(game.state("orb").owner).toBe(P2);
    const gold = goldTokens(game, "p1");
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0] as string)).toMatchObject({ cardType: "gear", controller: P1, isExhausted: true, isToken: true, name: "Gold", owner: P1 });
    expect(goldTokens(game, "p2")).toEqual([]);
    expect(game.zoneOf("seal")).toBe("base");
    expect(game.zoneOf("myGold")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("'Energy cost' only: a [0]-energy gear with a power cost (Seal of Insight) is a legal victim", async () => {
    const game = await board().build();
    await playAndSteal(game, "seal");
    expect(game.zoneOf("seal")).toBe("trash");
    expect(goldTokens(game, "p1")).toHaveLength(1);
  });

  test("your own gear is fair game: killing my ready Gold token yields a fresh EXHAUSTED Gold (net one Gold, tapped)", async () => {
    const game = await board().build();
    expect(game.state("myGold").isReady).toBe(true);
    await playAndSteal(game, "myGold");
    expect(game.zoneOf("myGold")).not.toBe("base");
    const gold = goldTokens(game, "p1");
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0] as string).isExhausted).toBe(true);
  });

  test("decline the 'you may': nothing is killed and no Gold token is played", async () => {
    const game = await board().build();
    await game.p1.play("pp");
    await game.settle();
    expect(game.decision()?.kind).toBe("yes-no");
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("orb")).toBe("base");
    expect(game.zoneOf("seal")).toBe("base");
    expect(goldTokens(game, "p1")).toEqual([]);
    expect(game.p1.gear()).toEqual(["myGold"]);
  });

  test("'If you do': with no gear on the board at all, accepting does nothing — no Gold token", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "pp").build();
    await game.p1.play("pp");
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
      await game.settle();
    }
    expect(game.p1.gear()).toEqual([]);
    expect(game.p2.gear()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("'no more than [1]' — a 2-cost gear (Scrapheap) is never offered as a victim", async () => {
    // Expected pick options: myGold, orb, seal (all ≤ 1); scrap (2) absent. Actual: every gear on the board is offered.
    const game = await board().gear(P2, SCRAPHEAP, "scrap").build();
    await game.p1.play("pp");
    await game.settle();
    await game.p1.yes();
    await game.settle();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    const offered = (d?.kind === "pick" ? d.options.map((o) => o.card) : []).sort();
    expect(offered).toEqual(["myGold", "orb", "seal"]);
  });

  test("with only a 2-cost gear around, accepting kills nothing → Scrapheap survives, its owner draws nothing, no Gold", async () => {
    // Expected: no legal ≤1 gear ⇒ the kill fizzles and "if you do" fails. Actual: Scrapheap is killed,
    // P2 draws off its death trigger and P1 gets a Gold token.
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "pp").gear(P2, SCRAPHEAP, "scrap").build();
    const p2Hand = game.p2.hand().length;
    await game.p1.play("pp");
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
      await game.settle();
    }
    expect(game.zoneOf("scrap")).toBe("base");
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.p1.gear()).toEqual([]);
  });

  test("an ATTACHED 1-cost Equipment (Serrated Dirk on an enemy unit) is still gear: it is killed off the unit and Gold is played", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .hand(P1, CARD, "pp")
      .unit(P2, "base", { might: 3, name: "Wielder" }, "wielder", { equippedWith: ["dirk"] })
      .gear(P2, DIRK, "dirk", { attachedTo: "wielder" })
      .build();
    expect(game.state("dirk").attachedTo).toBe("wielder");
    expect(game.state("wielder").attachments).toEqual(["dirk"]);
    await playAndSteal(game, "dirk");
    expect(game.zoneOf("dirk")).toBe("trash");
    expect(game.zoneOf("wielder")).toBe("base");
    expect(goldTokens(game, "p1")).toHaveLength(1);
  });

  test.failing("BUG: killing an attached Equipment must also clear it from the unit's attachments (719.2) — a stale link remains", async () => {
    // Expected: after the Dirk dies the Wielder has no attachments. Actual: the unit still lists "dirk".
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .hand(P1, CARD, "pp")
      .unit(P2, "base", { might: 3, name: "Wielder" }, "wielder", { equippedWith: ["dirk"] })
      .gear(P2, DIRK, "dirk", { attachedTo: "wielder" })
      .build();
    await playAndSteal(game, "dirk");
    expect(game.zoneOf("dirk")).toBe("trash");
    expect(game.state("wielder").attachments).toEqual([]);
  });

  test("the token is a real Gold: it enters exhausted, readies on my next turn, and 'Kill this, [Exhaust]: [Add] [rainbow]' then works", async () => {
    const game = await board().build();
    await playAndSteal(game, "orb");
    const gold = goldTokens(game, "p1")[0] as string;
    expect(game.p1.can("activate", gold)).toBe(false); // exhausted this turn
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state(gold).isReady).toBe(true);
    await game.p1.activate(gold);
    // rule 186.1 — the cashed-in token ceases to exist rather than landing in a zone.
    expect(game.has(gold) ? game.zoneOf(gold) : "gone").not.toBe("base");
    expect(game.p1.power("rainbow")).toBe(1);
  });
});
