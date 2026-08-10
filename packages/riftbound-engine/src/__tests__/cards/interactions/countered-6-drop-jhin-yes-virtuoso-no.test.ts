/**
 * Interaction: Virtuoso (unl-181-219, Legend · Jhin)
 *     "When you play a spell, if you spent [4] or more, you may banish it. Then, if there are
 *      four spells banished with me, put each in its trash, channel 4 runes, and draw 1."
 *   × Jhin, Meticulous Killer (unl-089-219, Unit · Mind · [4] · 4 Might)
 *     "[Vision] … If you've spent [4] or more to play a spell this turn, you may play me for [mind]."
 *   × Wind Wall (ogn-064-298, Spell · Calm · [3][calm][calm] · Reaction) "Counter a spell."
 *   with Singularity (ogn-105-298, Spell · Mind · [6][mind][mind]) "Deal 6 to each of up to two units."
 *   and Void Seeker (ogn-024-298, Spell · Fury · [3][fury]) "Deal 4 to a unit at a battlefield. Draw 1."
 *
 * Question: P1 (Virtuoso; Jhin + Singularity in hand; exactly 6 energy + 3 mind; nothing played this
 * turn) casts Singularity at two of P2's units and P2 Wind Walls it. (a) Does Virtuoso trigger /
 * where does Singularity end up? (b) With 0 energy + 1 mind left, is Jhin playable for [mind]?
 * (c) Contrast: no Wind Wall. (d) Contrast: the countered spell cost only [3] (Void Seeker).
 *
 * Rules: 419.4.a (play-triggers fire on completion = resolution), 419.4.a.1 / 425.1.b (a countered
 * card was never "played" for such triggers), 425.1.a / 425.1.a.1 (countered → does nothing, to
 * trash), 425.1.c (no refund), 419.4.b (non-triggered "have you …" checks key off Finalization —
 * cf. the Battering Ram / Legion example), 340.1 (LIFO), 355.8.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VIRTUOSO = "unl-181-219";
const JHIN_KILLER = "unl-089-219";
const WIND_WALL = "ogn-064-298";
const SINGULARITY = "ogn-105-298";
const VOID_SEEKER = "ogn-024-298";

type Built = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn. P1: legend Virtuoso; hand Singularity + Jhin; EXACTLY [6] + 3 mind (2 mind for
 * Singularity, the third is Jhin's alternative cost). P2: two 3-Might units on P2's bf1 (a 6 kills
 * either), Wind Wall in hand with exactly [3] + 2 calm.
 */
