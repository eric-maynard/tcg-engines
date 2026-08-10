/**
 * Interaction: Challenge (ogn-128-298) · Spell · Body · 2 + [body] · Action
 *     "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *   × Frigid Touch (sfd-066-221) · Spell · Mind · 2 · Reaction · "[Repeat] [2] … Give a unit -2 [Might] this turn."
 *   × Imperial Decree (ogn-221-298) · Spell · Order · 5 + [order][order] · Action
 *     "When any unit takes damage this turn, kill it."
 *   (+ two inline "Kill Ledger" gear — "When you kill a unit, draw 1." — one per player, as the kill-credit oracle)
 *
 * Board: P1's turn; P1 has already RESOLVED Imperial Decree this turn. P1's F (4 Might) in base, P2's E (2 Might)
 * at bf1. P1 casts Challenge (F vs E).
 *
 * Question:
 *   (a) In response Frigid Touch lands on E (−2 Might, no floor) so E is 0 Might when Challenge resolves. Does E
 *       "deal 0" to F — is F dealt damage, does Decree fire on F, does F die? What happens to E, who is credited?
 *   (b) Control (no Frigid Touch): E deals 2 to F — does Decree kill F although 2 < 4, and who is responsible for
 *       F's death: P1 (cast both spells) or P2 (whose unit was the source of the damage)?
 *
 * Rules: 417.1.e / 417.1.e.1 (only VALID damage ≥ 1 is dealt — a 0-Might unit deals nothing, so "takes damage"
 * never happens for F), 417.6.b.3 (Challenge's damage is dealt BY THE UNITS, not by the spell), 417.6.b.4 (the
 * controller of the source unit is responsible for that Deal — P2 for E's damage even though P1 cast Challenge;
 * the CR's own example), 428.5.c.1 (a lethal-damage kill is credited to whoever was responsible for the damage),
 * 428.5.b (a kill INSTRUCTION is credited to the spell containing it and its controller — Imperial Decree / P1).
 *
 * Expected: (a) no Deal to F at all → F 0 damage, no Decree trigger for F, F lives; F deals 4 to E → E dies (P2's
 * trash), credited to F / P1 (P1's ledger draws, P2's does not); Decree also triggers for E but E is dead either
 * way. Same whether P1 or P2 casts the Frigid Touch. (b) two Deals: F→E 4 (P1 responsible) and E→F 2 (P2
 * responsible); F survives Challenge itself (2 < 4) but Decree's trigger then KILLS F; E dies too. Kill credit:
 * E → F/P1 (428.5.c.1); F → Imperial Decree/P1 (428.5.b) — P2 was responsible for the damage, not the kill, so
 * P2's ledger never fires and P1's fires twice.
 */
