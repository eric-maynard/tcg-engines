/**
 * Interaction: Decree of Rage (ven-015-166) · Spell · Fury · 1 + [fury] · Action
 *     "This can't be countered. Deal 4 to an enemy Calm unit."
 *   × Hard Bargain (sfd-136-221) · Spell · Chaos · 2 · Reaction
 *     "[Repeat] [2] … Counter a spell unless its controller pays [2]."
 *   × Lilting Lullaby (unl-190-219) · Spell · Calm/Mind · 2 + [rainbow][rainbow] · Reaction
 *     "Counter a spell. Its controller can't play spells this turn."
 *   (contrast: Void Seeker ogn-024-298 · Spell · Fury · 3 · Action — "Deal 4 to a unit at a battlefield. Draw 1.")
 *
 * Rules: 054.1 (can't beats can), 355.8 / 355.9.b ("can't be countered" is NOT a targeting restriction —
 * only "can't be chosen" is — so Decree is a legal choice for a counterspell), 158.1 / 340.1 (spells
 * execute top-to-bottom on resolution), 359.3.e.6 (an impossible instruction is ignored), 359.3.e.14 /
 * 359.3.e.14.a (Lullaby's "Its controller can't play spells" is LINKED to "Counter a spell"; if the
 * counter is ignored the rider is ignored too), 425.1.a (a countered card does nothing → trash),
 * 425.1.c (no refunds — for the countered spell OR for a counterspell that achieved nothing).
 *
 * Question / expected:
 *   (a) P2 may legally play Hard Bargain choosing Decree and pays 2. On resolution P1 need not pay;
 *       the counter is impossible and ignored; Decree resolves, deals 4, C (4 Might) dies; HB → trash.
 *   (b) Lullaby is likewise playable/paid; its counter is ignored AND the linked lock-out is ignored:
 *       Decree resolves, P1 may still play spells this turn.
 *   (c) Against Void Seeker both work normally: HB → pay [2] or be countered (no damage, no draw, no
 *       refund); Lullaby → countered AND P1 can't play spells this turn (units still fine).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DECREE = "ven-015-166";
const HARD_BARGAIN = "sfd-136-221";
const LULLABY = "unl-190-219";
const VOID_SEEKER = "ogn-024-298";

/** A cheap follow-up spell for P1 — the probe for "can't play spells this turn". */
const PING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Ping",
  rulesText: "Deal 1 to a unit.",
  timing: "action",
} as const;
const GUY = { cardType: "unit", domain: "fury", energyCost: 1, might: 1, name: "Guy" } as const;

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1 (turn player): 8 energy + 1 fury; a 2-Might Pal in base (Ping fodder); hand Decree, Void Seeker,
 * Ping (spell probe), Guy (unit probe).
 * P2: 4 energy + rainbow×2; hand Hard Bargain + Lilting Lullaby; controls bf1 with C, a 4-Might CALM unit.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .resources(P1, { energy: 8, power: { fury: 1 } })
    .resources(P2, { energy: 4, power: { rainbow: 2 } })
    .unit(P2, "bf1", { domain: "calm", might: 4, name: "Calm Sentinel" }, "c")
    .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
    .hand(P1, DECREE, "decree")
    .hand(P1, VOID_SEEKER, "seeker")
    .hand(P1, PING, "ping")
    .hand(P1, GUY, "guy")
    .hand(P2, HARD_BARGAIN, "hb")
    .hand(P2, LULLABY, "lullaby");
}

/** P1 casts `spell` at C and passes; P2 answers with `counter` choosing it. Chain = [spell, counter], P2 has priority. */
async function castAndCounter(game: Game, spell: "decree" | "seeker", counter: "hb" | "lullaby"): Promise<void> {
  await game.p1.cast(spell, { targets: "c" });
  await game.p1.passPriority();
  expect(game.p2.can("cast", counter)).toBe(true);
  await game.p2.cast(counter, { targets: spell });
  expect(game.chain().map((i) => i.cardId)).toEqual([spell, counter]);
}

