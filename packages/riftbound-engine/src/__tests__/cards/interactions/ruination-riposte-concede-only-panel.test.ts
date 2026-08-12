/**
 * Interaction: The Ruination (unl-180-219) — [9][order][order][order] Action spell, "Kill all units."
 *   × Riposte (sfd-206-221) — [Reaction] [2][rainbow][rainbow], "Choose a friendly unit and a spell.
 *     Counter that spell and give that unit +[Might] equal to that spell's Energy cost this turn."
 *
 * The question is about the ACTION PANEL, not about the cards resolving: the opponent casts The
 * Ruination, you hold Riposte, every rune is exhausted and the pool is empty.
 *   (a) does the panel stay non-blank while you hold Priority,
 *   (b) is Pass always the way out of it,
 *   (c) is the unpayable Riposte enumerated with its pay line, or silently omitted,
 *   and afterwards, on the opponent's turn with nothing you can do, does the panel distinguish
 *   "waiting for the other player" from "concede is your only legal move"?
 *
 * Rules covered (riftbound-rules ids):
 *   339.1 / 339.2   passing in sequence with no additions moves the chain to Resolve; otherwise
 *                   Priority rotates — so Pass is a control you always hold with Priority
 *   340.1           the newest Finalized item resolves in its entirety (Kill all units)
 *   159.2.b.2       a [Reaction] card may also be played during every Closed State — Riposte's
 *                   TIMING is legal here; only its COST is not
 *   357.1 / 357.1.a the combined Energy + Power cost is paid in full; Reaction [Add] abilities may
 *                   be cracked during that step
 *   163.2           Power pays Domain-associated Power costs (a [rainbow] pip takes any Domain)
 *   650             a player may concede at ANY time
 *   651.1           with one player left, that player wins
 */
import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUINATION = "unl-180-219";
const RIPOSTE = "sfd-206-221";

type Pool = { energy?: number; power?: Record<string, number> };

/**
 * P2's turn. P2 has the full [9][order][order][order] for The Ruination; P1 holds Riposte with
 * whatever pool/runes the facet needs, and both sides have a unit so "kill all units" is visible.
 */
function board(p1Pool: Pool = {}, p1Runes: readonly (readonly [string, boolean])[] = []) {
  const s = scenario()
    .turn(4)
    .active(P2)
    .resources(P2, { energy: 9, power: { order: 3 } })
    .resources(P1, p1Pool)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "My Guard" }, "mine")
    .unit(P2, "bf1", { might: 4, name: "Their Brute" }, "theirs")
    .hand(P2, RUINATION, "ruination")
    .hand(P1, RIPOSTE, "riposte");
  p1Runes.forEach(([domain, exhausted], i) => s.rune(P1, domain, { alias: `r${i}`, exhausted }));
  return s;
}

/** Cast The Ruination and pass P2's own Priority so P1 is the seat holding the panel. */
async function ruinationOnTheChain(p1Pool: Pool = {}, p1Runes: readonly (readonly [string, boolean])[] = [["body", true], ["order", true]]) {
  const game = await board(p1Pool, p1Runes).build();
  await game.p2.cast("ruination");
  await game.p2.passPriority();
  return game;
}

const panel = (d: unknown) => d as ActionDecision;
const keysOf = (d: unknown) => panel(d).options.map((o) => o.key);
const verbsOf = (d: unknown) => panel(d).options.map((o) => o.verb);

