/**
 * Interaction: Xerath, Freed (unl-026-219) · Champion Unit · Fury · 5 · 5 Might
 *     "[fury], [Exhaust]: Deal 3 to a unit. Use this ability only while I'm at a battlefield."
 *   × Vi, Hotheaded (unl-030-219) · Champion Unit · Fury · 4 · 3 Might
 *     "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *      [2][fury]: Double my Might this turn."
 *
 * Question: P1's turn, Open State. P1 has READY Xerath at bf1 and P1's OWN Vi in base. P2 has Vi (3
 * Might, Deflect) and a plain 3-Might W at bf2.
 *   (a) Pool exactly {fury:1}: is Xerath's ability listed, and which targets may be picked?
 *   (b) Pool {fury:1, calm:1}: P1 picks P2's Vi — when are the [fury] pip, the Deflect pip and the
 *       [Exhaust] paid, does P2 get priority before that, and can P2 answer with Vi's own double?
 *   (c) Xerath in base, or Xerath already exhausted — is the ability enumerated at all?
 *
 * Rules: 377.2.b ("use only while…" must be true to activate), 381 (activated abilities: controller's
 * turn + Open State only), 402.2 / 355.5 (targets chosen on activation), 402.3 + 355.8 (no legal,
 * payable choice → cannot be put on the chain), 403 / 404.1 (determine, then pay ALL costs before
 * finalizing), 406.4 (opponents get priority only after finalize), 809.1.c / 809.1.c.1 / 809.1.d +
 * 356.2.a.2 (Deflect = mandatory additional cost of 1 Power of ANY domain, owed only by OPPONENTS),
 * 414.4 (an [Exhaust] cost needs a ready permanent).
 *
 * Expected: (a) listed; legal picks = W, Xerath himself, P1's own Vi; P2's Vi is NOT selectable (total
 * would be [fury]+[1 any] which {fury:1} cannot cover). (b) both pips and the exhaust are paid on
 * activation, before P2 ever holds priority; P2 may only pass / play Reactions — Vi's double is neither
 * a Reaction nor is it P2's turn; the ability resolves for 3 → P2's Vi dies. (c) not enumerated in
 * either case.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const XERATH = "unl-026-219";
const VI = "unl-030-219";
const VI_DOUBLE = 1; // Vi's ability #0 is the Deflect keyword, #1 the activated double

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Flatten the `targets` field of Xerath's activate option into the set of card ids offered. */
function targetsOffered(game: G): string[] {
  const field = game.p1.option("activate", "xerath")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

/**
 * P1's turn 2, Open State. Xerath READY at bf1, P1's own Vi in base; P2's Vi + plain W at bf2.
 * P2 is given exactly [2][fury] so that Vi's double WOULD be affordable if it were ever legal.
 */
function board(pool: Record<string, number>) {
  return scenario()
    .resources(P1, { power: pool })
    .resources(P2, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", XERATH, "xerath")
    .unit(P1, "base", VI, "myVi")
    .unit(P2, "bf2", VI, "theirVi")
    .unit(P2, "bf2", { might: 3, name: "W" }, "w");
}

describe("Xerath, Freed × Vi, Hotheaded — Deflect pip is part of the activation cost", () => {
  // ---- (a) pool = {fury:1} ------------------------------------------------------------------------

  test("(a) setup: both Vis carry Deflect; P2's Vi is 3 Might", async () => {
    const game = await board({ fury: 1 }).build();
    expect(game.state("theirVi")).toMatchObject({ controller: P2, might: 3, zone: "battlefield-bf2" });
    expect(game.state("theirVi").keywords).toContain("Deflect");
    expect(game.state("myVi").keywords).toContain("Deflect");
    expect(game.state("xerath")).toMatchObject({ isReady: true, zone: "battlefield-bf1" });
  });

  test("(a) with exactly {fury:1} the ability IS listed, offering W, Xerath himself and P1's OWN Vi — but not P2's Vi (809.1.c: only opponents pay; 402.3/355.8: unpayable choice is not offered)", async () => {
    const game = await board({ fury: 1 }).build();
    expect(game.p1.can("activate", "xerath")).toBe(true);
    expect(targetsOffered(game)).toEqual(["myVi", "w", "xerath"]);
  });

  test("(a) naming P2's Vi anyway is rejected and nothing is partially paid — fury still 1, Xerath still ready, chain empty", async () => {
    const game = await board({ fury: 1 }).build();
    await expect(game.p1.activate("xerath", 0, { targets: "theirVi" })).rejects.toThrow();
    expect(game.p1.resources().power).toEqual({ fury: 1 });
    expect(game.state("xerath").isReady).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.state("theirVi").damage).toBe(0);
  });

  test("(a) P1's own Vi costs just [fury] + exhaust (no Deflect tax for her controller) and takes 3 → dies", async () => {
    const game = await board({ fury: 1 }).build();
    await game.p1.activate("xerath", 0, { targets: "myVi" });
    expect(game.p1.power()).toBe(0);
    expect(game.state("xerath").isExhausted).toBe(true);
    await game.settle();
    expect(game.zoneOf("myVi")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(a) W is a legal pick at base cost: 3 damage kills the 3-Might W", async () => {
    const game = await board({ fury: 1 }).build();
    await game.p1.activate("xerath", 0, { targets: "w" });
    expect(game.p1.power()).toBe(0);
    await game.settle();
    expect(game.zoneOf("w")).toBe("trash");
  });

  // ---- (b) pool = {fury:1, calm:1} ------------------------------------------------------------------

  test("(b) with {fury:1, calm:1} P2's Vi becomes a legal pick as well", async () => {
    const game = await board({ fury: 1, calm: 1 }).build();
    expect(targetsOffered(game)).toEqual(["myVi", "theirVi", "w", "xerath"]);
  });

  test("(b) on activation Xerath is exhausted and the item is on the chain targeting P2's Vi BEFORE anyone gets priority; P1 (turn player) holds priority first (404.1, 406)", async () => {
    const game = await board({ fury: 1, calm: 1 }).build();
    await game.p1.activate("xerath", 0, { targets: "theirVi" });
    expect(game.state("xerath").isExhausted).toBe(true);
    expect(game.p1.power("fury")).toBe(0);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "xerath", controller: P1, targets: ["theirVi"], triggered: false }),
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("theirVi").damage).toBe(0); // nothing resolves yet
  });

  // BUG: expected the whole cost — [fury] + Deflect [1 any] — to leave the pool at activation (403 /
  // 404.1 / 809.1.c.1), i.e. {fury:0, calm:0}. Actual: the Deflect surcharge is deducted BEFORE the
  // ability's own pips and, on a tie, greedily spends the FURY power (pool insertion order), after
  // which the ability's own [fury] pip is silently clamped to "paid" — calm stays 1, so P1 paid only 1
  // of the 2 power owed. (With the pool keyed calm-first, or with 2 calm, the right total is taken.)
  test("(b) both the [fury] pip AND the Deflect pip are paid at activation — pool {fury:1, calm:1} is fully drained (403, 404.1, 809.1.c.1)", async () => {
    const game = await board({ fury: 1, calm: 1 }).build();
    await game.p1.activate("xerath", 0, { targets: "theirVi" });
    expect(game.p1.resources().power).toEqual({ calm: 0, fury: 0 });
  });

  test("(b) P2 first receives priority only after finalize: by then Xerath is already exhausted and the fury pip already gone (406.4)", async () => {
    const game = await board({ fury: 1, calm: 1 }).build();
    await game.p1.activate("xerath", 0, { targets: "theirVi" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.state("xerath").isExhausted).toBe(true);
    expect(game.p1.power("fury")).toBe(0);
    expect(game.zoneOf("theirVi")).toBe("battlefield-bf2");
  });

  test("(b) P2 cannot answer with Vi's '[2][fury]: Double my Might' — no Reaction tag and not P2's turn (381); P2's menu is pass/concede only", async () => {
    const game = await board({ fury: 1, calm: 1 }).build();
    await game.p1.activate("xerath", 0, { targets: "theirVi" });
    await game.p1.passPriority();
    expect(game.p2.can("activate", "theirVi")).toBe(false);
    expect(game.p2.legal().map((o) => o.verb).sort()).toEqual(["concede", "passPriority"]);
    const r = await game.p2.try((p) => p.activate("theirVi", VI_DOUBLE));
    expect(r.ok).toBe(false);
    expect(game.p2.resources()).toEqual({ energy: 2, power: { fury: 1 } }); // nothing spent
    expect(game.chain()).toHaveLength(1);
  });

  test("(b) after both pass the ability resolves: 3 damage into 3 Might — P2's Vi is dead, W untouched, back to P1's Open State", async () => {
    const game = await board({ fury: 1, calm: 1 }).build();
    await game.p1.activate("xerath", 0, { targets: "theirVi" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("theirVi")).toBe("trash");
    expect(game.p2.trash()).toContain("theirVi");
    expect(game.state("w").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ---- (c) use-condition / exhaust cost ------------------------------------------------------------

  test("(c) Xerath in P1's BASE: 'use only while I'm at a battlefield' is false → not enumerated even fully funded (377.2.b)", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1, calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", XERATH, "xerath")
      .unit(P2, "bf2", VI, "theirVi")
      .unit(P2, "bf2", { might: 3, name: "W" }, "w")
      .build();
    expect(game.p1.can("activate", "xerath")).toBe(false);
    expect(game.p1.legal().some((o) => o.key.startsWith("activateAbility:xerath"))).toBe(false);
    const r = await game.p1.try((p) => p.activate("xerath", 0, { targets: "w" }));
    expect(r.ok).toBe(false);
    expect(game.p1.power()).toBe(2);
  });

  test("(c) Xerath at bf1 but already EXHAUSTED: [Exhaust] cannot be completed → not enumerated (414.4, 402.3)", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1, calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", XERATH, "xerath", { exhausted: true })
      .unit(P2, "bf2", VI, "theirVi")
      .unit(P2, "bf2", { might: 3, name: "W" }, "w")
      .build();
    expect(game.state("xerath").isExhausted).toBe(true);
    expect(game.p1.can("activate", "xerath")).toBe(false);
    expect(game.p1.legal().some((o) => o.key.startsWith("activateAbility:xerath"))).toBe(false);
    const r = await game.p1.try((p) => p.activate("xerath", 0, { targets: "w" }));
    expect(r.ok).toBe(false);
    expect(game.state("w").damage).toBe(0);
  });
});
