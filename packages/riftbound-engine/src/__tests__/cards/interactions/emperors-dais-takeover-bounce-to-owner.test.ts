/**
 * Interaction: Hostile Takeover (sfd-202-221) · Spell · Mind/Order · 5 + 2 pips
 *     "Take control of an enemy unit at a battlefield. Ready it. (… Otherwise, conquer.)
 *      Lose control of that unit and recall it at end of turn."
 *   × Emperor's Dais (sfd-207-221) · Battlefield
 *     "When you conquer here, you may pay [1] and return a unit you control here to its owner's hand.
 *      If you do, play a 2 [Might] Sand Soldier unit token here."
 *
 * Rules: 477.1.a (control-changing layer), 190.3.a (a unit that "otherwise becomes present" under a
 * non-controller contests the battlefield), 466.5.d / 469.1 (establishing control = Conquer, +1),
 * 190.6.d / 190.6.a ("you" on a battlefield = its CONTROLLER, who controls its abilities), 383.4.c.2.b
 * (the conquer trigger belongs to the conquering player), 056.2 / 127.1 (a returned card goes to its
 * OWNER's hand), 182 / 183 (a token's controller AND owner = controller of the creating ability),
 * 359.3.e.12 (an object that left the board → null; instructions about it are ignored), 317.1 / 455 / 456
 * / 323.7 (end of turn: lose control, recall = not a move, to its controller's base), 190.4.c / 323.6 (an
 * emptied battlefield is lost at the next Open-state cleanup). Dais timing (383.3.a / 402.2 / 205 / 444.2):
 * the "you may" opt-in and the choice of WHICH unit here are made when the trigger is finalized (nothing paid);
 * the [1] is paid — still declinable — and the unit returned as the item RESOLVES; the token follows if both happened.
 *
 * Board: Emperor's Dais is P2's battlefield (P2 owns it), controlled by P2 with a lone EXHAUSTED vanilla
 * 4-cost 4-Might "X". P1: 7 energy + 2 order, Hostile Takeover in hand, has not scored the Dais this
 * turn. Each side has an irrelevant 1-Might unit at home.
 *
 * Q (a) P1 resolves Hostile Takeover on X — who conquers/scores, and whose "When you conquer here" is it?
 *   (b) YES: is P2-owned X a legal "unit you control here" for P1? Whose hand does it go to? Who
 *       gets/owns the Sand Soldier; does HT's end-of-turn clause touch it; who holds the Dais next turn?
 *   (c) NO: where is X at end of turn and does P1 keep the Dais?
 * Expected: (a) P1 controls + readies X → Contested → non-combat showdown → P1 conquers, +1; the Dais
 *   trigger is P1's (controller), P2 gets nothing. (b) X qualifies (control, not ownership); paying sends
 *   X to P2's hand and costs [1]; the Sand Soldier is P1's (controller and owner) at the Dais, so P1 keeps
 *   the Dais; HT's delayed clause finds X gone → does nothing, the token never "reverts"; P1 Holds next
 *   turn for a 2nd point. (c) X stays P1's at the Dais this turn; at end of turn it reverts to P2 and is
 *   recalled to P2's base; the empty Dais becomes uncontrolled; P1 keeps the 1 point, nobody holds.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HOSTILE_TAKEOVER = "sfd-202-221";
const EMPERORS_DAIS = "sfd-207-221";

function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { order: 2 } })
    .battlefield("dais", { controller: P2, def: EMPERORS_DAIS, inert: false, owner: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "dais", { energyCost: 4, might: 4, name: "X" }, "x", { exhausted: true })
    .unit(P2, "base", { might: 1, name: "P2 Homebody" }, "p2home")
    .unit(P1, "base", { might: 1, name: "P1 Homebody" }, "p1home")
    .hand(P1, HOSTILE_TAKEOVER, "ht");
}

const sandSoldiers = (game: Game) => game.cardsAt("dais").filter((c) => game.state(c).name === "Sand Soldier");

/** P1 casts Hostile Takeover on X and both players pass priority → the spell has resolved. */
async function takeover(game: Game): Promise<void> {
  await game.p1.cast("ht", { targets: "x" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("ht")).toBe("trash");
}

/** …then both players pass Focus in the (non-combat) showdown the steal opened → P1 establishes control. */
async function takeoverAndConquer(game: Game): Promise<void> {
  await takeover(game);
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "showdown") {
      break;
    }
    await game.acting().passFocus();
  }
}

