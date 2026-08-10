/**
 * Interaction: Tornado Warrior (ven-099-166) × Gust (ogn-169-298)
 *
 *   Tornado Warrior — Unit · Chaos · 3 · 3 Might
 *     "[Hidden] (Hide now for [rainbow] to react with later for [0].)
 *      When you play me from face down, you may empower something here. Disempower it at end of turn."
 *   Gust — Spell (Reaction) · Chaos · 1
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Rules: 402.1 / 402.2 ("you may" and the chosen object are fixed when the trigger is finalized on the
 * chain), 383.3 (a triggered ability on the chain is independent of its source), 441.1 / 442.1 /
 * 442.1.a.1 (Empower / Disempower; disempowering a non-empowered thing does nothing), 390.2 / 390.5 /
 * 390.5.a (a "… at end of turn" rider is a DELAYED triggered ability linked to that object), 392 (delayed
 * abilities fire at their time regardless of whether the creating card is still on the board), 317.1.a
 * (Ending Step: end-of-turn triggers go on the chain — a real priority window), 359.3.e.2 / .e.4 (a chosen
 * object that left the board → instruction ignored; a replayed card is a NEW object), 359.3.e.3 (moving
 * between board locations keeps it the same object).
 *
 * Question: P1's turn; P1 controls bf1 with vanilla X (3) there and a facedown Tornado Warrior at bf1; P2
 * holds Gust. P1 flips the Warrior for [0]; its trigger goes on the chain, P1 says yes and picks X.
 *   Case A — P2 Gusts the WARRIOR in response: (a) is X still empowered? (b) at end of turn, with the
 *            Warrior long gone, does "Disempower it" still happen, as a respondable chain item?
 *   Case B — P2 Gusts X in response: anything empowered? delayed trigger? a replayed X affected at EOT?
 *   Case C — no response; X later walks back to base: is X (no longer "here") disempowered at EOT?
 *
 * Expected: A(a) yes — Gust resolves first and bounces the Warrior, but the pending trigger still resolves
 * and empowers X. A(b) yes — a delayed trigger, put on the chain in the Ending Step under P1's control;
 * P1 then P2 get priority; X is disempowered on resolution. B: nothing is empowered (X left → ignored),
 * the Warrior stays at bf1 un-empowered, a replayed X is a new un-empowered object, and the end of turn
 * raises nothing. C: yes — "here" only scoped the choice; the delayed "Disempower it" follows the object
 * to base: chain item at EOT, X disempowered.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TORNADO_WARRIOR = "ven-099-166";
const GUST = "ogn-169-298";

/**
 * P1's turn (turn 2). bf1: P1's X (3 Might, replayable for 2) + P1's facedown Tornado Warrior. P2 exactly
 * affords Gust (1 + a chaos power in case of a pip). P1 has 5 energy to replay X in Case B.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5 })
    .resources(P2, { energy: 1, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { energyCost: 2, might: 3, name: "Vanilla X" }, "x")
    .facedown(P1, "bf1", TORNADO_WARRIOR, "tw")
    .hand(P2, GUST, "gust");
}

/** P1 flips the Warrior at bf1, answers its trigger "yes" → X, and passes priority to P2 (trigger still pending). */
async function flippedChoosingX(): Promise<Game> {
  const game = await board().build();
  await game.p1.reveal("tw");
  expect(game.zoneOf("tw")).toBe("battlefield-bf1");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 }); // "you MAY empower…" (402.1)
  await game.p1.yes();
  const pick = game.decision();
  expect(pick).toMatchObject({ kind: "pick", seat: P1, semantics: "target" });
  // "something here": only permanents at bf1 are offered
  expect(pick?.kind === "pick" ? pick.options.map((o) => o.key).sort() : []).toEqual(["tw", "x"]);
  await game.p1.pick("x");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tw", controller: P1, targets: ["x"], triggered: true })]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  return game;
}

