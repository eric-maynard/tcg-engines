/**
 * Ruling fe0dcf7d096ecf53 — Traveling Merchant (OGN-185 → ogn-185-298) · Chaos Unit · [2] · 2 Might
 *   "When I move, discard 1, then draw 1."
 *   × Flame Chompers (OGN-006 → ogn-006-298) · Fury Unit · [3] · 3 Might — "When you discard me, you may pay [fury] to play me."
 *
 * Q: I move Traveling Merchant into a battlefield and discard Flame Chompers to its trigger — can I play the Chompers
 *    to that battlefield as an attacker?
 * A: No. The Chompers trigger resolves while the move is still resolving (chain not empty): you do not control the
 *    destination yet, so it is not a legal place to play a unit — only your base or a battlefield you ALREADY control.
 *    Combat/attacker designations only begin after the chain empties, by which time Chompers is already elsewhere.
 * Rules: 340.1 / 401 (units are played to base or a battlefield you control), 190.4 / 348.2 (control only after the
 *        showdown), 464.2 (combat staged after the chain empties), 383 (nested triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TRAVELING_MERCHANT = "ogn-185-298";
const FLAME_CHOMPERS = "ogn-006-298";
const FILLER = "ogn-175-298";

/**
 * P1's turn. bf1 = the destination (`enemyHeld`: P2's Guard (1) there, else open). P1 already controls bf2 (Keeper).
 * Merchant ready in base; Flame Chompers is P1's only hand card; exactly 1 fury; known deck top.
 */
function board(enemyHeld: boolean) {
  const b = scenario()
    .battlefield("bf1", { controller: enemyHeld ? P2 : null })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf2", { might: 1, name: "Keeper" }, "keeper")
    .unit(P1, "base", TRAVELING_MERCHANT, "merchant")
    .hand(P1, FLAME_CHOMPERS, "chompers")
    .deck(P1, [FILLER, FILLER], ["d1", "d2"])
    .resources(P1, { energy: 0, power: { fury: 1 } });
  return enemyHeld ? b.unit(P2, "bf1", { might: 1, name: "Guard" }, "guard") : b;
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Merchant → bf1; its move trigger resolves (discard Chompers, draw); P1 accepts Chompers' [fury] → at the destination prompt. */
async function moveDiscardPay(enemyHeld: boolean): Promise<Game> {
  const game = await board(enemyHeld).build();
  await game.p1.move("merchant", "bf1");
  expect(game.zoneOf("merchant")).toBe("battlefield-bf1");
  // 2–3. "When I move" is on the chain → Closed state; no showdown/combat has begun, nobody is an attacker yet.
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  expect(showdown(game)?.active ?? false).toBe(false);
  expect(game.state("merchant").combatRole).toBeNull();
  await game.p1.passPriority();
  await game.p2.passPriority(); // 4. Merchant's trigger resolves: discard (only Chompers), draw 1
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("chompers");
  }
  expect(game.zoneOf("chompers")).toBe("trash");
  // 5. Chompers' discard trigger — "you may pay [fury]" asked at finalization.
  expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "chompers" } });
  await game.p1.yes();
  expect(game.p1.power("fury")).toBe(0);
  for (let i = 0; i < 4 && game.decision()?.kind === "action"; i++) {
    await game.acting().passPriority();
  }
  return game;
}

describe("Ruling fe0dcf7d096ecf53 — open battlefield: Chompers can't be played where the Merchant is still arriving", () => {
  test("6. the play-destination offer is base or the already-held bf2 — bf1 is absent and naming it is rejected; P1 does not control bf1 yet", async () => {
    const game = await moveDiscardPay(false);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(keys).toContain("base");
    expect(keys).toContain("battlefield-bf2");
    expect(keys).not.toContain("battlefield-bf1");
    const r = await game.p1.try((p) => p.pick("battlefield-bf1"));
    expect(r.ok).toBe(false);
  });

  test("7. Chompers goes to base; only when the chain is empty does the (non-combat) showdown run and P1 conquer bf1 — with the Merchant alone", async () => {
    const game = await moveDiscardPay(false);
    await game.p1.pick("base");
    expect(game.zoneOf("chompers")).toBe("base");
    expect(game.p1.hand()).toEqual(["d1"]);
    await game.settle();
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.units("bf1")).toEqual(["merchant"]);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});

describe("Ruling fe0dcf7d096ecf53 — enemy-held battlefield: Chompers can never join as an attacker", () => {
  test("same offer against P2's bf1 (Guard there): base / bf2 only — not the attacked bf1", async () => {
    const game = await moveDiscardPay(true);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(keys.sort()).toEqual(["base", "battlefield-bf2"]);
  });

  test("after Chompers lands in base the chain empties and ONLY THEN combat opens: Merchant is the lone attacker, Chompers has no role; Merchant (2) beats Guard (1) and conquers", async () => {
    const game = await moveDiscardPay(true);
    await game.p1.pick("base");
    expect(game.zoneOf("chompers")).toBe("base");
    // Chain now empty → the staged combat begins.
    for (let i = 0; i < 4 && !(showdown(game)?.active ?? false); i++) {
      await game.acting().pass();
    }
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("merchant").combatRole).toBe("attacker");
    expect(game.state("chompers").combatRole).toBeNull();
    expect(game.p1.units("bf1")).toEqual(["merchant"]);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("chompers")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
