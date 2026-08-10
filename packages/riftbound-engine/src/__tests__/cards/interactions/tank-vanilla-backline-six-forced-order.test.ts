/**
 * Interaction: Petty Officer (ogn-215-298) · Unit · Order · 5 · 5 Might  "[Assault] (+1 [Might] while I'm an attacker.)"
 *   attacking alone into P2's bf1 defended by
 *   × Lecturing Yordle (ogn-087-298) · 2 Might · "[Tank] (I must be assigned combat damage first.) …"
 *   × Shipyard Skulker (ogn-175-298) · 3 Might · vanilla
 *   × Enthusiastic Promoter (unl-043-219) · 2 Might · "[Backline] (I must be assigned combat damage last.) When I hold, [Buff] all units here."
 *
 * The 465.2.c.6 textbook board: Tank + vanilla + Backline vs exactly 6 attacking damage.
 *
 * Rules: 807.1.b.3 / 807.1.c (Assault +1 only while an attacker → 6), 465.2.a/b (sums), 465.2.c (attacker
 * assigns first), 465.2.c.3 (full lethal before the next unit), 465.2.c.4 (no over-assignment while another
 * unit remains), 465.2.c.6 (must obey Tank-first / Backline-last: Tank → vanilla → Backline), 815.1.b /
 * 815.1.c.1-2 (non-Tank units are invalid until every Tank has lethal), 826.3 / 826.4.a-b (Backline units are
 * invalid until every non-Backline unit has lethal), 465.2.c.1.a (dealt simultaneously), 466.1.a (survivors
 * healed; attackers recalled/killed), 466.3 / 466.5 (a defender remains → no conquer).
 *
 * Question: nobody plays anything. What does P1's assignment look like step by step (Yordle only, min 2 →
 * Skulker only, min 3 → Promoter, the remaining 1), which lines are rejected, final marks, deaths, who holds
 * bf1? Contrast: a plain 5-Might attacker — is the Promoter touched at all?
 *
 * Expected: attacker 6 vs defenders 7. The only legal line is {Yordle 2, Skulker 3, Promoter 1} — every tier
 * holds a single unit, so there is no choice for P1 to make (the engine may resolve it without a prompt; if it
 * does prompt, every other line is refused). Yordle and Skulker die, Promoter survives healed; P2's 7 ≥ 6
 * kills Petty Officer; P2 keeps bf1, no points. With 5 damage: {Yordle 2, Skulker 3} exhausts it — the
 * Promoter is never a legal recipient and takes 0; same deaths, same holder.
 * Probe (one extra vanilla 3 so a real choice exists): the Decision lists lethal minima, refuses Promoter
 * before the vanillas / a non-exact Yordle, and accepts {Yordle 2, one vanilla 3, the other vanilla 1}.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PETTY_OFFICER = "ogn-215-298";
const LECTURING_YORDLE = "ogn-087-298";
const SHIPYARD_SKULKER = "ogn-175-298";
const ENTHUSIASTIC_PROMOTER = "unl-043-219";

type Attacker = "assault6" | "vanilla5";

/** P1's turn. P2 holds bf1 with Yordle (Tank 2) + Skulker (3) + Promoter (Backline 2); P1's lone attacker is ready in base. */
function board(attacker: Attacker = "assault6", opts: { extraVanilla?: boolean } = {}) {
  const s = scenario().battlefield("bf1", { controller: P2 });
  if (attacker === "assault6") {
    s.unit(P1, "base", PETTY_OFFICER, "officer");
  } else {
    s.unit(P1, "base", { might: 5, name: "Plain Five" }, "officer");
  }
  s.unit(P2, "bf1", LECTURING_YORDLE, "yordle").unit(P2, "bf1", SHIPYARD_SKULKER, "skulker").unit(P2, "bf1", ENTHUSIASTIC_PROMOTER, "promo");
  if (opts.extraVanilla) {
    s.unit(P2, "bf1", { might: 3, name: "Deckhand" }, "deckhand");
  }
  return s;
}

/** Total combat damage dealt to `target` (public damageLog). */
function dealt(game: Game, target: string): number {
  return (game.gameState.damageLog ?? []).filter((r) => r.combat && r.target === target).reduce((s, r) => s + r.amount, 0);
}

/** The attacker walks into bf1; pass focus/priority until a non-pass decision (an assignment prompt) or the open main phase. */
async function attackUntilAssignment(game: Game): Promise<Decision | null> {
  await game.p1.move("officer", "bf1");
  expect(game.state("officer").combatRole).toBe("attacker");
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main" || !d.passKey) {
      return d;
    }
    await game.acting().pass();
  }
  return game.decision();
}

/** Full line: attack, take whatever is forced, settle to the open main phase. */
async function fight(attacker: Attacker): Promise<Game> {
  const game = await board(attacker).build();
  await game.p1.move("officer", "bf1");
  const s = await game.settle();
  expect(s.reason).toBe("open");
  return game;
}

