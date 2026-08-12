/**
 * Interaction: Relentless Pursuit (sfd-184-221) · Spell · Fury/Body · 2 + [rainbow] · [Action]
 *                "Move a friendly unit. You may attach an Equipment with the same controller to it. This turn,
 *                 that unit has 'When I conquer, you may move me to my base.'"
 *            × Treasure Hunter (sfd-130-221) · Unit · Chaos · 2 · 1 Might
 *                "When I move, play a Gold gear token exhausted."
 *
 * Question: P1's turn, Neutral Open, no Equipment anywhere. P1 Pursuits Treasure Hunter from base to the
 * empty, uncontrolled bfC. How many Gold tokens; when does the Non-Combat Showdown open relative to the
 * spell / move trigger; who has Focus; does P1 conquer when both pass? P1 then takes the granted "you may
 * move me to my base": does bfC stay P1's, does P1 keep the point? Later the same turn P1 Standard-Moves a
 * vanilla 2-Might unit base → the again-empty bfC and both pass: does P1 score bfC a second time?
 *
 * Rules: 450 (an effect move is a Move → Contested applied by P1), Treasure Hunter's "When I move" (Gold #1),
 * 323.8 / 323.12 / 344.2 / 316.8.b.1 (the staged Non-Combat Showdown only BEGINS in a Neutral Open state,
 * i.e. after the spell AND the move trigger have left the chain), 345 (P1 — who applied Contested — has
 * Focus), 348 → 348.2.a → 469.1 (both pass → P1 establishes control → Conquer, +1), the turn-scoped granted
 * conquer trigger (optional move home = a second Move → Gold #2), 323.6 / 190.4.c (empty bfC in an Open
 * state → P1 loses control at the next Cleanup; the point is never undone), 348.2.a.1 / 469.1 / 470 (second
 * establishment of control the same turn is NOT a Conquer: no point), 315.2.b (Hold next turn is fine).
 *
 * Expected: RP resolves → Hunter at bfC (Contested) → move trigger → Gold #1 (exhausted) → chain empty →
 * showdown at bfC, P1 Focus → pass/pass → P1 conquers, +1 → "you may move me to my base" → yes → Hunter home
 * → Gold #2 → bfC uncontrolled, P1 still 1. Vanilla W → bfC → showdown → pass/pass → bfC is P1's again but
 * no point (net +1 for the turn), two exhausted Gold tokens, Hunter in base; P1 Holds bfC next turn (→ 2).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RELENTLESS_PURSUIT = "sfd-184-221";
// rule 355.7 / 355.9 (riftjudge 4283ca02526c0650) — the Equipment is named as the
// spell is played, so one must be in play for Relentless Pursuit to be castable.
const RP_EQUIPMENT = "sfd-042-221";
const TREASURE_HUNTER = "sfd-130-221";

/**
 * P1's turn 2, main phase. bfC empty & uncontrolled; bfX is P2's with a big unit parked there (irrelevant,
 * just a second battlefield so destinations are a real choice). P1: Treasure Hunter + vanilla W (2) in base,
 * Relentless Pursuit in hand, exactly 2 energy + 1 [rainbow]. No Equipment on either side.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bfC", { controller: null })
    .battlefield("bfX", { controller: P2 })
    .unit(P2, "bfX", { might: 5, name: "Faraway" }, "far")
    .unit(P1, "base", TREASURE_HUNTER, "hunter")
    .unit(P1, "base", { might: 2, name: "Vanilla W" }, "W")
    .gear(P1, RP_EQUIPMENT, "rpEquip")
    .hand(P1, RELENTLESS_PURSUIT, "rp");
}

const golds = (game: Game): string[] => game.findAll({ name: "Gold", owner: P1 }).filter((id) => game.state(id).isToken);
const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);
const isShowdownFocus = (seat?: string) => (d: Decision | null) =>
  d?.kind === "action" && d.context === "showdown" && (seat === undefined || d.seat === seat);
const isChainPriority = (d: Decision | null) => d?.kind === "action" && d.context === "chain";
const isOpenMain = (d: Decision | null) => d?.kind === "action" && d.context === "main";
const isMoveHomeOffer = (d: Decision | null) => d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "hunter";

/** Step with passes / forced answers only until `pred` holds (bounded). */
async function until(game: Game, pred: (d: Decision | null) => boolean, max = 30): Promise<Decision | null> {
  for (let i = 0; i < max && !pred(game.decision()); i++) {
    await game.settle({ maxSteps: 1 });
  }
  expect(pred(game.decision())).toBe(true);
  return game.decision();
}

/** Cast Relentless Pursuit on the Hunter and send it to bfC (the destination is asked as the spell is played). */
async function pursued(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("rp", { targets: ["hunter", "rpEquip"] });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("battlefield-bfC");
  return game;
}

/** …through the showdown (both pass) and the conquer, up to the granted "you may move me to my base" offer. */
async function conquered(): Promise<Game> {
  const game = await pursued();
  await until(game, isMoveHomeOffer);
  return game;
}

/** …accept the offer and drain to P1's open main phase. */
async function sentHome(): Promise<Game> {
  const game = await conquered();
  await game.p1.yes();
  await until(game, isOpenMain);
  return game;
}