function board() {
  return scenario()
    .legend(P1, VIRTUOSO, "virtuoso")
    .resources(P1, { energy: 6, power: { mind: 3 } })
    .resources(P2, { energy: 3, power: { calm: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Grunt A" }, "gruntA")
    .unit(P2, "bf1", { might: 3, name: "Grunt B" }, "gruntB")
    .hand(P1, SINGULARITY, "singularity")
    .hand(P1, JHIN_KILLER, "jhin")
    .hand(P2, WIND_WALL, "windwall");
}

/** P1 casts Singularity at both grunts; P1 passes; P2 answers with Wind Wall on it. Chain NOT yet resolved. */
async function singularityWindWalled(): Promise<Built> {
  const game = await board().build();
  await game.p1.cast("singularity", { targets: ["gruntA", "gruntB"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 1 } }); // [6][mind][mind] genuinely paid
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // no Virtuoso prompt at play time
  await game.p1.passPriority();
  expect(game.p2.can("cast", "windwall")).toBe(true);
  await game.p2.cast("windwall", { targets: "singularity" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["singularity", "windwall"]);
  return game;
}

/** Pass priority through the whole chain, recording (and declining) any Virtuoso opt-in P1 is shown. */
async function drainWatchingVirtuoso(game: Built, accept: boolean): Promise<boolean> {
  let asked = false;
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      expect(d.source?.cardId).toBe("virtuoso");
      asked = true;
      await (accept ? game.p1.yes() : game.p1.no());
      continue;
    }
    if (d?.kind === "action" && d.context === "chain") {
      await game.acting().passPriority();
      continue;
    }
    break;
  }
  return asked;
}

describe("Countered 6-drop: Jhin's alt cost YES, Virtuoso NO (Singularity × Wind Wall)", () => {
  // ─── (a) countered: no Virtuoso, Singularity to trash, no damage ───────────────────────────
  test("(a) Wind Wall resolves first (340.1) and counters Singularity: Virtuoso is NEVER offered (419.4.a.1 / 425.1.b), Singularity goes to P1's TRASH — not banishment, not hand (425.1.a.1) — no damage is dealt, Wind Wall → P2's trash", async () => {
    const game = await singularityWindWalled();
    const asked = await drainWatchingVirtuoso(game, false);
    expect(asked).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("singularity")).toBe("trash");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.hand()).not.toContain("singularity");
    expect(game.zoneOf("windwall")).toBe("trash");
    expect(game.state("gruntA").damage).toBe(0);
    expect(game.state("gruntB").damage).toBe(0);
    expect(game.zoneOf("gruntA")).toBe("battlefield-bf1");
    expect(game.zoneOf("gruntB")).toBe("battlefield-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 1 } }); // 425.1.c — nothing refunded
    expect(game.violations()).toEqual([]);
  });

  // ─── (b) …but the [6] was SPENT: Jhin for [mind] ───────────────────────────────────────────
  test("(b) with 0 energy + 1 mind after the counter, Jhin IS playable — only via his alternative [mind] cost (419.4.b: 'spent [4]+ to play a spell this turn' keys off Finalization; 425.1.c no refund); he enters base exhausted, [mind] paid, Vision looks at the top card", async () => {
    const game = await singularityWindWalled();
    await game.settle();
    expect(game.zoneOf("singularity")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 1 } });
    expect(game.p1.can("play", "jhin")).toBe(true);
    const deckTop = game.p1.deck()[0] as string;
    await game.p1.play("jhin", { params: { altCost: true }, to: "base" });
    expect(game.zoneOf("jhin")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // paid [mind] only
    // Vision is a triggered "when you play me": it sits on the chain, then shows P1 the top card.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jhin", triggered: true })]);
    const stop = await game.settle(); // both pass → Vision resolves → "recycle it?" pick handed back
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const look = game.decision() as { options: { card?: string; key: string }[] };
    expect(look.options.map((o) => o.card ?? o.key)).toEqual([deckTop]);
    await game.p1.decline(); // keep it
    await game.settle();
    expect(game.state("jhin").isExhausted).toBe(true);
    expect(game.p1.deck()[0]).toBe(deckTop); // kept on top
    // (No `violations()` oracle here: the harness's `costPaid` invariant only knows the printed
    // [4] and flags a legitimate alternative-cost play — a harness limitation, not an engine bug.)
    expect(game.violations().filter((v) => v.invariant !== "costPaid")).toEqual([]);
  });

  test("(b) negative control: WITHOUT any spell cast this turn, 0 energy + 1 mind does not pay for Jhin", async () => {
    const game = await scenario()
      .legend(P1, VIRTUOSO, "virtuoso")
      .resources(P1, { energy: 0, power: { mind: 1 } })
      .hand(P1, JHIN_KILLER, "jhin")
      .build();
    expect(game.p1.can("play", "jhin")).toBe(false);
  });

  // ─── (c) contrast: not countered ───────────────────────────────────────────────────────────
  test("(c) un-countered: Singularity resolves (6 to each grunt → both die), THEN Virtuoso triggers (spent 6 ≥ 4) and P1 may banish it → Singularity ends in BANISHMENT; Jhin's [mind] play is likewise available", async () => {
    const game = await board().build();
    await game.p1.cast("singularity", { targets: ["gruntA", "gruntB"] });
    const asked = await drainWatchingVirtuoso(game, true);
    expect(asked).toBe(true);
    await game.settle();
    expect(game.zoneOf("gruntA")).toBe("trash");
    expect(game.zoneOf("gruntB")).toBe("trash");
    expect(game.zoneOf("singularity")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("singularity");
    expect(game.zoneOf("windwall")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 1 } });
    expect(game.p1.can("play", "jhin")).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("(c) un-countered, Virtuoso declined: Singularity simply goes to the trash (the banish is a 'you may')", async () => {
    const game = await board().build();
    await game.p1.cast("singularity", { targets: ["gruntA", "gruntB"] });
    const asked = await drainWatchingVirtuoso(game, false);
    expect(asked).toBe(true);
    await game.settle();
    expect(game.zoneOf("singularity")).toBe("trash");
    expect(game.p1.banishment()).toEqual([]);
  });

  // ─── (d) contrast: the countered spell cost only [3] ───────────────────────────────────────
  test("(d) if the only spell P1 paid for cost [3] (Void Seeker, Wind Walled), Jhin costs his full [4]: unplayable at 0 energy + 1 mind, playable once [4] is in the pool — and then the [4] is paid, the mind is not", async () => {
    const game = await scenario()
      .legend(P1, VIRTUOSO, "virtuoso")
      .resources(P1, { energy: 3, power: { fury: 1, mind: 1 } })
      .resources(P2, { energy: 3, power: { calm: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Grunt A" }, "gruntA")
      .hand(P1, VOID_SEEKER, "seeker")
      .hand(P1, JHIN_KILLER, "jhin")
      .hand(P2, WIND_WALL, "windwall")
      .build();
    await game.p1.cast("seeker", { targets: "gruntA" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, mind: 1 } });
    await game.p1.passPriority();
    await game.p2.cast("windwall", { targets: "seeker" });
    const asked = await drainWatchingVirtuoso(game, false);
    expect(asked).toBe(false); // spent 3 < 4 anyway, and countered
    await game.settle();
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.state("gruntA").damage).toBe(0);
    // Only [3] was spent on a spell this turn → no alternative cost.
    expect(game.p1.can("play", "jhin")).toBe(false);
    await game.p1.do("addResources", { energy: 4 });
    expect(game.p1.can("play", "jhin")).toBe(true);
    await game.p1.play("jhin", { to: "base" });
    await game.settle({ policy: "first" }); // Vision — any answer
    expect(game.zoneOf("jhin")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, mind: 1 } }); // full [4], mind untouched
  });

  test("(d) the condition is about the amount SPENT, not about resolution: an UN-countered Void Seeker ([3]) does not unlock the [mind] price either", async () => {
    const game = await scenario()
      .legend(P1, VIRTUOSO, "virtuoso")
      .resources(P1, { energy: 3, power: { fury: 1, mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Big Grunt" }, "big")
      .hand(P1, VOID_SEEKER, "seeker")
      .hand(P1, JHIN_KILLER, "jhin")
      .build();
    await game.p1.cast("seeker", { targets: "big" });
    await game.settle();
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.state("big").damage).toBe(4);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, mind: 1 } });
    expect(game.p1.can("play", "jhin")).toBe(false);
  });
});
