/**
 * Interaction: Clash of Giants (unl-110-219) · Spell · Body · 6 + [body][body]
 *     "Choose two units. They deal damage equal to their Mights to each other."
 *   × Esteemed Hierophant (ven-025-166) · Unit · Calm · 5 · 5 Might
 *     "While you control 7 or more runes, prevent all damage that ENEMY spells and abilities would deal to me."
 *   × Anivia, Primal (ogn-148-298) · Champion Unit · Body · 7 · 8 Might
 *     "When I attack, deal 3 to all enemy units here."
 *   (+ Vanguard Sergeant ogn-219-298, vanilla 4 Might; Hextech Ray ogn-009-298 "Deal 3 to a unit at a
 *    battlefield" as the enemy-SPELL-source sanity probe; Immortal Phoenix ogn-037-298 "When you kill a unit
 *    with a spell, you may pay [1][fury] to play me from your trash" in P2's trash as the attribution witness.)
 *
 * Rules: 417.6.b.3 (when a spell names UNITS as the source, the damage is dealt by those units — not by the
 * spell), 417.6.b.4 (the controller of the source is responsible for the Deal), 417.6.b.2 / 417.6.b.2.a (a
 * subject-less "deal 3" on an ability: the ability — plus the unit — is the source), 417.6.c / 417.6.c.1
 * (combat damage has the opposing units as source), 428.5.c.1 (whoever is responsible for the deal is
 * responsible for the resulting Cleanup kill), 437.4 (fully prevented damage was never dealt).
 *
 * Question: P1 controls 7 runes, Hierophant (5) and Vanguard Sergeant (4) at bf1. P2's turn.
 *   (a) P2 plays Clash of Giants choosing BOTH of P1's units. Is Hierophant's damage prevented (it "came
 *       from" an enemy spell)? Who is the source / responsible for the Sergeant's death?
 *   (b) Contrast: P2 attacks bf1 with Anivia. Is her trigger's 3 to Hierophant prevented, is the 3 to the
 *       Sergeant dealt, and is Anivia's 8 COMBAT damage to Hierophant prevented?
 *
 * Expected: (a) No prevention — the source is Vanguard Sergeant, a unit P1 controls (417.6.b.3): Hierophant
 * takes 4 and survives (4 marked); Sergeant takes 5 from Hierophant and dies in the Cleanup. P1 is
 * responsible for both Deals (417.6.b.4) and hence for the kill (428.5.c.1) even though P2 played the spell
 * — P2's "when you kill" witness stays silent. (b) Anivia's trigger is enemy ABILITY damage → 0 to Hierophant
 * (437.4), 3 to Sergeant. Combat damage has Anivia as its source (417.6.c) — not spell/ability damage — so
 * the 8 is dealt in full and Hierophant (5) dies; alone, Hierophant's 5 back does not kill Anivia (8).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CLASH_OF_GIANTS = "unl-110-219";
const HIEROPHANT = "ven-025-166";
const ANIVIA = "ogn-148-298";
const VANGUARD_SERGEANT = "ogn-219-298";
const HEXTECH_RAY = "ogn-009-298";
const IMMORTAL_PHOENIX = "ogn-037-298";

/**
 * P2's turn 2. P1: 7 calm runes, Hierophant (5) at bf1 (P1's), Vanguard Sergeant (4) at bf1 (or in base for
 * the solo-defender variant). P2: Anivia (8) in base, Clash of Giants + Hextech Ray in hand, Immortal Phoenix
 * in the trash; energy 8 + [body][body] + [fury][fury] = Clash (6+BB) with 2+[fury][fury] to spare — enough
 * for the Ray (1+F) AND a Phoenix payment (1+F), so a silent Phoenix is never "couldn't afford it".
 */
