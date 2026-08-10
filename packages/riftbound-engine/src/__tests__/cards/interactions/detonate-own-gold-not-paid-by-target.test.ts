/**
 * Interaction: Detonate (sfd-005-221) · Spell · Fury · [1]+[fury] · Action
 *     "Kill a gear. Its controller draws 2."
 *   × Gold (unl-t05) · Gear Token
 *     "[Reaction] Kill this, [Exhaust]: [Add] [rainbow]."
 *   × Seal of Rage (ogn-040-298) · Gear · "[Exhaust]: [Reaction] — [Add] [fury]."
 *
 * Question — the 358.1 / 357.3 seam: the TARGET of a spell destroyed by paying that spell's own
 * cost. Detonate aimed at your OWN Gold token ("cash the Gold for two cards"). P1's turn, Neutral
 * Open, P1 has exactly 1 energy and NO fury/rainbow floating.
 *   (a) P1 controls two ready Golds G1, G2 and nothing else that makes power. Detonate → G1: which
 *       payment sources may pay the [fury] pip? End state?
 *   (b) P1 controls ONLY G1: is "Detonate → G1" a legal play at all? Is "Detonate → P2's Seal of
 *       Rage" legal (paid by cracking G1)?
 *   (c) as (b) + P1's own ready Seal of Rage: Detonate → G1 offered now, and what pays?
 *   (d) rollback probe: raw {playSpell Detonate → G1} on board (b) — state afterwards?
 *
 * Rules: 355.5/355.7 (a gear on the board is a target chosen at play time); 357.1.a (Reaction [Add]
 * abilities may be used DURING cost payment); 357.3 (may not pay in a way that deterministically
 * makes a later step illegal); 358.1 (targets re-checked after payment); 358.5 (failure → everything
 * undone); 419.2.a + 355.16 (a play that cannot be completed is not a legal play); 429 (Add resolves
 * at once, no chain item); 186.1 (a killed token ceases to exist).
 *
 * Expected (rules): (a) legal; the pip's pay-with list is {G2} only — G1's own ability absent
 * (357.3); energy 1→0, G2 gone, Detonate on the chain → G1; on resolution G1 dies and P1 draws 2.
 * (b) Detonate → G1 absent from the legal plays; Detonate → P2's Seal legal (G1 cracked for the
 * pip), Seal dies, P2 draws 2. (c) offered; Seal of Rage pays; G1 survives payment, dies on
 * resolution, P1 draws 2. (d) refused and fully undone: G1 ready on the board, energy 1, pool empty,
 * Detonate in hand, chain empty, Neutral Open with P1 to act, no draw, play counters unchanged.
 *
 * DESIGN (DESIGN.md §Paying costs; FIXER-PRIMER §7 "NOT DONE … 357.1.a"): paying is MANUAL — the
 * engine deliberately does not implement the Add-during-payment sub-step. A play is only OFFERED
 * when the CURRENT pool covers its total cost; an uncracked Gold / ready Seal is never credited.
 * The player cracks/exhausts FIRST, then plays. So there is no "pay-with list" to inspect: the
 * 357.3 guarantee ("the target cannot pay for its own destruction") is delivered structurally —
 * a Gold cracked before the play has ceased to exist (186.1) and is never offered as a target,
 * and a Gold still on the board when Detonate is offered was by construction not used to pay.
 * Every facet below asserts the ENGINE's manual-pay sequencing; the rules' end states are the same.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DETONATE = "sfd-005-221";
const GOLD = "unl-t05";
const SEAL_OF_RAGE = "ogn-040-298";

/** Flatten the `targets` field of P1's Detonate cast option into the set of card ids offered. */
function targetsOffered(game: Game): string[] {
  const opt = game.p1.option("cast", "det");
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

interface BoardOpts {
  golds: number;
  ownSeal?: boolean;
}

/**
 * P1's turn, Neutral Open. P1: exactly 1 energy, no power; Detonate in hand; `golds` ready Gold
 * tokens g1..gN; optionally a ready Seal of Rage. P2: a Seal of Rage in base (an enemy gear target).
 * A vanilla body per side keeps the bases non-empty.
 */
function board(opts: BoardOpts) {
  const b = scenario()
    .resources(P1, { energy: 1 })
    .hand(P1, DETONATE, "det")
    .gear(P2, SEAL_OF_RAGE, "theirSeal")
    .unit(P1, "base", { might: 2, name: "P1 Body" }, "p1body")
    .unit(P2, "base", { might: 2, name: "P2 Body" }, "p2body");
  for (let i = 1; i <= opts.golds; i++) {
    b.gear(P1, GOLD, `g${i}`);
  }
  if (opts.ownSeal) {
    b.gear(P1, SEAL_OF_RAGE, "mySeal");
  }
  return b;
}

describe("Detonate → own Gold: the target may not pay for the spell that kills it (357.3 / 358.1) — under manual pay", () => {
  // ── (a) two Golds ────────────────────────────────────────────────────────────────────

  test("(a) DESIGN: with 1 energy, no power and two READY Golds, Detonate is not offered yet — the pool is short a [fury] and uncracked Golds are never credited (357.1.a not implemented); both Gold abilities are", async () => {
    // DESIGN (DESIGN.md §Paying costs): rules 357.1.a would let the pip be Added mid-payment; the
    // engine asks the player to crack first, then play.
    const game = await board({ golds: 2 }).build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "det")).toBe(false);
    expect(game.p1.can("activate", "g1")).toBe(true);
    expect(game.p1.can("activate", "g2")).toBe(true);
  });

  test("(a) crack G2 for the pip (429: immediate, no chain item; 186.1: G2 ceases to exist) → Detonate is now offered and its targets are {G1, P2's Seal} — G2, the payer, is absent (357.3 delivered structurally)", async () => {
    const game = await board({ golds: 2 }).build();
    await game.p1.activate("g2");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("g2")).toBe("gone");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 1 } });
    expect(game.p1.can("cast", "det")).toBe(true);
    expect(targetsOffered(game).sort()).toEqual(["g1", "theirSeal"]);
  });

  test("(a) Detonate → G1 after cracking G2: energy 1→0 and the [rainbow] pays the [fury] pip; Detonate is finalized on the chain targeting G1; G1 is untouched by payment (still on the board, READY); P1 keeps priority first (337.1.a/337.4), then P2 gets it", async () => {
    const game = await board({ golds: 2 }).build();
    await game.p1.activate("g2");
    await game.p1.cast("det", { targets: "g1" });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "det", controller: P1, targets: ["g1"], triggered: false })]);
    expect(game.zoneOf("g1")).toBe("base");
    expect(game.state("g1").isReady).toBe(true);
    expect(game.actingSeat()).toBe(P1);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("(a) resolution: G1 is killed (token → gone) and ITS CONTROLLER — P1, not P2 — draws 2; Detonate → P1's trash; back to Neutral Open", async () => {
    const game = await board({ golds: 2 }).build();
    await game.p1.activate("g2");
    const p1Hand = game.p1.hand().length; // includes det
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("det", { targets: "g1" });
    await game.settle();
    expect(game.zoneOf("g1")).toBe("gone");
    expect(game.p1.hand()).toHaveLength(p1Hand - 1 + 2);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.zoneOf("det")).toBe("trash");
    expect(game.p1.trash()).toContain("det");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) a single Gold ────────────────────────────────────────────────────────────────

  test("(b) only G1: 'Detonate → G1' is NOT a legal play at all — absent from seat.legal(), not merely rejected (419.2.a / 355.16; DESIGN: pool-only affordability gives the same answer)", async () => {
    const game = await board({ golds: 1 }).build();
    expect(game.p1.can("cast", "det")).toBe(false);
    expect(game.p1.option("cast", "det")).toBeUndefined();
    expect(game.p1.legal().map((o) => o.key)).not.toContain("playSpell:det");
    await expect(game.p1.cast("det", { targets: "g1" })).rejects.toThrow();
    expect(game.zoneOf("det")).toBe("hand");
    expect(game.zoneOf("g1")).toBe("base");
  });

  test("(b) cracking G1 for the pip makes Detonate legal — but ONLY at P2's Seal of Rage: G1 no longer exists, so 'Detonate → G1 paid by G1' can never be expressed", async () => {
    const game = await board({ golds: 1 }).build();
    await game.p1.activate("g1");
    expect(game.zoneOf("g1")).toBe("gone");
    expect(game.p1.can("cast", "det")).toBe(true);
    expect(targetsOffered(game)).toEqual(["theirSeal"]);
    await expect(game.p1.cast("det", { targets: "g1" })).rejects.toThrow();
    expect(game.zoneOf("det")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 1 } }); // the failed attempt spent nothing
  });

  test("(b) Detonate → P2's Seal of Rage, paid with the cracked G1: pool drains, Seal dies on resolution and ITS controller (P2) draws 2", async () => {
    const game = await board({ golds: 1 }).build();
    await game.p1.activate("g1");
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("det", { targets: "theirSeal" });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "det", targets: ["theirSeal"] })]);
    await game.settle();
    expect(game.zoneOf("theirSeal")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.p1.hand()).toHaveLength(p1Hand - 1); // P1 only spent Detonate
    expect(game.zoneOf("det")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // ── (c) single Gold + own Seal of Rage ───────────────────────────────────────────────

  test("(c) G1 + own ready Seal of Rage: exhausting the Seal adds [fury] (G1 untouched) → Detonate offered with G1 among the targets", async () => {
    const game = await board({ golds: 1, ownSeal: true }).build();
    expect(game.p1.can("cast", "det")).toBe(false); // DESIGN: still pool-only before the Add
    await game.p1.activate("mySeal");
    expect(game.chain()).toEqual([]);
    expect(game.state("mySeal").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.p1.can("cast", "det")).toBe(true);
    expect(targetsOffered(game).sort()).toEqual(["g1", "mySeal", "theirSeal"]);
    expect(game.state("g1")).toMatchObject({ isReady: true, zone: "base" });
  });

  test("(c) Detonate → G1 paid by the Seal's [fury]: G1 SURVIVES payment (on the board, ready, its ability was not used), dies only on resolution, and P1 draws 2", async () => {
    const game = await board({ golds: 1, ownSeal: true }).build();
    await game.p1.activate("mySeal");
    const p1Hand = game.p1.hand().length;
    await game.p1.cast("det", { targets: "g1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "det", targets: ["g1"] })]);
    expect(game.zoneOf("g1")).toBe("base");
    expect(game.state("g1").isReady).toBe(true);
    await game.settle();
    expect(game.zoneOf("g1")).toBe("gone");
    expect(game.p1.hand()).toHaveLength(p1Hand - 1 + 2);
    expect(game.zoneOf("det")).toBe("trash");
    expect(game.zoneOf("mySeal")).toBe("base"); // the Seal was only exhausted, not killed
    expect(game.violations()).toEqual([]);
  });

  // ── (d) rollback probe ───────────────────────────────────────────────────────────────

  test("(d) raw {playSpell Detonate → G1} on board (b) with an unpaid pip is REFUSED and nothing leaks (358.5): G1 ready on the board, energy 1, pool empty, Detonate in hand, chain empty, Neutral Open with P1 to act, no draw, play counters unchanged", async () => {
    const game = await board({ golds: 1 }).build();
    const hashBefore = game.stateHash();
    const p1Hand = [...game.p1.hand()];
    const played = { ...(game.gameState.cardsPlayedThisTurn ?? {}) };
    const asList = await game.p1.try((p) => p.do("playSpell", { cardId: "det", targets: ["g1"] }));
    expect(asList.ok).toBe(false);
    const asId = await game.p1.try((p) => p.do("playSpell", { cardId: "det", targetId: "g1" }));
    expect(asId.ok).toBe(false);
    expect(game.stateHash()).toBe(hashBefore);
    expect(game.zoneOf("g1")).toBe("base");
    expect(game.state("g1")).toMatchObject({ isExhausted: false, isReady: true });
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} }); // no orphaned floating [rainbow]
    expect(game.zoneOf("det")).toBe("hand");
    expect(game.p1.hand()).toEqual(p1Hand);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.cardsPlayedThisTurn ?? {}).toEqual(played);
    expect(game.violations()).toEqual([]);
  });
});
