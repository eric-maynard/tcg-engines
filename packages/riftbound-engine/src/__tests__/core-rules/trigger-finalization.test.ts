/**
 * Core rules — the trigger FINALIZATION dialog (G7).
 *
 * CARD-INDEPENDENT: every unit / spell below is an inline filler definition.
 *
 * Rules covered (riftbound-rules ids):
 *   337.1 / 337.1.b / 337.4   pending items finalize oldest-first, then Priority goes out
 *   383.3.a / 402.1 / 402.1.a  leading "you may": decided at finalization; decline ⇒ removed
 *   383.3.e.2                  a declined "once each turn" trigger has not used up its turn
 *   383.3.b / 383.3.b.1 / 404  base cost ("pay [1] to …") paid at finalization or the item leaves
 *   402.2 / 355.5.b            targets chosen at finalization, per item (copies choose independently)
 *   402.4                      no legal choice ⇒ removed unfinalized (not countered)
 *   359.3.e.5                  a bound target that became illegal makes its instruction fizzle — no re-target
 *   809.1.c.1                  the [Deflect] surcharge is owed when the target is CHOSEN (finalization)
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

// ---------------------------------------------------------------------------
// Inline filler definitions
// ---------------------------------------------------------------------------

/** Unit · 2 Might · "When you play me, deal 2 to a unit." */
const PLAY_PINGER = {
  abilities: [
    {
      effect: { amount: 2, target: { type: "unit" }, type: "damage" },
      trigger: { event: "play-self", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 2,
  name: "Filler Play Pinger",
};

/** Unit · 2 Might · TWO copies of "When you play me, deal 1 to an enemy unit." */
const DOUBLE_PINGER = {
  abilities: [
    {
      effect: { amount: 1, target: { controller: "enemy", type: "unit" }, type: "damage" },
      trigger: { event: "play-self", on: "self" },
      type: "triggered",
    },
    {
      effect: { amount: 1, target: { controller: "enemy", type: "unit" }, type: "damage" },
      trigger: { event: "play-self", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 2,
  name: "Filler Double Pinger",
};

/** Unit · 2 Might · "When you play me, deal 2 to an enemy unit at a battlefield." */
const BATTLEFIELD_PINGER = {
  abilities: [
    {
      effect: { amount: 2, target: { controller: "enemy", location: "battlefield", type: "unit" }, type: "damage" },
      trigger: { event: "play-self", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 2,
  name: "Filler Battlefield Pinger",
};

/** Unit · 2 Might · "Once each turn, when you play a unit? — no: When you play me, you may draw 1 (once each turn)." */
const ONCE_MAY_DRAWER = {
  abilities: [
    {
      effect: { amount: 1, type: "draw" },
      optional: true,
      trigger: { event: "play-self", on: "self", restrictions: [{ type: "once-each-turn" }] },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 2,
  name: "Filler Once May Drawer",
};

/** Unit · 2 Might · "When you play me, you may pay [1] to draw 1." */
const PAY_DRAWER = {
  abilities: [
    {
      condition: { cost: { energy: 1 }, type: "pay-cost" },
      effect: { amount: 1, type: "draw" },
      optional: true,
      trigger: { event: "play-self", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 2,
  name: "Filler Pay Drawer",
};

/** [Reaction] Return a unit at a battlefield to its owner's hand. */
const REACTION_BOUNCE = {
  abilities: [
    {
      effect: { target: { location: "battlefield", type: "unit" }, type: "return-to-hand" },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  keywords: ["Reaction"],
  name: "Filler Reaction Bounce",
  timing: "reaction",
};

/** Enemy unit with [Deflect] (value 1). */
const DEFLECTOR = {
  abilities: [{ keyword: "Deflect", type: "keyword", value: 1 }],
  cardType: "unit",
  domain: "calm",
  energyCost: 0,
  keywords: ["Deflect"],
  might: 3,
  name: "Filler Deflector",
};

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Raw chain items (the observation view omits finalization bookkeeping). */
function rawChain(game: G): readonly Record<string, unknown>[] {
  return (game.gameState.interaction?.chain?.items ?? []) as unknown as readonly Record<string, unknown>[];
}

function priorityOf(game: G): string | undefined {
  const chain = game.gameState.interaction?.chain;
  return chain?.active ? chain.activePlayer : undefined;
}

// ===========================================================================
// 1. Leading "you may"
// ===========================================================================

describe("402.1 / 383.3.a: a leading 'you may' is decided while the trigger is FINALIZED", () => {
  test("declined ⇒ no chain item, no priority round, and a 'once each turn' trigger is NOT used up (383.3.e.2): the second copy played this turn asks again", async () => {
    const game = await scenario()
      .fillDecks({ main: 5, runes: 0 })
      .hand(P1, ONCE_MAY_DRAWER, "o1")
      .hand(P1, ONCE_MAY_DRAWER, "o2")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.play("o1");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    expect(rawChain(game)).toEqual([expect.objectContaining({ cardId: "o1", status: "pending", triggered: true })]);
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.p2.can("passPriority")).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.hand()).toHaveLength(hand0 - 1);
    // Same source would be blocked; a second copy is its own ability — and the first, having
    // declined, did not consume anything either way.
    await game.p1.play("o2");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(rawChain(game)).toEqual([expect.objectContaining({ cardId: "o2", status: "finalized" })]);
    expect(game.p1.hand()).toHaveLength(hand0 - 2); // draw waits for resolution
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 - 1);
  });

  test("383.3.e.2: the once-per-turn tally the trigger consumed when queued is refunded on decline and kept on accept", async () => {
    const counts = (g: G) => (g.gameState as { turnEventCounts?: Record<string, number> }).turnEventCounts ?? {};
    const declined = await scenario().fillDecks({ main: 5, runes: 0 }).hand(P1, ONCE_MAY_DRAWER, "o1").build();
    await declined.p1.play("o1");
    const key = rawChain(declined)[0]?.onceKey as string;
    expect(typeof key).toBe("string");
    expect(counts(declined)[key]).toBe(1);
    await declined.p1.no();
    expect(counts(declined)[key] ?? 0).toBe(0);

    const accepted = await scenario().fillDecks({ main: 5, runes: 0 }).hand(P1, ONCE_MAY_DRAWER, "o1").build();
    await accepted.p1.play("o1");
    await accepted.p1.yes();
    expect(counts(accepted)[key]).toBe(1);
  });
});

// ===========================================================================
// 2. Targets at finalization
// ===========================================================================

describe("402.2 / 355.5.b: caster-chosen targets are chosen while FINALIZING, before the opponent's Priority", () => {
  test("the pick is the first decision after the play (timing FIN); afterwards the finalized item carries the target and P1 — then P2 — hold Priority; resolution does not ask again", async () => {
    const game = await scenario()
      .unit(P2, "base", { might: 3, name: "X" }, "X")
      .unit(P2, "base", { might: 3, name: "Y" }, "Y")
      .hand(P1, PLAY_PINGER, "T")
      .build();
    await game.p1.play("T");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["T", "X", "Y"]);
    expect(game.p2.can("passPriority")).toBe(false); // nobody has Priority over a Pending Item
    await game.p1.pick("Y");
    expect(rawChain(game)).toEqual([expect.objectContaining({ cardId: "T", status: "finalized", targets: ["Y"] })]);
    expect(priorityOf(game)).toBe(P1);
    expect(game.state("Y").damage).toBe(0);
    await game.p1.passPriority();
    expect(priorityOf(game)).toBe(P2);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // no re-prompt
    expect(game.state("Y").damage).toBe(2);
    expect(game.state("X").damage).toBe(0);
  });

  test("two triggers from the same event are separate items and choose INDEPENDENTLY (oldest first, 337.1.b)", async () => {
    const game = await scenario()
      .unit(P2, "base", { might: 3, name: "X" }, "X")
      .unit(P2, "base", { might: 3, name: "Y" }, "Y")
      .hand(P1, DOUBLE_PINGER, "D")
      .build();
    await game.p1.play("D");
    expect(game.chain()).toHaveLength(2);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { chainItemId: game.chain()[0]?.id } });
    await game.p1.pick("X");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { chainItemId: game.chain()[1]?.id } });
    await game.p1.pick("Y");
    expect(rawChain(game).map((c) => c.targets)).toEqual([["X"], ["Y"]]);
    await game.settle();
    expect(game.state("X").damage).toBe(1);
    expect(game.state("Y").damage).toBe(1);
  });

  test("359.3.e.5: the opponent bounces the CHOSEN unit in response → the instruction fizzles; the other legal unit is NOT hit instead and no new prompt appears", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "X" }, "X")
      .unit(P2, "bf1", { might: 3, name: "Y" }, "Y")
      .hand(P1, BATTLEFIELD_PINGER, "T")
      .hand(P2, REACTION_BOUNCE, "B")
      .build();
    await game.p1.play("T");
    await game.p1.pick("X");
    await game.p1.passPriority();
    await game.p2.cast("B", { targets: "X" });
    await game.settle();
    expect(game.zoneOf("X")).toBe("hand");
    expect(game.state("Y").damage).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("402.4: with NO legal target the trigger is removed at once — nothing on the chain, no priority window", async () => {
    const game = await scenario().unit(P1, "base", { might: 3 }, "mine").hand(P1, BATTLEFIELD_PINGER, "T").build();
    await game.p1.play("T");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.can("passPriority")).toBe(false);
  });

  test("a single legal candidate is bound without a prompt, and it is bound NOW: a unit arriving before resolution is not hit", async () => {
    const game = await scenario()
      .resources(P2, { energy: 0 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "X" }, "X")
      .hand(P1, BATTLEFIELD_PINGER, "T")
      .build();
    await game.p1.play("T");
    expect(game.decision()?.kind).toBe("action");
    expect(rawChain(game)).toEqual([expect.objectContaining({ cardId: "T", status: "finalized", targets: ["X"] })]);
    await game.settle();
    expect(game.state("X").damage).toBe(2);
  });
});

// ===========================================================================
// 3. Base costs and Deflect at finalization
// ===========================================================================

describe("383.3.b / 404: a 'you may pay [N] to …' base cost is paid while finalizing", () => {
  test("accept ⇒ the Energy is paid immediately, the draw waits for resolution; P2 gets Priority in between", async () => {
    const game = await scenario().fillDecks({ main: 5, runes: 0 }).resources(P1, { energy: 1 }).hand(P1, PAY_DRAWER, "P").build();
    const hand0 = game.p1.hand().length;
    await game.p1.play("P");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "FIN" });
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0); // rule 404.1: paid now
    expect(game.p1.hand()).toHaveLength(hand0 - 1); // not drawn yet
    expect(rawChain(game)).toEqual([expect.objectContaining({ cardId: "P", optional: false, status: "finalized" })]);
    await game.p1.passPriority();
    expect(priorityOf(game)).toBe(P2);
    await game.p2.passPriority();
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.p1.energy()).toBe(0); // not charged twice
  });

  test("decline ⇒ nothing paid and the item leaves the chain (404.2); unpayable ⇒ 'yes' is not a legal answer", async () => {
    const game = await scenario().fillDecks({ main: 5, runes: 0 }).resources(P1, { energy: 1 }).hand(P1, PAY_DRAWER, "P").build();
    await game.p1.play("P");
    await game.p1.no();
    expect(game.p1.energy()).toBe(1);
    expect(game.chain()).toEqual([]);

    const broke = await scenario().fillDecks({ main: 5, runes: 0 }).hand(P1, PAY_DRAWER, "P").build();
    await broke.p1.play("P");
    expect(broke.decision()).toMatchObject({ canAccept: false, kind: "yes-no", seat: P1 });
    expect((await broke.p1.try((p) => p.yes())).ok).toBe(false);
    await broke.p1.no();
    expect(broke.chain()).toEqual([]);
  });

  test("809.1.c.1: choosing an enemy [Deflect] unit with a trigger costs its Power WHEN CHOSEN — before anyone passes; the damage still waits for resolution", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .unit(P2, "base", DEFLECTOR, "def")
      .unit(P2, "base", { might: 3, name: "Plain" }, "plain")
      .hand(P1, PLAY_PINGER, "T")
      .build();
    await game.p1.play("T");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(expect.arrayContaining(["def", "plain"]));
    await game.p1.pick("def");
    expect(game.p1.power("fury")).toBe(0); // surcharge paid at finalization
    expect(game.state("def").damage).toBe(0);
    await game.settle();
    expect(game.state("def").damage).toBe(2);
    expect(game.p1.power("fury")).toBe(0);
  });

  test("809.1.c.1 negative space: without Power the [Deflect] unit is not a legal choice at all (only the plain unit and the pinger itself are offered)", async () => {
    const game = await scenario()
      .unit(P2, "base", DEFLECTOR, "def")
      .unit(P2, "base", { might: 3, name: "Plain" }, "plain")
      .hand(P1, PLAY_PINGER, "T")
      .build();
    await game.p1.play("T");
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["T", "plain"]);
  });
});
