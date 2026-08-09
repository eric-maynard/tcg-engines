/**
 * Interaction: two different XP "costs" inside triggered abilities.
 *   Kha'Zix, Evolving Hunter (unl-119-219) · Champion Unit · Body · 5+[body] · 5 Might
 *     "[Hunt] When I attack, you may spend 3 XP to deal damage equal to my Might to an enemy unit here."
 *   × Insightful Investigator (unl-135-219) · Unit · Chaos · 3 · 3 Might
 *     "When you play me, choose an opponent. They reveal their hand. You may pay 2 XP to choose a
 *      card from their hand. If you do, they discard that card and draw 1."
 *   × Flash (ogs-011-024) · Spell · Chaos · 2 · [Reaction] "Move up to 2 friendly units to base."
 *
 * Question. P1 has 5 XP. (a) Kha'Zix attacks P2's lone 4-Might unit at bf1 and P1 opts in: when
 * are the 3 XP spent and the target chosen? P2 responds with Flash pulling the unit to base — does
 * the ability do anything, is the XP refunded, what happens to the combat? (b) With only 2 XP is P1
 * even asked? (c) P1 (2 XP) plays Insightful Investigator: does the trigger need any decision or
 * payment to go on the chain; does P2 get priority before or after the reveal; does P1 decide to pay
 * before or after seeing the hand? (d) Same with 1 XP.
 *
 * Rules: 383.3.a / 383.3.b / 383.3.b.1 / 740.4.a.2 / 204.3.a (leading "you may" + "spend 3 XP to …"
 * = opt-in AND base cost, both settled at FINALIZATION); 402.2 (targets chosen at finalization);
 * 404.1 (costs paid at finalization) / 404.2 (unpayable → removed, never finalized); 406.4 (then the
 * opponent may React); 359.3.e.2 / 359.3.e.5 / 359.3.f.2 ("enemy unit HERE" re-checked on execution
 * → moved to base = illegal → instruction ignored); 425.1.c (paid costs are never refunded); 465.1 /
 * 466.3.a (no defender left → no damage step, attacker wins) + 823 (Hunt on conquer).
 * Investigator: 383.3.b (its own second example!) / 383.3.a.3 / 204.3.b / 740.4.a.2.a — "pay 2 XP"
 * sits in a LATER instruction → paid on RESOLUTION, the ability always finalizes; 444.2 / 444.2.b /
 * 359.3.e.14.a (can't/won't pay → the "If you do" branch is skipped, the reveal still happened).
 *
 * Expected: (a) opt-in + target at finalization, 3 XP spent immediately (5→2) before P2 holds
 * priority; Flash resolves first; Kha'Zix's damage instruction is ignored (unit no longer "here"), XP
 * NOT refunded; no defender → Kha'Zix conquers bf1 untouched, +1 point, Hunt → 3 XP. (b) no prompt at
 * all, nothing on the chain. (c) trigger finalizes with no decision and no payment; P2 gets priority
 * BEFORE the hand is revealed; on resolution P2 reveals, THEN P1 (seeing the hand) may pay 2 XP and
 * pick → discard + P2 draws 1. (d) hand still revealed; nothing can be picked; no discard, no draw.
 */
import { describe, expect, test } from "bun:test";
import type { CardView, Game } from "../../../harness";
import { isHiddenView, P1, P2, scenario } from "../../../harness";

const KHAZIX = "unl-119-219";
const INVESTIGATOR = "unl-135-219";
const FLASH = "ogs-011-024";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit — the "other" card in P2's hand

// ---- (a)/(b) Kha'Zix attacks; P2 holds Flash -------------------------------------------------

/** P1 (`xp`) has Kha'Zix ready in base; P2 controls bf1 with a lone 4-Might Foe and holds Flash (2 energy ready). */
function huntBoard(xp: number) {
  return scenario()
    .xp(P1, xp)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Foe" }, "foe")
    .unit(P1, "base", KHAZIX, "kz")
    .resources(P2, { energy: 2 })
    .hand(P2, FLASH, "flash");
}

/** Kha'Zix attacks bf1, P1 opts in (lone enemy → auto-bound target), P1 passes, P2 Flashes Foe home. */
async function attackOptInFlash(): Promise<Game> {
  const game = await huntBoard(5).build();
  await game.p1.move("kz", "bf1");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  await game.p2.cast("flash", { targets: "foe" });
  return game;
}

/** Both players pass once → the newest chain item resolves. */
async function resolveTop(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
}

// ---- (c)/(d) Investigator ---------------------------------------------------------------------

/** P1 (`xp`, 3 energy) holds Investigator; P2 holds Flash + a Skulker, has 2 energy and a unit out at bf1 (a real Flash target). */
function sleuthBoard(xp: number) {
  return scenario()
    .xp(P1, xp)
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Scout" }, "scout")
    .hand(P1, INVESTIGATOR, "inv")
    .hand(P2, FLASH, "flash")
    .hand(P2, SKULKER, "skulk");
}