function counterTargetsOffered(game: Game, counter: "hb" | "lullaby"): string[] {
  const field = game.p2.option("cast", counter)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

describe("Decree of Rage ('can't be countered') × Hard Bargain / Lilting Lullaby", () => {
  // ── (a) Hard Bargain vs Decree ────────────────────────────────────────────────────────────────

  test("(a) with Decree on the chain, Hard Bargain IS playable and Decree is offered as its choice — 'can't be countered' is not 'can't be chosen' (355.8 / 355.9.b); P2 really pays 2", async () => {
    const game = await board().build();
    await game.p1.cast("decree", { targets: "c" });
    expect(game.p1.resources()).toEqual({ energy: 7, power: { fury: 0 } });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "hb")).toBe(true);
    expect(counterTargetsOffered(game, "hb")).toEqual(["decree"]);
    await game.p2.cast("hb", { targets: "decree" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["decree", "hb"]);
    expect(game.p2.energy()).toBe(2);
    expect(game.zoneOf("hb")).toBe("chain");
  });

  test("(a) Hard Bargain resolves: P1 does not pay (declines if asked), the counter is impossible and ignored — Decree stays on the chain, P1's pool untouched, HB → trash unrefunded (054.1, 359.3.e.6, 425.1.c)", async () => {
    const game = await board().build();
    await castAndCounter(game, "decree", "hb");
    await game.p2.passPriority();
    await game.p1.passPriority(); // HB resolves
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      await game.p1.no();
    }
    expect(game.chain().map((i) => i.cardId)).toEqual(["decree"]);
    expect(game.chain()[0]?.countered).toBe(false);
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.p1.energy()).toBe(7);
    expect(game.p2.energy()).toBe(2);
  });

  test("(a) …then Decree resolves: 4 damage kills the 4-Might Calm unit; Decree → trash", async () => {
    const game = await board().build();
    await castAndCounter(game, "decree", "hb");
    game.script(P1, [(d) => (d.kind === "yes-no" ? false : undefined)]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("c")).toBe("trash");
    expect(game.zoneOf("decree")).toBe("trash");
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.p1.energy()).toBe(7); // never paid the ransom
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) Lilting Lullaby vs Decree ─────────────────────────────────────────────────────────────

  test("(b) Lullaby IS playable choosing Decree and is paid for (2 + [rainbow][rainbow]); on resolution the counter is ignored: Decree resolves and kills C, Lullaby → trash (359.3.e.6, 425.1.c)", async () => {
    const game = await board().build();
    await game.p1.cast("decree", { targets: "c" });
    await game.p1.passPriority();
    expect(counterTargetsOffered(game, "lullaby")).toEqual(["decree"]);
    await game.p2.cast("lullaby", { targets: "decree" });
    expect(game.p2.resources()).toEqual({ energy: 2, power: { rainbow: 0 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["decree", "lullaby"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("lullaby")).toBe("trash");
    expect(game.zoneOf("decree")).toBe("trash");
    expect(game.zoneOf("c")).toBe("trash");
  });

  // Expected: "Its controller can't play spells this turn" is linked to "Counter a spell"; the counter
  // was ignored (Decree can't be countered), so the lock-out is ignored too (359.3.e.14.a) and P1 may
  // still cast Ping. Actual: the engine records Decree as the counter's victim even though it was not
  // countered and sets cannotPlaySpellsThisTurn[P1] — Ping (and every other P1 spell) is refused.
  test("(b) after Lullaby fails to counter Decree, P1 must still be able to play spells this turn — the linked rider is ignored with the ignored counter (359.3.e.14.a)", async () => {
    const game = await board().build();
    await castAndCounter(game, "decree", "lullaby");
    await game.settle();
    expect(game.zoneOf("c")).toBe("trash"); // Decree did resolve
    expect(game.p1.energy()).toBe(7);
    expect(game.gameState.cannotPlaySpellsThisTurn?.[P1]).toBeUndefined();
    expect(game.p1.can("cast", "ping")).toBe(true);
    await game.p1.cast("ping", { targets: "pal" });
    await game.settle();
    expect(game.state("pal").damage).toBe(1);
  });

  test("(b) the lock-out question aside, units are never affected: P1 can still play Guy after Lullaby resolves", async () => {
    const game = await board().build();
    await castAndCounter(game, "decree", "lullaby");
    await game.settle();
    expect(game.p1.can("play", "guy")).toBe(true);
    await game.p1.play("guy");
    await game.settle();
    expect(game.zoneOf("guy")).toBe("base");
  });

  // ── (c) contrast: the same counters against Void Seeker ──────────────────────────────────────

  test("(c) Hard Bargain vs Void Seeker, P1 PAYS [2] at resolution: Seeker survives → 4 damage kills C, P1 draws 1; P1 energy 8−3−2 = 3", async () => {
    const game = await board().build();
    await castAndCounter(game, "seeker", "hb");
    expect(game.p1.energy()).toBe(5);
    await game.p2.passPriority();
    await game.p1.passPriority(); // HB resolves → ransom prompt
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "hb" } });
    await game.p1.yes();
    expect(game.p1.energy()).toBe(3);
    expect(game.chain().map((i) => i.cardId)).toEqual(["seeker"]);
    const hand = game.p1.hand().length;
    await game.settle();
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.zoneOf("c")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand + 1);
  });

  test("(c) Hard Bargain vs Void Seeker, P1 DECLINES: Seeker is countered → trash, no damage, no draw, its 3 energy not refunded (425.1.a, 425.1.c)", async () => {
    const game = await board().build();
    await castAndCounter(game, "seeker", "hb");
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    const hand = game.p1.hand().length;
    await game.p1.no();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.zoneOf("c")).toBe("battlefield-bf1");
    expect(game.state("c").damage).toBe(0);
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.p1.energy()).toBe(5);
  });

  test("(c) Lullaby vs Void Seeker: countered (no damage, no draw) AND P1 can't play spells for the rest of the turn — Ping and Decree refused, the unit Guy still playable", async () => {
    const game = await board().build();
    await castAndCounter(game, "seeker", "lullaby");
    const hand = game.p1.hand().length;
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.zoneOf("lullaby")).toBe("trash");
    expect(game.state("c").damage).toBe(0);
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.p1.energy()).toBe(5); // plenty left, yet:
    expect(game.p1.can("cast", "ping")).toBe(false);
    expect(game.p1.can("cast", "decree")).toBe(false);
    await expect(game.p1.cast("ping", { targets: "c" })).rejects.toThrow();
    expect(game.p1.can("play", "guy")).toBe(true);
  });

  test("(c) Lullaby's lock-out lasts only 'this turn': on P1's next turn spells are castable again", async () => {
    const game = await board().build();
    await castAndCounter(game, "seeker", "lullaby");
    await game.settle();
    expect(game.p1.can("cast", "ping")).toBe(false);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 1 });
    expect(game.p1.can("cast", "ping")).toBe(true);
  });
});
