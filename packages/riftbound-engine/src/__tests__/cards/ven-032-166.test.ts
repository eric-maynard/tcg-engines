/**
 * Frostcoat Mother — ven-032-166 · Unit · Calm · 3 energy · 3 Might
 *
 *   [Empower] [12]. This ability costs [1] less for each rune you control.
 *   (Pay the cost: Empower me. Use only if not Empowered.)
 *   [Empowered][>] I have +3 [Might].
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. [Empower] is an ACTIVATED ability (827.1) = "[12]: Empower me. Play only if not Empowered"; it uses
 *     the chain (377.3), only on my turn in an Open state (381 / 145.2), never while already Empowered.
 *  2. The self-discount (827.1.c.3) counts rune CARDS I control — ready or exhausted — not pool energy and
 *     not the opponent's runes: 0 runes → 12, 5 → 7, 12 → free, 13+ → still 0 (never negative).
 *  3. [Empowered][>] +3 is a dependent passive (828.1.c): live exactly while the status is on — it counts in
 *     combat, persists across turns (nothing clears Empowered at end of turn), and must vanish the instant
 *     she is Disempowered — so Lacerate ("disempower it, then kill it if ≤3 Might") kills a 6-Might Mother.
 *  4. Partner: Sanction (Calm Reaction) empowers her only until end of turn → 6 now, 3 next turn, and her
 *     own [Empower] becomes usable again afterwards.
 *  5. Cost edge: 3 energy flat, enters exhausted.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-032-166";
const SANCTION = "ven-035-166"; // Calm Reaction: mode 0 = Empower a unit, disempower it at end of turn
const LACERATE = "ven-127-166"; // Order spell: disempower chosen unit, then kill it if it has ≤3 Might

async function empowerVia(activateWith: { runes: number; energy: number; exhaustedRunes?: boolean }) {
  const game = await scenario()
    .resources(P1, { energy: activateWith.energy })
    .runes(P1, "calm", activateWith.runes, { exhausted: activateWith.exhaustedRunes })
    .unit(P1, "base", CARD, "mom")
    .build();
  const can = game.p1.can("activate", "mom");
  return { can, game };
}

describe("Frostcoat Mother (ven-032-166)", () => {
  test("parsed abilities should be an activated [Empower] costing 12 with a per-rune discount PLUS the while-empowered +3 static; only the static is present", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 3, might: 3 });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    const stat = abilities.find((a) => a.type === "static");
    expect(stat).toMatchObject({ condition: { type: "while-empowered" }, effect: { amount: 3, type: "modify-might" } });
    const act = abilities.find((a) => a.type === "activated") as { cost?: { energy?: number }; effect?: { type?: string } } | undefined;
    expect(act).toBeDefined();
    expect(act?.cost?.energy).toBe(12);
    expect(act?.effect?.type).toBe("empower");
    expect(JSON.stringify(act)).toMatch(/rune/i); // "costs [1] less for each rune you control"
  });

  test("cost: 3 energy, enters the base exhausted as a plain 3-Might, non-Empowered unit; 2 energy is short", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "mom").build();
    await game.p1.play("mom");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("mom")).toMatchObject({ isEmpowered: false, isExhausted: true, might: 3, zone: "base" });
    expect((await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "mom").build()).p1.can("play", "mom")).toBe(false);
  });

  test("[Empowered][>] +3: an Empowered Mother is 6 Might (base 3), a non-Empowered one beside her stays 3", async () => {
    const game = await scenario().unit(P1, "base", CARD, "mom", { empowered: true }).unit(P1, "base", CARD, "plain").build();
    expect(game.state("mom")).toMatchObject({ baseMight: 3, isEmpowered: true, might: 6 });
    expect(game.state("plain")).toMatchObject({ isEmpowered: false, might: 3 });
  });

  test("[Empower] with 0 runes costs the full [12]: 12 energy activates it (11 does not), it goes on the chain, and on resolution she is Empowered at 6 Might", async () => {
    // Actual: no activated ability exists on the card at all.
    expect((await empowerVia({ energy: 11, runes: 0 })).can).toBe(false);
    const { can, game } = await empowerVia({ energy: 12, runes: 0 });
    expect(can).toBe(true);
    await game.p1.activate("mom");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mom", triggered: false })]);
    expect(game.state("mom").isEmpowered).toBe(false); // not before resolution
    await game.settle();
    expect(game.state("mom")).toMatchObject({ isEmpowered: true, might: 6 });
  });

  test("the discount counts every rune I control, exhausted ones included — 5 exhausted runes → costs 7 (7 energy yes, 6 no)", async () => {
    expect((await empowerVia({ energy: 6, exhaustedRunes: true, runes: 5 })).can).toBe(false);
    const { can, game } = await empowerVia({ energy: 7, exhaustedRunes: true, runes: 5 });
    expect(can).toBe(true);
    await game.p1.activate("mom");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("mom").might).toBe(6);
  });

  test("12 runes make it free (0 energy activates), and 13 runes do not go negative — the pool stays exactly 0", async () => {
    for (const runes of [12, 13]) {
      const { can, game } = await empowerVia({ energy: 0, runes });
      expect(can).toBe(true);
      await game.p1.activate("mom");
      expect(game.p1.energy()).toBe(0);
      await game.settle();
      expect(game.state("mom").isEmpowered).toBe(true);
    }
  });

  test("negative space — the OPPONENT's 12 runes discount nothing (0 runes of mine, 11 energy → not activatable)", async () => {
    const game = await scenario().resources(P1, { energy: 11 }).runes(P2, "calm", 12).unit(P1, "base", CARD, "mom").build();
    expect(game.p1.can("activate", "mom")).toBe(false);
  });

  test("negative space — 'Use only if not Empowered' (827.1.c.1) and 'only on my turn' (381): already-Empowered, or on P2's turn, 12 energy buys nothing", async () => {
    const already = await scenario().resources(P1, { energy: 12 }).unit(P1, "base", CARD, "mom", { empowered: true }).build();
    expect(already.p1.can("activate", "mom")).toBe(false);
    const theirTurn = await scenario().active(P2).resources(P1, { energy: 12 }).unit(P1, "base", CARD, "mom").build();
    expect(theirTurn.p1.can("activate", "mom")).toBe(false);
  });

  test("Empowered persists across turns (no rule clears it): still Empowered and 6 Might on my next turn", async () => {
    const game = await scenario().unit(P1, "base", CARD, "mom", { empowered: true }).build();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("mom")).toMatchObject({ isEmpowered: true, might: 6 });
  });

  test("the +3 counts in combat: a 5-Might attacker into an Empowered Mother dies and she holds the battlefield", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "mom", { empowered: true })
      .unit(P2, "base", { might: 5 }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("mom")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    // Control: the same fight against a NON-empowered Mother (3 Might) kills her.
    const ctrl = await scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "mom").unit(P2, "base", { might: 5 }, "raider").build();
    await ctrl.p2.move("raider", "bf1");
    await ctrl.settle();
    expect(ctrl.zoneOf("mom")).toBe("trash");
  });

  test("partner — Sanction (mode 0) empowers her for the turn only: 6 Might now, back to 3 and non-Empowered after the turn ends", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { calm: 1 } }).unit(P1, "base", CARD, "mom").hand(P1, SANCTION, "sanc").build();
    await game.p1.cast("sanc");
    await game.settle();
    // rule 355.3 / 355.8 (rule-id: ven-035-166) — with no [Empowered] unit on the board
    // Sanction's second mode is unselectable, so the one-mode menu may already be settled.
    if (game.decision()?.kind === "pick") {
      await game.p1.chooseMode(0);
    }
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("mom");
    }
    await game.settle();
    expect(game.state("mom")).toMatchObject({ isEmpowered: true, might: 6 });
    await game.advanceTurn();
    expect(game.state("mom")).toMatchObject({ isEmpowered: false, might: 3 });
  });

  test("counter — Lacerate on an Empowered (6-Might) Mother: disempowering drops the +3 at once (828.1.c), so 'then kill it if it has 3 Might or less' kills her", async () => {
    // Actual: she is disempowered (reads 3 Might afterwards) but survives — the ≤3 check saw a stale 6.
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { order: 1 } })
      .unit(P1, "base", CARD, "mom", { empowered: true })
      .hand(P2, LACERATE, "lac")
      .build();
    expect(game.state("mom").might).toBe(6);
    await game.p2.cast("lac", { targets: "mom" });
    await game.settle();
    expect(game.zoneOf("mom")).toBe("trash");
  });
});
