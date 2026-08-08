/**
 * Interaction: Noxian Guillotine (ogn-254-298) · Action spell · Fury/Order · 4 + one printed [C] pip
 *     "Choose a unit. Kill it the next time it takes damage this turn. [Legion] — Kill it now instead."
 *   × Pouty Poro (ogn-013-298) · 2-Might Fury unit · "[Deflect] (Opponents must pay [rainbow] to
 *     choose me with a spell or ability.)"
 *   × Gold token (sfd-t03) · gear · "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]."
 *
 * Question: P1 aims Guillotine at P2's Pouty Poro (at a battlefield); P1 may also control one Gold
 * token (ready or exhausted). Which pools make the cast legal and what pays what?
 *   (i)   {4, fury:1}  no Gold          → Poro illegal (nothing for Deflect); vanilla enemy legal.
 *   (ii)  {4, fury:1}  + ready Gold     → legal: fury→[C], Gold's [A]→Deflect; −4 E, −1 fury, Gold gone.
 *   (iii) {4, calm:1}  + ready Gold     → legal: Gold's [A]→the hybrid [C] pip, calm→Deflect.
 *   (iv)  {4, calm:2}  no Gold, Poro    → illegal: calm pays Deflect but cannot pay [fury|order].
 *   (v)   {4, calm:2}  no Gold, vanilla → ALSO illegal (discriminates a "generic rainbow" pip engine).
 * Can Gold be cracked mid-payment? By the rules yes (357.1.a / 429.3), but by DESIGN (DESIGN.md §Paying
 * costs) the engine pays manually: Gold must be cracked BEFORE the play is initiated (needs a READY Gold since
 * its cost includes [Exhaust]). Does Legion change the cost (no — only the effect, 812.1.c)?
 *
 * Rules: 135.2.e.6.c ([C] on a two-domain card = power of either of ITS domains — Defiant Dance
 * example), 135.2.e.5.a/b ([A] as a cost = any domain; [A] ADDED to the pool pays a pip of any domain,
 * hybrid included), 809.1.c/.c.1 + 356.2.a.2 (Deflect = mandatory additional +1 power of ANY domain
 * per choice by an opponent), 357.1.a + 429.3/.3.a (Reaction [Add] abilities are usable inside the Pay
 * step and resolve immediately), 355.8/358.2 (unpayable choice ⇒ not a valid target ⇒ cannot be put on
 * the chain), 812.1.c (Legion = another card finalized earlier this turn), 186.1 (a killed token ceases
 * to exist).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUILLOTINE = "ogn-254-298";
const POUTY_PORO = "ogn-013-298";
const GOLD = "sfd-t03";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Flatten the `targets` field of P1's cast option into the set of card ids offered. */
function targetsOffered(game: Game, alias: string): string[] {
  const opt = game.p1.option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

interface BoardOpts {
  readonly power: Record<string, number>;
  /** undefined = no Gold; "ready" / "exhausted" = one Gold token in P1's base in that state (aliased
   * `token-gold`: the engine recognises tokens by their `token-` id prefix, rule 186.1). */
  readonly gold?: "ready" | "exhausted";
}

/**
 * P2 holds bf1 with Pouty Poro (Deflect) and a vanilla 2-Might grunt. P1 has 4 energy + `power`,
 * Guillotine in hand, a 0-cost recruit (to switch Legion on when wanted) and optionally one Gold.
 */
function board(opts: BoardOpts) {
  let s = scenario()
    .resources(P1, { energy: 4, power: opts.power })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", POUTY_PORO, "poro")
    .unit(P2, "bf1", { might: 2, name: "Vanilla Grunt" }, "vanilla")
    .hand(P1, { energyCost: 0, might: 1, name: "Cheap Recruit" }, "recruit")
    .hand(P1, GUILLOTINE, "ng");
  if (opts.gold) {
    s = s.gear(P1, GOLD, "token-gold", opts.gold === "exhausted" ? { exhausted: true } : undefined);
  }
  return s;
}

describe("Noxian Guillotine × Pouty Poro × Gold — hybrid [C] pip vs Deflect's any-domain pip vs added [A]", () => {
  test("setup: Guillotine is a Fury/Order card with exactly one printed power pip; the Poro has Deflect", async () => {
    const game = await board({ power: { fury: 1 } }).build();
    const ng = game.state("ng");
    expect([...ng.domains].sort()).toEqual(["fury", "order"]);
    expect(ng.energyCost).toBe(4);
    expect(ng.powerCost).toHaveLength(1);
    expect(game.state("poro").keywords).toContain("Deflect");
  });

  // ── (i) {4, fury:1}, no Gold ────────────────────────────────────────────────────────────

  test("(i) {4, fury:1} no Gold: fury pays the [C] pip but nothing is left for Deflect → the Poro is NOT offered and a cast at it is rejected (809.1.c, 355.8)", async () => {
    const game = await board({ power: { fury: 1 } }).build();
    const offered = targetsOffered(game, "ng");
    expect(offered).toContain("vanilla");
    expect(offered).not.toContain("poro");
    await expect(game.p1.cast("ng", { targets: "poro" })).rejects.toThrow();
    expect(game.zoneOf("ng")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1 } }); // nothing spent on a refused play
  });

  test("(i) {4, fury:1} no Gold: the same pool IS enough for a non-Deflect enemy unit — pays exactly 4 energy + the fury", async () => {
    const game = await board({ power: { fury: 1 } }).build();
    await game.p1.cast("ng", { targets: "vanilla" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ng", controller: P1 })]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("ng")).toBe("trash");
    // No Legion (first card this turn) → vanilla is alive with a delayed kill armed on it.
    expect(game.locationOf("vanilla")).toBe("bf1");
  });

  test("(i′) {4, order:1} works exactly like fury for the hybrid pip — ORDER is Guillotine's other domain (135.2.e.6.c)", async () => {
    const game = await board({ power: { order: 1 } }).build();
    expect(targetsOffered(game, "ng")).toContain("vanilla");
    await game.p1.cast("ng", { targets: "vanilla" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  });

  // ── (ii) {4, fury:1} + Gold ─────────────────────────────────────────────────────────────

  test("(ii) {4, fury:1} + ready Gold cracked BEFORE initiating the play: the added [A] pays Deflect, fury pays [C] → legal; −4 energy, −1 fury, −1 [A], Gold token ceases to exist (429.3, 135.2.e.5.b, 186.1)", async () => {
    const game = await board({ gold: "ready", power: { fury: 1 } }).build();
    expect(game.p1.can("activate", "token-gold")).toBe(true); // Reaction-speed Add on your own turn, open state
    await game.p1.activate("token-gold", 0, { sacrifice: "token-gold" });
    expect(game.chain()).toHaveLength(0); // Add abilities never use the chain (429.3.a)
    expect(game.has("token-gold")).toBe(false); // killed token → non-board zone → ceases to exist
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1, rainbow: 1 } });

    expect(targetsOffered(game, "ng")).toContain("poro");
    await game.p1.cast("ng", { targets: "poro" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ng" })]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, rainbow: 0 } });
    await game.settle();
    expect(game.zoneOf("ng")).toBe("trash");
    expect(game.locationOf("poro")).toBe("bf1"); // no Legion: delayed kill only
  });

  // DESIGN (DESIGN.md §Paying costs): manual pay — deliberate deviation from 357.1.a. Affordability (and so the
  // set of legal Deflect targets) is POOL-ONLY: a READY Gold that has not been cracked yet is not credited. The
  // player cracks Gold first (previous test), then the Poro is offered.
  test("DESIGN (manual pay, deviates from 357.1.a/429.3): (ii) {4, fury:1} + READY Gold still on the board — the Poro is NOT yet offered and a cast at it is refused with nothing spent; cracking Gold first makes it legal", async () => {
    const game = await board({ gold: "ready", power: { fury: 1 } }).build();
    expect(game.state("token-gold").isReady).toBe(true);
    expect(targetsOffered(game, "ng")).not.toContain("poro");
    expect(targetsOffered(game, "ng")).toContain("vanilla");
    expect((await game.p1.try((p) => p.cast("ng", { targets: "poro" }))).ok).toBe(false);
    expect(game.zoneOf("ng")).toBe("hand");
    expect(game.has("token-gold")).toBe(true); // Gold was not auto-cracked
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1 } });
    // Manual path: crack Gold → [A] in the pool → Poro offered.
    await game.p1.activate("token-gold", 0, { sacrifice: "token-gold" });
    expect(targetsOffered(game, "ng")).toContain("poro");
    expect((await game.p1.try((p) => p.cast("ng", { targets: "poro" }))).ok).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, rainbow: 0 } });
  });

  test("(ii′) an EXHAUSTED Gold cannot be cracked at all — its cost includes [Exhaust] — so it can never fund Deflect and the Poro stays illegal", async () => {
    const game = await board({ gold: "exhausted", power: { fury: 1 } }).build();
    expect(game.state("token-gold").isExhausted).toBe(true);
    expect(game.p1.can("activate", "token-gold")).toBe(false);
    await expect(game.p1.activate("token-gold", 0, { sacrifice: "token-gold" })).rejects.toThrow();
    expect(targetsOffered(game, "ng")).not.toContain("poro");
    await expect(game.p1.cast("ng", { targets: "poro" })).rejects.toThrow();
    expect(game.zoneOf("token-gold")).toBe("base");
  });

  // ── (iii) {4, calm:1} + Gold ────────────────────────────────────────────────────────────

  test("(iii) {4, calm:1} + Gold: the ADDED [A] pays the hybrid [C] pip and calm pays Deflect → legal; pool fully drained (135.2.e.5.b, 809.1.c.1)", async () => {
    const game = await board({ gold: "ready", power: { calm: 1 } }).build();
    // Before cracking: calm alone can pay neither role fully (it could pay Deflect, never the [C] pip).
    expect(game.p1.can("cast", "ng")).toBe(false);
    await game.p1.activate("token-gold", 0, { sacrifice: "token-gold" });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { calm: 1, rainbow: 1 } });
    const offered = targetsOffered(game, "ng");
    expect(offered).toContain("poro");
    expect(offered).toContain("vanilla");
    await game.p1.cast("ng", { targets: "poro" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ng" })]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, rainbow: 0 } });
  });

  test("(iii′) {4, calm:1} + cracked Gold aimed at the VANILLA unit: only the [C] pip is owed — the [A] pays it and the calm is left over", async () => {
    const game = await board({ gold: "ready", power: { calm: 1 } }).build();
    await game.p1.activate("token-gold", 0, { sacrifice: "token-gold" });
    await game.p1.cast("ng", { targets: "vanilla" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 1, rainbow: 0 } });
  });

  // ── (iv)/(v) {4, calm:2}, no Gold ───────────────────────────────────────────────────────

  test("(iv) {4, calm:2} no Gold, target the Poro: calm could pay Deflect but neither calm can pay [fury|order] → illegal (135.2.e.6.c)", async () => {
    const game = await board({ power: { calm: 2 } }).build();
    expect(targetsOffered(game, "ng")).not.toContain("poro");
    await expect(game.p1.cast("ng", { targets: "poro" })).rejects.toThrow();
    expect(game.zoneOf("ng")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { calm: 2 } });
  });

  test("(v) {4, calm:2} no Gold, target the VANILLA unit: also illegal — the printed pip is hybrid fury|order, not a true any-domain [A]; Guillotine is not castable at all", async () => {
    const game = await board({ power: { calm: 2 } }).build();
    expect(game.p1.can("cast", "ng")).toBe(false);
    expect(targetsOffered(game, "ng")).toEqual([]);
    await expect(game.p1.cast("ng", { targets: "vanilla" })).rejects.toThrow();
    expect(game.zoneOf("ng")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { calm: 2 } });
  });

  test("(v′) control: pooled [A] with NO Gold and no fury/order ({4, rainbow:1}) does pay the hybrid pip for the vanilla target — added [A] is universal (135.2.e.5.b) — but one [A] cannot cover pip + Deflect for the Poro", async () => {
    const game = await board({ power: { rainbow: 1 } }).build();
    const offered = targetsOffered(game, "ng");
    expect(offered).toContain("vanilla");
    expect(offered).not.toContain("poro");
    await game.p1.cast("ng", { targets: "vanilla" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });

  // ── Legion: effect only, never cost ─────────────────────────────────────────────────────

  test("Legion active changes nothing about the cost: {4, fury:1} no Gold still cannot reach the Poro, and the vanilla cast still drains exactly 4 + fury (812.1.c)", async () => {
    const game = await board({ power: { fury: 1 } }).build();
    await game.p1.play("recruit");
    await game.settle();
    expect(game.zoneOf("recruit")).toBe("base");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1); // another card finalized → Legion on
    expect(targetsOffered(game, "ng")).not.toContain("poro");
    await expect(game.p1.cast("ng", { targets: "poro" })).rejects.toThrow();
    await game.p1.cast("ng", { targets: "vanilla" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    // …but the EFFECT is swapped: "Kill it now instead".
    expect(game.zoneOf("vanilla")).toBe("trash");
    expect(game.gameState.activeReplacements ?? []).toHaveLength(0);
  });

  test("Legion active, {4, calm:2} no Gold: still not castable at anything — Legion grants no discount and no domain leniency", async () => {
    const game = await board({ power: { calm: 2 } }).build();
    await game.p1.play("recruit");
    await game.settle();
    expect(game.p1.can("cast", "ng")).toBe(false);
    await expect(game.p1.cast("ng", { targets: "vanilla" })).rejects.toThrow();
  });

  // ── Resolution: delayed kill vs kill now on the Deflect Poro ────────────────────────────

  test("resolution WITHOUT Legion on the Poro (paid via pre-cracked Gold): the Poro survives with a delayed 'kill the next time it takes damage' armed on it", async () => {
    const game = await board({ gold: "ready", power: { fury: 1 } }).build();
    await game.p1.activate("token-gold", 0, { sacrifice: "token-gold" });
    await game.p1.cast("ng", { targets: "poro" });
    await game.settle();
    expect(game.zoneOf("ng")).toBe("trash");
    expect(game.locationOf("poro")).toBe("bf1");
    expect(game.state("poro").damage).toBe(0);
    const armed = (game.gameState.activeReplacements ?? []) as { replaces?: string; sourceCardId?: string; targetCardIds?: string[] }[];
    expect(armed).toEqual([expect.objectContaining({ replaces: "take-damage", sourceCardId: "ng", targetCardIds: ["poro"] })]);
  });

  test("resolution WITH Legion on the Poro (recruit first, Gold pre-cracked): the Poro dies immediately, no delayed kill left behind; cost was still 4 + fury + [A] for Deflect", async () => {
    const game = await board({ gold: "ready", power: { fury: 1 } }).build();
    await game.p1.play("recruit");
    await game.settle();
    await game.p1.activate("token-gold", 0, { sacrifice: "token-gold" });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1, rainbow: 1 } });
    await game.p1.cast("ng", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, rainbow: 0 } });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.locationOf("vanilla")).toBe("bf1"); // only the chosen unit
    expect(game.gameState.activeReplacements ?? []).toHaveLength(0);
    expect(game.violations()).toEqual([]);
  });
});
