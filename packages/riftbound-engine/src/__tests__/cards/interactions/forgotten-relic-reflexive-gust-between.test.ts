/**
 * Interaction: Forgotten Relic (ven-108-166) × Gust (ogn-169-298)
 *
 *   Forgotten Relic — Gear · Chaos · 5
 *     "When you play this or at the start of your Beginning Phase, [Burn 1]. When you burn a unit this way,
 *      do this: Give a friendly unit +[Might] equal to the burned card's Might this turn."
 *   Gust — Spell (Reaction) · Chaos · 1
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Rules: 387.1 / 387.2 / 387.3 ("do this:" = Reflexive Trigger, preceded by its condition), 388.1 (it creates
 * a NEW Pending chain item), 401.2 / 354.3 (while the parent effect is still resolving nothing else proceeds),
 * 402.2 (targets are chosen when the new item is finalized), 337.1.b, 359.3.e.2 (a target that moved to a
 * non-board zone is illegal on resolution — the effect does nothing, it does not retarget), 317.2 ("this
 * turn" expires in the Expiration Step).
 *
 * Question: P1's turn. Y (2) at bf1 (P1's), Z (5) in P1's base; P2 holds Gust with 1 energy. P1 plays
 * Forgotten Relic. Case A — top of P1's deck is a 4-Might unit: (a) is the +Might clause inline or a
 * SEPARATE chain item after the burn? (b) when is P1 asked for the recipient? (c) P1 picks Y — can P2 Gust Y
 * before the bonus lands, and does the bonus then jump to Z or fizzle? Case B — top card is a spell: any
 * reflexive item / prompt at all? Case C — no response: Y's Might this turn?
 *
 * Expected: the gear resolves to base at once; its play trigger is a chain item (P2's first window, nothing
 * burned yet). On resolution Burn 1 → the 4-Might unit hits P1's trash; the "do this" is a reflexive trigger:
 * a NEW item is added and only when it is finalized is P1 asked y|z (burned Might already fixed at 4). P1 picks
 * Y, gets priority, passes; P2 may Gust Y (second window); Gust resolves first, Y → hand; the reflexive item
 * then finds its only target illegal → nobody gains Might (Z stays 5). Case C: Y = 6 this turn, 2 next turn.
 * Case B: no reflexive item, no prompt, chain empty. Always: burned card in P1's trash, Relic stays in base.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FORGOTTEN_RELIC = "ven-108-166";
const GUST = "ogn-169-298";
const VANGUARD_SERGEANT = "ogn-219-298"; // vanilla 4-Might unit — the Case A burn
const VENGEANCE = "ogn-229-298"; // a spell — the Case B burn
const SKULKER = "ogn-175-298";

/** P1's turn. bf1 (P1's): Y (2). P1 base: Z (5). P1: 5 energy + Relic; P2: 1 energy + Gust. P1's deck top = `top`. */
function board(top: string) {
  return scenario()
    .resources(P1, { energy: 5 })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Unit Y" }, "y")
    .unit(P1, "base", { might: 5, name: "Unit Z" }, "z")
    .unit(P2, "base", { might: 1, name: "P2 Bystander" }, "bystander")
    .deck(P1, [top, SKULKER, SKULKER], ["burnee", "d2", "d3"])
    .deck(P2, [SKULKER, SKULKER], ["e1", "e2"])
    .hand(P1, FORGOTTEN_RELIC, "relic")
    .hand(P2, GUST, "gust");
}

