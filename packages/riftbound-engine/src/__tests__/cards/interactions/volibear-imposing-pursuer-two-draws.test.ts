/**
 * Interaction: Volibear, Imposing (ogn-158-298) · Champion Unit · Body · 12 · 10 Might — P2's, holding bf1
 *     "[Shield 3] [Tank] When an opponent moves to a battlefield other than mine, draw 1. (Bases are not battlefield.)"
 *   × Stealthy Pursuer (ogn-177-298) · Unit · Chaos · 4 · 4 Might — P1's, at bfA
 *     "When a friendly unit moves from my location, I may be moved with it."
 *   × Vi, Destructive (ogn-036-298) · Champion Unit · Fury · 2 · 3 Might · "[Ganking] …" — P1's, at bfA
 *
 * Board: P2's Volibear holds bf1. P1 controls bfA with Vi + Pursuer (both ready). bfB is open (no
 * controller, no units). P1's turn, Neutral Open.
 *
 * Question:
 *   (a) Vi ganks alone bfA → bfB. Two triggers arise at once on different sides (P1's Pursuer, P2's
 *       Volibear): who appends first / who is on top / who gets priority first? P1 opts the Pursuer in.
 *       How many cards does P2 draw once the Pursuer has followed — is the Pursuer's relocation a second
 *       "move to a battlefield other than mine"? When does the showdown at bfB actually begin?
 *   (b) Vi + a vanilla unit make ONE group Standard Move base → bfB: how many Volibear draws?
 *   (c) Vi ganks bfA → bf1 (Volibear's own battlefield): draw?
 *   (d) after a failed attack elsewhere P1's surviving attacker is RECALLED to base: draw?
 *
 * Expected:
 *   (a) Vi's Ganking Standard Move (810) exhausts Vi and completes at once; the move Cleanup (319.8)
 *       marks bfB Contested and STAGES a showdown there. Pursuer (P1) and Volibear (P2) trigger together →
 *       383.3.d.1: the TURN PLAYER P1 appends the Pursuer first and makes its leading "I may" opt-in while
 *       finalizing it (383.3.a); then P2's Volibear item goes on TOP (no choices). No `order` prompt for
 *       either seat (one item each). 337.4: P2 — controller of the newest item — gets priority first.
 *       LIFO: Volibear resolves → P2 draws 1. Then the Pursuer resolves and is MOVED bfA → bfB by an effect
 *       (no Ganking needed, 810.1.c.3; stays ready — exhaustion is only the Standard-Move cost). That is a
 *       new Move by an opponent's unit to a battlefield other than bf1 → Volibear triggers AGAIN → P2 draws
 *       a second card. Total 2. Only once the chain is empty in a Neutral Open state does the staged
 *       showdown at bfB begin (323.12); no P2 units there → non-combat; pass/pass → P1 conquers bfB.
 *   (b) A multi-unit Standard Move is ONE game action (144.3) → "an opponent moves" is met once → 1 draw.
 *   (c) Destination is Volibear's own battlefield → no draw (combat at bf1 proceeds normally).
 *   (d) Recalls are not moves (455 / 456.1) → no draw beyond the one for the original move.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOLIBEAR_IMPOSING = "ogn-158-298";
const STEALTHY_PURSUER = "ogn-177-298";
const VI_DESTRUCTIVE = "ogn-036-298";

/** (a)/(c): P2's Volibear holds bf1; P1's Vi + Pursuer ready at P1's bfA; bfB open and empty. P1's turn. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: null })
    .unit(P2, "bf1", VOLIBEAR_IMPOSING, "voli")
    .unit(P1, "bfA", VI_DESTRUCTIVE, "vi")
    .unit(P1, "bfA", STEALTHY_PURSUER, "sp");
}

const chainView = (game: Game): (string | boolean)[][] => game.chain().map((c) => [c.cardId, c.controller, c.triggered]);
const isOpenMain = (d: Decision | null): boolean => d?.kind === "action" && d.context === "main";

/** (a) up to the first priority window: Vi ganks to bfB, P1 opts the Pursuer in. */
async function gankedAndOptedIn(): Promise<{ game: Game; p2Hand0: number }> {
  const game = await board().build();
  const p2Hand0 = game.p2.hand().length;
  await game.p1.gank("vi", "bfB");
  await game.p1.yes();
  return { game, p2Hand0 };
}

