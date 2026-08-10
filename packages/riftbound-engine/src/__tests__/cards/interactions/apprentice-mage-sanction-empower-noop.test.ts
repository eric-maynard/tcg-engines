/**
 * Interaction: Apprentice Mage (ven-047-166) × Sanction (ven-035-166) × Matriarch of War (ven-153-166)
 *
 *   Apprentice Mage — Unit · Mind · 3 · 3 Might
 *     "[Empower] [2] ([2]: Empower me. Use only if not Empowered.)
 *      When I become [Empowered], [Predict 2].
 *      [Empowered][>] I have +1 [Might]."                                              — P1's, in base
 *   Sanction — Spell · Calm · 3 + [calm] · [Reaction]
 *     "Choose one — Empower a unit. Disempower it at end of turn.
 *                   Disempower a unit that's [Empowered]. Empower it at end of turn."   — in P2's hand
 *   Matriarch of War — Legend · Body/Order
 *     "When you empower something else, empower me. …"                                 — P1's legend
 *
 * Rules: 441.1.a–c (Empowered is binary; empowering an Empowered object does nothing additional),
 * 441.2.a / 827.2 / 827.2.a (BECOMING Empowered is the referencable event), 442.1.a (Disempower only
 * affects Empowered objects — mode 2 needs "a unit that's [Empowered]"), 827.1.c.1 ("Play only if not
 * Empowered"), 828.1.d ("When I become Empowered" fires on the false→true edge), 406.4 (Reactions before an
 * ability resolves), 402.3 (no legal option → not legal to choose), 441.3.a ("you empower" = the player the
 * effect directs — P2's Sanction is P2 empowering).
 *
 * Question: P1's turn, Open state. P1 activates the Mage's [Empower] paying [2]; in the Closed state P2
 * reacts with Sanction.
 *   (a) Can P2 pick mode 2 (Disempower an [Empowered] unit) on the Mage right now?
 *   (b) P2 picks mode 1 (Empower) on the Mage. Resolve the chain: how many Predicts, Mage's Might, does
 *       Matriarch become Empowered, is the [2] refunded, is [Empower] still offered?
 *   (c) End of turn / P1's next turn?
 *   (d) Control: no Sanction.
 *
 * Expected: (a) No — the Empower ability is still unresolved, the Mage is not Empowered, mode 2 has no legal
 * object in the Mage. (b) LIFO: Sanction resolves → Mage becomes Empowered → Predict 2 ONCE, 4 Might; Matriarch
 * does NOT trigger (P2 empowered it). Then P1's Empower resolves on an already-Empowered Mage → nothing
 * (441.1.c): no second Predict, still no Matriarch trigger. [2] stays spent; [Empower] no longer offered.
 * (c) At end of turn Sanction's delayed Disempower → 3 Might, not Empowered; next P1 turn [Empower] is offered
 * again and, resolving normally, fires Predict again and now triggers Matriarch. (d) Empower resolves →
 * Predict once, 4 Might, Matriarch triggers → legend Empowered; ability no longer offered.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const APPRENTICE_MAGE = "ven-047-166";
const SANCTION = "ven-035-166";
const MATRIARCH_OF_WAR = "ven-153-166";
const TOP_A = { cardType: "spell", energyCost: 0, name: "Top A" };
const TOP_B = { cardType: "spell", energyCost: 0, name: "Top B" };

/**
 * P1's turn (turn 2, main). P1: legend Matriarch of War (un-Empowered), an un-Empowered Apprentice Mage in
 * base, exactly [2] floating, known top-of-deck a, b (Predict fodder). P2: exactly 3 + [calm] for Sanction,
 * Sanction in hand, and a vanilla Bystander in base (a second legal "a unit").
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 3, power: { calm: 1 } })
    .legend(P1, MATRIARCH_OF_WAR, "mow")
    .unit(P1, "base", APPRENTICE_MAGE, "mage")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P2, SANCTION, "sanction")
    .deckTop(P1, TOP_A, "a")
    .deckTop(P1, TOP_B, "b");
}

/** P1 activates [Empower] [2] and passes priority → P2 holds priority with the ability unresolved. */
async function empowerPending(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.can("activate", "mage")).toBe(true);
  await game.p1.activate("mage");
  expect(game.p1.energy()).toBe(0);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mage", controller: P1, triggered: false })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

