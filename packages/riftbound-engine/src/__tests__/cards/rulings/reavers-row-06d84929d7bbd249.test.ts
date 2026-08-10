/**
 * Ruling 06d84929d7bbd249 — Reaver's Row (OGN-285 → ogn-285-298, Battlefield)
 *   "When you defend here, you may move a friendly unit here to base."
 *   × Gust (ogn-169-298, Reaction, 1) "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   (+ Rebuke ogn-172-298, Action "Return a unit at a battlefield to its owner's hand." as the opponent's ACTION-speed spell)
 *
 * Q: Does Reaver's Row's effect start a chain, and can the opponent respond with actions/reactions?
 * A: It is a defend trigger placed on the INITIAL chain of the showdown; its target is declared when it goes on
 *    the chain. The opponent may respond with Reactions but not Actions (actions need an empty chain). If the
 *    targeted unit is removed (e.g. Gusted) before the trigger resolves, no new target may be picked. Only after
 *    the initial chain fully resolves does the attacker get Focus and may play Action spells.
 * Rules: 383.4.f (defend triggers), 355.7/355.15 (targets declared at finalization), 343/336 (closed state:
 *        reactions only), 359.3.e.5 (illegal target → instruction ignored), 347.1 (Focus after the chain empties).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const GUST = "ogn-169-298";
const REBUKE = "ogn-172-298";

/**
 * P2's turn. P1 holds Reaver's Row (live text) with Big (3) and Small (2). P2's Raider (5) attacks from base.
 * P2 holds Gust (Reaction, 1) and Rebuke (Action, 2 + [chaos][chaos]) with exactly 3 energy + 2 chaos.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { chaos: 2 } })
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .unit(P1, "row", { might: 3, name: "Big" }, "big")
    .unit(P1, "row", { might: 2, name: "Small" }, "small")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P2, GUST, "gust")
    .hand(P2, REBUKE, "rebuke");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Raider attacks the Row; P1 accepts the trigger and targets Small; P1 passes priority → P2 holds priority. */
async function rowTriggerPendingP2Priority(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "row");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row", pendingChoiceType: "opt-in" }, timing: "FIN" });
  await game.p1.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "row" }, semantics: "target", timing: "FIN" });
  await game.p1.pick("small");
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P2 });
  return game;
}

describe("Ruling 06d84929d7bbd249 — Reaver's Row is a defend trigger on the showdown's initial chain", () => {
  test("the Standard Move opens the combat and Reaver's Row triggers for the DEFENDER (P1): opt-in then target are both asked at finalization, and the item sits on the chain with its declared target", async () => {
    const game = await board().build();
    await game.p2.move("raider", "row");
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "row", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["big", "small"]); // "a friendly unit here"
    await game.p1.pick("small");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P1, targets: ["small"], triggered: true, type: "ability" })]);
    // It is a chain: a priority window opens (closed state), nothing has moved yet.
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain" });
    expect(game.locationOf("small")).toBe("row");
  });

  test("the opponent CAN respond with a Reaction (Gust on Small) but CANNOT play an Action (Rebuke) while the trigger is on the chain", async () => {
    const game = await rowTriggerPendingP2Priority();
    expect(game.p2.can("cast", "gust")).toBe(true);
    expect(game.p2.can("cast", "rebuke")).toBe(false);
    const r = await game.p2.try((p) => p.cast("rebuke", { targets: "big" }));
    expect(r.ok).toBe(false);
    await game.p2.cast("gust", { targets: "small" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["row", "gust"]);
    expect(game.p2.resources()).toEqual({ energy: 2, power: { chaos: 2 } });
  });

  test("unopposed, the trigger resolves and moves the declared target (Small) to P1's base; Big stays and defends", async () => {
    const game = await rowTriggerPendingP2Priority();
    await game.p2.passPriority(); // both passed → resolves
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("small")).toBe("base");
    expect(game.locationOf("big")).toBe("row");
    expect(showdown(game)?.active).toBe(true);
  });

  test("if Gust bounces the targeted Small first (LIFO), Reaver's Row then resolves doing NOTHING — no re-pick is offered and Big is not moved (355.15, 359.3.e.5)", async () => {
    const game = await rowTriggerPendingP2Priority();
    await game.p2.cast("gust", { targets: "small" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("small")).toBe("hand");
    expect(game.p1.hand()).toContain("small");
    expect(game.chain().map((c) => c.cardId)).toEqual(["row"]);
    // Now the Row trigger resolves: no new target prompt for P1, Big untouched.
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      const d = game.decision();
      expect(d?.kind === "pick" && d.seat === P1).toBe(false); // never asked to re-target
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.decision()?.kind).toBe("action"); // no lingering pick
    expect(game.locationOf("big")).toBe("row");
    expect(game.p1.units("base")).toEqual([]);
  });

  test("only after the initial chain has fully resolved does the ATTACKER (P2) get Focus — and then an Action spell (Rebuke) becomes playable", async () => {
    const game = await rowTriggerPendingP2Priority();
    await game.p2.passPriority(); // trigger resolves (Small → base)
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2 });
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P2 });
    expect(game.p2.can("cast", "rebuke")).toBe(true);
    expect(game.p2.can("cast", "gust")).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