function board(opts: { sergeantAt?: "bf1" | "base"; runes?: number } = {}) {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 8, power: { body: 2, fury: 2 } })
    .battlefield("bf1", { controller: P1 })
    .runes(P1, "calm", opts.runes ?? 7)
    .unit(P1, "bf1", HIEROPHANT, "hier")
    .unit(P1, opts.sergeantAt ?? "bf1", VANGUARD_SERGEANT, "serg")
    .unit(P2, "base", ANIVIA, "anivia")
    .trash(P2, IMMORTAL_PHOENIX, "p2phoenix")
    .hand(P2, CLASH_OF_GIANTS, "clash")
    .hand(P2, HEXTECH_RAY, "ray");
}

const pairsOffered = (game: Game): string[][] =>
  (game.p2.option("cast", "clash")?.fields.find((f) => f.name === "targets")?.options ?? []) as string[][];

/** Anivia attacks bf1; pass priority on her attack trigger only, stopping at the first showdown Focus window (trigger resolved, combat not yet). */
async function aniviaAttacksToFocus(game: Game): Promise<void> {
  await game.p2.move("anivia", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "anivia", controller: P2, triggered: true })]);
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context !== "chain") {
      break;
    }
    await game.seat(d.seat).passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  expect(game.chain()).toEqual([]);
}