describe("setup — the three tiers and the two sums", () => {
  test("Yordle has Tank (2), Skulker is vanilla (3), Promoter has Backline (2) → defenders sum 7; Petty Officer is 5 at rest and 6 once he is the attacker (Assault, 807.1.c)", async () => {
    const game = await board().build();
    expect(game.state("yordle")).toMatchObject({ keywords: expect.arrayContaining(["Tank"]), might: 2 });
    expect(game.state("skulker").keywords).toEqual([]);
    expect(game.state("skulker").might).toBe(3);
    expect(game.state("promo")).toMatchObject({ keywords: expect.arrayContaining(["Backline"]), might: 2 });
    expect(game.state("promo").keywords).not.toContain("Tank");
    expect(game.state("yordle").keywords).not.toContain("Backline");
    expect(game.state("officer")).toMatchObject({ keywords: ["Assault"], might: 5 });
    await game.p1.move("officer", "bf1");
    expect(game.state("officer")).toMatchObject({ combatRole: "attacker", might: 6 });
    expect(game.state("yordle").combatRole).toBe("defender");
  });
});

describe("6 damage (Petty Officer with Assault) — Tank → vanilla → Backline is fully forced", () => {
  test("P1 never gets to deviate: either no assignment prompt is raised (single legal line) or every other line is refused — Promoter before Skulker, Yordle 3 (over), Yordle 1 (under), all-on-Yordle, skipping the Tank", async () => {
    const game = await board().build();
    const d = await attackUntilAssignment(game);
    if (d?.kind === "distribute" && d.seat === P1) {
      expect(d.total).toBe(6);
      expect(d.buckets.find((b) => b.key === "yordle")?.lethal).toBe(2);
      expect(d.buckets.find((b) => b.key === "skulker")?.lethal).toBe(3);
      expect(d.buckets.find((b) => b.key === "promo")?.lethal).toBe(2);
      for (const bad of [
        { promo: 2, skulker: 2, yordle: 2 }, // Backline before the vanilla unit has lethal (826.4.b)
        { promo: 4, skulker: 0, yordle: 2 }, // same, worse
        { promo: 0, skulker: 3, yordle: 3 }, // over-assign the Tank while others remain (465.2.c.4)
        { promo: 2, skulker: 3, yordle: 1 }, // moving on before the Tank has lethal (465.2.c.3 / 815)
        { promo: 3, skulker: 3, yordle: 0 }, // skipping the Tank entirely (815.1.c.2)
        { promo: 0, skulker: 0, yordle: 6 }, // everything on the Tank
        { promo: 0, skulker: 4, yordle: 2 }, // over-assign Skulker while Promoter remains
      ]) {
        expect((await game.p1.try((p) => p.distribute(bad))).ok).toBe(false);
      }
      expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1 });
      await game.p1.distribute({ promo: 1, skulker: 3, yordle: 2 });
    } else {
      // No choice exists → the engine must not have asked P1 anything about assignment.
      expect(d?.kind === "distribute" && d.seat === P1).toBe(false);
    }
    await game.settle();
    expect(dealt(game, "yordle")).toBe(2);
    expect(dealt(game, "skulker")).toBe(3);
    expect(dealt(game, "promo")).toBe(1);
  });

  test("final marks as dealt: {Yordle 2, Skulker 3, Promoter 1} from P1 and all 7 of P2's on the lone Petty Officer (465.2.b, 465.2.c.1.a)", async () => {
    const game = await fight("assault6");
    const combat = (game.gameState.damageLog ?? []).filter((r) => r.combat).map((r) => [r.target, r.amount, r.source.player]);
    expect(combat).toEqual(
      expect.arrayContaining([
        ["yordle", 2, P1],
        ["skulker", 3, P1],
        ["promo", 1, P1],
        ["officer", 7, P2],
      ]),
    );
    expect(combat).toHaveLength(4);
  });

  test("deaths: Yordle (2 ≥ 2) and Skulker (3 ≥ 3) die; Promoter (1 < 2) survives and is healed to 0; Petty Officer dies to 7 ≥ 6 — his Assault-inclusive Might is the lethal threshold, and 7 clears it anyway", async () => {
    const game = await fight("assault6");
    expect(game.zoneOf("yordle")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.p2.trash().sort()).toEqual(["skulker", "yordle"]);
    expect(game.zoneOf("promo")).toBe("battlefield-bf1");
    expect(game.state("promo")).toMatchObject({ damage: 0, might: 2 });
    expect(game.zoneOf("officer")).toBe("trash");
    expect(game.p1.trash()).toEqual(["officer"]);
  });

  test("a defender remains → no conquer: P2 keeps bf1 uncontested with just the Promoter, nobody scores, nothing left on the chain, back to P1's open main phase (466.3, 466.5)", async () => {
    const game = await fight("assault6");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.units("bf1")).toEqual(["promo"]);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("promo").combatRole).toBeNull();
    expect(game.violations()).toEqual([]);
  });

  test("the surviving Promoter is a live unit for P2: next turn P2 HOLDS bf1 (+1) and its hold trigger buffs it to 3", async () => {
    const game = await fight("assault6");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.state("promo")).toMatchObject({ isBuffed: true, might: 3, zone: "battlefield-bf1" });
  });
});

