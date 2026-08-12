/**
 * Interaction: Dancing Grenade's replay is the OPPONENT's chain item, played from P1's card.
 *   Dancing Grenade (unl-020-219) · Spell · Fury · 2 + [fury] —
 *     "Deal 2 to a unit. Its controller may play this spell again for [rainbow]. If they do, this
 *      deals 1 additional Bonus Damage for each time this spell has dealt damage this turn."
 *   Watchful Sentry (ogn-096-298) · Unit · Mind · 2 · 1 Might — "[Deathknell] — Draw 1."
 *   Wind Wall (ogn-064-298) · Spell · Calm · 3 + [calm] · [Reaction] — "Counter a spell."
 *   Chemtech Cask (sfd-063-221) · Gear · Mind · 1 — "When you play a spell on an opponent's turn,
 *     you may exhaust me to play a Gold gear token exhausted." (P2's, to observe 419.4.a / 419.4.a.1)
 *
 * Question: P1 casts Dancing Grenade at P2's Watchful Sentry and P2 elects to replay it.
 *   (a) Does the replay resolve INSIDE P1's resolution or become a new chain item, and who controls it?
 *   (b) Who gets priority once the replay is finalized, and may P1 answer with Wind Wall?
 *   (c) If P1 counters it, whose trash does the card land in, is anything refunded, does the replay
 *       still count as a card P2 played, and does it fire P2's "when you play a spell" trigger?
 *   (d) If it resolves, may P1 (now the damaged unit's controller) replay it a third time?
 *
 * Rules: 330.1 / 330.2 (a play made during a resolution is put on the existing chain), 354.2 / 419.3 /
 * 419.3.a / 419.3.b (a Limited Play — pending until the current resolution finishes, then all the
 * ordinary steps of Play), 191.2 (the controller of a card is the player who played it), 419.1,
 * 340.3 / 336.1 (the chain goes back to Finalize and one FEPR processes the newly pending items),
 * 337.1.a (no priority passing during finalization), 337.4 / 339.2 (the controller of the newest item
 * receives priority first, then it passes), 406.4 (an ordinary chain item may be answered), 425.1.a.1 /
 * 359.3.d (a countered card does nothing and goes to its OWNER's trash), 425.1.c (nothing refunded),
 * 419.4.a.1 (a countered card fires no "when you play" triggers), 419.4.b (it still counts as played).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DANCING_GRENADE = "unl-020-219";
const WATCHFUL_SENTRY = "ogn-096-298";
const WIND_WALL = "ogn-064-298";
const CHEMTECH_CASK = "sfd-063-221";

/**
 * P1's turn 2. P1 holds Dancing Grenade (and Wind Wall when asked for); P2 fields the Watchful Sentry
 * (1 Might — the printed 2 damage kills it) plus a 6-Might wall; P1 fields a 6-Might bruiser so the
 * replay has a P1-controlled unit to bounce back off.
 */
function board(opts: { wind?: boolean; cask?: boolean } = {}) {
  const b = scenario()
    .turn(2)
    .active(P1)
    .resources(P1, { energy: 9, power: { calm: 3, fury: 3, rainbow: 3 } })
    .resources(P2, { energy: 9, power: { calm: 3, fury: 3, rainbow: 3 } })
    .hand(P1, DANCING_GRENADE, "grenade")
    .unit(P2, "base", WATCHFUL_SENTRY, "sentry")
    .unit(P2, "base", { might: 6, name: "P2 Wall" }, "wall")
    .unit(P1, "base", { might: 6, name: "P1 Bruiser" }, "bruiser");
  if (opts.wind === true) {
    b.hand(P1, WIND_WALL, "windWall");
  }
  if (opts.cask === true) {
    b.gear(P2, CHEMTECH_CASK, "cask");
  }
  return b;
}

/** Cast the Grenade at the Sentry and let it resolve; stops on P2's "play this again?" offer. */
async function toReplayOffer(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>) {
  await game.p1.cast("grenade", { targets: "sentry" });
  await game.p1.passPriority();
  await game.p2.passPriority();
}

