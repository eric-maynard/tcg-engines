/**
 * Interaction: Hextech Ray (ogn-009-298) · Spell · Fury · 1+[fury] · [Action] — "Deal 3 to a unit at a battlefield."
 *   × Sacrifice (unl-173-219) · Spell · Order · 1 · [Reaction] — "As an additional cost to play this, kill a
 *     friendly [Mighty] unit. Draw 2 and channel 1 rune exhausted."
 *   × Nasus, Guardian of Knowledge (ven-063-166) · Champion Unit · Mind · 5+[mind] · 6 Might —
 *     "Once each turn, when an enemy unit here dies, channel 1 rune exhausted."
 *
 * Rules: 337.1 / 337.1.a / 337.1.b / 337.3 (Pending items are finalized strictly in APPEND order, oldest
 * first, and finalizing never passes Priority), 337.4 (only when nothing is Pending does the controller
 * of the newest item gain Priority), 339.1 (all pass in sequence → resolve), 340.1 (newest resolves),
 * 340.4 (after a resolution the controller of the new newest item gains Priority), 340.2 + 335 (empty
 * chain → Open state, turn player has priority), 357.2 (additional costs are paid during play), 383.3
 * (a triggered ability is appended when its event happens — here while Sacrifice is still Pending),
 * 359.3.e.2 / .e.5 (a target that left the board is illegal on resolution; the spell does nothing to it
 * but still resolves and goes to trash).
 *
 * Question: P2's turn. bf1 (P2's) holds P2's Nasus (6) and P1's 5-Might unit X. P2 plays Hextech Ray on X
 * and passes; P1 responds with Sacrifice, killing X as the cost; Nasus's trigger fires while Sacrifice is
 * still Pending.
 *   (a) Finalize order = append order (Sacrifice, then the Nasus trigger), no priority in between; then
 *       priority to P2 (controller of the newest item). Chain oldest→newest: [Ray (P2), Sacrifice (P1),
 *       Nasus trigger (P2)].
 *   (b) P2 pass, P1 pass → Nasus trigger resolves (P2 channels 1 exhausted) → priority P1; P1 pass, P2
 *       pass → Sacrifice resolves (P1 draws 2, channels 1 exhausted) → priority P2; P2 pass, P1 pass →
 *       Ray resolves on an illegal target: no damage, → trash; Open state, P2 has priority. Nasus's
 *       once-each-turn is consumed.
 *   (c) Control: X at bf2 (no Nasus) → chain [Ray, Sacrifice], priority P1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_RAY = "ogn-009-298";
const SACRIFICE = "unl-173-219";
const NASUS = "ven-063-166";

function board(xAt: "bf1" | "bf2" = "bf1") {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { fury: 2 } })
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", NASUS, "nasus")
    .unit(P1, xAt, { might: 5, name: "Unit X" }, "x")
    .unit(P1, "bf1", { might: 1, name: "Unit Y" }, "y")
    .hand(P2, HEXTECH_RAY, "ray")
    .hand(P2, HEXTECH_RAY, "ray2")
    .hand(P1, SACRIFICE, "sacrifice");
}

/** P2 casts Ray on X and passes; P1 responds with Sacrifice killing X. */
async function rayThenSacrifice(game: Game): Promise<void> {
  await game.p2.cast("ray", { targets: "x" });
  await game.p2.passPriority();
  expect(game.actingSeat()).toBe(P1);
  await game.p1.cast("sacrifice", { sacrifice: "x" });
}

const chainStatuses = (game: Game) => (game.gameState.interaction?.chain?.items ?? []).map((i) => i.status ?? "finalized");

