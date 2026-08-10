/**
 * Ruling 0d84dfc0de86bd2d — Traveling Merchant (OGN-185 → ogn-185-298) "When I move, discard 1, then draw 1."
 *   × Zaun Warrens (OGN-298 → ogn-298-298) battlefield "When you conquer here, discard 1, then draw 1."
 *   × Flame Chompers (OGN-006 → ogn-006-298) "When you discard me, you may pay [fury] to play me."
 *
 * Q: Merchant moves to Zaun Warrens (staging a Showdown) and I discard Flame Chompers to the Merchant's
 *    trigger — what is the order of resolution?
 * A: Move → Showdown is staged and the Merchant's move trigger goes on the chain → both pass, it resolves
 *    completely (discard AND draw) → only now Chompers' discard trigger goes on the chain → it resolves (pay
 *    [fury], Chompers is played) → chain empty → the staged Showdown finally starts. A resolving effect is
 *    never interrupted. Nuance: if the Merchant is killed while its trigger is on the chain, the trigger
 *    still resolves in full.
 * Rules: 323.9 / 344 (a staged showdown opens only once the chain is empty), 336–337 (resolve fully, then
 *        pending triggers are added), 383 (triggered abilities), 359 (resolution not tied to the source surviving).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MERCHANT = "ogn-185-298";
const ZAUN_WARRENS = "ogn-298-298";
const FLAME_CHOMPERS = "ogn-006-298";

/** Inline P2 Reaction: deal 2 to a unit (kills the 2-Might Merchant). */
const ZAP = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Zap",
  timing: "reaction",
};

/**
 * P1's turn. Zaun Warrens (live text) is empty and uncontrolled. P1: ready Merchant in base, hand = Flame
 * Chompers + a vanilla Junk card, exactly [fury] floating for the Chompers payment. P2 holds Zap with [1].
 */
function board() {
  return scenario()
    .resources(P1, { power: { fury: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("zw", { controller: null, def: ZAUN_WARRENS, inert: false, owner: P2 })
    .unit(P1, "base", MERCHANT, "merchant")
    .hand(P1, FLAME_CHOMPERS, "chompers")
    .hand(P1, { cardType: "unit", might: 1, name: "Junk" }, "junk")
    .hand(P2, ZAP, "zap");
}

async function merchantMoved(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("merchant", "zw");
  return game;
}

describe("Ruling 0d84dfc0de86bd2d — Merchant → Zaun Warrens discarding Flame Chompers: strict ordering", () => {
  test("step 1: the move STAGES a showdown at Zaun Warrens (contested, not yet open) and puts the Merchant's move trigger on the chain; P1 has priority in a CHAIN context, not showdown Focus", async () => {
    const game = await merchantMoved();
    expect(game.gameState.battlefields.zw).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    // Nothing discarded or drawn yet.
    expect(game.p1.hand().sort()).toEqual(["chompers", "junk"]);
  });

  test("step 2–3: both pass → the Merchant trigger resolves IN FULL: P1 picks Chompers to discard and draws 1; only THEN does a Chompers discard-trigger item appear on the chain — and the showdown has still not opened", async () => {
    const game = await merchantMoved();
    const deck0 = game.p1.deck().length;
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["chompers", "junk"]);
    // No Chompers item can exist before the discard has actually happened.
    expect(game.chain().some((c) => c.cardId === "chompers")).toBe(false);
    await game.p1.pick("chompers");
    // Discard AND draw both done (the resolving effect was not interrupted) …
    expect(game.p1.hand()).not.toContain("chompers");
    expect(game.p1.hand()).toContain("junk");
    expect(game.p1.hand()).toHaveLength(2); // junk + the drawn card
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
    // … and now Chompers' "when you discard me" trigger is the chain; the showdown is still only staged.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "chompers", controller: P1, triggered: true })]);
    expect(game.gameState.battlefields.zw).toMatchObject({ contested: true, controller: null });
    const cur = game.decision();
    expect(cur?.kind === "action" ? cur.context : cur?.kind).not.toBe("showdown");
  });

  test("step 4–6: P1 accepts the [fury] payment (a yes/no for P1), the Chompers item resolves and Chompers is played to base; only once the chain is EMPTY does the staged showdown open (Focus to P1), and passing it through conquers Zaun Warrens", async () => {
    const game = await merchantMoved();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("chompers");
    // The optional payment is P1's decision.
    let sawYesNo = false;
    for (let i = 0; i < 6 && game.zoneOf("chompers") !== "base"; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no") {
        expect(d.seat).toBe(P1);
        sawYesNo = true;
        await game.p1.yes();
      } else if (d?.kind === "action" && d.context === "chain" && d.passKey) {
        // Showdown must not have opened while a Chompers item is unresolved.
        expect(game.chain().some((c) => c.cardId === "chompers")).toBe(true);
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(sawYesNo).toBe(true);
    expect(game.zoneOf("chompers")).toBe("base");
    expect(game.p1.power("fury")).toBe(0);
    // Chain empty → the staged showdown starts now: P1 (turn player / stager) has Focus.
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.zw).toMatchObject({ contested: true, controller: null });
    // Both pass Focus → P1 conquers the Warrens (its own conquer trigger then asks for another discard).
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.gameState.battlefields.zw?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "zw", controller: P1, triggered: true })]);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("junk");
    }
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance — P2 kills the Merchant (Zap, Reaction) while its move trigger is on the chain: the Merchant dies first, yet the trigger still resolves fully (P1 still discards and draws)", async () => {
    const game = await merchantMoved();
    const deck0 = game.p1.deck().length;
    await game.p1.passPriority();
    await game.p2.cast("zap", { targets: "merchant" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["merchant", "zap"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Zap resolves
    expect(game.zoneOf("merchant")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["merchant"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // the orphaned trigger resolves anyway
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("junk");
    expect(game.p1.trash()).toContain("junk");
    expect(game.p1.hand()).toContain("chompers");
    expect(game.p1.hand()).toHaveLength(2); // chompers + drawn card
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
  });
});