/** P1 plays the Relic; both players pass on the play trigger so it resolves (Burn 1 [+ reflexive]). */
async function playAndResolveTrigger(top: string): Promise<Game> {
  const game = await board(top).build();
  await game.p1.play("relic");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "relic", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

function pickOptions(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : [];
}

describe("Forgotten Relic — the 'do this:' bonus is a reflexive chain item P2 can Gust in between", () => {
  // ── the play and the first window ──────────────────────────────────────────────────────────

  test("playing the Relic: the gear is in P1's base at once, its 'When you play this' trigger is a chain item, nothing is burned yet, and P2 gets a reaction window (could Gust now)", async () => {
    const game = await board(VANGUARD_SERGEANT).build();
    await game.p1.play("relic");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("relic")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "relic", controller: P1, triggered: true })]);
    expect(game.zoneOf("burnee")).toBe("mainDeck");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    expect(game.zoneOf("burnee")).toBe("mainDeck"); // still not burned
  });

  // ── Case A: a 4-Might unit is burned ───────────────────────────────────────────────────────

  test("Case A (b): P1 is asked for the recipient only AFTER the burn — the 4-Might unit is already in P1's trash — and only friendly units (Y, Z) are offered", async () => {
    const game = await playAndResolveTrigger(VANGUARD_SERGEANT);
    expect(game.zoneOf("burnee")).toBe("trash");
    expect(game.p1.trash()).toContain("burnee");
    expect(game.state("burnee").baseMight).toBe(4);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(pickOptions(game)).toEqual(["y", "z"]); // never P2's bystander
    expect(game.zoneOf("relic")).toBe("base");
  });

  // Expected (387/388.1/402.2): the "do this:" clause is a NEW chain item — when P1 is prompted (its
  // finalization) or at the latest right after P1 picks, the chain holds exactly one triggered Relic item
  // and play is in a Closed State. Actual: the engine runs the clause inline inside the play trigger's
  // resolution — the prompt appears with an EMPTY chain and after the pick play drops straight to P1's
  // open main phase; no reflexive item ever exists.
  test("Case A (a) the +Might clause is a separate reflexive chain item (388.1) — after P1 picks Y the chain holds that item and P1 has priority in a Closed State; engine resolves it inline with an empty chain", async () => {
    const game = await playAndResolveTrigger(VANGUARD_SERGEANT);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("y");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "relic", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("y").might).toBe(2); // not landed yet
  });

  // Expected (388 + 359.3.e.2): P1 picks Y and passes; P2 Gusts Y (2 ≤ 3, at a battlefield) in this SECOND
  // window; LIFO: Gust resolves first (Y → P1's hand), then the reflexive item finds its only target in a
  // non-board zone → no Might for anyone; it does NOT retarget to Z. Actual: there is no second window —
  // after the pick the engine is already in P1's open main phase, so P2 cannot respond at all.
  test("Case A (c) P2 can Gust Y in response to the reflexive item; Y is bounced and the bonus fizzles — Z stays 5, nothing retargets (359.3.e.2); engine offers P2 no window", async () => {
    const game = await playAndResolveTrigger(VANGUARD_SERGEANT);
    await game.p1.pick("y");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "y" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["relic", "gust"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("y")).toBe("hand");
    expect(game.p1.hand()).toContain("y");
    expect(game.state("z")).toMatchObject({ might: 5, mightModifier: 0 });
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.p2.energy()).toBe(0);
    expect(game.zoneOf("burnee")).toBe("trash");
    expect(game.zoneOf("relic")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // Expected (Case C): nobody responds → Y is 2 + 4 = 6 until end of turn (317.2), Z unchanged; next turn Y
  // is 2 again. Actual: on the prompted path (two friendly candidates) the engine loses the burned card's
  // Might between the prompt and the application — Y gets +0 and stays 2.
  test("Case C — P1 picks Y and everyone passes: Y is 6 this turn (2 + burned 4), Z stays 5, and Y is back to 2 next turn (317.2); engine applies +0 after the prompt", async () => {
    const game = await playAndResolveTrigger(VANGUARD_SERGEANT);
    await game.p1.pick("y");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("y")).toMatchObject({ baseMight: 2, might: 6, zone: "battlefield-bf1" });
    expect(game.state("z").might).toBe(5);
    expect(game.zoneOf("burnee")).toBe("trash");
    expect(game.zoneOf("relic")).toBe("base");
    await game.advanceTurn();
    expect(game.state("y").might).toBe(2);
  });

  test("Case C control: with Y as P1's ONLY unit the recipient is forced — no response → Y is 6 this turn and 2 again next turn; Relic stays, burnee in trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Unit Y" }, "y")
      .unit(P2, "base", { might: 1, name: "P2 Bystander" }, "bystander")
      .deck(P1, [VANGUARD_SERGEANT, SKULKER, SKULKER], ["burnee", "d2", "d3"])
      .hand(P1, FORGOTTEN_RELIC, "relic")
      .hand(P2, GUST, "gust")
      .build();
    await game.p1.play("relic");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("y");
      await game.settle();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("y")).toMatchObject({ baseMight: 2, might: 6 });
    expect(game.state("bystander").might).toBe(1);
    expect(game.zoneOf("burnee")).toBe("trash");
    expect(game.zoneOf("relic")).toBe("base");
    await game.advanceTurn();
    expect(game.state("y").might).toBe(2); // "this turn" expired (317.2)
  });

  // ── Case B: a spell is burned ──────────────────────────────────────────────────────────────

  test("Case B: the burned card is a SPELL — condition 'when you burn a unit this way' not met: no reflexive item, no prompt, chain empty, open main phase; Y/Z unchanged; spell in P1's trash; Relic on board", async () => {
    const game = await playAndResolveTrigger(VENGEANCE);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("burnee")).toBe("trash");
    expect(game.p1.trash()).toEqual(["burnee"]);
    expect(game.p1.deck().slice(0, 2)).toEqual(["d2", "d3"]);
    expect(game.state("y").might).toBe(2);
    expect(game.state("z").might).toBe(5);
    expect(game.zoneOf("relic")).toBe("base");
    expect(game.p2.hand()).toContain("gust"); // P2 never needed to act
    expect(game.violations()).toEqual([]);
  });
});