describe("Sacrifice kills X under Nasus in response to Hextech Ray — cross-seat finalize order and the resolution walk", () => {
  test("setup: it is P2's turn; Ray offers X (and Y, and Nasus) as 'a unit at a battlefield'; after Ray, P1's only response is the Reaction Sacrifice with X (its only Mighty unit) as the cost", async () => {
    const game = await board().build();
    expect(game.turnPlayer()).toBe(P2);
    const rayTargets = game.p2.option("cast", "ray")?.fields.find((f) => f.arg === "targets")?.options ?? [];
    expect(new Set(rayTargets.flat() as string[])).toEqual(new Set(["x", "y", "nasus"]));
    await game.p2.cast("ray", { targets: "x" });
    await game.p2.passPriority();
    const sacOptions = game.p1.option("cast", "sacrifice")?.fields.find((f) => f.arg === "sacrifice")?.options ?? [];
    expect([...sacOptions]).toEqual(["x"]);
  });

  test("(a) X dies as Sacrifice's COST (357.2) — Nasus's trigger is appended behind the still-Pending Sacrifice; both end up Finalized in append order with NO priority window in between (337.1/.1.a/.1.b/.3)", async () => {
    const game = await board().build();
    await rayThenSacrifice(game);
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.zoneOf("sacrifice")).toBe("chain");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "ray", controller: P2, triggered: false }),
      expect.objectContaining({ cardId: "sacrifice", controller: P1, triggered: false }),
      expect.objectContaining({ cardId: "nasus", controller: P2, triggered: true }),
    ]);
    expect(chainStatuses(game)).toEqual(["finalized", "finalized", "finalized"]);
    // Nothing resolved during finalization: no draws, no runes yet.
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.runes()).toEqual([]);
    expect(game.p2.runes()).toEqual([]);
  });

  test("(a) once nothing is Pending, Priority goes to the controller of the NEWEST item — P2 (Nasus trigger), not P1 who just played (337.4)", async () => {
    const game = await board().build();
    await rayThenSacrifice(game);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p1.can("passPriority")).toBe(false);
  });

  test("(b) step 1 — P2 pass, P1 pass → the Nasus trigger resolves: P2 channels 1 rune EXHAUSTED; chain [Ray, Sacrifice]; Priority → P1 (controller of Sacrifice, 340.4)", async () => {
    const game = await board().build();
    await rayThenSacrifice(game);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // 339.2 — one pass only hands priority on
    expect(game.p2.runes()).toEqual([]);
    await game.p1.passPriority();
    expect(game.p2.runes()).toHaveLength(1);
    expect(game.p2.runes({ ready: true })).toEqual([]);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "ray", controller: P2 }),
      expect.objectContaining({ cardId: "sacrifice", controller: P1 }),
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(b) step 2 — P1 pass, P2 pass → Sacrifice resolves: P1 draws 2 and channels 1 rune exhausted; Sacrifice → trash; chain [Ray]; Priority → P2 (340.4)", async () => {
    const game = await board().build();
    await rayThenSacrifice(game);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Nasus trigger
    await game.p1.passPriority();
    await game.p2.passPriority(); // Sacrifice
    expect(game.zoneOf("sacrifice")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: true })).toEqual([]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P2, triggered: false })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("(b) step 3 — P2 pass, P1 pass → Hextech Ray resolves on an illegal target (X is in the trash, 359.3.e.2): no damage anywhere, Ray still 'played' → trash; chain empty → Neutral Open, turn player P2 acts (340.2, 335)", async () => {
    const game = await board().build();
    await rayThenSacrifice(game);
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.state("y").damage).toBe(0);
    expect(game.state("nasus").damage).toBe(0);
    expect(game.p2.resources()).toEqual({ energy: 1, power: { fury: 1 } }); // Ray's cost stayed paid
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("(b) Nasus's 'once each turn' is consumed: a second enemy unit (Y) dying at bf1 later this turn does NOT channel again", async () => {
    const game = await board().build();
    await rayThenSacrifice(game);
    await game.settle();
    expect(game.p2.runes()).toHaveLength(1);
    await game.p2.cast("ray2", { targets: "y" });
    await game.settle();
    expect(game.zoneOf("y")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.p2.runes()).toHaveLength(1); // still just the one from the first death
  });

  // ── (c) control: X at bf2, away from Nasus ────────────────────────────────────────────────

  test("(c) X at bf2 (not 'here' for Nasus): no trigger — chain after Sacrifice finalizes is [Ray (P2), Sacrifice (P1)] and P1, controller of the newest item, holds Priority (337.4)", async () => {
    const game = await board("bf2").build();
    await rayThenSacrifice(game);
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "ray", controller: P2, triggered: false }),
      expect.objectContaining({ cardId: "sacrifice", controller: P1, triggered: false }),
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(c) then P1 pass, P2 pass → Sacrifice resolves (draw 2, channel 1); P2 pass, P1 pass → Ray fizzles on dead X; P2 never channels; back to P2's open main phase", async () => {
    const game = await board("bf2").build();
    await rayThenSacrifice(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("sacrifice")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.p2.runes()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });
});
