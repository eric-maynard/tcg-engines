/**
 * Irelia, Fervent — sfd-057-221 · Champion Unit · Calm · 5 energy · 4 Might · Irelia
 *
 *   [Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *   When you choose or ready me, give me +1 [Might] this turn.
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. "When you choose me" is a Targeting Effect (383.4.b): it goes on the chain right after YOUR
 *     spell that targets her is finalized — above the spell, before anyone can react — so it
 *     resolves first and does not care whether the spell later resolves or is countered (FAQ).
 *  2. "you" = her controller only. An opponent choosing her pays Deflect (809.1.c, any domain) and
 *     grants NO Might — with exactly-lethal damage (Void Seeker's 4 into her 4) she must die.
 *  3. Choose AND ready from one spell (Wallop "Ready a unit") are two events → +2 if she was
 *     exhausted; if she was already ready no readying happens (415.1.b/c) → only the choose +1.
 *  4. Awaken-phase readying IS "you ready me" (315.1.b / 415.3.a, FAQ): exhausted at your turn
 *     start → +1 for that turn; already ready → nothing. A non-targeting mass ready ("Ready your
 *     units") fires only the ready half.
 *  5. Repeat spell choosing her for both executions = two targeting events → two triggers
 *     (FAQ: Feral Strength repeated = +6 total → 10 Might).
 *  6. "+1 this turn" expires at end of turn; her own trigger says "me" (no choice) so it never
 *     re-triggers itself.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-057-221";
const DISCIPLINE = "ogn-058-298"; // Reaction · 2 · Give a unit +2 Might this turn. Draw 1.
const WALLOP = "ogn-146-298"; // Action · 2 · Ready a unit.
const FERAL_STRENGTH = "sfd-034-221"; // Reaction · 2 · Repeat [2] · Give a unit +2 Might this turn.
const ON_THE_HUNT = "sfd-204-221"; // 1 + [rainbow][rainbow] · Ready your units. (no targeting)
const VOID_SEEKER = "ogn-024-298"; // Action · 3 + [fury] · Deal 4 to a unit at a battlefield. Draw 1.

describe("Irelia, Fervent (sfd-057-221)", () => {
  test("costs 5 energy (no power); enters the base exhausted as a 4-Might unit with Deflect; 4 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "ire").build();
    await game.p1.play("ire");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("ire")).toBe("base");
    expect(game.state("ire")).toMatchObject({ isExhausted: true, might: 4 });
    expect(game.state("ire").keywords).toContain("Deflect");
    expect(game.chain()).toHaveLength(0); // playing her chooses/readies nothing
    const short = await scenario().resources(P1, { energy: 4, power: { calm: 2 } }).hand(P1, CARD, "ire").build();
    expect(short.p1.can("play", "ire")).toBe(false);
  });

  test("choose: your Discipline on her puts her trigger ABOVE the spell; it resolves first (+1 → 5), then the spell (+2 → 7); no Deflect tax for you", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARD, "ire").hand(P1, DISCIPLINE, "disc").build();
    await game.p1.cast("disc", { targets: "ire" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain().map((c) => [c.name, c.triggered])).toEqual([
      ["Discipline", false],
      ["Irelia, Fervent", true],
    ]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain().map((c) => c.name)).toEqual(["Discipline"]);
    expect(game.state("ire").might).toBe(5);
    await game.settle();
    expect(game.state("ire").might).toBe(7);
    expect(game.violations()).toEqual([]);
  });

  test("'this turn': both her own +1 and the spell's +2 are gone after the turn passes (back to 4)", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARD, "ire").hand(P1, DISCIPLINE, "disc").build();
    await game.p1.cast("disc", { targets: "ire" });
    await game.settle();
    expect(game.state("ire").might).toBe(7);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("ire").might).toBe(4);
  });

  // BUG — expected: "When YOU choose me" is controller-only, so an enemy Void Seeker puts only itself
  // on the chain and its 4 damage kills the 4-Might Irelia. Actual: the enemy targeting also fires
  // her trigger (chain = [Void Seeker, Irelia]), she goes to 5 Might and survives exactly-lethal.
  test("an opponent choosing Irelia fires her 'when YOU choose me' trigger — enemy Void Seeker's exactly-lethal 4 should kill her with no +1", async () => {
    const exact = await scenario()
      .active(P2)
      .resources(P2, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ire")
      .hand(P2, VOID_SEEKER, "vs")
      .build();
    expect(exact.p2.can("cast", "vs")).toBe(false); // only target is Irelia and the Deflect pip is unpaid
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3, power: { fury: 1, mind: 1 } }) // Deflect may be paid with ANY domain (809.1.c.1)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ire")
      .hand(P2, VOID_SEEKER, "vs")
      .build();
    await game.p2.cast("vs", { targets: "ire" });
    expect(game.p2.energy()).toBe(0);
    expect(game.p2.power()).toBe(0);
    expect(game.chain().map((c) => c.name)).toEqual(["Void Seeker"]); // no Irelia trigger
    await game.settle();
    expect(game.zoneOf("ire")).toBe("trash"); // 4 damage into 4 Might — a bogus +1 would have saved her
  });

  test("choose + ready from one spell (Wallop on an EXHAUSTED Irelia): +1 on finalize, +1 more when she readies → 6 and ready", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARD, "ire", { exhausted: true }).hand(P1, WALLOP, "wal").build();
    await game.p1.cast("wal", { targets: "ire" });
    expect(game.chain().map((c) => c.name)).toEqual(["Wallop", "Irelia, Fervent"]);
    await game.settle();
    expect(game.state("ire").isReady).toBe(true);
    expect(game.state("ire").might).toBe(6);
  });

  test("negative space: Wallop on an already-READY Irelia readies nothing (415.1.b) → only the choose trigger, 5 Might", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARD, "ire").hand(P1, WALLOP, "wal").build();
    await game.p1.cast("wal", { targets: "ire" });
    await game.settle();
    expect(game.state("ire").might).toBe(5);
    expect(game.chain()).toHaveLength(0);
  });

  test("Awaken readying counts (FAQ): exhausted at the start of your turn → trigger in the Beginning window → 5 Might on your turn; already ready → stays 4", async () => {
    const tired = await scenario().turn(2).active(P2).unit(P1, "base", CARD, "ire", { exhausted: true }).build();
    await tired.p2.endTurn();
    expect(tired.turnPlayer()).toBe(P1);
    expect(tired.chain()).toEqual([expect.objectContaining({ cardId: "ire", triggered: true })]);
    await tired.settle();
    expect(tired.phase()).toBe("main");
    expect(tired.state("ire")).toMatchObject({ isReady: true, might: 5 });
    const fresh = await scenario().turn(2).active(P2).unit(P1, "base", CARD, "ire").build();
    await fresh.advanceTurn();
    expect(fresh.turnPlayer()).toBe(P1);
    expect(fresh.state("ire").might).toBe(4);
  });

  test("a non-targeting mass ready ('Ready your units') fires only the READY half: exhausted → 5, not 6", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { rainbow: 2 } })
      .unit(P1, "base", CARD, "ire", { exhausted: true })
      .unit(P1, "base", { might: 2 }, "pal", { exhausted: true })
      .hand(P1, ON_THE_HUNT, "hunt")
      .build();
    await game.p1.cast("hunt");
    expect(game.chain().map((c) => c.name)).toEqual(["On the Hunt"]); // nothing was chosen
    await game.settle();
    expect(game.state("pal").isReady).toBe(true);
    expect(game.state("ire")).toMatchObject({ isReady: true, might: 5 });
  });

  test("Repeat spell choosing her twice (Feral Strength, 4 energy) = two targeting events → two triggers → 4 +1 +1 +2 +2 = 10 (FAQ)", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).unit(P1, "base", CARD, "ire").hand(P1, FERAL_STRENGTH, "fs").build();
    await game.p1.cast("fs", { repeat: 1, targets: "ire" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.name)).toEqual(["Feral Strength", "Irelia, Fervent", "Irelia, Fervent"]);
    await game.settle();
    expect(game.state("ire").might).toBe(10);
  });

  test("Deflect only taxes opponents: her controller's spells choose her at printed cost, an opponent with no spare power cannot choose her at all", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2 })
      .unit(P1, "base", CARD, "ire")
      .unit(P1, "base", { might: 2 }, "plain")
      .hand(P2, DISCIPLINE, "disc")
      .build();
    const r = await game.p2.try((p) => p.cast("disc", { targets: "ire" }));
    expect(r.ok).toBe(false);
    await game.p2.cast("disc", { targets: "plain" }); // untaxed target is fine
    expect(game.p2.energy()).toBe(0);
    expect(game.chain().map((c) => c.name)).toEqual(["Discipline"]);
  });

  test("parsed abilities: Deflect 1 keyword + a self-targeted 'choose-or-ready' trigger giving +1 Might for the turn", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ energyCost: 5, isChampion: true, might: 4, tags: ["Irelia"] });
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({ keyword: "Deflect", type: "keyword", value: 1 });
    expect(def?.abilities?.[1]).toMatchObject({
      effect: { amount: 1, duration: "turn", target: "self", type: "modify-might" },
      trigger: { event: "choose-or-ready", on: "self" },
      type: "triggered",
    });
  });
});
