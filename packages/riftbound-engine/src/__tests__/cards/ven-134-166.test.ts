/**
 * Kayle, Justified — ven-134-166 · Champion Unit (Kayle) · Order · 3 energy (no power) · 3 Might
 *
 *   [Empower] [3] ([3]: Empower me.)
 *   I can be [Empowered] up to three times.
 *   I have +2 [Might] for each time I'm [Empowered].
 *   While I'm [Empowered] three times, I have [Deflect 3] and [Ganking].
 *
 * Rules: 827.1 (Empower = "[Cost]: Empower this. Play only if not Empowered."), 441.1.b/c
 * (Empowered is normally binary and can't be re-applied) BUT 441.1.c.1 (an effect may grant
 * permission to be Empowered multiple times and then ignores that restriction — Kayle's 2nd line),
 * 809 (Deflect X: opponents pay X extra power of ANY domain per choose; mandatory additional cost),
 * 810 / 144.4.c (Ganking: standard move battlefield → battlefield), 727.1.b.2 (dependent "While…"
 * statics are live exactly while the condition holds), 143.4 (units enter exhausted).
 *
 * Head-judge notes — the tricky spots this file covers:
 *  1. ZERO empowers is a real state: a fresh Kayle is exactly 3 Might with no Deflect and no Ganking.
 *     "+2 for each time" with 0 times is +0 — a parser that drops the "for each time I'm Empowered"
 *     qualifier would show 5 in hand/base. Guarded explicitly.
 *  2. 441.1.c.1 overrides 827.1.c.1's "only if not Empowered": after the 1st Empower the ability must
 *     STILL be on the menu (2nd → 7 Might, 3rd → 9 Might), and after the 3rd it must be GONE ("up to
 *     three times" — a 4th activation with energy to spare is illegal).
 *  3. The keyword line is all-or-nothing at exactly three: once/twice Empowered → no Deflect, no
 *     Ganking (can't hop bf1 → bf2); thrice → Deflect with value 3 (opponent needs THREE spare power of
 *     any domain to Hextech-Ray her; two is not enough) and Ganking (bf1 → bf2 legal).
 *  4. Empowered has no duration: the count (and the Might) survive two advanceTurn()s.
 *  5. Empower is an activated ability of a unit: your turn, open state only — not on the opponent's
 *     turn, not inside a showdown. Each activation costs a full [3] (2 energy → not offered).
 * Partner/counter cards: Hextech Ray ogn-009-298 (opponent's targeted spell for the Deflect tax),
 * Cleave ogn-004-298 (own spell — Deflect never taxes the controller).
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-134-166";
const HEXTECH_RAY = "ogn-009-298"; // [Action] Deal 3 to a unit at a battlefield — 1 energy + [fury]
const CLEAVE = "ogn-004-298"; // [Action] Give a unit [Assault 3] this turn — 1 energy

/** Kayle on the board for P1 (P1's turn) with `energy` to spend on Empower activations. */
function onBoard(energy: number, at: "base" | "bf1" = "base") {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Sentry" }, "sentry")
    .unit(P1, at, CARD, "kayle");
}

async function empowerTimes(game: Game, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    expect(game.p1.can("activate", "kayle")).toBe(true);
    await game.p1.activate("kayle");
    await game.settle();
  }
}

