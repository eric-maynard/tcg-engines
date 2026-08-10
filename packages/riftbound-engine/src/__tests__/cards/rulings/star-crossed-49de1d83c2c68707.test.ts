/**
 * Ruling 49de1d83c2c68707 — Star-Crossed (UNL-128 → unl-128-219) · Reaction · [3][chaos] "Return a friendly unit and an
 *   enemy unit to their owners' hands."
 *   × Diana, Lunari (UNL-079 → unl-079-219) · 3 Might "When a showdown begins here, you may pay [1]. If you do, [Predict],
 *     then reveal the top card of your Main Deck. If it's a spell, draw it."
 *   (play-trigger case exercised with Lecturing Yordle ogn-087-298 "When you play me, draw 1.")
 *
 * Q: (1) Star-Crossed in response to a unit's "when you play me" trigger — does the ability still resolve? (2) A showdown
 *    begins at Diana's battlefield, her trigger is on the chain, opponent Star-Crosses Diana — do I still Predict etc.?
 * A: Yes to both. Once a triggered ability is on the chain it is independent of its source; bouncing the unit does not
 *    remove or stop it. Diana's effect (pay [1], Predict, reveal, draw-if-spell) needs nothing from Diana on the board.
 * Rules: 376/377 (abilities on the chain are independent of their source), 383 (triggered abilities), 359.3 (resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STAR_CROSSED = "unl-128-219";
const DIANA = "unl-079-219";
const LECTURING_YORDLE = "ogn-087-298";
const CLEAVE = "ogn-004-298"; // the spell on top of P1's deck
const SKULKER = "ogn-175-298";

const ids = (game: Game) => game.chain().map((c) => c.cardId);

/** Pass priority until the chain has `n` items left. */
async function resolveDownTo(game: Game, n: number): Promise<void> {
  for (let i = 0; i < 10 && game.chain().length > n; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling 49de1d83c2c68707 (1) — Star-Crossed on a unit whose play trigger is on the chain: the trigger still resolves", () => {
  /** P1's turn with [3]; P1 plays Lecturing Yordle. P2: Pawn in base (its friendly half) + Star-Crossed with [3][chaos]. */
  function board() {
    return scenario()
      .resources(P1, { energy: 3 })
      .resources(P2, { energy: 3, power: { chaos: 1 } })
      .unit(P2, "base", { might: 1, name: "Pawn" }, "pawn")
      .hand(P1, LECTURING_YORDLE, "yordle")
      .hand(P2, STAR_CROSSED, "sc")
      .deck(P1, [CLEAVE, SKULKER], ["top", "second"]);
  }

  test("Yordle is played, its 'draw 1' trigger goes on the chain; P2 responds with Star-Crossed [Pawn, Yordle] which resolves first — Yordle is back in P1's hand while its trigger is STILL on the chain", async () => {
    const game = await board().build();
    await game.p1.play("yordle");
    expect(game.zoneOf("yordle")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yordle", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "sc")).toBe(true);
    await game.p2.cast("sc", { targets: ["pawn", "yordle"] });
    expect(ids(game)).toEqual(["yordle", "sc"]);
    await resolveDownTo(game, 1);
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.zoneOf("yordle")).toBe("hand");
    expect(game.zoneOf("pawn")).toBe("hand");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yordle", triggered: true })]); // not removed with its source
  });

  test("…and the trigger then resolves normally: P1 draws 1 (the top card) even though the Yordle is no longer on the board", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length; // includes the Yordle
    await game.p1.play("yordle");
    await game.p1.passPriority();
    await game.p2.cast("sc", { targets: ["pawn", "yordle"] });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("top")).toBe("hand");
    expect(game.p1.hand()).toContain("yordle");
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1 + 1); // played Yordle, got it back, drew 1
    expect(game.violations()).toEqual([]);
  });
});

describe("Ruling 49de1d83c2c68707 (2) — Diana, Lunari Star-Crossed off the battlefield still Predicts / reveals / draws", () => {
  /**
   * P2's turn. P1 holds bf1 with Diana + Buddy and has exactly [1] for her payment; P1's deck: Cleave (spell) then a unit.
   * P2's Raider (3) attacks from base; P2 keeps Pawn home as Star-Crossed's friendly half; P2 has [3][chaos].
   */
  function board() {
    return scenario()
      .active(P2)
      .resources(P1, { energy: 1 })
      .resources(P2, { energy: 3, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", DIANA, "diana")
      .unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .unit(P2, "base", { might: 1, name: "Pawn" }, "pawn")
      .hand(P2, STAR_CROSSED, "sc")
      .deck(P1, [CLEAVE, SKULKER], ["topspell", "second"]);
  }

  /** Raider attacks bf1 → Diana's showdown trigger on the chain; P1 passes; P2 Star-Crosses [Pawn, Diana]; it resolves. */
  async function dianaBounced(): Promise<Game> {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "diana", controller: P1, triggered: true })]);
    // 383.3.a — the leading "you may" is a free "use it?" while the trigger is finalized (timing FIN) …
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "diana" }, timing: "FIN" });
    await game.p1.yes();
    // … 205 / 444.2 — but the "pay [1]. If you do…" is decided on RESOLUTION, so nothing is paid yet.
    expect(game.p1.energy()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "sc")).toBe(true);
    await game.p2.cast("sc", { targets: ["pawn", "diana"] });
    expect(ids(game)).toEqual(["diana", "sc"]);
    await resolveDownTo(game, 1);
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.zoneOf("diana")).toBe("hand");
    expect(game.p1.hand()).toContain("diana");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "diana", triggered: true })]);
    return game;
  }

  test("Star-Crossed resolves first and returns Diana (and P2's Pawn) to hand; Diana's 'showdown begins here' trigger remains on the chain", async () => {
    await dianaBounced();
  });

  test("the trigger then resolves with Diana in hand: P1 is asked to pay [1] (yes), gets the Predict choice (keeps the top card), the top card Cleave is revealed and — being a spell — drawn", async () => {
    const game = await dianaBounced();
    await resolveDownTo(game, 0);
    // Resolution-time payment prompt (444.2), for P1.
    let d: Decision | null = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "diana" }, timing: "RES" });
    expect(d?.kind === "yes-no" ? d.canAccept : undefined).not.toBe(false);
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0);
    // Predict: look at the top card, may recycle it — P1 is shown Cleave and declines to recycle.
    d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "diana" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["topspell"]);
    await game.p1.decline();
    await game.settle(); // reveal Cleave → it's a spell → draw it; then the showdown continues
    expect(game.zoneOf("topspell")).toBe("hand");
    expect(game.p1.hand()).toContain("topspell");
    expect(game.zoneOf("second")).toBe("mainDeck");
    expect(game.zoneOf("diana")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });

  test("control: had P1 recycled Cleave with the Predict, the revealed top card would be the unit and nothing is drawn — showing the whole effect really ran off the deck, not off Diana", async () => {
    const game = await dianaBounced();
    await resolveDownTo(game, 0);
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("topspell"); // recycle it
    await game.settle();
    expect(game.zoneOf("topspell")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("topspell");
    expect(game.zoneOf("second")).toBe("mainDeck"); // revealed (a unit), stays
    expect(game.p1.hand()).not.toContain("second");
  });
});
