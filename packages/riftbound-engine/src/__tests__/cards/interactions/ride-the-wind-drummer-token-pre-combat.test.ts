/**
 * Interaction: Ride the Wind (ogn-173-298) · Spell · Chaos · 2 · Action
 *     "Move a friendly unit and ready it."
 *   × Noxian Drummer (ogn-222-298) · Unit · Order · 3 · 3 Might
 *     "When I move to a battlefield, play a 1 [Might] Recruit unit token here. (It is also at the
 *      battlefield.)"
 *   (vs a vanilla 3-Might "Guard" defending P2's battlefield bfB)
 *
 * Rules: 446.3 (moving is instantaneous), 190.3.a / 190.3.a.1 / 450 (the mover's controller applies
 * Contested; a unit played to an already-Contested battlefield re-applies nothing), 355.2.b ("play … here"
 * grants the location permission), 323.8 / 323.9 (Showdown + Combat become Staged in the cleanup),
 * 323.12 / 323.13 / 344 (they only BEGIN from a Neutral Open state — not while a trigger sits on the
 * chain), 453 (a Standard Move ends with a cleanup), 464.2.c.1 / 464.2.c.3 / 464.2.d (when combat begins
 * EVERY unit of the attacker present gains Attacker; attacker gets Focus), 465.2.c.3 (lethal-first
 * assignment), 466.1.a.1 (combat heal), 466.3.a / 466.3.d / 466.5.b / 466.5.d (winner conquers; mutual
 * wipe → no result, battlefield uncontrolled), 420.3.a (Standard Move exhausts), 309.1.
 *
 * Question: P1's turn; P2 holds bfB with a 3-Might Guard. P1's exhausted Drummer is sent to bfB by Ride
 * the Wind (moved + readied). Does combat wait for the move trigger? Is the Recruit legally played at bfB
 * and is it an ATTACKER (it neither moved nor existed when Contested was applied)? Combat math with and
 * without the token; parity with a plain Standard Move.
 *
 * Expected: spell resolves → Drummer at bfB ready, bfB Contested by P1, trigger pending → combat is only
 * Staged (Closed state). Trigger resolves → Recruit played at bfB (no re-contest). Chain empty → combat
 * begins: Drummer AND Recruit are attackers, Guard defends; 3+1 = 4 ≥ 3 kills Guard; Guard's 3 kills
 * either Drummer (all 3) or Recruit (1, then 2 to Drummer who heals). A P1 unit remains → P1 conquers +1.
 * Without the token (vanilla 3 mover) it is 3 v 3, both die, no winner, bfB uncontrolled. Standard Move:
 * same sequence and outcome, Drummer merely exhausted instead of ready.
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const NOXIAN_DRUMMER = "ogn-222-298";
const GUARD = { might: 3, name: "Guard" };

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1's turn 2. P2 controls bfB with a vanilla 3-Might Guard. P1: exhausted Drummer in base, Ride the Wind + exactly its cost. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bfB", { controller: P2 })
    .unit(P2, "bfB", GUARD, "guard")
    .unit(P1, "base", NOXIAN_DRUMMER, "drummer", { exhausted: true })
    .hand(P1, RIDE_THE_WIND, "ride");
}

/** Same, but the mover is a vanilla exhausted 3-Might unit (no token). */
function vanillaBoard() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bfB", { controller: P2 })
    .unit(P2, "bfB", GUARD, "guard")
    .unit(P1, "base", { might: 3, name: "Vanilla Mover" }, "mover", { exhausted: true })
    .hand(P1, RIDE_THE_WIND, "ride");
}

/** Standard-Move parity board: ready Drummer in base, no spell needed. */
function walkBoard() {
  return scenario()
    .battlefield("bfB", { controller: P2 })
    .unit(P2, "bfB", GUARD, "guard")
    .unit(P1, "base", NOXIAN_DRUMMER, "drummer");
}

function unitsAt(game: Game, bf: string): string[] {
  return game.cardsAt(bf).map((c) => `${game.state(c).name}/${game.state(c).controller}/${game.state(c).combatRole ?? "none"}`);
}

function recruitAt(game: Game, bf: string): string | undefined {
  return game.cardsAt(bf).find((c) => game.state(c).name === "Recruit");
}

/** Cast Ride the Wind on `unit`, both pass, answer the destination prompt (bfB) → the spell has fully resolved. */
async function rideTo(game: Game, unit: string): Promise<void> {
  await game.p1.cast("ride", { targets: unit });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
    await game.p1.pick("bfB");
  }
  expect(game.zoneOf("ride")).toBe("trash");
}

