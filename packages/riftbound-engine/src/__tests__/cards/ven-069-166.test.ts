/**
 * Mel, Newly Awakened — ven-069-166 · Champion Unit · Mind · 4 energy + [mind] · 4 Might · Mel
 *
 *   When you play me, draw 1.
 *   [Empower] [3] ([3]: Empower me. Use only if not Empowered.)
 *   [Empowered][>] Your spells and abilities can't be countered. If a spell or ability you control
 *   would give -[Might] to a unit it chooses, it gives an additional -1 [Might].
 *
 * Head-judge checklist for this card:
 *   1. Play trigger: a chain item (opponent gets priority) that draws exactly the top card.
 *   2. rule 827.1.c.1 / 145.2 / 441.1.b — [Empower] [3] is an activated ability: costs 3, uses the
 *      chain, Main-Phase-open-state only, gone once Empowered.
 *   3. "can't be countered" (425) is gated on Empowered: Wind Wall on my Stupefy does nothing while
 *      Mel is Empowered, but counters it normally while she is not; and it never shields the
 *      OPPONENT's spells from my counters.
 *   4. "additional -1 [Might]" applies only to MY targeted -Might (Stupefy −1 → −2, Smoke Screen −4 → −5)
 *      and the spell's own "to a minimum of 1" still clamps the total; the opponent's Stupefy on my
 *      unit is not boosted; nothing changes while Mel is not Empowered.
 *   5. Parser audit: the whole [Empowered] passive is missing from the registry payload today — the
 *      structural test below pins that so it flips when the card is completed.
 *   6. Cost: 4 energy + 1 mind.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-069-166";
const STUPEFY = "ogn-095-298"; // [Reaction] 1: give a unit −1 Might this turn (min 1). Draw 1.
const SMOKE_SCREEN = "ogn-093-298"; // [Reaction] 2+[mind]: give a unit −4 Might this turn (min 1).
const WIND_WALL = "ogn-064-298"; // [Reaction] 3+[calm][calm]: counter a spell.
const FILLER = "ogn-175-298";

/** P1's turn: Mel (empowered or not) in base, P2 has a 4-Might unit, P1 holds Stupefy with 1 energy. */
function stupefyBoard(isEmpowered: boolean) {
  return scenario()
    .resources(P1, { energy: 1 })
    .unit(P1, "base", CARD, "mel", isEmpowered ? { empowered: true } : undefined)
    .unit(P2, "base", { might: 4, name: "Test Subject" }, "foe")
    .hand(P1, STUPEFY, "stupefy");
}

/** P1 casts Stupefy on foe, P2 answers with Wind Wall on it, everything resolves. */
async function stupefyIntoWindWall(game: Game): Promise<void> {
  await game.p1.cast("stupefy", { targets: "foe" });
  await game.p1.passPriority();
  await game.p2.cast("ww");
  expect(game.chain().map((c) => c.cardId)).toEqual(["stupefy", "ww"]);
  await game.settle();
  expect(game.chain()).toEqual([]);
}

