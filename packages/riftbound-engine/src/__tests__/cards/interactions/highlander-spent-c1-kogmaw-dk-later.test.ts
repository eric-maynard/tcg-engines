/**
 * Interaction: a one-shot death-replacement is spent by the FIRST Cleanup that would kill its unit — and a
 * Deathknell queued by that same Cleanup resolves later, as its own chain item, against whatever board the
 * replacement left behind.
 *
 *   × Firestorm (ogs-002-024) · Spell · Fury · 6
 *       "Deal 3 to all enemy units at a battlefield."                                                — P1
 *   × Kog'Maw, Caustic (ogn-190-298) · Champion Unit · Chaos · 3 · 1 Might
 *       "[Deathknell] — Deal 4 to all units at my battlefield. (When I die, get the effect.)"        — P2
 *   × Highlander (ogs-020-024) · Spell · Calm/Body · 4 · [Reaction]
 *       "Choose a friendly unit. The next time it would die this turn, heal it, exhaust it, and recall
 *        it instead. (Send it to base. This isn't a move.)"                                          — P2
 *
 * Rules: 417.1.d (one Deal action marks every unit at the same time), 321 / 321.1 (nothing dies while a
 * chain item resolves), 319.5 (a Cleanup runs when the item leaves the chain), 320 / 320.1 (nothing
 * resolves inside a Cleanup), 322 / 323.4 / 808 (Cleanup step 3a queues the Deathknell as a Pending Item,
 * noting its battlefield), 323.5 + 370.1.a.2 (units that would die from the same game action die
 * simultaneously), 391 (a delayed one-shot replacement armed on a unit), 370.2 (a replacement may be
 * applied only once to an event and to the events replacing it — it is SPENT), 373.1.a (the replacement's
 * actions execute before the unmodified deaths of the same batch), 418.1 / 428.5.c / 428.5.d (the kill is
 * attributed to the Deathknell and to Kog'Maw), 323.6 (control lapses at an Open-State Cleanup's step 4).
 *
 * Position: P1's turn, Open. P2 controls bf1 with Kog'Maw, Caustic and a vanilla unit U. P1 casts Firestorm
 * at bf1; P2 reacts with Highlander on U.
 *
 * Question / Expected:
 *  (a) U at 3 Might — Cleanup C1 after Firestorm leaves the chain queues the Deathknell (3a) and then finds
 *      Kog'Maw (3/1) and U (3/3) dying simultaneously from the same game action. Highlander applies to U's
 *      death: healed to 0, exhausted, recalled to base — and it is SPENT. Kog'Maw goes to P2's trash. The
 *      Deathknell then resolves as its OWN chain item and deals 4 to all units at bf1; U is in P2's base,
 *      so it is not hit at all, and the already-spent Highlander is never re-offered.
 *  (b) U at 5 Might — Firestorm's 3 is not lethal, so Highlander survives C1 still armed. C1 kills Kog'Maw
 *      alone. The Deathknell then puts U at 7/5, and it is the Cleanup AFTER the Deathknell where U would
 *      die and where Highlander applies. Same one-shot, a different Cleanup.
 *  (c) U at 5 with no Highlander — Kog'Maw dies in C1, the Deathknell puts U at 7/5 and U dies in the
 *      Cleanup after it. bf1 then has no P2 unit, so P2 loses control at that Cleanup's step 4.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIRESTORM = "ogs-002-024";
const KOGMAW = "ogn-190-298";
const HIGHLANDER = "ogs-020-024";

function board(uMight: number, opts: { highlander?: boolean } = {}) {
  const s = scenario()
    .resources(P1, { energy: 6, power: { fury: 2 } })
    .resources(P2, { energy: 4, power: { body: 2, calm: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", KOGMAW, "kogmaw")
    .unit(P2, "bf1", { might: uMight, name: "U" }, "u")
    .hand(P1, FIRESTORM, "firestorm");
  return opts.highlander === false ? s : s.hand(P2, HIGHLANDER, "hl");
}

/** Cast Firestorm at bf1, answer with Highlander on U, and resolve Highlander only. */
async function firestormAnsweredByHighlander(game: Game): Promise<void> {
  await game.p1.cast("firestorm", { targets: "bf1" });
  await game.p1.passPriority();
  await game.p2.cast("hl", { targets: "u" });
  await game.p2.passPriority();
  await game.p1.passPriority(); // Highlander resolves (LIFO), arming the replacement on U
}

