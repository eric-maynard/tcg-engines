/**
 * Interaction: Teemo, Strategist (ogn-121-298) · Champion Unit · Mind · 2 · 2 Might
 *     "[Hidden] When I defend, choose an enemy unit here and reveal the top 5 cards of your Main Deck. Deal 1 to
 *      that unit for each card with [Hidden] revealed this way, then recycle the revealed cards."
 *   × Cannon Barrage (ogn-127-298) · Spell · Body · 2 + [body] · Reaction — "Deal 2 to all enemy units in combat."
 *   × Not So Fast (sfd-045-221) · Spell · Calm · 2 + [calm] · Reaction — "Counter an enemy spell or ability that
 *     chooses a friendly unit or gear."
 *
 * Rules: 383.4.f (Defend trigger) · 402.2 (its target — "an enemy unit here" — is chosen at finalization) · 337.4
 * (then priority: the trigger's controller first) · 355.9.c + 383.2.a.1 (an ability and its source are separate
 * objects; removing the source after it triggered does not remove the ability — Sona example) · 355.9.a.2 / 425.3
 * (a finalized ability on the chain is "an ability" a counter may choose, whatever became of its source) · 425.1.a
 * (countered → does nothing, cleared) · 359.3.e.2 / 359.3.e.12 (at resolution a target must still meet "enemy unit
 * HERE"; a source that left the board has a null location) · 319.5 (Cleanup after an item leaves the chain kills
 * lethally-damaged units) · 466.5 (combat result: sole survivor side conquers; nobody left → uncontrolled).
 *
 * RULING (riftjudge 1bd4b510ce2c24a2 — literally Teemo × Cannon Barrage — and a84d20167aa557ec): when Teemo dies
 * before his trigger resolves "the effect still resolves and reveals the top 5 cards, but it cannot deal any damage
 * because the damage targets an enemy unit 'here' (where Teemo is) and Teemo is no longer anywhere". The pairing
 * brief expected 4 damage ("the text doesn't read Teemo's stats"), but "here" IS a characteristic of the source
 * (359.3.e.12: a unit off the board has no location → A no longer meets "enemy unit here", 359.3.e.2/.e.5), the
 * two train rulings are explicit, and the engine agrees — so facet (a) asserts: item persists, reveal + recycle
 * happen, damage 0.
 *
 * Board: P1's turn. P2 controls bf1 with Teemo (2) + Guard (3, vanilla). P1 has vanilla A (5) in base, Cannon
 * Barrage + Not So Fast in hand and exactly 4 energy + [body] + [calm]. P2's top 5 = 4 [Hidden] cards + 1 plain.
 * P1 moves A → bf1: Teemo's defend trigger is finalized on A (the only enemy unit there).
 *   (a) P2 passes, P1 Barrages: Teemo dies in the Cleanup after Barrage resolves, Guard carries 2; the source-less
 *       trigger stays on the chain (targets [A]) and resolves: reveals d1–d5, recycles them, deals 0 (ruling).
 *       Combat: A 5 into Guard (3, 2 dmg) → Guard dies, A takes 3 and survives → P1 conquers bf1.
 *   (b) P1 answers with Not So Fast on the trigger instead: legal (enemy ability choosing friendly A) → countered:
 *       no reveal, no damage, Teemo alive. Combat: A 5 vs 2 + 3 → P1's default assignment kills both defenders,
 *       A takes 5 and dies → nobody left, bf1 uncontrolled, no points.
 *   (c) Both: Barrage (Teemo dies), then NSF on the ORPHANED trigger — still a legal "enemy ability that chooses a
 *       friendly unit" → countered; no reveal; combat as in (a) → P1 conquers.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEEMO = "ogn-121-298";
const CANNON_BARRAGE = "ogn-127-298";
const NOT_SO_FAST = "sfd-045-221";
const CONSULT_THE_PAST = "ogn-083-298"; // spell with [Hidden]
const FAE_DRAGON = "ogn-097-298"; // unit with [Hidden]
const SKULKER = "ogn-175-298"; // no [Hidden]

function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { body: 1, calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", TEEMO, "teemo")
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 5, name: "Attacker A" }, "a")
    .hand(P1, CANNON_BARRAGE, "barrage")
    .hand(P1, NOT_SO_FAST, "nsf")
    .deck(P2, [CONSULT_THE_PAST, FAE_DRAGON, SKULKER, CONSULT_THE_PAST, FAE_DRAGON, SKULKER, SKULKER], ["d1", "d2", "d3", "d4", "d5", "d6", "d7"]);
}

/** A attacks bf1; Teemo's defend trigger is finalized on A; P2 (its controller) passes → P1 holds priority. */
async function triggerPendingP1HasPriority(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("a", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P2, targets: ["a"], triggered: true, type: "ability" })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