import { describe, expect, test } from "bun:test";
import type { Game, Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";
const FRIGID_TOUCH = "sfd-066-221";
const IMPERIAL_DECREE = "ogn-221-298";

/** Kill-credit oracle (428.5): "When you kill a unit, draw 1." — `actor: controller` = the player credited with the kill. */
const killLedger = (name: string) =>
  ({
    abilities: [
      { effect: { amount: 1, type: "draw" }, trigger: { event: "die", on: { actor: "controller", type: "unit" } }, type: "triggered" },
    ],
    cardType: "gear",
    name,
    rulesText: "When you kill a unit, draw 1.",
  }) as const;

/**
 * P1's turn. P1: 9 energy + [body] + [order][order] (Decree 5+OO, Challenge 2+B, Frigid Touch 2), F (4) in base,
 * Decree + Challenge + Frigid Touch in hand, a Kill Ledger. P2: 2 energy and its own Frigid Touch (for the "or P2"
 * variant), E (2) at its bf1, a Kill Ledger.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 9, power: { body: 1, order: 2 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 4, name: "Friendly F" }, "F")
    .unit(P2, "bf1", { might: 2, name: "Enemy E" }, "E")
    .gear(P1, killLedger("P1 Kill Ledger"), "p1Ledger")
    .gear(P2, killLedger("P2 Kill Ledger"), "p2Ledger")
    .hand(P1, IMPERIAL_DECREE, "decree")
    .hand(P1, CHALLENGE, "challenge")
    .hand(P1, FRIGID_TOUCH, "frigidP1")
    .hand(P2, FRIGID_TOUCH, "frigidP2");
}

/** Decree resolved earlier this turn; then P1 casts Challenge (F vs E). Chain = [challenge], P1 holds priority. */
async function decreeThenChallenge(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("decree");
  await game.settle();
  expect(game.zoneOf("decree")).toBe("trash");
  expect(game.chain()).toEqual([]);
  await game.p1.cast("challenge", { targets: ["F", "E"] });
  expect(game.chain().map((i) => i.cardId)).toEqual(["challenge"]);
  expect(game.actingSeat()).toBe(P1);
  return game;
}

/** …and `caster` answers Challenge with Frigid Touch on E. Chain = [challenge, frigid]. */
async function withFrigidOnE(caster: Seat = P1): Promise<Game> {
  const game = await decreeThenChallenge();
  if (caster === P1) {
    await game.p1.cast("frigidP1", { targets: "E" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["challenge", "frigidP1"]);
  } else {
    await game.p1.passPriority();
    await game.p2.cast("frigidP2", { targets: "E" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["challenge", "frigidP2"]);
  }
  return game;
}

/** Pass priority back and forth until Challenge itself has left the chain (stops BEFORE any trigger it caused resolves). */
async function resolveThroughChallenge(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().some((c) => c.cardId === "challenge"); i++) {
    await game.acting().passPriority();
  }
  expect(game.zoneOf("challenge")).toBe("trash");
}

type DamageRow = { target: string; amount: number; source: { cardId?: string; kind: string; player?: string } };
const damageRows = (game: Game): DamageRow[] =>
  ((game.gameState.damageLog ?? []) as DamageRow[]).map((r) => ({ amount: r.amount, source: { ...r.source }, target: r.target }));
const decreeItems = (game: Game): number => game.chain().filter((c) => c.cardId === "decree" && c.triggered).length;

describe("Challenge × Frigid Touch (0-Might source deals nothing) × Imperial Decree — and who gets the kill credit", () => {
  test("premise: Decree (5 + [order][order]) resolves to the trash arming its turn-long trigger; Challenge costs 2 + [body] and names [F, E]; nobody has drawn anything", async () => {
    const game = await decreeThenChallenge();
    expect(game.p1.resources()).toEqual({ energy: 2, power: { body: 0, order: 0 } });
    expect(game.chain()[0]).toMatchObject({ cardId: "challenge", controller: P1, triggered: false });
    expect(game.p1.hand().sort()).toEqual(["frigidP1"]);
    expect(game.p2.hand()).toEqual(["frigidP2"]);
    expect(damageRows(game)).toEqual([]);
  });

  // ───────────────────────────── (a) Frigid Touch makes E a 0-Might source ─────────────────────────────

  test("(a) Frigid Touch (Reaction) is castable by P1 on top of its own Challenge; it resolves first (LIFO) and E sits at 0 Might — no floor — while Challenge is still waiting", async () => {
    const game = await withFrigidOnE(P1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, order: 0 } });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Frigid Touch resolves
    expect(game.zoneOf("frigidP1")).toBe("trash");
    expect(game.chain().map((i) => i.cardId)).toEqual(["challenge"]);
    expect(game.state("E").might).toBe(0);
    expect(game.state("F").might).toBe(4);
  });

  test("(a) Challenge resolves: the ONLY Deal is F → E for 4 (source F, P1 responsible); E's 'deal 0' is not a Deal at all (417.1.e.1) — F has 0 damage and no damage record names F as a target", async () => {
    const game = await withFrigidOnE(P1);
    await resolveThroughChallenge(game);
    expect(damageRows(game)).toEqual([{ amount: 4, source: { cardId: "F", kind: "unit", player: P1 }, target: "E" }]);
    expect(game.zoneOf("F")).toBe("base");
    expect(game.state("F").damage).toBe(0);
  });

  test("(a) so Imperial Decree triggers exactly ONCE (for E) — never for F; E (0 Might, 4 damage) is already dead in P2's trash by the time anyone gets priority", async () => {
    const game = await withFrigidOnE(P1);
    await resolveThroughChallenge(game);
    expect(decreeItems(game)).toBe(1);
    expect(game.zoneOf("E")).toBe("trash");
    expect(game.p2.trash()).toContain("E");
  });

  test("(a) after the whole chain: F ALIVE in base undamaged, E in P2's trash, chain empty, P1's Open main phase, no invariant violations", async () => {
    const game = await withFrigidOnE(P1);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("F")).toBe("base");
    expect(game.state("F").damage).toBe(0);
    expect(game.p1.units("base")).toContain("F");
    expect(game.zoneOf("E")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(a) kill credit: E's death is F's lethal damage → credited to P1 (417.6.b.4 / 428.5.c.1) — P1's Kill Ledger draws exactly 1, P2's never fires", async () => {
    const game = await withFrigidOnE(P1);
    const p1Hand = game.p1.hand().length; // 0 (all three spells cast)
    const p2Hand = game.p2.hand().length;
    await game.settle();
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    expect(game.p2.hand()).toHaveLength(p2Hand);
  });

  test("(a) identical outcome when it is P2 who Frigid-Touches its own E in P1's window: F undamaged and alive, one Decree trigger, E dead, credit to P1", async () => {
    const game = await withFrigidOnE(P2);
    expect(game.p2.energy()).toBe(0);
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await resolveThroughChallenge(game);
    expect(damageRows(game).map((r) => `${r.source.cardId}->${r.target}:${r.amount}`)).toEqual(["F->E:4"]);
    expect(decreeItems(game)).toBe(1);
    await game.settle();
    expect(game.zoneOf("F")).toBe("base");
    expect(game.state("F").damage).toBe(0);
    expect(game.zoneOf("E")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    expect(game.p2.hand()).toHaveLength(p2Hand);
  });

  // ───────────────────────────── (b) control: no Frigid Touch ─────────────────────────────

  test("(b) control — Challenge resolves with two Deals: F → E 4 with P1 responsible, and E → F 2 with P2 responsible (417.6.b.3 / 417.6.b.4: E's controller answers for E's damage although P1 cast the spell)", async () => {
    const game = await decreeThenChallenge();
    await resolveThroughChallenge(game);
    const rows = damageRows(game);
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({ amount: 4, source: { cardId: "F", kind: "unit", player: P1 }, target: "E" });
    expect(rows).toContainEqual({ amount: 2, source: { cardId: "E", kind: "unit", player: P2 }, target: "F" });
  });

  test("(b) right after Challenge: F took VALID damage (2 < 4, still in base) so Decree triggered for F too — two Decree items on the chain; E already dead of lethal damage", async () => {
    const game = await decreeThenChallenge();
    await resolveThroughChallenge(game);
    expect(game.zoneOf("F")).toBe("base");
    expect(game.state("F").damage).toBe(2);
    expect(decreeItems(game)).toBe(2);
    expect(game.zoneOf("E")).toBe("trash");
  });

  test("(b) once the chain settles Decree has KILLED F despite 2 < 4: F in P1's trash, E in P2's trash, chain empty", async () => {
    const game = await decreeThenChallenge();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("F")).toBe("trash");
    expect(game.p1.trash()).toContain("F");
    expect(game.zoneOf("E")).toBe("trash");
    expect(game.p2.trash()).toContain("E");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(b) kill credit: E → F's damage → P1 (428.5.c.1); F → Imperial Decree's kill instruction → its controller P1 (428.5.b). P2 was responsible for the DAMAGE to F but not the KILL: P1's ledger draws 2, P2's ledger draws 0", async () => {
    const game = await decreeThenChallenge();
    const p1Hand = game.p1.hand().length; // 1 (Frigid Touch unused)
    const p2Hand = game.p2.hand().length;
    await game.settle();
    expect(game.p1.hand()).toHaveLength(p1Hand + 2);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.state("p2Ledger").zone).toBe("base"); // it was there all along — it just never triggered
  });

  test("(b) the P1 ledger's two triggers straddle the Decree kill: one is already on the chain with the two Decree items right after Challenge (E's death), the second appears only when a Decree item resolves and kills F", async () => {
    const game = await decreeThenChallenge();
    await resolveThroughChallenge(game);
    const ledgerItems = (): number => game.chain().filter((c) => c.cardId === "p1Ledger").length;
    expect(ledgerItems()).toBe(1);
    expect(game.chain().some((c) => c.cardId === "p2Ledger")).toBe(false);
    // Resolve items one at a time until F leaves the board; at that moment a fresh P1-ledger trigger must be on the chain.
    let sawSecond = false;
    for (let i = 0; i < 12 && game.chain().length > 0; i++) {
      const fBefore = game.zoneOf("F");
      await game.acting().passPriority();
      if (fBefore === "base" && game.zoneOf("F") === "trash") {
        sawSecond = ledgerItems() === 1 && decreeItems(game) <= 1;
      }
    }
    expect(game.zoneOf("F")).toBe("trash");
    expect(sawSecond).toBe(true);
    expect(game.chain().some((c) => c.cardId === "p2Ledger")).toBe(false);
  });
});
