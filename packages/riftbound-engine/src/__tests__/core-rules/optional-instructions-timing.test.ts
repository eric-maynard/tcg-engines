/**
 * Core rules — WHEN an optional / costed part of a TRIGGERED ability is decided and paid: ONE model
 * (`E/abilities/optional-kind.ts optionalKind`, adjudicated in the maycost package against CR 2026-07-24 and the
 * TRAIN rulings; the resolution-side rulings all predate the Unleashed CR — see the RULING-CONFLICT notes in
 * cards/rulings/{not-so-fast-49473a82,lucian-gunslinger-8d132579,reavers-row-a2ef45fb,-abb596dd,sett-brawler-1e8583a2,
 * wildclaw-shaman-0fe28561,-8c17f84d,jinx-rebel-a32c9f92}).
 *
 *   kind                    text                                          decided             act / payment                    payoff
 *   ─────────────────────── ───────────────────────────────────────────── ─────────────────── ──────────────────────────────── ─────────────────────────────
 *   cost-at-finalization    "you may [pay N|kill me|exhaust me|discard N|  FIN (383.3.a/402.1) FIN — the trigger's BASE COST      mandatory on RES; a counter
 *                            spend a buff|kill X|recycle X] TO Y",                              (383.3.b, 204.3.a, 740.4.a.2,     refunds nothing (425.1.c);
 *                            "Recycle me to Y", "spend 3 XP to Y"                                404.1); objects named by a forced a resource that appears only
 *                                                                                              FIN pick (402.2); can't pay ⇒     AFTER finalization can't pay
 *                                                                                              item removed, no chain item (404.2)
 *   may-at-finalization     "you may Y", "you may X. If you do, Y"        FIN (383.3.a/402.1) X and Y performed on RES; a "pay Y mandatory once opted in
 *                                                                          decline ⇒ removed   [C]. If you do" is a GAME ACTION,  (383.3.a.1); "if you do" is
 *                                                                          (383.3.a.2)         not a cost (205) — asked, and      linked (359.3.e.14): X not
 *                                                                                              declinable, on RES (444.2); Y's   performed ⇒ Y skipped
 *                                                                                              objects are targets chosen at FIN
 *                                                                                              (402.2)
 *   may-at-resolution       a "you may"/"pay … to" LATER in the effect    RES (383.3.a.3)     RES (204.3.b, 740.4.a.2.a)        only if taken
 *
 * Harness: finalization questions carry `timing:"FIN"` (opt-in yes/no, cost-object pick, target pick), resolution
 * questions `timing:"RES"`. Chain items carry `mayKind`.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const ICEVALE_ARCHER = "unl-065-219"; // "When I attack, you may pay [1] to give a unit here -1 [Might] this turn."
const NOT_SO_FAST = "sfd-045-221"; // Reaction [2][calm] "Counter an enemy spell or ability that chooses a friendly unit or gear."
const MONASTERY = "ogn-282-298"; // "When you conquer here, you may spend a buff to draw 1."
const SETT = "ogn-164-298"; // "When I'm played and when I conquer, buff me. …"
const REAVERS_ROW = "ogn-285-298"; // "When you defend here, you may move a friendly unit here to base."
const DRAVEN = "sfd-020-221"; // "When I attack or defend, you may pay [fury]. If you do, give me +2 [Might] this turn."
const INVESTIGATOR = "unl-135-219"; // "When you play me, choose an opponent. They reveal their hand. You may pay 2 XP to choose a card from their hand. If you do, …"

const mayKinds = (game: Game) => (game.gameState.interaction?.chain?.items ?? []).map((it) => ({ card: it.cardId, mayKind: it.mayKind }));

async function passUntil(game: Game, stop: (d: Decision | null) => boolean, max = 8): Promise<void> {
  for (let i = 0; i < max; i++) {
    const d = game.decision();
    if (stop(d) || d?.kind !== "action" || !d.passKey) {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

describe("cost-at-finalization — 'you may [cost] TO [effect]' (383.3.a + 383.3.b / 204.3.a / 404)", () => {
  function archerBoard(energy: number) {
    return scenario()
      .resources(P1, { energy })
      .resources(P2, { energy: 2, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Defender" }, "def")
      .unit(P1, "base", ICEVALE_ARCHER, "archer")
      .hand(P2, NOT_SO_FAST, "nsf");
  }

  test("Icevale Archer 'you may pay [1] TO give a unit here -1': the yes/no is a FINALIZATION question naming the cost; 'yes' PAYS AT ONCE (energy 1 → 0) and the target is chosen at FIN too — all before the first priority window (383.3.b.1, 402.2, 406.4)", async () => {
    const game = await archerBoard(1).build();
    await game.p1.move("archer", "bf1");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "archer" }, timing: "FIN" });
    expect(game.decision()?.prompt).toMatch(/Pay \[1\]/);
    expect(mayKinds(game)).toEqual([{ card: "archer", mayKind: "cost-at-finalization" }]);
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0);
    const pick = game.decision();
    expect(pick).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "archer" }, timing: "FIN" });
    await game.p1.pick("def");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "archer", targets: ["def"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.state("def").might).toBe(5); // the effect waits
    await passUntil(game, () => game.chain().length === 0);
    expect(game.decision()?.kind).not.toBe("yes-no"); // nothing more asked on resolution
    expect(game.state("def").might).toBe(4);
  });

  test("404.2 — cannot pay at finalization (0 energy, no rune): 'yes' is illegal (DESIGN manual pay keeps the prompt, canAccept:false); 'no' removes the Pending item — no chain item, no priority window", async () => {
    const game = await archerBoard(0).build();
    await game.p1.move("archer", "bf1");
    expect(game.decision()).toMatchObject({ canAccept: false, kind: "yes-no", seat: P1, timing: "FIN" });
    expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("425.1.c — a COUNTERED costed trigger refunds nothing: P2 Not-So-Fasts the Archer's ability (it chose P2's unit) → the -1 never happens, P1's [1] stays spent", async () => {
    const game = await archerBoard(1).build();
    await game.p1.move("archer", "bf1");
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("def");
    }
    expect(game.p1.energy()).toBe(0);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.p2.can("cast", "nsf")).toBe(true);
    await game.p2.cast("nsf", { targets: "archer" });
    await passUntil(game, () => game.chain().length === 0);
    expect(game.chain()).toEqual([]);
    expect(game.state("def").might).toBe(5);
    expect(game.p1.energy()).toBe(0);
  });

  test("383.3.b.1 × 383.3.d — a resource that only appears AFTER finalization cannot pay: Sett conquers the Monastery unbuffed → the Monastery's 'spend a buff to draw' is removed unasked; Sett's own conquer buff (resolving later) never funds it", async () => {
    const game = await scenario()
      .battlefield("mon", { controller: P2, def: MONASTERY, inert: false })
      .unit(P2, "mon", { might: 1, name: "Weak" }, "weak")
      .unit(P1, "base", SETT, "sett")
      .build();
    await game.p1.move("sett", "mon");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.state("sett").isBuffed).toBe(true);
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.violations()).toEqual([]);
  });

  test("402.2 / 745 — the cost OBJECT is named by a forced FIN pick (min = max = 1) and paid at once: Monastery with two buffed units", async () => {
    const game = await scenario()
      .battlefield("mon", { controller: null, def: MONASTERY, inert: false })
      .unit(P1, "base", { might: 3, name: "Monk" }, "monk", { buffed: true })
      .unit(P1, "base", { might: 1, name: "Elder" }, "elder", { buffed: true })
      .build();
    await game.p1.move("monk", "mon");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    expect(mayKinds(game)).toEqual([{ card: "mon", mayKind: "cost-at-finalization" }]);
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1, timing: "FIN" });
    await game.p1.pick("elder");
    expect(game.state("elder").isBuffed).toBe(false);
    expect(game.p1.hand()).toHaveLength(0);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
  });
});

describe("may-at-finalization — 'you may Y' / 'you may X. If you do, Y' (383.3.a + 205 / 444.2)", () => {
  function rowBoard() {
    return scenario()
      .active(P2)
      .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
      .unit(P1, "row", { might: 4, name: "Big" }, "big")
      .unit(P1, "row", { might: 3, name: "Small" }, "small")
      .unit(P2, "base", { might: 2, name: "Poker" }, "poker");
  }

  test("Reaver's Row 'you may move a friendly unit here to base': opt-in AND target at FINALIZATION; the item then resolves WITHOUT a second question and the chosen unit IS moved (383.3.a.1 — ruling 6d6f177ae63f7aba)", async () => {
    const game = await rowBoard().build();
    await game.p2.move("poker", "row");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "row" }, timing: "FIN" });
    expect(mayKinds(game)).toEqual([{ card: "row", mayKind: "may-at-finalization" }]);
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "row" }, timing: "FIN" });
    await game.p1.pick("small");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", targets: ["small"] })]);
    let askedAgain = false;
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no") {
        askedAgain = true;
        break;
      }
      await game.acting().passPriority();
    }
    expect(askedAgain).toBe(false);
    expect(game.locationOf("small")).toBe("base");
    expect(game.locationOf("big")).toBe("row");
  });

  test("383.3.a.2 — declining at finalization: the item is removed and considered not to have triggered — no chain item, no priority window, nobody moves", async () => {
    const game = await rowBoard().build();
    await game.p2.move("poker", "row");
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.locationOf("small")).toBe("row");
  });

  function dravenBoard(furyInPool: number) {
    return scenario()
      .resources(P1, { power: { fury: furyInPool } })
      .runes(P1, "fury", 1)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .unit(P1, "base", DRAVEN, "draven");
  }

  test("Draven 'you may pay [fury]. If you do, +2': the opt-in at FINALIZATION is FREE (205 — no cost named, no fury taken); the Pay is asked as the item RESOLVES (444.2)", async () => {
    const game = await dravenBoard(1).build();
    await game.p1.move("draven", "bf1");
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "draven" }, timing: "FIN" });
    expect(d?.prompt).not.toMatch(/^Pay/);
    expect(mayKinds(game)).toEqual([{ card: "draven", mayKind: "may-at-finalization" }]);
    await game.p1.yes();
    expect(game.p1.power("fury")).toBe(1);
    await passUntil(game, (x) => x?.kind === "yes-no");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "draven" }, timing: "RES" });
    expect(game.decision()?.prompt).toMatch(/Pay \[fury\]/);
    await game.p1.yes();
    expect(game.p1.power("fury")).toBe(0);
    expect(game.state("draven")).toMatchObject({ might: 6, mightModifier: 2 });
  });

  test("a resource gained IN RESPONSE (after finalization) CAN pay a resolution-time Pay: no fury at opt-in, P1 recycles a fury rune in the priority window, then pays on resolution", async () => {
    const game = await dravenBoard(0).build();
    await game.p1.move("draven", "bf1");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "FIN" }); // free to take with 0 fury
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.recycleRune({ domain: "fury" });
    expect(game.p1.power("fury")).toBe(1);
    await passUntil(game, (x) => x?.kind === "yes-no");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "RES" });
    await game.p1.yes();
    expect(game.state("draven").might).toBe(6);
  });

  test("444.2 / 359.3.e.14 — the Pay cannot be made (or is declined) on resolution ⇒ the linked 'if you do' is skipped: no fury anywhere → Draven stays 4", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .unit(P1, "base", DRAVEN, "draven")
      .build();
    await game.p1.move("draven", "bf1");
    await game.p1.yes();
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no") {
        expect(d).toMatchObject({ canAccept: false, timing: "RES" });
        await game.p1.no();
      } else {
        await game.acting().passPriority();
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("draven").might).toBe(4);
  });
});

describe("may-at-resolution — a 'you may' / 'pay … to' that is NOT the first part of the effect (383.3.a.3 / 204.3.b)", () => {
  test("Insightful Investigator '… They reveal their hand. You may pay 2 XP to choose a card …': NOTHING is asked while the play trigger is finalized (it is not optional); the pay-2-XP choice appears only as the item RESOLVES (the CR's own 383.3.b / 204.3.b example)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .xp(P1, 2)
      .hand(P1, INVESTIGATOR, "inv")
      .hand(P2, "ogn-175-298", "junk")
      .build();
    await game.p1.play("inv");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "inv", triggered: true })]);
    expect(mayKinds(game)).toEqual([{ card: "inv", mayKind: "may-at-resolution" }]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" }); // straight to priority — no FIN yes/no
    expect(game.p1.xp()).toBe(2);
    await passUntil(game, (x) => x?.kind !== "action");
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, source: { cardId: "inv" }, timing: "RES" });
    await game.p1.pick("junk");
    expect(game.p1.xp()).toBe(0);
    expect(game.zoneOf("junk")).toBe("trash");
  });
});