describe("Kayle, Justified (ven-134-166)", () => {
  test("registry payload should carry all four printed lines — Empower [3] activated, an 'up to three times' permission, +2 Might PER empower, and a 'while empowered three times' static granting Deflect 3 + Ganking", async () => {
    // Expected: 4 abilities mirroring the 4 printed lines. Actual: only the Empower activation and a
    // modify-might static whose "per" qualifier is free text; lines 2 and 4 are missing entirely.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 3, isChampion: true, might: 3, name: "Kayle, Justified", tags: ["Kayle"] });
    expect(def?.powerCost).toBeUndefined();
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities[0]).toMatchObject({ cost: { energy: 3 }, effect: { target: "self", type: "empower" }, type: "activated" });
    expect(abilities[1 + 0]).toBeDefined();
    expect(abilities).toHaveLength(4);
    const keywordStatic = abilities.find((a) => JSON.stringify(a).includes("Ganking"));
    expect(keywordStatic).toBeDefined();
    expect(JSON.stringify(keywordStatic)).toContain("Deflect");
  });

  test("cost to play: 3 energy, no power; lands in base exhausted and NOT Empowered; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "kayle").build();
    await game.p1.play("kayle");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("kayle")).toBe("base");
    expect(game.state("kayle")).toMatchObject({ baseMight: 3, isEmpowered: false, isExhausted: true });
    expect(game.chain()).toEqual([]);
    const poor = await scenario().resources(P1, { energy: 2, power: { order: 3 } }).hand(P1, CARD, "kayle").build();
    expect(poor.p1.can("play", "kayle")).toBe(false);
  });

  test("with ZERO empowers Kayle must be exactly 3 Might (+2 × 0) with no Deflect and no Ganking", async () => {
    // Expected: 3 Might. Actual: the static's "for each time I'm Empowered" is ignored and a flat +2 is
    // applied permanently, so an un-Empowered Kayle already reads 5.
    const game = await onBoard(0).build();
    expect(game.state("kayle")).toMatchObject({ baseMight: 3, isEmpowered: false, might: 3 });
    expect(game.state("kayle").keywords).not.toContain("Deflect");
    expect(game.state("kayle").keywords).not.toContain("Ganking");
  });

  test("[Empower] [3]: activating pays exactly 3 energy, resolves off the chain, Kayle is Empowered and reads 5 Might; still no Deflect / Ganking after ONE empower", async () => {
    const game = await onBoard(4).build();
    expect(game.p1.can("activate", "kayle")).toBe(true);
    await game.p1.activate("kayle");
    expect(game.p1.energy()).toBe(1);
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("kayle")).toMatchObject({ isEmpowered: true, might: 5 });
    expect(game.state("kayle").keywords).not.toContain("Deflect");
    expect(game.state("kayle").keywords).not.toContain("Ganking");
  });

  test("Empower costs a full [3]: with 2 energy (and plenty of power) the ability is not offered", async () => {
    const game = await onBoard(2).resources(P1, { energy: 2, power: { order: 5 } }).build();
    expect(game.p1.can("activate", "kayle")).toBe(false);
    const t = await game.p1.try((p) => p.activate("kayle"));
    expect(t.ok).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 5 } });
  });

  test("'I can be Empowered up to three times' (441.1.c.1) — after the first Empower the ability is STILL offered; the second costs another 3 and takes her to 7 Might, still without Deflect/Ganking", async () => {
    // Expected: 2 activations, 6 energy spent, 7 Might, no keywords yet. Actual: the generic
    // "not-empowered" restriction removes the ability after the first activation.
    const game = await onBoard(9).build();
    await empowerTimes(game, 1);
    expect(game.p1.can("activate", "kayle")).toBe(true);
    await empowerTimes(game, 1);
    expect(game.p1.energy()).toBe(3);
    expect(game.state("kayle")).toMatchObject({ isEmpowered: true, might: 7 });
    expect(game.state("kayle").keywords).not.toContain("Deflect");
    expect(game.state("kayle").keywords).not.toContain("Ganking");
    expect(game.p1.can("gank", "kayle")).toBe(false);
  });

  test("third Empower → 9 Might with Deflect (value 3) and Ganking; 'up to three' — a FOURTH activation is not offered even with 3 energy left", async () => {
    // Expected: 3 × [3] = 9 energy spent of 12, 9 Might, Deflect 3 + Ganking live, no 4th. Actual: stuck after one.
    const game = await onBoard(12).build();
    await empowerTimes(game, 3);
    expect(game.p1.energy()).toBe(3);
    expect(game.state("kayle")).toMatchObject({ isEmpowered: true, might: 9 });
    expect(game.state("kayle").keywords).toEqual(expect.arrayContaining(["Deflect", "Ganking"]));
    const deflect = game.state("kayle").grantedKeywords.find((k) => k.keyword === "Deflect");
    expect(deflect?.value ?? 1).toBe(3);
    expect(game.p1.can("activate", "kayle")).toBe(false);
  });

  test("Ganking at three empowers — Kayle at bf1 may take her standard move straight to bf2 and fights there at 9 (kills the 2-Might Sentry, conquers)", async () => {
    // Expected: gank legal only at 3×; 9 Might into 2. Actual: never reaches 3× (and no Ganking static exists).
    const game = await onBoard(9, "bf1").build();
    expect(game.p1.can("gank", "kayle")).toBe(false); // 0× — no Ganking yet
    await empowerTimes(game, 3);
    expect(game.p1.can("gank", "kayle")).toBe(true);
    await game.p1.gank("kayle", "bf2");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.locationOf("kayle")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });

  test("Deflect 3 at three empowers (809.1.c) — on P2's turn a Hextech Ray at Kayle needs THREE spare power of any domain: 1 fury + 2 calm is rejected, 1 fury + 3 calm is accepted and fully spent", async () => {
    // Expected: mandatory +3 power tax for the opponent. Actual: Kayle never gets Deflect.
    const game = await onBoard(9, "bf1").hand(P2, HEXTECH_RAY, "ray").build();
    await empowerTimes(game, 3);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("kayle").keywords).toContain("Deflect");
    await game.p2.do("addResources", { energy: 1, power: { calm: 2, fury: 1 } });
    const short = await game.p2.try((p) => p.cast("ray", { targets: "kayle" }));
    expect(short.ok).toBe(false);
    expect(game.zoneOf("ray")).toBe("hand");
    await game.p2.do("addResources", { power: { calm: 1 } });
    await game.p2.cast("ray", { targets: "kayle" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
    await game.settle();
    expect(game.state("kayle").damage).toBe(3); // 3 < 9 — she lives
    expect(game.locationOf("kayle")).toBe("bf1");
  });

  test("no Deflect below three empowers: on P2's turn a Hextech Ray chooses a once-Empowered Kayle for just 1 energy + 1 fury and marks 3 damage (5 Might — survives)", async () => {
    const game = await onBoard(3, "bf1").hand(P2, HEXTECH_RAY, "ray").build();
    await empowerTimes(game, 1);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 1, power: { fury: 1 } });
    await game.p2.cast("ray", { targets: "kayle" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.state("kayle")).toMatchObject({ damage: 3, isEmpowered: true, might: 5 });
    expect(game.locationOf("kayle")).toBe("bf1");
  });

  test("Deflect never taxes the controller: P1's own Cleave chooses Kayle for exactly 1 energy", async () => {
    const game = await onBoard(4).hand(P1, CLEAVE, "cleave").build();
    await empowerTimes(game, 1);
    await game.p1.cast("cleave", { targets: "kayle" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("kayle").grantedKeywords).toEqual(expect.arrayContaining([{ duration: "turn", keyword: "Assault", value: 3 }]));
  });

  test("441.1.a no duration: once Empowered, Kayle stays Empowered at 5 Might through a full turn cycle", async () => {
    const game = await onBoard(3).build();
    await empowerTimes(game, 1);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("kayle")).toMatchObject({ isEmpowered: true, might: 5 });
    expect(game.locationOf("kayle")).toBe("base");
  });

  test("timing: Empower is not available on the opponent's turn nor while a showdown is open", async () => {
    const oppTurn = await onBoard(5).active(P2).build();
    expect(oppTurn.p1.can("activate", "kayle")).toBe(false);
    const sd = await scenario()
      .resources(P1, { energy: 5 })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "kayle")
      .unit(P1, "base", { might: 1, name: "Scout" }, "scout")
      .autoProcedures(false)
      .build();
    await sd.p1.move("scout", "bf1"); // empty uncontrolled battlefield → showdown with P1 holding Focus
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(sd.p1.can("activate", "kayle")).toBe(false);
  });
});