describe("Tornado Warrior × Gust — the empower trigger and its end-of-turn 'Disempower it'", () => {
  test("setup: flipping the Warrior costs [0]; the trigger's 'you may' + object (X) are fixed at finalization and public on the chain; P2 may respond with Gust on X or on the 3-Might Warrior", async () => {
    const game = await flippedChoosingX();
    expect(game.p1.energy()).toBe(5);
    expect(game.p2.can("cast", "gust")).toBe(true);
    const offered = (game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect([...offered].sort()).toEqual(["tw", "x"]);
    expect(game.state("x").isEmpowered).toBe(false); // nothing resolved yet
  });

  // ── Case A: Gust the Warrior in response ──────────────────────────────────────────────────

  test("Case A: Gust resolves first (LIFO) — Tornado Warrior returns to P1's hand while its trigger is still on the chain", async () => {
    const game = await flippedChoosingX();
    await game.p2.cast("gust", { targets: "tw" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["tw", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("tw")).toBe("hand");
    expect(game.p1.hand()).toContain("tw");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tw", targets: ["x"], triggered: true })]);
    expect(game.p2.resources().energy).toBe(0);
  });

  // Expected: the trigger is independent of its (bounced) source; X was chosen at finalization and is
  // still at bf1, so on resolution X becomes Empowered (402.2, 383.3, 441.1).
  // Actual: once the Warrior has left the board the trigger resolves doing nothing — X stays un-empowered
  // (the engine re-reads "here" from the absent source instead of honouring the locked choice).
  test.failing("BUG: Case A (a) — X still becomes Empowered when the trigger resolves although the Warrior was Gusted first (402.2, 383.3, 441.1)", async () => {
    const game = await flippedChoosingX();
    await game.p2.cast("gust", { targets: "tw" });
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("tw")).toBe("hand");
    expect(game.zoneOf("x")).toBe("battlefield-bf1");
    expect(game.state("x").isEmpowered).toBe(true);
  });

  // Expected: in P1's Ending Step the delayed "Disempower it" is put on the chain as a triggered item
  // controlled by P1 (392 — regardless of the Warrior being in hand); P1 then P2 hold priority (P2 could
  // even Gust again); on resolution X is Disempowered (442.1). Not a silent duration expiry.
  // Actual: blocked by the bug above — X was never empowered and no delayed trigger was created, so the
  // turn ends straight into P2's turn with an empty chain.
  test.failing("BUG: Case A (b) — at end of turn a respondable 'Disempower X' chain item appears (P1 then P2 get priority) and X ends the turn disempowered, Warrior still in hand (390.2, 392, 317.1.a, 442.1)", async () => {
    const game = await flippedChoosingX();
    await game.p2.cast("gust", { targets: "tw" });
    await game.settle();
    expect(game.state("x").isEmpowered).toBe(true);
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([expect.objectContaining({ controller: P1, targets: ["x"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("x").isEmpowered).toBe(true); // still empowered while the item is pending
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // a real reaction window
    expect(game.chain()).toHaveLength(1);
    await game.p2.passPriority();
    expect(game.state("x").isEmpowered).toBe(false);
    expect(game.zoneOf("tw")).toBe("hand");
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
  });

  // ── Case B: Gust X in response ────────────────────────────────────────────────────────────

  test("Case B: Gust bounces X first; the Warrior's trigger then resolves with its chosen object gone → nothing is empowered (359.3.e.2); the Warrior itself stays at bf1, un-empowered", async () => {
    const game = await flippedChoosingX();
    await game.p2.cast("gust", { targets: "x" });
    const s = await game.settle();
    expect(s.reason).toBe("open"); // no re-target prompt was raised
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("x")).toBe("hand");
    expect(game.p1.hand()).toContain("x");
    expect(game.state("tw")).toMatchObject({ isEmpowered: false, zone: "battlefield-bf1" });
    for (const id of [...game.p1.units(), ...game.p2.units()]) {
      expect(game.state(id).isEmpowered).toBe(false);
    }
  });

  test("Case B: P1 replays X (back to bf1, even) this turn — the NEW object enters un-empowered (359.3.e.4), and the end of turn raises no 'Disempower' item: the turn passes straight to P2 with X untouched", async () => {
    const game = await flippedChoosingX();
    await game.p2.cast("gust", { targets: "x" });
    await game.settle();
    expect(game.p1.can("play", "x")).toBe(true);
    await game.p1.play("x", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("x")).toBe("battlefield-bf1");
    expect(game.state("x").isEmpowered).toBe(false);
    expect(game.p1.energy()).toBe(3);
    await game.p1.endTurn();
    expect(game.chain()).toEqual([]); // no delayed trigger exists (390.5.a — no object in an appropriate zone)
    expect(game.phase()).not.toBe("ending");
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("x")).toMatchObject({ isEmpowered: false, zone: "battlefield-bf1" });
    expect(game.state("tw")).toMatchObject({ isEmpowered: false, zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
  });

  // ── Case C: no response; X walks home ─────────────────────────────────────────────────────

  test("Case C: no response — the trigger resolves and X at bf1 is Empowered (441.1); Warrior and X both remain at bf1", async () => {
    const game = await flippedChoosingX();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("x")).toMatchObject({ isEmpowered: true, zone: "battlefield-bf1" });
    expect(game.state("tw")).toMatchObject({ isEmpowered: false, zone: "battlefield-bf1" });
    expect(game.p2.hand()).toContain("gust");
  });

  test("Case C: X moves back to base and stays Empowered there — a move between board locations keeps it the same object (359.3.e.3); nothing expires mid-turn", async () => {
    const game = await flippedChoosingX();
    await game.settle();
    await game.p1.move("x", "base");
    await game.settle();
    expect(game.locationOf("x")).toBe("base");
    expect(game.state("x").isEmpowered).toBe(true);
  });

  test("Case C: at end of turn 'Disempower it' is a triggered CHAIN ITEM in P1's Ending Step aimed at X (now in base, no longer 'here'); P1 then P2 receive priority — P2 could still Gust — and X is disempowered only on resolution (390.2, 392, 317.1.a, 442.1)", async () => {
    const game = await flippedChoosingX();
    await game.settle();
    await game.p1.move("x", "base");
    await game.settle();
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([expect.objectContaining({ controller: P1, targets: ["x"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("x").isEmpowered).toBe(true); // not a silent expiry: still empowered while pending
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true); // a real reaction window (the Warrior at bf1 is a legal Gust target)
    expect(game.chain()).toHaveLength(1);
    expect(game.state("x").isEmpowered).toBe(true);
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("x")).toMatchObject({ isEmpowered: false, zone: "base" });
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.state("x").isEmpowered).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("Case C control: X that never moved is likewise disempowered via the end-of-turn chain item; the Warrior (never empowered) is unaffected", async () => {
    const game = await flippedChoosingX();
    await game.settle();
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("x")).toMatchObject({ isEmpowered: false, zone: "battlefield-bf1" });
    expect(game.state("tw")).toMatchObject({ isEmpowered: false, zone: "battlefield-bf1" });
  });
});