describe("contrast — a plain 5-Might attacker: the Backline Promoter is never reached", () => {
  test("{Yordle 2, Skulker 3} exhausts the 5; no prompt (or only that line accepted); the Promoter is dealt 0 combat damage — not even a 0-amount entry beyond that", async () => {
    const game = await board("vanilla5").build();
    const d = await attackUntilAssignment(game);
    expect(game.state("officer").might).toBe(5);
    if (d?.kind === "distribute" && d.seat === P1) {
      expect(d.total).toBe(5);
      expect((await game.p1.try((p) => p.distribute({ promo: 1, skulker: 2, yordle: 2 }))).ok).toBe(false);
      expect((await game.p1.try((p) => p.distribute({ promo: 3, skulker: 0, yordle: 2 }))).ok).toBe(false);
      await game.p1.distribute({ promo: 0, skulker: 3, yordle: 2 });
    } else {
      expect(d?.kind === "distribute" && d.seat === P1).toBe(false);
    }
    await game.settle();
    expect(dealt(game, "yordle")).toBe(2);
    expect(dealt(game, "skulker")).toBe(3);
    expect(dealt(game, "promo")).toBe(0);
    expect((game.gameState.damageLog ?? []).some((r) => r.combat && r.target === "promo" && r.amount > 0)).toBe(false);
  });

  test("same deaths and holder as the 6-damage line: Yordle + Skulker + the attacker die (7 ≥ 5), untouched Promoter keeps bf1 for P2", async () => {
    const game = await fight("vanilla5");
    expect(game.zoneOf("yordle")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.zoneOf("officer")).toBe("trash");
    expect(dealt(game, "officer")).toBe(7);
    expect(game.state("promo")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});

describe("probe — add a second vanilla 3 (Deckhand) so P1 has a real choice inside the middle tier", () => {
  test("now P1 IS asked (465.2.c.7): a distribute Decision for 6 with lethal minima Yordle 2 / Skulker 3 / Deckhand 3 / Promoter 2", async () => {
    const game = await board("assault6", { extraVanilla: true }).build();
    const d = await attackUntilAssignment(game);
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 6 });
    const buckets = d?.kind === "distribute" ? d.buckets.map((b) => [b.key, b.lethal]).sort() : [];
    expect(buckets).toEqual([
      ["deckhand", 3],
      ["promo", 2],
      ["skulker", 3],
      ["yordle", 2],
    ]);
  });

  test("the tiers are enforced on that Decision: Tank must get exactly 2 first, Backline is invalid while a vanilla lacks lethal, no over-assignment mid-sequence — only {Yordle 2, vanilla 3, other vanilla 1} (either vanilla) is accepted", async () => {
    const game = await board("assault6", { extraVanilla: true }).build();
    await attackUntilAssignment(game);
    for (const bad of [
      { deckhand: 0, promo: 1, skulker: 3, yordle: 2 }, // Backline while Deckhand has no lethal (826.4.b)
      { deckhand: 1, promo: 0, skulker: 2, yordle: 3 }, // Tank over-assigned (465.2.c.4)
      { deckhand: 2, promo: 0, skulker: 3, yordle: 1 }, // Tank under-assigned before moving on (815.1.c.2)
      { deckhand: 3, promo: 0, skulker: 3, yordle: 0 }, // Tank skipped
      { deckhand: 2, promo: 0, skulker: 2, yordle: 2 }, // splitting without lethal on either vanilla (465.2.c.3)
      { deckhand: 0, promo: 0, skulker: 4, yordle: 2 }, // over-assign Skulker while Deckhand/Promoter remain
    ]) {
      expect((await game.p1.try((p) => p.distribute(bad))).ok).toBe(false);
    }
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1 });
    // Either vanilla may be the one made lethal (same tier, 465.2.c.7).
    const other = await board("assault6", { extraVanilla: true }).build();
    await attackUntilAssignment(other);
    expect((await other.p1.try((p) => p.distribute({ deckhand: 3, promo: 0, skulker: 1, yordle: 2 }))).ok).toBe(true);
    await game.p1.distribute({ deckhand: 1, promo: 0, skulker: 3, yordle: 2 });
    await game.settle();
    expect(dealt(game, "promo")).toBe(0);
    expect(game.zoneOf("yordle")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.state("deckhand")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // 1 < 3, healed
    expect(game.zoneOf("officer")).toBe("trash"); // 10 ≥ 6
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
