/**
 * Ruling e353c771cd53db47 — Traveling Merchant (OGN-185 → ogn-185-298) · 2 Might "When I move, discard 1, then draw 1."
 *   × Reaver's Row (OGN-285 → ogn-285-298) "When you defend here, you may move a friendly unit here to base."
 *
 * Q: The Merchant moves into Reaver's Row where an opponent's unit stands. Do the move trigger and the defend trigger go
 *    on the chain together? What is the sequence?
 * A: Not simultaneous. The Merchant's move trigger forms its own chain and resolves first (discard 1, draw 1); only after
 *    that does the showdown begin, and the attack/defend triggers (Reaver's Row for the defender) form the initial chain.
 *    Reactions may be played before it resolves; afterwards the attacker keeps Focus (Actions only).
 * Rules: 401.1 / 323.9 (a staged showdown opens only in an Open state, i.e. once the move-trigger chain is gone),
 *        464.2 (combat opens → attacker/defender designation → initial chain), 464.2.d (attacker has Focus), 347.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TRAVELING_MERCHANT = "ogn-185-298";
const REAVERS_ROW = "ogn-285-298";

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1's turn. P2 holds a LIVE Reaver's Row with two 1-Might Guards. P1: ready Merchant in base, hand = one known Junk card. */
function board() {
  return scenario()
    .battlefield("row", { controller: P2, def: REAVERS_ROW, inert: false, owner: P2 })
    .unit(P2, "row", { might: 1, name: "Guard A" }, "ga")
    .unit(P2, "row", { might: 1, name: "Guard B" }, "gb")
    .unit(P1, "base", TRAVELING_MERCHANT, "merchant")
    .hand(P1, { cardType: "unit", energyCost: 9, might: 1, name: "Junk" }, "junk")
    .deck(P1, ["ogn-175-298"], ["p1top"]);
}

async function merchantIntoRow(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("merchant", "row");
  return game;
}

/** Both pass on the Merchant chain; P1 discards Junk and draws. */
async function resolveMerchantTrigger(game: Game): Promise<void> {
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("junk");
}

describe("Ruling e353c771cd53db47 — Merchant into Reaver's Row: move trigger first, THEN the showdown and its defend trigger", () => {
  test("step 1: right after the move only the Merchant's trigger is on the chain (the Merchant is already AT the Row); the battlefield is merely contested — no showdown, no attacker/defender yet, no Reaver's Row item", async () => {
    const game = await merchantIntoRow();
    expect(game.locationOf("merchant")).toBe("row"); // present at the battlefield when its trigger finalizes
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P1, triggered: true })]);
    expect(game.chain().some((c) => c.cardId === "row")).toBe(false);
    expect(game.gameState.battlefields.row).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(showdown(game)).toBeUndefined();
    expect(game.state("merchant").combatRole).toBeNull();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("step 2: the Merchant trigger resolves completely on its own chain — P1 discards Junk and draws 1 — before anything else happens", async () => {
    const game = await merchantIntoRow();
    await game.p1.passPriority();
    await game.p2.passPriority();
    // Resolution: discard prompt for P1 while still no showdown exists.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(showdown(game)).toBeUndefined();
    await game.p1.pick("junk");
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.p1.hand()).toEqual(["p1top"]);
    expect(game.chain().some((c) => c.cardId === "merchant")).toBe(false);
  });

  test("step 3: only now the showdown begins — Merchant attacker, Guards defenders — and Reaver's Row's 'when you defend here' is put up for P2 (opt-in surfaced to P2, then P2 chooses which Guard) as the initial chain", async () => {
    const game = await merchantIntoRow();
    await resolveMerchantTrigger(game);
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "row", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("merchant").combatRole).toBe("attacker");
    expect(game.state("ga").combatRole).toBe("defender");
    // "you may" — P2 decides at finalization.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "row" }, timing: "FIN" });
    await game.p2.yes();
    const pick = game.decision();
    expect(pick).toMatchObject({ kind: "pick", seat: P2 });
    expect(pick?.kind === "pick" ? pick.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["ga", "gb"]);
    await game.p2.pick("ga");
    // The initial chain = the Row's defend trigger; P2 (its controller) has priority to react first, then P1.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P2, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("step 4–5: the initial chain resolves (Guard A moves home) and the ATTACKER holds Focus in the still-open showdown", async () => {
    const game = await merchantIntoRow();
    await resolveMerchantTrigger(game);
    await game.p2.yes();
    await game.p2.pick("ga");
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("ga")).toBe("base");
    expect(game.locationOf("gb")).toBe("row");
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P1 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    // Focus lets P1 play Actions — a plain unit from hand is not among the options.
    expect(game.p1.legal().map((o) => o.verb)).not.toContain("play");
    await game.settle(); // combat: Merchant 2 vs Guard B 1 → P1 conquers
    expect(game.zoneOf("gb")).toBe("trash");
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