/** …P1 casts Cannon Barrage and both pass: it resolves (Teemo dies in the Cleanup), the trigger is still pending. */
async function afterBarrage(): Promise<Game> {
  const game = await triggerPendingP1HasPriority();
  await game.p1.cast("barrage");
  expect(game.p1.resources()).toEqual({ energy: 2, power: { body: 0, calm: 1 } });
  expect(game.chain().map((i) => i.cardId)).toEqual(["teemo", "barrage"]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

const lastReveal = (game: Game) => game.gameState.publicReveals?.at(-1);

describe("Teemo's defend trigger with its source Barraged away — resolves source-less (reveal, 0 damage 'here') vs Not So Fast", () => {
  test("premise: the Defend trigger is finalized at once with its only legal object A (402.2), P2 then P1 get priority (337.4); with priority P1 may cast Barrage or Not So Fast (whose only legal target is that trigger)", async () => {
    const game = await triggerPendingP1HasPriority();
    expect(game.p1.can("cast", "barrage")).toBe(true);
    expect(game.p1.can("cast", "nsf")).toBe(true);
    const nsfTargets = game.p1.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options;
    expect(nsfTargets).toEqual([["teemo"]]);
    expect(game.p2.deck().slice(0, 5)).toEqual(["d1", "d2", "d3", "d4", "d5"]);
    expect(game.state("a").damage).toBe(0);
  });

  // ── (a) Cannon Barrage kills the source before the trigger resolves ────────────────────────────

  test("(a) Barrage resolves first (LIFO): 2 to Teemo (lethal) and 2 to the Guard; the Cleanup puts Teemo in P2's trash — yet his finalized trigger is STILL on the chain with targets [A] intact (355.9.c, 383.2.a.1) and priority reopens with P2", async () => {
    const game = await afterBarrage();
    expect(game.zoneOf("barrage")).toBe("trash");
    expect(game.zoneOf("teemo")).toBe("trash");
    expect(game.state("guard")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    expect(game.state("a").damage).toBe(0); // Barrage hits ENEMY units only
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P2, countered: false, targets: ["a"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("(a) both pass → the source-less trigger RESOLVES (it is not removed with Teemo): P2 reveals exactly d1–d5 publicly and recycles them — d6 is the new top, d1–d5 sit at the bottom", async () => {
    const game = await afterBarrage();
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(lastReveal(game)).toMatchObject({ cardIds: ["d1", "d2", "d3", "d4", "d5"], playerId: P2 });
    const deck = game.p2.deck();
    expect(deck[0]).toBe("d6");
    expect(deck.slice(-5).sort()).toEqual(["d1", "d2", "d3", "d4", "d5"]);
    expect(game.p2.hand()).not.toContain("d1"); // revealed, not drawn
  });

  // RULING: riftjudge 1bd4b510ce2c24a2 / a84d20167aa557ec — "still reveals, but no damage: the target must be an
  // enemy unit HERE and Teemo is no longer anywhere" (CR 359.3.e.2 / 359.3.e.12). The brief expected 4; engine and
  // rulings say 0, and the CR's null-location rule supports them.
  test("(a) …but A is dealt 0, not 4: 'that unit' had to be an enemy unit HERE and the dead source has no 'here' (359.3.e.2, 359.3.e.12; riftjudge 1bd4b510ce2c24a2)", async () => {
    const game = await afterBarrage();
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("a")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" }); // combat showdown goes on
  });

  test("(a) combat then resolves A 5 into the Guard (3, already carrying 2): the Guard dies, A takes 3 and survives (3 < 5) → P1 CONQUERS bf1 for 1 point; Teemo, Guard, Barrage in the trashes", async () => {
    const game = await afterBarrage();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("teemo")).toBe("trash");
    expect(game.state("a")).toMatchObject({ location: "bf1", zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) Not So Fast on the trigger (Teemo alive) ───────────────────────────────────────────────

  test("(b) Not So Fast is legal on the trigger — an ENEMY ability that chose FRIENDLY A — and stacks on top for 2 + [calm]", async () => {
    const game = await triggerPendingP1HasPriority();
    await game.p1.cast("nsf", { targets: "teemo" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { body: 1, calm: 0 } });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "teemo", targets: ["a"], triggered: true }),
      expect.objectContaining({ cardId: "nsf", controller: P1, targets: ["teemo"], triggered: false, type: "spell" }),
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // caster keeps priority
  });

  test("(b) both pass → the trigger is COUNTERED and cleared (425.1.a): nothing is revealed (deck untouched, d1 on top), A takes 0, Teemo is alive and undamaged, NSF in P1's trash; the showdown continues with the chain empty", async () => {
    const game = await triggerPendingP1HasPriority();
    await game.p1.cast("nsf", { targets: "teemo" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.gameState.publicReveals ?? []).toEqual([]);
    expect(game.p2.deck().slice(0, 5)).toEqual(["d1", "d2", "d3", "d4", "d5"]);
    expect(game.state("a").damage).toBe(0);
    expect(game.state("teemo")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("(b) combat: A's 5 is exactly lethal to Teemo 2 + Guard 3 — the only legal assignment (465.2.c), taken without a prompt — while the defenders' 2 + 3 = 5 kill A → nobody remains: bf1 becomes UNCONTROLLED, no conquer, no points (466.5)", async () => {
    const game = await triggerPendingP1HasPriority();
    await game.p1.cast("nsf", { targets: "teemo" });
    let prompted = false;
    for (const seat of [P1, P2]) {
      game.script(seat, [
        (d) => {
          if (d.kind === "distribute") {
            prompted = true;
          }
          return undefined;
        },
      ]);
    }
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(prompted).toBe(false);
    expect(game.zoneOf("teemo")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) Barrage first, then NSF on the orphaned trigger ────────────────────────────────────────

  test("(c) after Barrage killed Teemo, the orphaned finalized trigger is still 'an enemy ability that chooses a friendly unit' (355.9.a.2, 425.3): once P2 passes, NSF is OFFERED with it as the sole target and the cast is accepted", async () => {
    const game = await afterBarrage();
    expect(game.zoneOf("teemo")).toBe("trash");
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "nsf")).toBe(true);
    expect(game.p1.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options).toEqual([["teemo"]]);
    await game.p1.cast("nsf", { targets: "teemo" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, calm: 0 } });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "teemo", controller: P2, targets: ["a"], triggered: true }),
      expect.objectContaining({ cardId: "nsf", controller: P1, targets: ["teemo"] }),
    ]);
  });

  test("(c) it resolves as a counter: the trigger is cleared without revealing anything (deck untouched), A takes 0; Teemo was already dead; NSF and Barrage in P1's trash", async () => {
    const game = await afterBarrage();
    await game.p2.passPriority();
    await game.p1.cast("nsf", { targets: "teemo" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.gameState.publicReveals ?? []).toEqual([]);
    expect(game.p2.deck().slice(0, 5)).toEqual(["d1", "d2", "d3", "d4", "d5"]);
    expect(game.state("a").damage).toBe(0);
    expect(game.zoneOf("teemo")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["barrage", "nsf"]);
  });

  test("(c) combat afterwards is (a)'s: A 5 kills the wounded Guard, takes 3, survives, and P1 conquers bf1 (1 point)", async () => {
    const game = await afterBarrage();
    await game.p2.passPriority();
    await game.p1.cast("nsf", { targets: "teemo" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("a")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  // ── control: nothing interferes ────────────────────────────────────────────────────────────────

  test("control — no response at all: the trigger resolves with Teemo alive: d1–d5 revealed (4 Hidden) → A takes exactly 4 and survives (4 < 5), cards recycled; then A 5 vs 2 + 3 kills both defenders while 4 + 5 kills A → bf1 uncontrolled", async () => {
    const game = await triggerPendingP1HasPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(lastReveal(game)).toMatchObject({ cardIds: ["d1", "d2", "d3", "d4", "d5"], playerId: P2 });
    expect(game.state("a")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
    expect(game.p2.deck()[0]).toBe("d6");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("teemo")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
  });
});
