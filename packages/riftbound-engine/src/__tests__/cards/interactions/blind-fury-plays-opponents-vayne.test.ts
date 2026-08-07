/**
 * Interaction: Blind Fury (ogn-025-298) · Spell · Fury · 4+[fury][fury] · Action
 *     "Each opponent reveals the top card of their Main Deck. Choose one and banish it, then play
 *      it, ignoring its cost. Then recycle the rest."
 *   × Vayne, Hunter (ogn-035-298) · Champion Unit · Fury · 4+[fury] · 2 Might
 *     "[Assault 3] If an opponent controls a battlefield, I enter ready. When I conquer, you may
 *      pay [1] to return me to my owner's hand."
 *   × Hidden Blade (ogn-213-298) · Spell · Order · 2+[order] · Action
 *     "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Question: P1 resolves Blind Fury; P2 reveals Vayne and P1 chooses it. P1 controls one
 * battlefield, P2 none. (a) Whose banishment, who plays/controls/owns it, where may it go, what
 * is paid, does it enter ready — is "an opponent" read from P1's (controller's) view? (b) Next
 * turn P1 conquers an open battlefield with Vayne: who scores, whose "When I conquer" is it, who
 * pays the [1], whose hand does she return to? (c) P2 Hidden-Blades the P1-controlled Vayne at a
 * battlefield: whose trash, who draws 2? (d) Generally: owner's zones receive her.
 *
 * Rules: 056.1 / 056.2 / 108.6 (banish → OWNER's banishment), 354.3 (the "then play it" happens
 * after Blind Fury finishes), 191.1 / 191.3 / 127.1 (player who plays it controls it; owner
 * unchanged), 355.2.a (controller's base or a battlefield the controller controls), 356.1.b.1
 * (ignore cost → pay nothing), 143.4 (units enter exhausted unless stated), card text read
 * relative to its controller, 469.1 (conqueror scores), 191.4.a / 383.4.c.2.a / 383.3.a.3 /
 * 204.3.b (P1 controls and pays for the conquer trigger), 124 / 056.2 (return → owner's hand),
 * 428.2 / 323.5 (kill → owner's trash), 359.3.e.12 / 808.1.d.3 (last-known controller draws).
 *
 * Expected: (a) P2's banishment; P1 plays and controls, P2 owns; P1's base or P1's battlefield;
 * nothing paid; enters EXHAUSTED (no opponent of P1 controls a battlefield) — contrast: ready if
 * P2 controls one. (b) P1 scores the conquer, P2 scores nothing; the pay-[1] prompt is P1's; if
 * paid Vayne goes to P2's hand. (c) Vayne → P2's trash; P1 (last controller) draws 2, P2 draws 0.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BLIND_FURY = "ogn-025-298";
const VAYNE = "ogn-035-298";
const HIDDEN_BLADE = "ogn-213-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn with exactly Blind Fury's cost (4 + 2 fury) plus 2 spare energy (to prove Vayne's own
 * 4+[fury] is never charged). P1 controls "home" (guarded); "open" is uncontrolled; P2 controls no
 * battlefield unless `p2HoldsOne`. Vayne is the top card of P2's Main Deck; P1's own top card is a
 * second Vayne copy ("myTop") to show only OPPONENTS reveal.
 */
function board(opts: { p2HoldsOne?: boolean } = {}) {
  const s = scenario()
    .resources(P1, { energy: 6, power: { fury: 2 } })
    .battlefield("home", { controller: P1 })
    .battlefield("open", { controller: null })
    .unit(P1, "home", { might: 4, name: "P1 Guard" }, "guard")
    .unit(P2, "base", { might: 2, name: "P2 Homebody" }, "p2home")
    .deckTop(P2, VAYNE, "vayne")
    .deckTop(P1, VAYNE, "myTop")
    .hand(P1, BLIND_FURY, "fury")
    .hand(P2, HIDDEN_BLADE, "blade");
  return opts.p2HoldsOne
    ? s.battlefield("theirs", { controller: P2 }).unit(P2, "theirs", { might: 3, name: "P2 Holder" }, "p2holder")
    : s;
}

/** Blind Fury fully resolved and Vayne played by P1 to `dest` ("base" | "home"). */
async function vayneStolenTo(dest: "base" | "home", opts: { p2HoldsOne?: boolean } = {}): Promise<Game> {
  const game = await board(opts).script(P1, ["vayne", dest === "base" ? "base" : "battlefield-home"]).build();
  await game.p1.cast("fury");
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.actingSeat()).toBe(P1);
  return game;
}