describe("Clash of Giants on two of P1's own units × Esteemed Hierophant — the UNITS are the source, P1's seat is responsible", () => {
  test("set-up sanity: P1 controls 7 runes; Hierophant 5, Sergeant 4, both at bf1; an ENEMY spell that is itself the source (P2's Hextech Ray) deals 0 to Hierophant (437.4) but 3 to the Sergeant — the prevention is live on this board", async () => {
    const game = await board().build();
    expect(game.p1.runes()).toHaveLength(7);
    expect(game.state("hier")).toMatchObject({ might: 5, zone: "battlefield-bf1" });
    expect(game.state("serg")).toMatchObject({ might: 4, zone: "battlefield-bf1" });
    await game.p2.cast("ray", { targets: "hier" });
    await game.settle();
    expect(game.state("hier")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("ray")).toBe("trash");
    const other = await board().build();
    await other.p2.cast("ray", { targets: "serg" });
    await other.settle();
    expect(other.state("serg")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
  });

  // ── (a) Clash of Giants naming Hierophant AND Sergeant ─────────────────────────────────────

  test("(a) 'Choose two units' has no controller restriction: P2 may name BOTH of P1's units — [hier, serg] is an offered pair; P2 pays 6 + [body][body]", async () => {
    const game = await board().build();
    const pairs = pairsOffered(game).map((p) => [...p].sort().join("+"));
    expect(pairs).toContain("hier+serg");
    await game.p2.cast("clash", { targets: ["hier", "serg"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "clash", controller: P2, targets: ["hier", "serg"], triggered: false })]);
    expect(game.p2.resources()).toEqual({ energy: 2, power: { body: 0, fury: 2 } });
  });

  test("(a) on resolution the damage to Hierophant is dealt BY VANGUARD SERGEANT — a unit P1 controls, not an enemy spell (417.6.b.3): NOT prevented, Hierophant has 4 marked and survives (4 < 5)", async () => {
    const game = await board().build();
    await game.p2.cast("clash", { targets: ["hier", "serg"] });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Clash resolves
    expect(game.zoneOf("hier")).toBe("battlefield-bf1");
    expect(game.state("hier").damage).toBe(4);
    await game.settle();
    expect(game.state("hier")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
  });

  test("(a) …and the Sergeant takes Hierophant's 5 (≥ 4) and dies in the Cleanup into P1's trash; Clash → P2's trash; P1 keeps bf1 through Hierophant", async () => {
    const game = await board().build();
    await game.p2.cast("clash", { targets: ["hier", "serg"] });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("serg")).toBe("trash");
    expect(game.p1.trash()).toEqual(["serg"]);
    expect(game.zoneOf("clash")).toBe("trash");
    expect(game.p2.trash().sort()).toEqual(["clash", "p2phoenix"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.units("bf1")).toEqual(["hier"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("(a) responsibility follows the SOURCE's controller (417.6.b.4 / 428.5.c.1): P2 cast the spell, yet P2's Immortal Phoenix ('when YOU kill a unit with a spell') is never asked when the Sergeant dies — P2 killed nothing; it stays in P2's trash with [1][fury] unspent", async () => {
    const game = await board().build();
    await game.p2.cast("clash", { targets: ["hier", "serg"] });
    await game.p2.passPriority();
    await game.p1.passPriority();
    // Straight back to P2's open main phase: no yes/no from the Phoenix in between.
    expect(game.decision()?.kind).not.toBe("yes-no");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("serg")).toBe("trash");
    expect(game.zoneOf("p2phoenix")).toBe("trash");
    expect(game.p2.resources()).toEqual({ energy: 2, power: { body: 0, fury: 2 } });
  });

  test("(a) rune count is irrelevant here (it is not enemy spell/ability damage at all): with only 6 runes the outcome is identical — Hierophant 4 marked, Sergeant dead", async () => {
    const game = await board({ runes: 6 }).build();
    expect(game.p1.runes()).toHaveLength(6);
    await game.p2.cast("clash", { targets: ["hier", "serg"] });
    await game.settle();
    expect(game.state("hier")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
    expect(game.zoneOf("serg")).toBe("trash");
  });

  // ── (b) Anivia attacks: ability damage vs combat damage ────────────────────────────────────

  test("(b) Anivia attacks bf1: 'When I attack, deal 3 to all enemy units here' is P2's ABILITY (417.6.b.2/.2.a) → enemy ability damage: 0 to Hierophant (prevented, 437.4), 3 marked on the Sergeant — checked at the first Focus window, before any combat damage", async () => {
    const game = await board().build();
    await aniviaAttacksToFocus(game);
    expect(game.state("hier")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("serg")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    expect(game.state("anivia")).toMatchObject({ combatRole: "attacker", damage: 0, might: 8, zone: "battlefield-bf1" });
  });

  test("(b) COMBAT damage has Anivia — a unit — as its source (417.6.c/.c.1), not a spell or ability: her 8 is dealt in full and Hierophant (5) DIES; the pre-damaged Sergeant dies too; the two defenders' 5 + 4 = 9 back kill Anivia (8) — bf1 left empty", async () => {
    const game = await board().build();
    await aniviaAttacksToFocus(game);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("hier")).toBe("trash"); // ← the point: combat damage was NOT prevented
    expect(game.zoneOf("serg")).toBe("trash");
    expect(game.zoneOf("anivia")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["hier", "serg"]);
    expect(game.cardsAt("battlefield-bf1")).toEqual([]);
    expect(game.p2.points()).toBe(0); // nobody left to conquer with (466.5.b)
    expect(game.violations()).toEqual([]);
  });

  test("(b) solo-defender variant (Sergeant home in base): the trigger deals Hierophant 0; in combat Anivia's 8 kills Hierophant while Hierophant's 5 back does NOT kill Anivia (8) — Anivia survives (healed after combat) and P2 conquers bf1 for a point", async () => {
    const game = await board({ sergeantAt: "base" }).build();
    await aniviaAttacksToFocus(game);
    expect(game.state("hier")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("serg")).toMatchObject({ damage: 0, zone: "base" }); // not "here"
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("hier")).toBe("trash");
    expect(game.state("anivia")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.zoneOf("serg")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("(b) contrast inside (b): below 7 runes even the trigger's 3 lands on Hierophant (3 marked at the Focus window) — so the 0 above really was the enemy-ability prevention, while combat kills Hierophant either way", async () => {
    const game = await board({ runes: 6, sergeantAt: "base" }).build();
    await aniviaAttacksToFocus(game);
    expect(game.state("hier")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    await game.settle();
    expect(game.zoneOf("hier")).toBe("trash");
    expect(game.state("anivia")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
  });
});