/** Pass priority (whoever holds it) until P1's open main phase; P1 pays the Dais's resolution-time [1] when asked (444.2). */
async function toOpenMain(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "main") {
      return;
    }
    if (d?.kind === "action" && d.passKey) {
      await game.acting().pass();
    } else if (d?.kind === "yes-no" && d.seat === P1 && d.timing === "RES") {
      await game.p1.yes();
    } else if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options[0]?.key as string);
    } else {
      break;
    }
  }
  expect(game.decision()).toMatchObject({ context: "main", kind: "action" });
}

describe("Emperor's Dais × Hostile Takeover — the thief conquers, bounces the loaner to its OWNER, keeps a Sand Soldier", () => {
  // ── (a) who conquers, whose trigger ─────────────────────────────────────────────────────────

  test("(a) Hostile Takeover resolves: P1 CONTROLS X (P2 still owns it), X is readied, and X's presence contests the Dais — a non-combat showdown opens with P1 holding Focus; nothing scored yet (477.1.a, 190.3.a)", async () => {
    const game = await board().build();
    await takeover(game);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 0 } });
    expect(game.state("x")).toMatchObject({ controller: P1, isReady: true, owner: P2, zone: "battlefield-dais" });
    expect(game.p1.units("dais")).toEqual(["x"]);
    expect(game.p2.units("dais")).toEqual([]);
    expect(game.gameState.battlefields.dais?.controller).not.toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("(a) the showdown closes → P1 CONQUERS the Dais and scores 1; P2 (owner of the battlefield and of X) scores nothing (466.5.d / 469.1)", async () => {
    const game = await board().build();
    await takeoverAndConquer(game);
    expect(game.gameState.battlefields.dais?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
  });

  test("(a) 'When YOU conquer here' is the CONTROLLER's — the Dais trigger is P1's chain item and the opt-in is asked of P1; P2 is asked nothing (190.6.d, 190.6.a, 383.4.c.2.b)", async () => {
    const game = await board().build();
    await takeoverAndConquer(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dais", controller: P1, triggered: true })]);
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "dais" }, timing: "FIN" });
    expect(game.p2.decision()?.kind ?? null).not.toBe("yes-no");
  });

  // ── (b) YES ─────────────────────────────────────────────────────────────────────────────────

  test("(b) P2-owned X IS a legal 'unit you control here' for P1: it is CHOSEN at finalization (402.2 — P1's base Homebody never is), stays on the Dais through P2's window (nothing paid yet — 205), and on resolution P1 pays [1] (2 → 1) and X returns to its OWNER's hand — P2's, not P1's (056.2 / 127.1)", async () => {
    const game = await board().build();
    await takeoverAndConquer(game);
    await game.p1.yes();
    // A lone candidate may be bound without asking; if a pick IS shown it lists exactly X.
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["x"]);
      await game.p1.pick("x");
    }
    expect(game.p1.energy()).toBe(2);
    expect(game.zoneOf("x")).toBe("battlefield-dais");
    expect(game.zoneOf("p1home")).toBe("base");
    // The Dais ability now waits on the chain with X named; P1 then P2 get priority over it.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dais", controller: P1, targets: ["x"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.zoneOf("x")).toBe("battlefield-dais"); // still here in P2's window
    await game.p2.passPriority(); // resolves: pay [1]?
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "dais" }, timing: "RES" });
    await game.p1.yes();
    expect(game.p1.energy()).toBe(1);
    expect(game.zoneOf("x")).toBe("hand");
    expect(game.p2.hand()).toContain("x");
    expect(game.p1.hand()).not.toContain("x");
    expect(game.state("x")).toMatchObject({ owner: P2, zone: "hand" });
  });

  test("(b) resolution: a 2-Might Sand Soldier token is played at the Dais with P1 as controller AND owner (182 / 183); P1 still has a unit there and keeps the Dais; energy 1, point kept", async () => {
    const game = await board().build();
    await takeoverAndConquer(game);
    await game.p1.yes();
    await toOpenMain(game);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    const soldiers = sandSoldiers(game);
    expect(soldiers).toHaveLength(1);
    expect(game.state(soldiers[0] as string)).toMatchObject({ controller: P1, isToken: true, might: 2, owner: P1, zone: "battlefield-dais" });
    expect(game.p1.units("dais")).toEqual(soldiers);
    expect(game.gameState.battlefields.dais?.controller).toBe(P1);
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(b) X is a NEW object in P2's hand that P2 must pay full price (4) to replay — not affordable off the 2 runes P2 channels next turn", async () => {
    const game = await board().build();
    await takeoverAndConquer(game);
    await game.p1.yes();
    await toOpenMain(game);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.hand()).toContain("x");
    expect(game.state("x").energyCost).toBe(4);
    expect(game.p2.can("play", "x")).toBe(false);
    await game.p2.tapRunes(2);
    expect(game.p2.energy()).toBe(2);
    expect(game.p2.can("play", "x")).toBe(false);
  });

  test("(b) end of turn: Hostile Takeover's 'lose control and recall' refers only to X, which left the board → nothing happens (359.3.e.12): the Sand Soldier stays P1's at the Dais through P2's turn, X stays in P2's hand (not recalled to any base)", async () => {
    const game = await board().build();
    await takeoverAndConquer(game);
    await game.p1.yes();
    await toOpenMain(game);
    const soldier = sandSoldiers(game)[0] as string;
    await game.advanceTurn(); // P1's Ending Step happens here
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state(soldier)).toMatchObject({ controller: P1, owner: P1, zone: "battlefield-dais" });
    expect(game.gameState.battlefields.dais?.controller).toBe(P1);
    expect(game.zoneOf("x")).toBe("hand");
    expect(game.p2.base()).not.toContain("x");
    expect(game.p1.base()).not.toContain("x");
    expect(game.p1.points()).toBe(1);
  });

  test("(b) net result: if the Sand Soldier survives P2's turn, P1 HOLDS the Dais at the start of P1's next turn for a second point — the temporary steal became a bounce + a permanent body + the battlefield", async () => {
    const game = await board().build();
    await takeoverAndConquer(game);
    await game.p1.yes();
    await toOpenMain(game);
    const soldier = sandSoldiers(game)[0] as string;
    await game.advanceTurn(); // → P2 (does nothing)
    await game.advanceTurn(); // → P1: Beginning Phase scores the Hold
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state(soldier)).toMatchObject({ controller: P1, zone: "battlefield-dais" });
    expect(game.gameState.battlefields.dais?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) NO ──────────────────────────────────────────────────────────────────────────────────

  test("(c) declined (at finalization — 383.3.a.2: no chain item): no [1] paid, no token; X stays P1's (P2-owned), ready, at the Dais for the rest of P1's turn and P1 controls the Dais with its 1 point", async () => {
    const game = await board().build();
    await takeoverAndConquer(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    await toOpenMain(game);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(2);
    expect(sandSoldiers(game)).toEqual([]);
    expect(game.state("x")).toMatchObject({ controller: P1, isReady: true, owner: P2, zone: "battlefield-dais" });
    expect(game.p1.units("dais")).toEqual(["x"]);
    expect(game.gameState.battlefields.dais?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
  });

  test("(c) at P1's Ending Step P1 loses control of X and it is RECALLED to its controller's — now P2's — base (317.1, 455/456, 323.7); the Dais is left with no units and P1 no longer controls it (190.4.c / 323.6); the conquer point stands", async () => {
    const game = await board().build();
    await takeoverAndConquer(game);
    await game.p1.no();
    await toOpenMain(game);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("x")).toMatchObject({ controller: P2, owner: P2, zone: "base" });
    expect(game.p2.base()).toContain("x");
    expect(game.p1.base()).not.toContain("x");
    expect(game.cardsAt("dais")).toEqual([]);
    expect(game.gameState.battlefields.dais?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    // X is fully P2's again: P2 may walk it straight back onto the empty Dais.
    expect(game.p2.can("move")).toBe(true);
    await game.p2.move("x", "dais");
    expect(game.locationOf("x")).toBe("dais");
  });

  test("(c) nobody Holds the Dais next turn: after P2's (idle) turn P1 starts its next turn still on 1 point, P2 on 0 — strictly worse for P1 than the YES line", async () => {
    const game = await board().build();
    await takeoverAndConquer(game);
    await game.p1.no();
    await toOpenMain(game);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.battlefields.dais?.controller).toBeNull();
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.state("x")).toMatchObject({ controller: P2, zone: "base" });
    expect(game.violations()).toEqual([]);
  });
});