describe("Relentless Pursuit × Treasure Hunter onto an empty battlefield — showdown timing, hit-and-run, and no re-conquer (470)", () => {
  test("cast: friendly units only (Hunter, W); 2 energy + [rainbow] paid; the destination for the Hunter is chosen as the spell is played — bfC or bfX, not base (it is there)", async () => {
    const game = await board().build();
    // rule 355.5 / 355.12 — each option is the PAIR the spell names: the unit it
    // moves and the Equipment it may attach (ruling 4283ca02526c0650).
    const tuples = (game.p1.option("cast", "rp")?.fields.find((f) => f.name === "targets")?.options ?? []) as string[][];
    expect([...new Set(tuples.map((t) => t[0]))].sort()).toEqual(["W", "hunter"]);
    expect([...new Set(tuples.map((t) => t[1]))]).toEqual(["rpEquip"]);
    await game.p1.cast("rp", { targets: ["hunter", "rpEquip"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["battlefield-bfC", "battlefield-bfX"]);
    await game.p1.pick("battlefield-bfC");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rp", controller: P1, triggered: false })]);
    expect(game.locationOf("hunter")).toBe("base"); // nothing moved yet — the spell is on the chain
    expect(isChainPriority(game.decision())).toBe(true);
  });

  test("RP resolves (P1 pass, P2 pass): the Hunter is at bfC, P1 applied Contested (450), the named Equipment attach is declined, and 'When I move' is on the chain — the showdown has NOT begun yet (Closed state, 323.12)", async () => {
    const game = await pursued();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.decline(); // rule 355.13 — the attach itself stays optional
    expect(game.zoneOf("rp")).toBe("trash");
    expect(game.locationOf("hunter")).toBe("bfC");
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: true, controller: null });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hunter", controller: P1, triggered: true })]);
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(isChainPriority(game.decision())).toBe(true);
    expect(golds(game)).toEqual([]);
    expect(game.p1.points()).toBe(0);
  });

  test("the move trigger resolves → Gold token #1 in P1's base, EXHAUSTED; only now (chain empty, Neutral Open) does the Cleanup begin the Non-Combat Showdown at bfC with P1 holding Focus (344.2 / 316.8.b.1 / 345)", async () => {
    const game = await pursued();
    await until(game, isShowdownFocus(P1));
    expect(game.chain()).toEqual([]);
    const g = golds(game);
    expect(g).toHaveLength(1);
    expect(game.state(g[0] as string)).toMatchObject({ isExhausted: true, location: "base", name: "Gold" });
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfC", focusPlayer: P1, isCombatShowdown: false });
    expect(game.gameState.battlefields.bfC?.controller).toBe(null);
    expect(game.p1.points()).toBe(0);
  });

  test("P1 passes Focus, P2 passes Focus → showdown closes → P1 establishes control of bfC = Conquer → +1 point (348.2.a / 469.1); the granted 'When I conquer, you may move me to my base' asks P1", async () => {
    const game = await pursued();
    await until(game, isShowdownFocus(P1));
    await game.p1.passFocus();
    expect(isShowdownFocus(P2)(game.decision())).toBe(true);
    await game.p2.passFocus();
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["bfC"]);
    await until(game, isMoveHomeOffer, 5);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "hunter" } });
    expect(game.locationOf("hunter")).toBe("bfC");
  });

  test("taking it: the Hunter goes home — a second Move → Gold token #2 (exhausted); at the next Cleanup bfC (empty, Open, no showdown) becomes UNcontrolled (323.6 / 190.4.c) but the point stays", async () => {
    const game = await sentHome();
    expect(game.locationOf("hunter")).toBe("base");
    const g = golds(game);
    expect(g).toHaveLength(2);
    for (const t of g) {
      expect(game.state(t)).toMatchObject({ isExhausted: true, location: "base", name: "Gold" });
    }
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("declining instead (control): the Hunter stays, bfC remains P1's, still exactly 1 point and only ONE Gold token", async () => {
    const game = await conquered();
    await game.p1.no();
    await until(game, isOpenMain);
    expect(game.locationOf("hunter")).toBe("bfC");
    expect(game.gameState.battlefields.bfC?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(golds(game)).toHaveLength(1);
  });

  test("later the same turn: W Standard-Moves base → the again-empty bfC → Contested → showdown with P1 Focus; both pass → P1 controls bfC again but this is NOT a Conquer — no second point (348.2.a.1 / 470)", async () => {
    const game = await sentHome();
    expect(game.p1.can("move")).toBe(true);
    await game.p1.move("W", "bfC");
    expect(game.locationOf("W")).toBe("bfC");
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: true, controller: null });
    expect(isShowdownFocus(P1)(game.decision())).toBe(true);
    expect(showdown(game)).toMatchObject({ battlefieldId: "bfC", focusPlayer: P1, isCombatShowdown: false });
    await game.p1.passFocus();
    await game.p2.passFocus();
    await until(game, isOpenMain, 5);
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1); // still 1: bfC was already Scored this turn
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["bfC"]);
    expect(game.chain()).toEqual([]); // and no conquer trigger of any kind
  });

  test("final tally for the turn: P1 net +1 (not +2), bfC controlled by P1 via W, two exhausted Gold tokens in base, Treasure Hunter in base; next turn P1 simply Holds bfC (→ 2)", async () => {
    const game = await sentHome();
    await game.p1.move("W", "bfC");
    await game.p1.passFocus();
    await game.p2.passFocus();
    await until(game, isOpenMain, 5);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields.bfC?.controller).toBe(P1);
    expect(game.p1.units("bfC")).toEqual(["W"]);
    expect(game.locationOf("hunter")).toBe("base");
    expect(golds(game).map((t) => game.state(t).isExhausted)).toEqual([true, true]);
    expect(game.violations()).toEqual([]);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1: Scoring Step holds bfC
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.gameState.battlefields.bfC?.controller).toBe(P1);
  });
});