describe("Blind Fury plays the opponent's Vayne, Hunter — owner vs controller", () => {
  // ---- (a) the steal itself ---------------------------------------------------------------------

  test("(a) only OPPONENTS reveal: P1 is offered exactly P2's top card (Vayne); P1's own top card stays put", async () => {
    const game = await board().build();
    await game.p1.cast("fury");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(d?.kind).toBe("pick");
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["vayne"]);
    expect(game.zoneOf("myTop")).toBe("mainDeck");
  });

  test("(a) the chosen card passes through its OWNER's (P2's) banishment — never P1's — while the pending play is P1's (056.2, 108.6, 354.3)", async () => {
    const game = await board().build();
    await game.p1.cast("fury");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("vayne");
    expect(game.zoneOf("vayne")).toBe("banishment");
    expect(game.p2.banishment()).toContain("vayne");
    expect(game.p1.banishment()).not.toContain("vayne");
    expect(game.state("vayne").owner).toBe(P2);
    // Blind Fury itself has finished (in P1's trash); the play of Vayne is a separate pending item controlled by P1.
    expect(game.zoneOf("fury")).toBe("trash");
    expect(game.chain().map((i) => [i.cardId, i.controller])).toEqual([["vayne", P1]]);
  });

  test("(a) P1 (the player instructed to 'play it') chooses the location: P1's base or a battlefield P1 controls — not the open one, not P2's (355.2.a)", async () => {
    const game = await board({ p2HoldsOne: true }).build();
    await game.p1.cast("fury");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("vayne");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(d?.kind).toBe("pick");
    const offered = d?.kind === "pick" ? d.options.map((o) => o.zone ?? o.key).sort() : [];
    expect(offered).toEqual(["base", "battlefield-home"]);
    expect(offered).not.toContain("battlefield-open");
    expect(offered).not.toContain("battlefield-theirs");
  });

  test("(a) after the play Vayne is on P1's board: controller P1, owner still P2; P2's banishment is empty again (191.1, 191.3, 127.1)", async () => {
    const game = await vayneStolenTo("base");
    expect(game.zoneOf("vayne")).toBe("base");
    expect(game.p1.base()).toContain("vayne");
    expect(game.p1.units()).toContain("vayne");
    expect(game.p2.base()).not.toContain("vayne");
    expect(game.state("vayne").controller).toBe(P1);
    expect(game.state("vayne").owner).toBe(P2);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.p2.deck()).not.toContain("vayne");
  });

  test("(a) 'ignoring its cost': only Blind Fury's 4+[fury][fury] is paid — Vayne's 4+[fury] is not (356.1.b.1)", async () => {
    const game = await vayneStolenTo("base");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0 } });
    expect(game.p2.energy()).toBe(0);
  });

  test("(a) 'an opponent' is read from the CONTROLLER's (P1's) view: P2 controls no battlefield → Vayne enters EXHAUSTED, even though P1 (P2's opponent) controls one (143.4)", async () => {
    const game = await vayneStolenTo("base");
    expect(game.gameState.battlefields.home?.controller).toBe(P1);
    expect(Object.values(game.gameState.battlefields).some((b) => b.controller === P2)).toBe(false);
    expect(game.state("vayne").isExhausted).toBe(true);
  });

  test("(a) contrast: when P2 (an opponent of controller P1) DOES control a battlefield, the stolen Vayne enters READY", async () => {
    const game = await vayneStolenTo("base", { p2HoldsOne: true });
    expect(game.gameState.battlefields.theirs?.controller).toBe(P2);
    expect(game.state("vayne").controller).toBe(P1);
    expect(game.state("vayne").isExhausted).toBe(false);
  });

  // ---- (b) conquering with the stolen Vayne -----------------------------------------------------

  /** Blind Fury → Vayne to P1's base; two turns pass; P1 (1 pt from holding home) sends Vayne to "open". */
  async function vayneConquersOpen(opts: { tapEnergy: number }): Promise<{ game: Game; p1Before: number; p2Before: number }> {
    const game = await vayneStolenTo("base");
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 (Vayne readied; P1 held "home" for 1)
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("vayne").isReady).toBe(true);
    if (opts.tapEnergy > 0) {
      await game.p1.tapRunes(opts.tapEnergy);
    }
    const p1Before = game.p1.points();
    const p2Before = game.p2.points();
    await game.p1.move("vayne", "open");
    await game.settle(); // showdown: both pass focus → P1 takes control → conquer
    return { game, p1Before, p2Before };
  }

  test("(b) P1 — the controller who took the battlefield — scores the conquer point (469.1)", async () => {
    const { game, p1Before } = await vayneConquersOpen({ tapEnergy: 0 });
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
      await game.settle();
    }
    expect(game.gameState.battlefields.open?.controller).toBe(P1);
    expect(game.locationOf("vayne")).toBe("open");
    expect(game.p1.points()).toBe(p1Before + 1);
  });

  // Expected (469.1, 127.1): only the conquering CONTROLLER scores; ownership of the unit is
  // irrelevant, so P2's score is unchanged. Actual: the engine also credits Vayne's owner (P2)
  // with a point when the P1-controlled Vayne conquers.
  test("(b) Vayne's OWNER (P2) scores nothing when the P1-controlled Vayne conquers (469.1)", async () => {
    const { game, p2Before } = await vayneConquersOpen({ tapEnergy: 0 });
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
      await game.settle();
    }
    expect(game.p2.points()).toBe(p2Before);
  });

  test("(b) 'When I conquer' is P1's ability: the trigger is controlled by P1 and the 'pay [1]?' question is put to P1, not P2 (191.4.a, 383.3.a.3)", async () => {
    const game = await vayneStolenTo("base");
    await game.advanceTurn();
    await game.advanceTurn();
    await game.p1.tapRunes(1);
    await game.p1.move("vayne", "open");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.chain().map((i) => [i.name, i.controller, i.triggered])).toEqual([["Vayne, Hunter", P1, true]]);
    // rule 383.3.b.1 (finalization): the "pay [1]?" question is put to the controller at once,
    // before either player gets priority over the chain item.
    const d = game.decision();
    expect(d?.kind).toBe("yes-no");
    expect(d?.seat).toBe(P1);
    expect(d?.kind === "yes-no" ? d.canAccept : undefined).toBe(true); // P1 has the 1 energy
  });

  test("(b) with an empty pool P1 cannot accept the payment; declining leaves Vayne at the conquered battlefield under P1 (204.3.b)", async () => {
    const { game } = await vayneConquersOpen({ tapEnergy: 0 });
    const d = game.decision();
    expect(d?.kind).toBe("yes-no");
    expect(d?.seat).toBe(P1);
    expect(d?.kind === "yes-no" ? d.canAccept : undefined).toBe(false);
    await game.p1.no();
    await game.settle();
    expect(game.locationOf("vayne")).toBe("open");
    expect(game.state("vayne").controller).toBe(P1);
    expect(game.p2.hand()).not.toContain("vayne");
  });

  test("(b) if P1 pays the [1] from P1's pool, 'return me to my OWNER's hand' sends Vayne to P2's hand — never P1's (127.1, 056.2, 124)", async () => {
    const { game } = await vayneConquersOpen({ tapEnergy: 1 });
    expect(game.p1.energy()).toBe(1);
    const p2Energy = game.p2.energy();
    const p1Hand = game.p1.hand().length;
    await game.p1.yes();
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p2.energy()).toBe(p2Energy);
    expect(game.zoneOf("vayne")).toBe("hand");
    expect(game.p2.hand()).toContain("vayne");
    expect(game.p1.hand()).not.toContain("vayne");
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.state("vayne").owner).toBe(P2);
    // P1 keeps the conquer point, but with no unit left there control lapses in the next cleanup (190.4.c).
    expect(game.p1.points()).toBe(2);
    expect(game.gameState.battlefields.open?.controller ?? null).toBeNull();
  });

  // ---- (c) Hidden Blade on the stolen Vayne ---------------------------------------------------

  /** Blind Fury → Vayne to P1's "home"; P2's turn; P2 (given 2+[order]) Hidden-Blades Vayne. */
  async function bladed(): Promise<{ game: Game; p1Hand: number; p2Hand: number }> {
    const game = await vayneStolenTo("home");
    expect(game.locationOf("vayne")).toBe("home");
    await game.advanceTurn(); // → P2's turn (P2 drew 1)
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 2, power: { order: 1 } });
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length; // includes Hidden Blade
    expect(game.p2.can("cast", "blade")).toBe(true);
    await game.p2.cast("blade", { targets: "vayne" });
    await game.settle();
    return { game, p1Hand, p2Hand };
  }

  test("(c) Hidden Blade may target the P1-controlled Vayne at a battlefield ('a unit at a battlefield')", async () => {
    const game = await vayneStolenTo("home");
    await game.advanceTurn();
    await game.p2.do("addResources", { energy: 2, power: { order: 1 } });
    const field = game.p2.option("cast", "blade")?.fields.find((f) => f.name === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
    expect(offered).toContain("vayne");
    expect(offered).toContain("guard");
    expect(offered).not.toContain("p2home"); // in base, not at a battlefield
  });

  test("(c)(d) the killed Vayne goes to its OWNER's trash — P2's, not P1's (428.2, 323.5, 056.2)", async () => {
    const { game } = await bladed();
    expect(game.zoneOf("vayne")).toBe("trash");
    expect(game.p2.trash()).toContain("vayne");
    expect(game.p1.trash()).not.toContain("vayne");
    expect(game.p1.trash()).toEqual(["fury"]);
    expect(game.p2.trash()).toContain("blade");
    expect(game.p1.units("home")).toEqual(["guard"]);
  });

  // Expected (359.3.e.12-style last-known information, cf. 808.1.d.3): "its controller" is the
  // unit's controller as it was on the board = P1 → P1 draws 2, P2 draws 0 (net −1 for the Blade).
  // Actual: the engine reads the controller after the card has landed in P2's trash (where
  // controller reverts to owner) and hands the 2 cards to P2; P1 draws nothing.
  test("(c) 'Its controller draws 2' = the last board controller P1 draws 2; P2 (owner/killer) draws nothing", async () => {
    const { game, p1Hand, p2Hand } = await bladed();
    expect(game.p1.hand()).toHaveLength(p1Hand + 2);
    expect(game.p2.hand()).toHaveLength(p2Hand - 1); // spent Hidden Blade, drew nothing
  });

  test("(c) exactly two cards are drawn in total off Hidden Blade (whoever receives them), and the chain is empty afterwards", async () => {
    const { game, p1Hand, p2Hand } = await bladed();
    const drawn = game.p1.hand().length - p1Hand + (game.p2.hand().length - (p2Hand - 1));
    expect(drawn).toBe(2);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