describe("Mel, Newly Awakened (ven-069-166)", () => {
  test("registry payload (parsed part): play-self draw-1 trigger + activated Empower [3] with the not-empowered restriction", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 4, isChampion: true, might: 4, powerCost: ["mind"], tags: ["Mel"] });
    expect(def?.abilities?.[0]).toMatchObject({ effect: { amount: 1, type: "draw" }, trigger: { event: "play-self" }, type: "triggered" });
    expect(def?.abilities?.[1]).toMatchObject({
      cost: { energy: 3 },
      effect: { target: "self", type: "empower" },
      restrictions: [{ type: "not-empowered" }],
      type: "activated",
    });
  });

  // Expected: a third (and possibly fourth) ability gated `while-empowered` carrying the
  // "can't be countered" grant and the −Might replacement. Actual: the parser emits only the two
  // abilities above — the entire [Empowered] line is silently dropped.
  test("the [Empowered] passive (uncounterable + extra −1 Might) is present in the parsed abilities", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    const abilities = (def?.abilities ?? []) as { condition?: { type?: string } }[];
    expect(abilities.length).toBeGreaterThanOrEqual(3);
    expect(abilities.some((a) => a.condition?.type === "while-empowered")).toBe(true);
  });

  test("cost 4 + [mind]; 'When you play me, draw 1' is a chain item the opponent may respond to, then draws exactly the top card", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { mind: 1 } })
      .hand(P1, CARD, "mel")
      .deck(P1, [FILLER, FILLER], ["top", "second"])
      .build();
    await game.p1.play("mel");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("mel")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mel", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p1.hand()).toEqual([]);
    await game.p2.passPriority();
    expect(game.p1.hand()).toEqual(["top"]);
    expect(game.p1.deck()[0]).toBe("second");
    expect(game.state("mel")).toMatchObject({ isEmpowered: false, isExhausted: true, might: 4 });
    expect((await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "m").build()).p1.can("play", "m")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3, power: { mind: 1 } }).hand(P1, CARD, "m").build()).p1.can("play", "m")).toBe(false);
  });

  test("[Empower] [3]: pays 3, resolves off the chain into the Empowered state, and is then no longer offered; 2 energy cannot pay it", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).unit(P1, "base", CARD, "mel").build();
    await game.p1.activate("mel");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mel", triggered: false })]);
    await game.settle();
    expect(game.state("mel").isEmpowered).toBe(true);
    await game.p1.do("addResources", { energy: 3 });
    expect(game.p1.can("activate", "mel")).toBe(false);
    expect((await scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARD, "mel").build()).p1.can("activate", "mel")).toBe(false);
  });

  test("rule 145.2: Empower cannot be used on the opponent's turn nor inside a showdown", async () => {
    const opp = await scenario().active(P2).resources(P1, { energy: 5 }).unit(P1, "base", CARD, "mel").build();
    expect(opp.p1.can("activate", "mel")).toBe(false);
    const sd = await scenario()
      .resources(P1, { energy: 5 })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "mel")
      .unit(P1, "base", { might: 1 }, "scout")
      .autoProcedures(false)
      .build();
    await sd.p1.move("scout", "bf1");
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(sd.p1.can("activate", "mel")).toBe(false);
  });

  test("negative space — NOT empowered: my Stupefy gives exactly −1 (4 → 3) and draws 1", async () => {
    const game = await stupefyBoard(false).build();
    await game.p1.cast("stupefy", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").might).toBe(3);
    expect(game.p1.hand()).toHaveLength(1);
  });

  // Expected: Empowered Mel adds −1 to my targeted −Might: Stupefy's −1 becomes −2 (4 → 2).
  // Actual: the Empowered passive is unimplemented, foe ends at 3.
  test("Empowered — my Stupefy gives an additional −1 Might (4 → 2)", async () => {
    const game = await stupefyBoard(true).build();
    expect(game.state("mel").isEmpowered).toBe(true);
    await game.p1.cast("stupefy", { targets: "foe" });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.state("foe").might).toBe(2);
  });

  // Expected: Smoke Screen −4 becomes −5: a 7-Might unit drops to 2, and on a 5-Might unit the spell's
  // own "to a minimum of 1" still clamps (5 − 5 → 1, not 0). Actual: plain −4 (7 → 3).
  test("Empowered — Smoke Screen gives −5 (7 → 2) and its 'minimum of 1' still clamps a 5-Might unit to 1", async () => {
    const big = await scenario()
      .resources(P1, { energy: 2, power: { mind: 1 } })
      .unit(P1, "base", CARD, "mel", { empowered: true })
      .unit(P2, "base", { might: 7 }, "giant")
      .hand(P1, SMOKE_SCREEN, "smoke")
      .build();
    await big.p1.cast("smoke", { targets: "giant" });
    await big.settle();
    expect(big.state("giant").might).toBe(2);
    const clamp = await scenario()
      .resources(P1, { energy: 2, power: { mind: 1 } })
      .unit(P1, "base", CARD, "mel", { empowered: true })
      .unit(P2, "base", { might: 5 }, "mid")
      .hand(P1, SMOKE_SCREEN, "smoke")
      .build();
    await clamp.p1.cast("smoke", { targets: "mid" });
    await clamp.settle();
    expect(clamp.state("mid").might).toBe(1);
  });

  test("negative space — the OPPONENT's Stupefy on my unit is not boosted by my Empowered Mel (exactly −1)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", CARD, "mel", { empowered: true })
      .unit(P1, "base", { might: 4 }, "mine")
      .hand(P2, STUPEFY, "theirs")
      .build();
    await game.p2.cast("theirs", { targets: "mine" });
    await game.settle();
    expect(game.state("mine").might).toBe(3);
    expect(game.state("mel").might).toBe(4);
  });

  test("negative space — NOT empowered: Wind Wall counters my Stupefy (no −Might, no draw, both spells to trash)", async () => {
    const game = await stupefyBoard(false).resources(P2, { energy: 3, power: { calm: 2 } }).hand(P2, WIND_WALL, "ww").build();
    await stupefyIntoWindWall(game);
    expect(game.state("foe").might).toBe(4);
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  // Expected (425 + Mel): with Mel Empowered my Stupefy cannot be countered — Wind Wall resolves to no
  // effect, Stupefy still shrinks the unit and draws me a card. Actual: Stupefy is countered.
  test("Empowered — 'your spells can't be countered': Wind Wall fails and my Stupefy still resolves", async () => {
    const game = await stupefyBoard(true).resources(P2, { energy: 3, power: { calm: 2 } }).hand(P2, WIND_WALL, "ww").build();
    expect(game.state("mel").isEmpowered).toBe(true);
    await stupefyIntoWindWall(game);
    expect(game.zoneOf("ww")).toBe("trash"); // Wind Wall was played and paid for regardless
    expect(game.p1.hand()).toHaveLength(1); // Stupefy's "Draw 1" happened
    expect(game.state("foe").might).toBeLessThan(4); // and its −Might landed (−1 or −2)
    expect(game.zoneOf("stupefy")).toBe("trash");
  });

  test("negative space — 'YOUR spells': my Empowered Mel does not protect the opponent's spell from MY Wind Wall", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .resources(P1, { energy: 3, power: { calm: 2 } })
      .unit(P1, "base", CARD, "mel", { empowered: true })
      .unit(P1, "base", { might: 4 }, "mine")
      .hand(P2, STUPEFY, "theirs")
      .hand(P1, WIND_WALL, "ww")
      .build();
    await game.p2.cast("theirs", { targets: "mine" });
    await game.p2.passPriority();
    await game.p1.cast("ww");
    await game.settle();
    expect(game.state("mine").might).toBe(4);
    expect(game.p2.hand()).toHaveLength(0);
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