/** Pass priority until the chain is empty (the Drummer trigger resolves). */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
}

describe("Ride the Wind → Noxian Drummer into an enemy battlefield: the Recruit token joins as an attacker", () => {
  // ── step 1: the spell resolves ─────────────────────────────────────────────────────────────

  test("Ride the Wind only offers FRIENDLY units (Drummer, not the enemy Guard) and costs 2 + [chaos]", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "ride")?.fields.find((f) => f.name === "targets");
    const offered = new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]));
    expect(offered).toEqual(new Set(["drummer"]));
    await expect(game.p1.cast("ride", { targets: "guard" })).rejects.toThrow();
  });

  test("on resolution Drummer is at bfB AND readied (446.3: no in-between state); bfB is Contested by P1, still controlled by P2 (190.3.a)", async () => {
    const game = await board().build();
    expect(game.state("drummer").isExhausted).toBe(true);
    await rideTo(game, "drummer");
    expect(game.zoneOf("drummer")).toBe("battlefield-bfB");
    expect(game.state("drummer").isReady).toBe(true);
    const bf = game.gameState.battlefields.bfB;
    expect(bf?.contested).toBe(true);
    expect(bf?.contestedBy).toBe(P1);
    expect(bf?.controller).toBe(P2);
  });

  test("the move trigger is now on the chain (P1's, triggered) → Closed state: combat is merely Staged — no showdown has begun, no unit has a combat designation yet, and P1 holds PRIORITY (not Focus) (323.9, 323.13, 344)", async () => {
    const game = await board().build();
    await rideTo(game, "drummer");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drummer", controller: P1, triggered: true })]);
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.state("drummer").combatRole).toBeNull();
    expect(game.state("guard").combatRole).toBeNull();
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P1 });
    expect(game.gameState.battlefields.bfB?.contested).toBe(true);
  });

  // ── step 2: the trigger resolves ───────────────────────────────────────────────────────────

  test("the trigger resolves: a 1-Might Recruit token is played 'here' = bfB, a battlefield P1 does NOT control (355.2.b); bfB stays Contested-by-P1, controller still P2 (190.3.a.1)", async () => {
    const game = await board().build();
    await rideTo(game, "drummer");
    await drainChain(game);
    const recruit = recruitAt(game, "bfB");
    expect(recruit).toBeDefined();
    expect(game.state(recruit as string)).toMatchObject({ isToken: true, might: 1, controller: P1, zone: "battlefield-bfB" });
    expect(game.p1.units("bfB")).toHaveLength(2);
    const bf = game.gameState.battlefields.bfB;
    expect(bf?.contested).toBe(true);
    expect(bf?.contestedBy).toBe(P1);
    expect(bf?.controller).toBe(P2);
  });

  test("only NOW (chain empty → Neutral Open cleanup) does combat begin at bfB: P1 is the Attacker with Focus, and BOTH Drummer and the Recruit carry the Attacker designation; Guard defends (323.13, 464.2.c.1, 464.2.c.3, 464.2.d)", async () => {
    const game = await board().build();
    await rideTo(game, "drummer");
    await drainChain(game);
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ active: true, battlefieldId: "bfB", isCombatShowdown: true, attackingPlayer: P1, defendingPlayer: P2, focusPlayer: P1 });
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P1 });
    expect(game.state("drummer").combatRole).toBe("attacker");
    expect(game.state(recruitAt(game, "bfB") as string).combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
  });

  // ── step 3: combat math ────────────────────────────────────────────────────────────────────

  test("combat, default line (P2 puts all 3 on Drummer): attackers 3+1 = 4 ≥ 3 kill Guard; Drummer dies, the Recruit survives → P1 wins, conquers bfB, scores 1 (465, 466.3.a, 466.5.d)", async () => {
    const game = await board().build();
    await rideTo(game, "drummer");
    const settled = await game.settle(); // passive policy takes the offered default allocation
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("drummer")).toBe("trash");
    const recruit = recruitAt(game, "bfB");
    expect(recruit).toBeDefined();
    expect(game.state(recruit as string).damage).toBe(0);
    expect(game.gameState.battlefields.bfB).toMatchObject({ controller: P1, contested: false });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
  });

  test("combat, P2's alternative lethal-first line (1 to the Recruit, then 2 to Drummer, 465.2.c.3): Recruit dies, Drummer survives and is healed (466.1.a.1) → P1 still conquers +1", async () => {
    const game = await board().build();
    await rideTo(game, "drummer");
    const seen: Decision[] = [];
    game.script(P2, [
      (d) => {
        if (d.kind !== "distribute") {
          return undefined;
        }
        seen.push(d);
        const drummer = d.buckets.find((b) => b.card === "drummer");
        const recruit = d.buckets.find((b) => b.card !== "drummer");
        return { allocation: { [recruit?.key as string]: 1, [drummer?.key as string]: 2 }, kind: "distribute" };
      },
    ]);
    await game.settle();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ kind: "distribute", seat: P2, total: 3 });
    const buckets = (seen[0] as Extract<Decision, { kind: "distribute" }>).buckets;
    expect(buckets).toHaveLength(2);
    expect(buckets.map((b) => b.label).sort()).toEqual([expect.stringContaining("Noxian Drummer"), expect.stringContaining("Recruit")]);
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("drummer")).toBe("battlefield-bfB");
    expect(game.state("drummer").damage).toBe(0);
    expect(recruitAt(game, "bfB")).toBeUndefined();
    expect(game.gameState.battlefields.bfB).toMatchObject({ controller: P1, contested: false });
    expect(game.p1.points()).toBe(1);
  });

  test("CONTRAST without the token (vanilla 3-Might mover): 3 v 3, both die, nobody remains → no winner, bfB becomes UNCONTROLLED, nobody scores (466.3.d, 466.5.b) — so the Recruit's attacker status is outcome-determining", async () => {
    const game = await vanillaBoard().build();
    await rideTo(game, "mover");
    // No trigger: combat begins straight from the cleanup after the spell.
    expect(game.chain()).toEqual([]);
    expect(game.state("mover").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    await game.settle();
    expect(game.zoneOf("mover")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.cardsAt("bfB")).toEqual([]);
    expect(game.gameState.battlefields.bfB).toMatchObject({ controller: null, contested: false });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  // ── parity: Standard Move ──────────────────────────────────────────────────────────────────

  test("PARITY (outcome): Drummer walking base→bfB by Standard Move is exhausted (420.3.a), triggers the same token at bfB, and both Drummer and Recruit are attackers when damage is dealt → Guard dies, P1 conquers +1", async () => {
    const game = await walkBoard().build();
    await game.p1.move("drummer", "bfB");
    expect(game.zoneOf("drummer")).toBe("battlefield-bfB");
    expect(game.state("drummer").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drummer", triggered: true, controller: P1 })]);
    await drainChain(game);
    const recruit = recruitAt(game, "bfB");
    expect(recruit).toBeDefined();
    expect(game.state("drummer").combatRole).toBe("attacker");
    expect(game.state(recruit as string).combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P1 });
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.p1.units("bfB").length).toBeGreaterThanOrEqual(1);
    expect(game.gameState.battlefields.bfB).toMatchObject({ controller: P1, contested: false });
    expect(game.p1.points()).toBe(1);
  });

  test("PARITY (outcome): exhausted-vs-ready is the only lasting difference — same trash contents for P2, same score, same controller", async () => {
    const viaSpell = await board().build();
    await rideTo(viaSpell, "drummer");
    await viaSpell.settle();
    const viaMove = await walkBoard().build();
    await viaMove.p1.move("drummer", "bfB");
    await viaMove.settle();
    for (const g of [viaSpell, viaMove]) {
      expect(g.p2.trash()).toEqual(["guard"]);
      expect(g.gameState.battlefields.bfB?.controller).toBe(P1);
      expect(g.p1.points()).toBe(1);
      expect(g.violations()).toEqual([]);
    }
  });

  // A Standard Move ends with a cleanup (453) exactly like the spell's resolution does; the move trigger is
  // already on the chain, so the state is Closed and 323.13 cannot begin the combat yet — it stays Staged
  // until the trigger has resolved (then Drummer + Recruit gain Attacker together under 464.2.c.3).
  test("PARITY (sequence): after the Standard Move the combat stays Staged (no showdown, no designations, P1 has priority) while Drummer's move trigger is on the chain — exactly as after Ride the Wind (453, 323.13, 344)", async () => {
    const game = await walkBoard().build();
    await game.p1.move("drummer", "bfB");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drummer", triggered: true })]);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.state("drummer").combatRole).toBeNull();
    expect(game.state("guard").combatRole).toBeNull();
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P1 });
  });
});