describe("Volibear, Imposing × Stealthy Pursuer following Vi's gank — two separate moves, two draws", () => {
  // ── (a) ─────────────────────────────────────────────────────────────────────────────────────

  test("(a) the gank completes at once: Vi exhausted at bfB, bfB Contested by P1 with a showdown STAGED but not begun (319.8, 190.3.a.1)", async () => {
    const game = await board().build();
    expect(game.p1.can("gank", "vi")).toBe(true);
    await game.p1.gank("vi", "bfB");
    expect(game.locationOf("vi")).toBe("bfB");
    expect(game.state("vi").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.locationOf("sp")).toBe("bfA");
  });

  test("(a) both triggers are appended turn-player-first: P1's Pursuer at the bottom, P2's Volibear on top; the very first prompt is P1's leading 'I may' opt-in made while finalizing the Pursuer item — no `order` prompt for anyone (383.3.d.1, 383.3.a)", async () => {
    const game = await board().build();
    await game.p1.gank("vi", "bfB");
    expect(chainView(game)).toEqual([
      ["sp", P1, true],
      ["voli", P2, true],
    ]);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "sp" } });
    expect(d?.kind).not.toBe("order");
    expect(game.p2.hand()).toHaveLength(0); // nothing has resolved yet
  });

  test("(a) after the opt-in, P2 — controller of the newest item — receives priority first, then P1 (337.4); still no showdown", async () => {
    const { game } = await gankedAndOptedIn();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(chainView(game)).toEqual([
      ["sp", P1, true],
      ["voli", P2, true],
    ]);
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
  });

  test("(a) LIFO: Volibear's item resolves first → P2 draws 1 while the Pursuer is still at bfA with its item on the chain", async () => {
    const { game, p2Hand0 } = await gankedAndOptedIn();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Volibear resolves
    expect(game.p2.hand()).toHaveLength(p2Hand0 + 1);
    expect(chainView(game)).toEqual([["sp", P1, true]]);
    expect(game.locationOf("sp")).toBe("bfA");
  });

  test("(a) then the Pursuer's item resolves: it is MOVED bfA→bfB by the effect (no Ganking of its own, stays READY) — and that separate move triggers Volibear AGAIN: a fresh P2 item is on the chain (810.1.c.3, 449.1, 319.8)", async () => {
    const { game, p2Hand0 } = await gankedAndOptedIn();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Volibear #1
    await game.p1.passPriority();
    await game.p2.passPriority(); // Pursuer resolves
    expect(game.locationOf("sp")).toBe("bfB");
    expect(game.state("sp").isReady).toBe(true);
    expect(game.state("vi").isExhausted).toBe(true);
    expect(chainView(game)).toEqual([["voli", P2, true]]);
    expect(game.p2.hand()).toHaveLength(p2Hand0 + 1); // second draw not yet resolved
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]); // showdown still only staged
  });

  test("(a) the second Volibear item resolves → P2 has drawn 2 in total; only NOW, chain empty, does the staged non-combat showdown at bfB begin with P1 holding Focus (323.12)", async () => {
    const { game, p2Hand0 } = await gankedAndOptedIn();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Volibear #1
    await game.p1.passPriority();
    await game.p2.passPriority(); // Pursuer
    await game.p2.passPriority();
    await game.p1.passPriority(); // Volibear #2
    expect(game.p2.hand()).toHaveLength(p2Hand0 + 2);
    expect(game.chain()).toEqual([]);
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ active: true, battlefieldId: "bfB", focusPlayer: P1, isCombatShowdown: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.bfB?.controller).toBe(null); // not conquered yet
  });

  test("(a) end state after everyone passes: P2 drew exactly 2, P1 drew nothing, P1 conquers bfB with Vi + Pursuer and scores 1; back to P1's open main phase", async () => {
    const { game, p2Hand0 } = await gankedAndOptedIn();
    await game.settle();
    expect(isOpenMain(game.decision())).toBe(true);
    expect(game.decision()?.seat).toBe(P1);
    expect(game.p2.hand()).toHaveLength(p2Hand0 + 2);
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.p1.units("bfB").sort()).toEqual(["sp", "vi"]);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(a, NO) declining the Pursuer: only the one Volibear item resolves → P2 draws exactly 1; the Pursuer stays at bfA and Vi conquers bfB alone", async () => {
    const game = await board().build();
    const p2Hand0 = game.p2.hand().length;
    await game.p1.gank("vi", "bfB");
    await game.p1.no();
    expect(chainView(game)).toEqual([["voli", P2, true]]);
    await game.settle();
    expect(game.p2.hand()).toHaveLength(p2Hand0 + 1);
    expect(game.locationOf("sp")).toBe("bfA");
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  // ── (b) one group Standard Move = one move action ───────────────────────────────────────────

  test("(b) Vi + a vanilla unit make ONE group Standard Move base→bfB → Volibear's 'when an opponent moves' is met once: exactly ONE item, exactly ONE draw (144.3)", async () => {
    // Expected: a multi-unit Standard Move is a single game action, so the player-templated trigger fires once.
    // Actual: the engine raises one Volibear item per moved unit (two items) and P2 draws 2.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bfB", { controller: null })
      .unit(P2, "bf1", VOLIBEAR_IMPOSING, "voli")
      .unit(P1, "base", VI_DESTRUCTIVE, "vi")
      .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
      .build();
    const p2Hand0 = game.p2.hand().length;
    await game.p1.move(["vi", "buddy"], "bfB");
    expect(game.locationOf("vi")).toBe("bfB");
    expect(game.locationOf("buddy")).toBe("bfB");
    expect(chainView(game)).toEqual([["voli", P2, true]]);
    await game.settle();
    expect(game.p2.hand()).toHaveLength(p2Hand0 + 1);
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
  });

  test("(b, control) the group move itself is legal and lands both units at bfB; whatever Volibear draws, P1 conquers the open bfB", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bfB", { controller: null })
      .unit(P2, "bf1", VOLIBEAR_IMPOSING, "voli")
      .unit(P1, "base", VI_DESTRUCTIVE, "vi")
      .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
      .build();
    const p2Hand0 = game.p2.hand().length;
    await game.p1.move(["vi", "buddy"], "bfB");
    expect(game.chain().every((c) => c.cardId === "voli" && c.controller === P2 && c.triggered)).toBe(true);
    expect(game.chain().length).toBeGreaterThanOrEqual(1);
    await game.settle();
    expect(game.p2.hand().length).toBeGreaterThanOrEqual(p2Hand0 + 1);
    expect(game.p1.units("bfB").sort()).toEqual(["buddy", "vi"]);
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
  });

  // ── (c) destination = Volibear's own battlefield ────────────────────────────────────────────

  test("(c) Vi ganks bfA→bf1 (Volibear's OWN battlefield): 'other than mine' fails — no Volibear item, no draw; only the Pursuer's opt-in is asked; combat at bf1 proceeds (Vi 3 into Volibear 13 dies)", async () => {
    const game = await board().build();
    const p2Hand0 = game.p2.hand().length;
    await game.p1.gank("vi", "bf1");
    expect(chainView(game)).toEqual([["sp", P1, true]]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "sp" } });
    await game.p1.no();
    await game.settle();
    expect(game.p2.hand()).toHaveLength(p2Hand0);
    expect(game.zoneOf("vi")).toBe("trash");
    expect(game.locationOf("voli")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(isOpenMain(game.decision())).toBe(true);
  });

  // ── (d) a recall is not a move ──────────────────────────────────────────────────────────────

  test("(d) Vi alone attacks P2's bfB (stunned 8-Might Wall): the move draws P2 exactly 1; the failed attack RECALLS Vi to base and that recall draws nothing more (455, 456.1)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bfB", { controller: P2 })
      .unit(P2, "bf1", VOLIBEAR_IMPOSING, "voli")
      .unit(P2, "bfB", { might: 8, name: "Wall" }, "wall", { stunned: true })
      .unit(P1, "base", VI_DESTRUCTIVE, "vi")
      .build();
    const p2Hand0 = game.p2.hand().length;
    await game.p1.move("vi", "bfB");
    expect(chainView(game)).toEqual([["voli", P2, true]]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // the genuine move trigger resolves
    expect(game.p2.hand()).toHaveLength(p2Hand0 + 1);
    expect(game.chain()).toEqual([]);
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ battlefieldId: "bfB", isCombatShowdown: true });
    await game.settle(); // combat: 3 < 8, stunned Wall deals nothing → Vi survives and is recalled
    expect(game.locationOf("vi")).toBe("base");
    expect(game.zoneOf("wall")).toBe("battlefield-bfB");
    expect(game.gameState.battlefields.bfB?.controller).toBe(P2);
    expect(game.p2.hand()).toHaveLength(p2Hand0 + 1); // the recall added no draw
    expect(game.chain()).toEqual([]);
    expect(isOpenMain(game.decision())).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
