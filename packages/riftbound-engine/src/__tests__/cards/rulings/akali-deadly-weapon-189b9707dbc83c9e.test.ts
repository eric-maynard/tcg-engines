/**
 * Ruling 189b9707dbc83c9e — Akali, Deadly Weapon (VEN-021 → ven-021-166) · Champion Unit · Fury · 3 · 3 Might
 *     "When I move, you may deal 1 to a unit at a battlefield I moved to or from. If I'm [Empowered], deal 2 instead."
 *   × Teemo, Strategist (OGN-121 → ogn-121-298) · 2 Might "When I defend, choose an enemy unit here and reveal the top 5
 *     cards of your Main Deck. Deal 1 to that unit for each card with [Hidden] revealed this way, then recycle them."
 *   × Rogue Assassin (VEN-139 → ven-139-166) · Legend "[Action] — [Exhaust]: If it's your turn, move a friendly unit in
 *     a showdown to base and if I'm [Empowered], ready it."
 *
 * Q: Akali moves into Teemo's battlefield. Does Teemo's "When I defend" go on the chain first, or can the Akali player
 *    fire the [Action] legend ability at once and pull Akali back?
 * A: Akali's "When I move" resolves first (if it kills Teemo there is no combat / no defend trigger). Then the
 *    showdown is staged and Teemo's defend trigger is put on the chain IMMEDIATELY — no window in between. While it
 *    is pending only Reactions are legal, so the [Action] legend ability can't be used. After it resolves and the
 *    chain is empty (showdown open state) the legend ability may move Akali home; the showdown ends without combat.
 * Rules: 383.3 (triggers go straight on the chain), 145.2 / 381 ([Action] timing), 464.2.c.3 (designations).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AKALI = "ven-021-166";
const TEEMO = "ogn-121-298";
const ROGUE_ASSASSIN = "ven-139-166";
const SKULKER = "ogn-175-298"; // vanilla, no [Hidden]

/**
 * P1's turn (legend Rogue Assassin, not empowered). Akali (3) ready in base. P2 holds bf1 with Teemo (2).
 * P2's deck top 5 = one [Hidden] card (a Teemo) + four vanilla units → Teemo's trigger deals exactly 1.
 */
function board(akaliMeta: { empowered?: boolean } = {}) {
  return scenario()
    .legend(P1, ROGUE_ASSASSIN, "rogue")
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", AKALI, "akali", akaliMeta)
    .unit(P2, "bf1", TEEMO, "teemo")
    .deck(P2, [TEEMO, SKULKER, SKULKER, SKULKER, SKULKER]);
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);
const legendOffered = (game: Game) => game.p1.legal().some((o) => o.moveId === "activateAbility" && o.card === "rogue");

/** Pass priority around until the chain is empty (stops before any non-action prompt). */
async function drainChain(game: Game): Promise<void> {
  while (game.chain().length > 0 && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
}

describe("Ruling 189b9707dbc83c9e — Akali into Teemo: move trigger → defend trigger (no gap) → only then the [Action] legend", () => {
  test("step 1: Akali's 'When I move' is the first and only chain item; nobody has a combat designation yet and the legend ability is not offered", async () => {
    const game = await board().build();
    await game.p1.move("akali", "bf1");
    expect(chainIds(game)).toEqual(["akali"]);
    expect(game.chain()[0]?.triggered).toBe(true);
    expect(game.state("teemo").combatRole).toBeNull();
    // The optional "you may deal 1" is asked of P1 first.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("teemo");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(legendOffered(game)).toBe(false); // Closed state: [Action] not playable
  });

  test("step 2: once Akali's trigger resolves (Teemo takes 1, survives), Teemo becomes Defender and his trigger is on the chain IMMEDIATELY — P1 never gets an empty-chain window to use Rogue Assassin first", async () => {
    const game = await board().build();
    await game.p1.move("akali", "bf1");
    await game.p1.yes();
    await game.p1.pick("teemo");
    // Resolve exactly the Akali item: both pass once.
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.state("teemo").damage).toBe(1);
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    // No neutral window: the very next state already has Teemo's defend trigger pending.
    expect(chainIds(game)).toEqual(["teemo"]);
    expect(game.state("akali").combatRole).toBe("attacker");
    expect(game.state("teemo").combatRole).toBe("defender");
    // Whoever holds priority while it is pending, P1's menu has no legend activation (only Reactions are legal).
    if (game.actingSeat() === P2) {
      expect(legendOffered(game)).toBe(false);
      await game.p2.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(chainIds(game)).toEqual(["teemo"]);
    expect(legendOffered(game)).toBe(false);
    expect(game.p1.legal().map((o) => o.verb).sort()).toEqual(["concede", "passPriority"]);
  });

  test("step 3: after Teemo's trigger resolves (1 [Hidden] card revealed → 1 to Akali) the chain is empty, P1 has Focus and NOW Rogue Assassin is legal; it moves Akali to base and the showdown ends with no combat damage", async () => {
    const game = await board().build();
    await game.p1.move("akali", "bf1");
    await game.p1.no(); // skip Akali's optional ping this time
    expect(chainIds(game)).toEqual(["teemo"]); // straight to the defend trigger
    await drainChain(game);
    expect(game.state("akali").damage).toBe(1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
    expect(legendOffered(game)).toBe(true);
    await game.p1.activate("rogue");
    expect(chainIds(game)).toEqual(["rogue"]);
    await drainChain(game);
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("akali");
    }
    // Akali moved (from bf1) → her move trigger asks again; decline.
    if (game.decision()?.kind === "yes-no") {
      expect(game.decision()?.seat).toBe(P1);
      await game.p1.no();
    }
    await game.settle();
    expect(game.locationOf("akali")).toBe("base");
    expect(game.state("rogue").isExhausted).toBe(true);
    expect(game.state("akali").isReady).toBe(false); // legend not empowered → no ready
    // rule 466.1.a.1: no combat damage was ever dealt, but the showdown still
    // reaches its Resolution Step, whose Combat Cleanup inserts "3c. Heal all
    // Units" — unqualified by location, so Teemo's 1 comes off Akali in base too.
    expect(game.state("akali").damage).toBe(0);
    expect(game.state("teemo").damage).toBe(0);
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.state("akali").combatRole).toBeNull();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("'if that kills Teemo': an [Empowered] Akali deals 2 with her move trigger, Teemo (2) dies before any showdown is staged — no defend trigger ever appears, no combat, and Akali conquers bf1", async () => {
    const game = await board({ empowered: true }).build();
    expect(game.state("akali").isEmpowered).toBe(true);
    expect(game.state("akali").might).toBe(4); // [Empowered] → +1
    await game.p1.move("akali", "bf1");
    expect(chainIds(game)).toEqual(["akali"]);
    await game.p1.yes();
    await game.p1.pick("teemo");
    await drainChain(game);
    expect(game.zoneOf("teemo")).toBe("trash");
    expect(chainIds(game)).not.toContain("teemo");
    expect(game.state("akali").combatRole).toBeNull(); // never designated attacker: no combat
    await game.settle();
    expect(game.state("akali").damage).toBe(0);
    expect(game.locationOf("akali")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