/** P2's hand exactly as P1 is allowed to see it right now. */
function p2HandSeenByP1(game: Game): CardView[] {
  return (game.p1.view().zones.hand ?? []).filter((c) => c.owner === P2);
}

describe("Kha'Zix 'you may spend 3 XP to …' — opt-in, target and cost at FINALIZATION; Flash makes it fizzle, XP gone", () => {
  test("(a) the opt-in is put to P1 at finalization (timing FIN, 'yes' available) with the trigger pending and before P2 has held priority", async () => {
    const game = await huntBoard(5).build();
    await game.p1.move("kz", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kz", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "kz" }, timing: "FIN" });
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.xp()).toBe(5); // nothing spent before the choice is made
  });

  test("(a) step 2 — the enemy unit 'here' is chosen (bound as the target) at finalization, before P2 gets priority (402.2)", async () => {
    const game = await huntBoard(5).build();
    await game.p1.move("kz", "bf1");
    await game.p1.yes(); // lone legal enemy here → auto-bound, no separate pick
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kz", targets: ["foe"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // P1 holds priority first
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // only now may P2 react (406.4)
  });

  // Expected (383.3.b, 740.4.a.2, 404.1): "spend 3 XP" right after the leading "you may" is the
  // trigger's BASE COST, paid at finalization → P1 is at 2 XP before anyone holds priority.
  // Actual: the engine models "spend 3 XP" as the first step of the resolving effect, so XP is
  // still 5 while the item waits on the chain and is only deducted on resolution.
  test("BUG: (a) step 4 — the 3 XP are spent AT FINALIZATION (5 → 2) before P2 ever holds priority (404.1, 740.4.a.2)", async () => {
    const game = await huntBoard(5).build();
    await game.p1.move("kz", "bf1");
    await game.p1.yes();
    expect(game.p1.xp()).toBe(2);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.xp()).toBe(2);
  });

  test("(a) P2 may respond with Flash targeting the chosen Foe; the chain is [Kha'Zix trigger, Flash] and Flash (newest) resolves first: Foe is in base while the trigger still waits", async () => {
    const game = await attackOptInFlash();
    expect(game.chain().map((i) => [i.name, i.controller])).toEqual([
      ["Kha'Zix, Evolving Hunter", P1],
      ["Flash", P2],
    ]);
    expect(game.p2.energy()).toBe(0);
    await resolveTop(game); // Flash
    expect(game.locationOf("foe")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kz", targets: ["foe"] })]);
    expect(game.zoneOf("flash")).toBe("trash");
  });

  test("(a) on resolution Foe is no longer an 'enemy unit HERE' → the damage instruction is ignored: Foe takes 0, and the XP is NOT refunded (P1 at 2)", async () => {
    const game = await attackOptInFlash();
    await resolveTop(game); // Flash
    await resolveTop(game); // Kha'Zix's trigger
    expect(game.chain()).toEqual([]);
    expect(game.state("foe")).toMatchObject({ damage: 0, location: "base" });
    expect(game.zoneOf("foe")).toBe("base");
    expect(game.p1.xp()).toBe(2); // 5 − 3, nothing given back (425.1.c by analogy)
  });

  test("(a) combat: no defending unit remains → no damage step; Kha'Zix wins, conquers bf1 undamaged (+1 point) and Hunt pays 1 XP (2 → 3)", async () => {
    const game = await attackOptInFlash();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.locationOf("kz")).toBe("bf1");
    expect(game.state("kz").damage).toBe(0);
    expect(game.state("foe")).toMatchObject({ damage: 0, location: "base" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("(b) only 2 XP: the cost is unpayable → the trigger never becomes a chain item and P1 is not asked anything (404.2); XP stays 2 through the showdown", async () => {
    const game = await huntBoard(2).build();
    await game.p1.move("kz", "bf1");
    expect(game.chain()).toEqual([]);
    expect(game.decision()?.kind).not.toBe("yes-no");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
    expect(game.p1.xp()).toBe(2);
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.p1.xp()).toBeGreaterThanOrEqual(2); // never spent (Hunt may add 1 once the 5-vs-4 combat conquers)
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash"); // died to 5 combat damage only
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.xp()).toBe(3); // 2 untouched + Hunt
  });
});

describe("Insightful Investigator 'You may pay 2 XP …' in a LATER instruction — always finalizes, P2 reacts before the reveal, P1 pays with full information", () => {
  test("(c) playing her puts the trigger on the chain with NO decision and NO payment: P1 simply holds priority, XP still 2", async () => {
    const game = await sleuthBoard(2).build();
    await game.p1.play("inv");
    expect(game.zoneOf("inv")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "inv", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.decision()?.kind).not.toBe("yes-no");
    expect(game.p1.xp()).toBe(2);
  });

  test("(c) P2 gets priority BEFORE anything is revealed: while P2 holds priority (and may Flash), P2's hand is still hidden from P1 (406.4)", async () => {
    const game = await sleuthBoard(2).build();
    await game.p1.play("inv");
    expect(p2HandSeenByP1(game).every(isHiddenView)).toBe(true);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "flash")).toBe(true);
    const seen = p2HandSeenByP1(game);
    expect(seen).toHaveLength(2);
    expect(seen.every(isHiddenView)).toBe(true);
    expect(game.p1.xp()).toBe(2);
  });

  test("(c) on resolution P2's hand is revealed FIRST, then P1 — now seeing Flash + Skulker — is asked whether to pay/pick (timing RES, declinable), XP still unpaid", async () => {
    const game = await sleuthBoard(2).build();
    await game.p1.play("inv");
    await resolveTop(game);
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, semantics: "from-revealed", source: { cardId: "inv" }, timing: "RES" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["flash", "skulk"]);
    const seen = p2HandSeenByP1(game);
    expect(seen).toHaveLength(2);
    expect(seen.some(isHiddenView)).toBe(false); // identities visible to P1 now
    expect(game.p1.xp()).toBe(2); // the 2 XP are paid only if P1 goes through with the pick
  });

  test("(c) paying: P1 picks the Skulker → 2 XP spent (→0), P2 discards it and P2 (not P1) draws 1", async () => {
    const game = await sleuthBoard(2).build();
    const p2Deck = game.p2.deck().length;
    await game.p1.play("inv");
    await resolveTop(game);
    await game.p1.pick("skulk");
    await game.settle();
    expect(game.p1.xp()).toBe(0);
    expect(game.zoneOf("skulk")).toBe("trash");
    expect(game.p2.trash()).toContain("skulk");
    expect(game.p2.hand()).toHaveLength(2); // flash + the drawn card
    expect(game.p2.hand()).toContain("flash");
    expect(game.p2.deck()).toHaveLength(p2Deck - 1);
    expect(game.p1.hand()).toEqual([]);
    expect(game.chain()).toEqual([]);
  });

  test("(c) declining after seeing the hand costs nothing: XP 2, no discard, no draw", async () => {
    const game = await sleuthBoard(2).build();
    const p2Deck = game.p2.deck().length;
    await game.p1.play("inv");
    await resolveTop(game);
    await game.p1.decline();
    await game.settle();
    expect(game.p1.xp()).toBe(2);
    expect(game.p2.hand().sort()).toEqual(["flash", "skulk"]);
    expect(game.p2.deck()).toHaveLength(p2Deck);
  });

  test("(c) contrast with Kha'Zix: P2 using its reaction window (Flash) cannot waste P1's XP — by resolution the revealed hand is just [Skulker], and P1 pays 2 XP knowing exactly what it buys", async () => {
    const game = await sleuthBoard(2).build();
    await game.p1.play("inv");
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: "scout" });
    expect(game.chain().map((i) => i.name)).toEqual(["Insightful Investigator", "Flash"]);
    await resolveTop(game); // Flash
    expect(game.locationOf("scout")).toBe("base");
    expect(game.p1.xp()).toBe(2); // still nothing paid
    await resolveTop(game); // Investigator trigger
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "RES" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["skulk"]);
    await game.p1.pick("skulk");
    await game.settle();
    expect(game.p1.xp()).toBe(0);
    expect(game.zoneOf("skulk")).toBe("trash");
  });

  test("(d) 1 XP: the trigger still finalizes and P2 still gets priority first; on resolution the hand IS revealed to P1 but no card can be picked", async () => {
    const game = await sleuthBoard(1).build();
    await game.p1.play("inv");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "inv", triggered: true })]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(p2HandSeenByP1(game).every(isHiddenView)).toBe(true);
    await game.p2.passPriority();
    // revealed: P1 sees both identities …
    const seen = p2HandSeenByP1(game);
    expect(seen).toHaveLength(2);
    expect(seen.some(isHiddenView)).toBe(false);
    // … but cannot pay 2 XP, so nothing is choosable (444.2.b)
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options).toEqual([]);
      expect(d.allowDecline).toBe(true);
      expect((await game.p1.try((p) => p.pick("skulk"))).ok).toBe(false);
    }
  });

  test("(d) 1 XP: 'If you do' branch skipped — XP stays 1, P2 keeps both cards, P2 draws nothing (359.3.e.14.a)", async () => {
    const game = await sleuthBoard(1).build();
    const p2Deck = game.p2.deck().length;
    await game.p1.play("inv");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p1.xp()).toBe(1);
    expect(game.p2.hand().sort()).toEqual(["flash", "skulk"]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.p2.deck()).toHaveLength(p2Deck);
    expect(game.zoneOf("inv")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
