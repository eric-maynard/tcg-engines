/**
 * Ruling cd86d8879a749afa — Reaver's Row (ogn-285-298) × Falling Star (ogn-029-298)
 *   Reaver's Row — Battlefield: "When you defend here, you may move a friendly unit here to base."
 *   Falling Star — Spell · [2][fury][fury]: "Deal 3 to a unit. Deal 3 to a unit."
 *   (Flash ogs-011-024 — [Reaction] "Move up to 2 friendly units to base." — is the defender's retreat-in-response.)
 *
 * Q: I attack a 4-Might defender at Reaver's Row with a 4-Might unit and hold Falling Star. When does the Row's effect
 *    happen / when does the defender decide, and is Falling Star wasted if they can just fall back to base?
 * A: Reaver's Row is a Defend trigger placed on the showdown's Initial Chain, its target named as it goes on the chain;
 *    while that chain is up only Reactions are legal, so Falling Star cannot pre-empt the defender's choice. And no —
 *    Falling Star targets "a unit", not "a unit at a battlefield": if the opponent moves the target to base in response,
 *    it still resolves and damages that unit in base.
 *    Notes: the ruling calls Falling Star an Action spell, but the printed card has no [Action] (engine: Standard timing,
 *    rule 155) — so the "cast it once the state is Open" step is exercised in the Open main phase. Its aside that the
 *    "may" waits for resolution is superseded by CR 383.3.a (leading "you may" is decided at finalization).
 * Rules: 383.4 (defend trigger), 336/343 (Closed state: Reactions only), 355.9 (target legality on resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const FALLING_STAR = "ogn-029-298";
const FLASH = "ogs-011-024";

/**
 * P1's turn with exactly [2] + 2 fury. P2 holds Reaver's Row (live text) with a 4-Might Defender and a 1-Might Squire;
 * P1's 4-Might Attacker waits in base. P2 holds Flash + [2].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .resources(P2, { energy: 2 })
    .battlefield("row", { controller: P2, def: REAVERS_ROW, inert: false })
    .unit(P2, "row", { might: 4, name: "Defender" }, "def")
    .unit(P2, "row", { might: 1, name: "Squire" }, "squire")
    .unit(P1, "base", { might: 4, name: "Attacker" }, "atk")
    .hand(P1, FALLING_STAR, "star")
    .hand(P2, FLASH, "flash");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Attack the Row; P2 keeps the trigger (yes) and names the Defender; stop in the Closed initial-chain window. */
async function attackRowTriggerPending(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("atk", "row");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "row", defendingPlayer: P2, isCombatShowdown: true });
  // The DEFENDER (P2) is asked: keep the "you may" trigger (383.3.a, at finalization), then which friendly unit here.
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "row" }, timing: "FIN" });
  await game.p2.yes();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "target", source: { cardId: "row" }, timing: "FIN" });
  expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["def", "squire"]);
  await game.p2.pick("def");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P2, targets: ["def"], triggered: true })]);
  return game;
}

describe("Ruling cd86d8879a749afa — Reaver's Row is an Initial-Chain defend trigger; Falling Star can't pre-empt it but isn't wasted by a retreat", () => {
  test("1. moving in starts the showdown and puts Reaver's Row's trigger (target: Defender, chosen on placement) on the Initial Chain — state Closed, nothing has moved", async () => {
    const game = await attackRowTriggerPending();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.locationOf("def")).toBe("row");
    expect(game.state("def").combatRole).toBe("defender");
  });

  test("2. while the Initial Chain is up P1 cannot play Falling Star (not a Reaction) — rejected whenever P1 holds priority; only passing/Reactions are legal", async () => {
    const game = await attackRowTriggerPending();
    let checked = 0;
    for (let i = 0; i < 3 && game.chain().length > 0; i++) {
      if (game.actingSeat() === P1) {
        expect(game.p1.can("cast", "star")).toBe(false);
        const r = await game.p1.try((p) => p.cast("star", { targets: ["def", "def"] }));
        expect(r.ok).toBe(false);
        checked++;
      }
      await game.acting().passPriority();
    }
    expect(checked).toBeGreaterThan(0);
    expect(game.zoneOf("star")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 2 } });
  });

  test("3. the Initial Chain resolves LIFO and the defender's choice takes effect there: the Defender is moved to P2's base before P1 ever gets an Open window; the Squire stays to defend", async () => {
    const game = await attackRowTriggerPending();
    while (game.chain().length > 0) {
      await game.acting().passPriority();
    }
    expect(game.locationOf("def")).toBe("base");
    expect(game.locationOf("squire")).toBe("row");
    expect(showdown(game)?.active).toBe(true);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // Focus only now
  });

  test("3'. declining the 'you may' at finalization removes the trigger: nobody moves and the chain is already empty when P1 gets Focus", async () => {
    const game = await board().build();
    await game.p1.move("atk", "row");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "row" } });
    await game.p2.no();
    while (game.chain().length > 0) {
      await game.acting().passPriority();
    }
    expect(game.locationOf("def")).toBe("row");
    expect(game.locationOf("squire")).toBe("row");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("5. not wasted: Falling Star (both 3s at the Defender) cast in the Open state; P2 responds by Flashing the Defender to base — Falling Star still resolves on 'a unit' in base: 6 damage kills it", async () => {
    const game = await board().build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // Open state
    expect(game.p1.can("cast", "star")).toBe(true);
    await game.p1.cast("star", { targets: ["def", "def"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "star", controller: P1 })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "flash")).toBe(true);
    await game.p2.cast("flash", { targets: "def" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["star", "flash"]);
    // Flash resolves first: the Defender is now in base with Falling Star still pending on it.
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "flash"); i++) {
      await game.acting().passPriority();
    }
    expect(game.locationOf("def")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["star"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.zoneOf("def")).toBe("trash"); // 3 + 3 ≥ 4: still a legal target in base, so it died
    expect(game.locationOf("squire")).toBe("row");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