/** Let Firestorm resolve — this is Cleanup C1. */
async function resolveFirestorm(game: Game): Promise<void> {
  await game.p1.passPriority();
  await game.p2.passPriority();
}

/** Let the queued Deathknell chain item resolve. */
async function resolveDeathknell(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
}

function bf1Controller(game: Game): string | null | undefined {
  return game.gameState.battlefields?.bf1?.controller;
}

describe("Highlander spent in Cleanup C1 × Kog'Maw's Deathknell resolving later", () => {
  // ── (a) U at 3 Might — both would die in C1 ─────────────────────────────────────────────────

  test("(a) Firestorm is one Deal action: nothing dies while it resolves (321) — the deaths happen in Cleanup C1 (319.5), where Kog'Maw (3/1) and U (3/3) would die simultaneously (323.5 / 370.1.a.2)", async () => {
    const game = await board(3).build();
    await firestormAnsweredByHighlander(game);
    expect(game.state("kogmaw")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("u")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["firestorm"]);
    await resolveFirestorm(game);
    // C1 resolved both fates at once: Kog'Maw dead, U replaced out of its death.
    expect(game.zoneOf("kogmaw")).toBe("trash");
    expect(game.zoneOf("u")).toBe("base");
  });

  test("(a) Highlander's replacement applies to U in C1 (391 / 373.1.a): U is healed to 0 damage, exhausted and recalled to P2's base, while Kog'Maw's unmodified death sends it to P2's trash", async () => {
    const game = await board(3).build();
    await firestormAnsweredByHighlander(game);
    expect(game.gameState.activeReplacements ?? []).toHaveLength(1);
    await resolveFirestorm(game);
    expect(game.state("u")).toMatchObject({ controller: P2, damage: 0, isExhausted: true, zone: "base" });
    expect(game.p2.base()).toContain("u");
    expect(game.p2.trash()).toContain("kogmaw");
    expect(game.zoneOf("firestorm")).toBe("trash");
    expect(game.zoneOf("hl")).toBe("trash");
  });

  test("(a) the Deathknell is queued in C1 as a Pending Item and becomes its OWN chain item — nothing resolves inside a Cleanup (320 / 320.1, 323.4 / 808)", async () => {
    const game = await board(3).build();
    await firestormAnsweredByHighlander(game);
    await resolveFirestorm(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kogmaw", controller: P2, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("(a) Highlander is consumed EXACTLY ONCE (370.2): the armed replacement is gone the moment C1 applied it, and the Deathknell that follows never re-offers it", async () => {
    const game = await board(3).build();
    await firestormAnsweredByHighlander(game);
    expect(game.gameState.activeReplacements ?? []).toHaveLength(1);
    await resolveFirestorm(game);
    expect(game.gameState.activeReplacements ?? []).toEqual([]); // spent in C1
    await resolveDeathknell(game);
    expect(game.gameState.activeReplacements ?? []).toEqual([]); // and never re-armed
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.gameState.activeReplacements ?? []).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(a) when the Deathknell deals 4 to all units at bf1, U is NOT hit at all — it is in P2's base, not at bf1: it keeps 0 damage and stays exhausted, and it is not saved a second time", async () => {
    const game = await board(3).build();
    await firestormAnsweredByHighlander(game);
    await resolveFirestorm(game);
    await resolveDeathknell(game);
    expect(game.zoneOf("u")).toBe("base");
    expect(game.state("u")).toMatchObject({ damage: 0, isExhausted: true, might: 3 });
    expect(game.zoneOf("kogmaw")).toBe("trash");
    expect(game.chain()).toEqual([]);
  });

  test("(a) control at bf1 is KEPT through C1 — that Cleanup is not an Open State (the Deathknell is a Pending Item) — and only lapses at the Open Cleanup after the Deathknell (323.6)", async () => {
    const game = await board(3).build();
    await firestormAnsweredByHighlander(game);
    await resolveFirestorm(game);
    expect(bf1Controller(game)).toBe(P2); // no P2 unit there, but the state is Closed
    await resolveDeathknell(game);
    expect(bf1Controller(game)).toBeNull();
  });

  test("(a) NO side — same board without Highlander: U (3/3) simply dies alongside Kog'Maw in C1 and both sit in P2's trash", async () => {
    const game = await board(3, { highlander: false }).build();
    await game.p1.cast("firestorm", { targets: "bf1" });
    await resolveFirestorm(game);
    expect(game.zoneOf("kogmaw")).toBe("trash");
    expect(game.zoneOf("u")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["kogmaw"]);
  });

  // ── (b) U at 5 Might — Highlander survives C1 and fires one Cleanup later ────────────────────

  test("(b) Firestorm's 3 is not lethal on a 5-Might U: after C1 only Kog'Maw is dead, U is still at bf1 with 3 damage, and Highlander is still ARMED", async () => {
    const game = await board(5).build();
    await firestormAnsweredByHighlander(game);
    await resolveFirestorm(game);
    expect(game.zoneOf("kogmaw")).toBe("trash");
    expect(game.state("u")).toMatchObject({ baseMight: 5, damage: 3, isExhausted: false, zone: "battlefield-bf1" });
    expect(game.gameState.activeReplacements ?? []).toHaveLength(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["kogmaw"]);
  });

  test("(b) the Deathknell's 4 takes U to 7 damage on 5 Might, and the SAME one-shot applies in the Cleanup AFTER the Deathknell — U healed, exhausted, recalled to base, replacement now spent", async () => {
    const game = await board(5).build();
    await firestormAnsweredByHighlander(game);
    await resolveFirestorm(game);
    await resolveDeathknell(game);
    expect(game.zoneOf("u")).toBe("base");
    expect(game.state("u")).toMatchObject({ controller: P2, damage: 0, isExhausted: true });
    expect(game.p2.base()).toContain("u");
    expect(game.gameState.activeReplacements ?? []).toEqual([]);
    expect(game.chain()).toEqual([]);
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.violations()).toEqual([]);
  });

  // ── (c) U at 5 with no Highlander ────────────────────────────────────────────────────────────

  test("(c) no Highlander: Kog'Maw dies in C1, then the Deathknell puts U at 7/5 and U dies in the Cleanup after it — both cards end in P2's trash (kill attributed to the Deathknell, 428.5.c / 428.5.d)", async () => {
    const game = await board(5, { highlander: false }).build();
    await game.p1.cast("firestorm", { targets: "bf1" });
    await resolveFirestorm(game);
    expect(game.zoneOf("kogmaw")).toBe("trash");
    expect(game.state("u")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    await resolveDeathknell(game);
    expect(game.zoneOf("u")).toBe("trash");
    expect(game.p2.trash().toSorted()).toEqual(["kogmaw", "u"]);
    expect(game.p2.base()).toEqual([]);
  });

  test("(c) bf1 then holds no P2 unit, so in the Open state at that Cleanup's step 4 P2 loses control (323.6) — bf1 ends uncontrolled and uncontested", async () => {
    const game = await board(5, { highlander: false }).build();
    await game.p1.cast("firestorm", { targets: "bf1" });
    await resolveFirestorm(game);
    expect(bf1Controller(game)).toBe(P2); // still Closed: the Deathknell is pending
    await resolveDeathknell(game);
    expect(bf1Controller(game)).toBeNull();
    expect(game.gameState.battlefields?.bf1?.contested).toBe(false);
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.violations()).toEqual([]);
  });
});