/** …then P2 casts Sanction mode 1 (index 0: "Empower a unit") on the Mage. Nothing has resolved yet. */
async function sanctionOnTop(): Promise<Game> {
  const game = await empowerPending();
  await game.p2.cast("sanction", { mode: 0, targets: "mage" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  return game;
}

/**
 * Drain the whole chain by hand, counting Predict prompts (the reveal-and-pick sourced from the Mage):
 * decline every recycle, keep the order, accept any trigger-order offer, pass priority otherwise.
 * Stops at the open main phase. Returns how many Predict look-prompts were raised.
 */
async function drainCountingPredicts(game: Game): Promise<number> {
  let predicts = 0;
  for (let i = 0; i < 40; i++) {
    const d: Decision | null = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "pick" && d.source?.cardId === "mage" && d.semantics === "from-revealed") {
      predicts++;
      await game.seat(d.seat).decline();
    } else if (d.kind === "order" && d.source?.pendingChoiceType === "order-cards") {
      await game.seat(d.seat).order(d.items.map((it) => it.key));
    } else if (d.kind === "order") {
      await game.acceptTriggerOrder();
    } else if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  return predicts;
}

describe("(a) Sanction mode 2 needs 'a unit that's [Empowered]' — the Mage, whose Empower is still on the chain, is not one", () => {
  test("with the Empower ability pending the Mage is NOT Empowered yet (nothing resolves before Reactions, 406.4)", async () => {
    const game = await empowerPending();
    expect(game.state("mage")).toMatchObject({ isEmpowered: false, might: 3 });
    expect(game.state("mow").isEmpowered).toBe(false);
  });

  test("P2's Sanction menu offers only mode 1 ('Empower a unit') — mode 2 is absent because no unit on the board is [Empowered] (442.1.a, 355.8/402.3)", async () => {
    const game = await empowerPending();
    expect(game.p2.can("cast", "sanction")).toBe(true);
    const modeField = game.p2.option("cast", "sanction")?.fields.find((f) => f.name === "mode");
    expect(modeField?.options).toEqual([0]);
    expect(modeField?.labels).toEqual(["Empower a unit. Disempower it at end of turn"]);
  });

  test("an explicit mode-2-on-the-Mage cast is rejected; Sanction stays in hand and P2's pool is untouched", async () => {
    const game = await empowerPending();
    await expect(game.p2.cast("sanction", { mode: 1, targets: "mage" })).rejects.toThrow();
    expect(game.zoneOf("sanction")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 3, power: { calm: 1 } });
    expect(game.chain()).toHaveLength(1);
  });

  test("mode 1 may choose the Mage (or any other unit — the Bystander): the cast lands on top of P1's ability with { mode: 0, targets: [mage] }", async () => {
    const game = await empowerPending();
    const targets = game.p2.option("cast", "sanction")?.fields.find((f) => f.name === "targets");
    const offered = [...new Set((targets?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : v == null ? [] : [v]) as string[]))].sort();
    expect(offered).toEqual(["bystander", "mage"]);
    await game.p2.cast("sanction", { mode: 0, targets: "mage" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["mage", "sanction"]); // bottom → top
    expect(game.chain()[1]).toMatchObject({ controller: P2, mode: 0, targets: ["mage"], triggered: false });
  });
});

describe("(b) P2's Sanction (mode 1) on the Mage, then P1's own Empower resolves into an already-Empowered Mage", () => {
  test("LIFO: after P2 and P1 pass, Sanction resolves FIRST — the Mage becomes Empowered (4 Might) while P1's Empower ability is still the bottom chain item", async () => {
    const game = await sanctionOnTop();
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("sanction")).toBe("trash");
    expect(game.state("mage")).toMatchObject({ baseMight: 3, isEmpowered: true, might: 4 });
    expect(game.chain()[0]).toMatchObject({ cardId: "mage", controller: P1, triggered: false }); // the paid Empower, unresolved
  });

  test("that false→true edge is a 'become Empowered' event (441.2.a / 828.1.d): the Mage's Predict trigger goes on the chain above the pending Empower — and NO Matriarch of War item (P2, not P1, empowered it — 441.3.a)", async () => {
    const game = await sanctionOnTop();
    await game.p2.passPriority();
    await game.p1.passPriority();
    const chain = game.chain();
    expect(chain).toHaveLength(2);
    expect(chain[1]).toMatchObject({ cardId: "mage", controller: P1, triggered: true });
    expect(chain.some((c) => c.cardId === "mow")).toBe(false);
    expect(game.state("mow").isEmpowered).toBe(false);
  });

  test("the Predict trigger resolves: P1 looks at exactly the top 2 (a, b) — one Predict 2", async () => {
    const game = await sanctionOnTop();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Sanction
    await game.p1.passPriority();
    await game.p2.passPriority(); // Predict trigger
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed", source: { cardId: "mage" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["a", "b"]);
  });

  test("then P1's Empower ability resolves on an already-Empowered Mage → nothing additional happens (441.1.b–c): Predict fired exactly ONCE over the whole chain, no second look-prompt, chain empty, open main phase", async () => {
    const game = await sanctionOnTop();
    const predicts = await drainCountingPredicts(game);
    expect(predicts).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.deck().slice(0, 2)).toEqual(["a", "b"]); // declined recycles, kept order
  });

  test("after the chain: Mage Empowered, 4 Might, still in base; no invariant violations", async () => {
    const game = await sanctionOnTop();
    await drainCountingPredicts(game);
    expect(game.state("mage")).toMatchObject({ isEmpowered: true, might: 4, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  // Expected: P1's Empower resolving into an already-Empowered Mage is "nothing additional happens"
  // (441.1.b–c) — no empower action by P1 took place, so "When YOU empower something else" has no event:
  // the chain is simply empty afterwards and the legend stays un-Empowered.
  // Actual: the engine fires an 'empower' event for the redundant empower (it treats every empower
  // instruction as an action, 441.1.c.1-style, even without a "may be Empowered multiple times"
  // permission) → a Matriarch of War trigger lands on the chain and the legend ends up Empowered.
  test("the redundant Empower is a no-op — NO Matriarch of War trigger is put on the chain when P1's ability resolves, and the legend stays un-Empowered (441.1.b–c, 441.2.a)", async () => {
    const game = await sanctionOnTop();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Sanction → Mage Empowered, Predict trigger on top
    await game.p1.passPriority();
    await game.p2.passPriority(); // Predict resolves
    await game.p1.decline();
    if (game.decision()?.kind === "order") {
      await game.p1.order(["a", "b"]);
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mage", controller: P1, triggered: false })]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // P1's Empower resolves into an already-Empowered Mage
    expect(game.state("mage")).toMatchObject({ isEmpowered: true, might: 4 });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("mow").isEmpowered).toBe(false);
  });

  test("the [2] was a paid cost, not refunded (P1 pool stays 0); [Empower] is no longer offered ('Use only if not Empowered', 827.1.c.1) even if P1 finds 2 more energy", async () => {
    const game = await sanctionOnTop();
    await drainCountingPredicts(game);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("activate", "mage")).toBe(false);
    await game.p1.do("addResources", { energy: 2 });
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("activate", "mage")).toBe(false);
  });
});

describe("(c) end of turn and P1's next turn", () => {
  test("P1 ends the turn: Sanction's delayed 'Disempower it' is a P2-controlled triggered chain item aimed at the Mage in P1's Ending Step; once it resolves the Mage is un-Empowered and back to 3 Might on P2's turn", async () => {
    const game = await sanctionOnTop();
    await drainCountingPredicts(game);
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toEqual([expect.objectContaining({ controller: P2, targets: ["mage"], triggered: true })]);
    expect(game.state("mage").isEmpowered).toBe(true); // still on while the item is pending
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("mage")).toMatchObject({ isEmpowered: false, might: 3, zone: "base" });
  });

  test("on P1's next turn [Empower] [2] is offered again; activated and resolved normally it is a NEW become-Empowered event: the Mage's Predict trigger AND Matriarch of War's trigger both go on the chain; Predict 2 fires once more, 4 Might, legend Empowered, ability off again", async () => {
    const game = await sanctionOnTop();
    await drainCountingPredicts(game);
    await game.advanceTurn(); // → P2 (the delayed Disempower resolves on the way)
    await game.advanceTurn(); // → P1, turn 4
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("mage")).toMatchObject({ isEmpowered: false, might: 3 });
    await game.p1.tapRunes(2);
    expect(game.p1.can("activate", "mage")).toBe(true);
    await game.p1.activate("mage");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Empower resolves (827.2)
    expect(game.state("mage")).toMatchObject({ isEmpowered: true, might: 4 });
    const chain = game.chain();
    expect(chain.map((c) => c.cardId).sort()).toEqual(["mage", "mow"]);
    expect(chain.every((c) => c.controller === P1 && c.triggered)).toBe(true);
    const predicts = await drainCountingPredicts(game);
    expect(predicts).toBe(1);
    expect(game.state("mage")).toMatchObject({ isEmpowered: true, might: 4 });
    expect(game.state("mow").isEmpowered).toBe(true);
    expect(game.p1.can("activate", "mage")).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});

describe("(d) control — no Sanction at all", () => {
  test("P2 just passes: the Empower resolves (827.2) → Mage Empowered, 4 Might; BOTH the Mage's Predict trigger and Matriarch of War's trigger go on the chain under P1", async () => {
    const game = await empowerPending();
    await game.p2.passPriority();
    expect(game.state("mage")).toMatchObject({ isEmpowered: true, might: 4 });
    const chain = game.chain();
    expect(chain.map((c) => c.cardId).sort()).toEqual(["mage", "mow"]);
    expect(chain.every((c) => c.controller === P1 && c.triggered)).toBe(true);
  });

  test("everything settles: Predict 2 exactly once, Mage 4 Might & Empowered, legend Empowered, [2] spent, [Empower] no longer offered", async () => {
    const game = await empowerPending();
    const predicts = await drainCountingPredicts(game);
    expect(predicts).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("mage")).toMatchObject({ isEmpowered: true, might: 4 });
    expect(game.state("mow").isEmpowered).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("activate", "mage")).toBe(false);
    expect(game.p2.hand()).toContain("sanction");
    expect(game.violations()).toEqual([]);
  });

  test("contrast with (c): with no Sanction there is no end-of-turn Disempower — the Mage is still Empowered (4 Might) on P2's turn and on P1's next turn", async () => {
    const game = await empowerPending();
    await drainCountingPredicts(game);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("mage")).toMatchObject({ isEmpowered: true, might: 4 });
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("mage")).toMatchObject({ isEmpowered: true, might: 4 });
    expect(game.state("mow").isEmpowered).toBe(true);
  });
});