describe("Dancing Grenade replayed by the opponent: whose chain item is it?", () => {
  // ---- (a) the replay is a new chain item, controlled by P2 -------------------------------------

  test("(a) the 'play this again' offer belongs to the DAMAGED unit's controller and is made during P1's resolution — P2 is asked, the Sentry has already died, and nothing is on the chain but its Deathknell", async () => {
    const game = await board().build();
    await toReplayOffer(game);
    expect(game.zoneOf("sentry")).toBe("trash"); // 2 damage killed the 1-Might Sentry
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sentry", controller: P2, triggered: true })]);
    const decision = game.decision();
    expect(decision?.kind).toBe("yes-no");
    expect(decision?.seat).toBe(P2);
    expect(decision?.timing).toBe("RES"); // offered while Dancing Grenade is resolving
    expect(game.zoneOf("grenade")).toBe("trash"); // the spell itself has finished resolving
  });

  test("(a) accepting does NOT resolve inline: the replay is placed on the existing chain as a new item whose CONTROLLER is P2 even though P1 still OWNS the card (330.1, 419.3, 191.2)", async () => {
    const game = await board().build();
    await toReplayOffer(game);
    await game.p2.yes();

    // P2 — not P1 — chooses the new target, from every unit on the board.
    const pick = game.decision();
    expect(pick?.kind).toBe("pick");
    expect(pick?.seat).toBe(P2);
    expect((pick as { options: { key: string }[] }).options.map((o) => o.key).sort()).toEqual(["bruiser", "wall"]);
    await game.p2.pick("bruiser");

    expect(game.chain().map((i) => i.cardId)).toEqual(["sentry", "grenade"]);
    expect(game.chain()[1]).toMatchObject({ cardId: "grenade", controller: P2, triggered: false });
    expect(game.chain()[1]?.targets).toEqual(["bruiser"]);
    expect(game.zoneOf("grenade")).toBe("chain");
    expect(game.state("grenade").owner).toBe(P1); // ownership never moves (191.1)
    expect(game.state("bruiser").damage).toBe(0); // nothing has resolved yet
  });

  test("(a) P2 pays the [rainbow] and no Energy — the replay's cost comes out of P2's pool, not P1's (191.2.b)", async () => {
    const game = await board().build();
    const p1Energy = game.p1.energy();
    const p1Fury = game.p1.power("fury");
    await toReplayOffer(game);
    const p2Before = game.p2.resources();
    await game.p2.yes();
    await game.p2.pick("bruiser");
    expect(game.p2.energy()).toBe(p2Before.energy); // [rainbow] is Power, not Energy
    const p2PowerSpent = Object.values(p2Before.power).reduce((a, b) => a + b, 0)
      - Object.values(game.p2.resources().power).reduce((a, b) => a + b, 0);
    expect(p2PowerSpent).toBe(1);
    expect(game.p1.energy()).toBe(p1Energy - 2); // P1 only ever paid for the first cast
    expect(game.p1.power("fury")).toBe(p1Fury - 1);
  });

  // ---- (b) priority order and answering your own card ------------------------------------------

  test("(b) once the replay is finalized the CONTROLLER of the newest item — P2 — receives priority first; P1 gets it only after P2 passes (337.4, 339.2)", async () => {
    const game = await board({ wind: true }).build();
    await toReplayOffer(game);
    await game.p2.yes();
    await game.p2.pick("bruiser");
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p1.can("cast", "windWall")).toBe(false); // not P1's window yet

    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "windWall")).toBe(true);
  });

  test("(b) P1 may Wind Wall the replay of its OWN card — it is an ordinary spell on the chain (406.4)", async () => {
    const game = await board({ wind: true }).build();
    await toReplayOffer(game);
    await game.p2.yes();
    await game.p2.pick("bruiser");
    await game.p2.passPriority();
    await game.p1.cast("windWall", { targets: "grenade" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["sentry", "grenade", "windWall"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("bruiser").damage).toBe(0); // countered: no damage ever dealt
  });

  // ---- (c) countering the replay ---------------------------------------------------------------

  test("(c) the countered replay lands in its OWNER's trash — P1's, not P2's — and nothing P2 paid is refunded (425.1.a.1, 359.3.d, 425.1.c)", async () => {
    const game = await board({ wind: true }).build();
    await toReplayOffer(game);
    const p2Power = Object.values(game.p2.resources().power).reduce((a, b) => a + b, 0);
    await game.p2.yes();
    await game.p2.pick("bruiser");
    await game.p2.passPriority();
    await game.p1.cast("windWall", { targets: "grenade" });
    await game.settle();

    expect(game.zoneOf("grenade")).toBe("trash");
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["grenade", "windWall"]));
    expect(game.p2.trash()).not.toContain("grenade");
    expect(game.p2.trash()).toContain("sentry");
    expect(Object.values(game.p2.resources().power).reduce((a, b) => a + b, 0)).toBe(p2Power - 1); // still spent
  });

  test("(c) because it never resolves the ping-pong stops there: no further 'play this again' offer, and the open main phase comes back to P1", async () => {
    const game = await board({ wind: true }).build();
    await toReplayOffer(game);
    await game.p2.yes();
    await game.p2.pick("bruiser");
    await game.p2.passPriority();
    await game.p1.cast("windWall", { targets: "grenade" });
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(c) it WAS Finalized, so it counts among the cards P2 played this turn (419.4.b) — but firing no 'when you play a spell' trigger: P2's Chemtech Cask stays ready (419.4.a.1)", async () => {
    const game = await board({ cask: true, wind: true }).build();
    const playedBefore = (game.gameState as { cardsPlayedThisTurn?: Record<string, number> }).cardsPlayedThisTurn?.[P2] ?? 0;
    await toReplayOffer(game);
    await game.p2.yes();
    await game.p2.pick("bruiser");
    await game.p2.passPriority();
    await game.p1.cast("windWall", { targets: "grenade" });
    await game.settle();
    expect((game.gameState as { cardsPlayedThisTurn?: Record<string, number> }).cardsPlayedThisTurn?.[P2]).toBe(playedBefore + 1);
    expect(game.state("cask").isExhausted).toBe(false);
    expect(game.p2.gear()).toEqual(["cask"]); // no Gold token
  });

  test("(c) baseline: an ORDINARY P2 spell on P1's turn does trigger P2's Cask — so the Cask itself is wired up and pointed the right way", async () => {
    const game = await board({ cask: true, wind: true }).build();
    // Give the Wind Wall to P2 instead by having P2 answer P1's first cast directly.
    const g2 = await scenario()
      .turn(2)
      .active(P1)
      .resources(P1, { energy: 9, power: { fury: 3 } })
      .resources(P2, { energy: 9, power: { calm: 3 } })
      .hand(P1, DANCING_GRENADE, "grenade")
      .hand(P2, WIND_WALL, "theirWall")
      .unit(P2, "base", WATCHFUL_SENTRY, "sentry")
      .gear(P2, CHEMTECH_CASK, "cask")
      .build();
    await g2.p1.cast("grenade", { targets: "sentry" });
    await g2.p1.passPriority();
    await g2.p2.cast("theirWall", { targets: "grenade" });
    await g2.settle();
    expect(g2.chain()).toEqual([expect.objectContaining({ cardId: "cask", controller: P2, triggered: true })]);
    expect(g2.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test.failing("(c) BUG: a REPLAY that resolves is still a Play (419.3.b), so completing it must fire P2's 'when you play a spell' Cask (419.4.a) — the engine emits no play event for the Limited Play, so the Cask never triggers", async () => {
    const game = await board({ cask: true }).build();
    await toReplayOffer(game);
    await game.p2.yes();
    await game.p2.pick("bruiser");
    await game.p2.passPriority();
    await game.p1.passPriority();
    // Expected: the replay resolved, so P2's Cask trigger is on the chain awaiting its "you may
    // exhaust me". Actual: the only pending decision is P1's third-replay offer; the Cask is silent.
    expect(game.state("bruiser").damage).toBe(3);
    expect(game.chain().some((i) => i.cardId === "cask")).toBe(true);
  });

  // ---- (d) the ping-pong ------------------------------------------------------------------------

  test("(d) resolving instead: the replay deals 2 + 1 Bonus Damage (second dealing this turn) and the offer bounces back to P1, the newly damaged unit's controller", async () => {
    const game = await board().build();
    await toReplayOffer(game);
    await game.p2.yes();
    await game.p2.pick("bruiser");
    await game.p2.passPriority();
    await game.p1.passPriority();

    expect(game.state("bruiser").damage).toBe(3); // 2 + 1 for the first dealing this turn
    const decision = game.decision();
    expect(decision?.kind).toBe("yes-no");
    expect(decision?.seat).toBe(P1); // the controller of the newly damaged unit
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sentry", controller: P2 })]);
  });

  test("(d) each replay is a fresh chain item with its own finalize / priority cycle — the third trip is controlled by P1 and the card is the same object throughout, ending in P1's trash (336.1, 359.3.d)", async () => {
    const game = await board().build();
    await toReplayOffer(game);
    await game.p2.yes();
    await game.p2.pick("bruiser");
    await game.p2.passPriority();
    await game.p1.passPriority();

    await game.p1.yes(); // P1 takes the third trip
    expect(game.decision()?.kind).toBe("pick");
    expect(game.decision()?.seat).toBe(P1);
    await game.p1.pick("wall");
    expect(game.chain().map((i) => i.cardId)).toEqual(["sentry", "grenade"]);
    expect(game.chain()[1]).toMatchObject({ cardId: "grenade", controller: P1 }); // back under P1
    expect(game.state("grenade").owner).toBe(P1);
    expect(game.actingSeat()).toBe(P1); // controller of the newest item goes first again

    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("wall").damage).toBe(4); // 2 + 2 (third dealing this turn)
    // P2 is offered a fourth trip; declining empties the chain and the card rests in P1's trash.
    expect(game.decision()?.seat).toBe(P2);
    await game.p2.no();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("grenade")).toBe("trash");
    expect(game.p1.trash()).toContain("grenade");
    expect(game.p2.trash()).not.toContain("grenade");
    expect(game.violations()).toEqual([]);
  });
});