describe("The Ruination × Riposte — the action panel while a lethal spell is on the chain", () => {
  test("with the spell pending, the seat holding Priority gets a non-blank panel and Pass is always in it (339.1 / 339.2)", async () => {
    const game = await ruinationOnTheChain();

    expect(game.actingSeat()).toBe(P1);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "action", context: "chain", seat: P1 });
    // (a) non-blank: there is at least one option, and the prompt names what is being responded to.
    expect(panel(d).options.length).toBeGreaterThan(0);
    expect(panel(d).prompt).toContain("The Ruination");
    // (b) Pass is the way out — both as a keyed option and as the decision's own passKey.
    expect(verbsOf(d)).toContain("passPriority");
    expect(panel(d).passKey).toBe("passChainPriority:-");
    // 650 — leaving is offered from the same panel.
    expect(verbsOf(d)).toContain("concede");
    expect(game.violations()).toEqual([]);
  });

  test("Riposte's TIMING is fine here — a [Reaction] is playable in a Closed State (159.2.b.2); only the cost stops it, and a paid pool casts it", async () => {
    // Same closed state, same chain, but the pips are pooled: the play is accepted, so nothing
    // about the chain window is refusing Riposte.
    const game = await ruinationOnTheChain({ energy: 2, power: { order: 1, rainbow: 1 } }, []);
    // 163.2 — a [rainbow] pip takes Power of any Domain, so order+rainbow covers [rainbow][rainbow].
    expect(game.p1.can("cast", "riposte")).toBe(true);
    await game.p1.cast("riposte", { targets: "mine" });
    await game.settle();
    expect(game.zoneOf("ruination")).toBe("trash"); // countered
    expect(game.zoneOf("mine")).toBe("battlefield-bf1"); // never killed
    expect(game.state("mine").might).toBe(3 + 9); // +Might = the countered spell's Energy cost
  });

  test("with every rune exhausted and an empty pool, Riposte is refused and is NOT enumerated — nothing could fund the [2] (404.2)", async () => {
    const game = await ruinationOnTheChain({}, [["body", true], ["order", true]]);

    // DESIGN: paying is manual (DESIGN.md §Paying costs, a deliberate deviation from 357.1.a /
    // 429.3) and rule 404.2 keeps a cost NOTHING can fund off the menu. Energy comes only from
    // TAPPING a ready rune (164.2.a) and both runes are exhausted, so the [2] is unreachable and
    // the play is correctly absent rather than greyed.
    expect(game.p1.can("cast", "riposte")).toBe(false);
    expect(panel(game.decision()).reachablePlays ?? []).toEqual([]);
    await expect(game.p1.cast("riposte", { targets: "mine" })).rejects.toThrow();

    // …and the panel is still not blank: the exhausted runes are recyclable (594), so the seat is
    // shown what it CAN do rather than an empty box.
    expect(verbsOf(game.decision())).toContain("recycleRune");
    expect(keysOf(game.decision())).toEqual(
      expect.arrayContaining(["concede:-", "passChainPriority:-", "recycleRune:r0", "recycleRune:r1"]),
    );
  });

  test("a Riposte ONE recycle away is listed with its pay line while you hold chain Priority (357.1.a / 429.3)", async () => {
    // Pool: [2] Energy + one [rainbow]; two READY order runes on board. One recycle turns an order
    // rune into the missing pip, so 357.1.a makes this play reachable during Pay Costs — exactly
    // the case the pay line exists for, and exactly where a [Reaction] lives.
    const game = await ruinationOnTheChain({ energy: 2, power: { rainbow: 1 } }, [["order", false], ["order", false]]);
    expect(game.p1.can("cast", "riposte")).toBe(false); // not paid yet — correct

    // Listed, dimmed, with "recycle a rune for [order] first": `reachablePlays` is derived for
    // every panel the seat holds, not only main-phase ones.
    const reach = panel(game.decision()).reachablePlays ?? [];
    expect(reach.map((r) => r.card)).toContain(game.card("riposte"));
    expect(reach.find((r) => r.card === game.card("riposte"))?.needsAdd.reason).toContain("recycle");

    // The recycle really is the whole fix, so the omission is a reporting gap, not a legality one.
    await game.p1.recycleRune("r0", "order");
    expect(game.p1.can("cast", "riposte")).toBe(true);
  });

  test("all players pass in sequence: The Ruination resolves and kills every unit (339.1 / 340.1)", async () => {
    const game = await ruinationOnTheChain();
    await game.p1.passPriority();

    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.zoneOf("ruination")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("WAITING is not a dead end: P1 holds no Decision at all, yet its move set is exactly [concede] — the panel must key off decision ownership, not off the move set", async () => {
    const game = await ruinationOnTheChain();
    await game.p1.passPriority();

    // It is P2's open Main Phase with nothing owed to P1.
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ kind: "action", seat: P2 });

    // The predicate "the seat's legal move set is exactly [concede]" is TRUE here — 650 never
    // stops applying — so any panel copy keyed on it would call a plain wait a dead end.
    expect(game.p1.legal()).toEqual([]);
    expect(game.p1.can("concede")).toBe(true);
    // The fact that actually separates the two states: P1 owns no Decision.
    expect(game.p1.decision()).toBeNull();
  });

  test("while you DO hold the panel there is always a non-concede way out, so a genuine [concede]-only ActionDecision never appears on a chain or in your Main Phase", async () => {
    const chainPanel = await ruinationOnTheChain();
    expect(verbsOf(chainPanel.decision())).toContain("concede");
    expect(verbsOf(chainPanel.decision()).filter((v) => v !== "concede")).not.toEqual([]);
    expect(panel(chainPanel.decision()).passKey).toBeDefined();

    // Own turn, empty hand, empty pool: still endTurn beside concede.
    const ownTurn = await scenario().turn(4).active(P1).build();
    const d = ownTurn.decision();
    expect(d).toMatchObject({ kind: "action", seat: P1, context: "main" });
    expect(verbsOf(d)).toContain("concede");
    expect(panel(d).endTurnKey).toBeDefined();
    expect(verbsOf(d).filter((v) => v !== "concede")).not.toEqual([]);
  });

  test("conceding really ends it: the conceder is removed, the one remaining player wins and no prompt survives (650 / 651.1)", async () => {
    const game = await ruinationOnTheChain();
    await game.p1.passPriority(); // The Ruination resolves; P1 has nothing left

    expect(game.p1.can("concede")).toBe(true);
    await game.p1.concede();

    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.decision() ?? null).toBeNull();
    expect(game.gameState.pendingChoice).toBeUndefined();
    expect(game.engine.getGameEndResult()).toMatchObject({ reason: "concede", winner: P2 });
    expect(game.violations()).toEqual([]);
  });
});
