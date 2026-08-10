/**
 * Interaction: Kinkou Monk (ogn-141-298) "When you play me, buff up to two other friendly units." — an "up to N"
 *              targeted trigger — vs Gust (ogn-169-298) bouncing a chosen unit in response, and Shen, Kinkou
 *              (ogn-241-298) arriving as a [Reaction] after the targets were locked.
 *
 *   Kinkou Monk — Unit · Body · 4+[body] · 4 Might
 *     "When you play me, buff up to two other friendly units. (Each one that doesn't have a buff gets a +1 [Might] buff.)"
 *   Gust — Spell · Chaos · 1 · [Reaction]: "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   Shen, Kinkou — Unit · Order · 3+[order] · 3 Might · [Reaction] [Shield 2] [Tank]
 *
 * Question. P1 controls A (2 Might, at bf1), B and C (in base), all unbuffed, and holds Monk and Shen. P1 plays Monk
 * and, at finalization, chooses A and B.
 *  (a) P2 responds with Gust on A (→ hand). On resolution: is B still buffed? Is A (now a card in hand) buffed? May
 *      P1 re-assign A's slot to C?
 *  (b) Instead P1 responds to its own Monk trigger by playing Shen as a Reaction — can Shen be added as one of the
 *      "up to two" when the trigger resolves?
 *  (c) P1 chose only ONE target (A) although B and C were available — can a second be added at resolution?
 *  (d) When exactly is the 0/1/2 choice made, and by whom?
 *
 * Rules: 402.2 → 355.5 (a triggered ability's targets — including how many of an "up to N" — are chosen by its
 * controller during FINALIZATION, before anyone receives priority; 355.13: choosing fewer, even zero, is legal and
 * the item stays), 359.3.e.2 / 359.3.e.4 (a target that changed to a non-board zone is no longer legal),
 * 359.3.e.8 (the effect operates on the remaining legal targets only — no re-targeting at resolution), 124 (a card
 * that left the board and returns is a NEW object), 337.4 (LIFO: Gust resolves before the Monk trigger).
 *
 * Expected. (d) FIN pick for P1: kind "pick", timing FIN, targeting "up-to", min 0 / max 2, options exactly
 * {A, B, C} (Monk himself and enemy units excluded); the finalized item records targets [A, B] and that snapshot
 * never changes afterwards. (a) Gust resolves first, A → hand; the Monk trigger then buffs B only; A (in hand, and
 * if replayed: a new object) and C get nothing; no prompt at resolution. (b) Shen enters fine but was never a
 * target → not buffed; A and B are. (c) One pick is final: A buffed, B / C not, nothing asked at resolution.
 * Zero picks: the item still finalizes and resolves doing nothing.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KINKOU_MONK = "ogn-141-298";
const GUST = "ogn-169-298";
const SHEN_KINKOU = "ogn-241-298";

/**
 * Turn 2, P1 active with 7 energy + [body] + [order] (Monk 4+[body], Shen 3+[order]). bf1 is P1's with A (2);
 * B (2) and C (2) in P1's base — all unbuffed; bf2 is P2's with enemy E (3). P2 holds Gust with exactly 1 energy.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { body: 1, order: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Unit A" }, "A")
    .unit(P1, "base", { might: 2, name: "Unit B" }, "B")
    .unit(P1, "base", { might: 2, name: "Unit C" }, "C")
    .unit(P2, "bf2", { might: 3, name: "Enemy E" }, "E")
    .hand(P1, KINKOU_MONK, "monk")
    .hand(P1, SHEN_KINKOU, "shen")
    .hand(P2, GUST, "gust");
}

/** P1 plays Monk to base → the FIN target-set pick for its trigger is pending. */
async function monkPlayed(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("monk", { to: "base" });
  return game;
}

/** …and P1 locks A and B as the "up to two" → P1 holds priority on the finalized trigger. */
async function lockedAB(): Promise<Game> {
  const game = await monkPlayed();
  await game.p1.pick("A", "B");
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

/** Pass priority until the chain is empty. */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 10 && game.chain().length > 0 && game.decision()?.kind === "action"; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
}

const monkItem = (game: Game) => game.chain().find((c) => c.cardId === "monk");

describe("Kinkou Monk 'up to two' — chosen at finalization, locked against Gust and a late Shen", () => {
  // ── (d) when / who ───────────────────────────────────────────────────────────────────────────

  test("(d) the 0–2 choice is P1's FINALIZATION decision, asked immediately after the play and BEFORE anyone has priority: pick, timing FIN, targeting 'up-to', min 0 / max 2 (402.2, 355.5, 355.13)", async () => {
    const game = await monkPlayed();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", max: 2, min: 0, seat: P1, semantics: "target", targeting: "up-to", timing: "FIN" });
    expect(d?.kind === "pick" ? d.source?.cardId : undefined).toBe("monk");
    // the trigger is already on the chain as a pending item, with no targets recorded yet
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "monk", controller: P1, triggered: true })]);
    expect(monkItem(game)?.targets).toBeUndefined();
    // nobody may act yet: P2 has no menu at all
    expect(game.p2.legal()).toEqual([]);
  });

  test("(d) the offered set is exactly the OTHER FRIENDLY units {A, B, C} — not Monk himself, not the enemy E", async () => {
    const game = await monkPlayed();
    const d = game.decision();
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : [];
    expect(offered).toEqual(["A", "B", "C"]);
    await expect(game.p1.pick("E")).rejects.toThrow();
    // (raw answer: the `pick()` verb treats naming the SOURCE card as a no-op re-assertion)
    const self = await game.act(P1, { keys: ["monk"], kind: "pick" });
    expect(self.ok).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
  });

  test("(d) picking A and B finalizes the item with targets [A, B]; Monk cost exactly 4 + [body]; P1 (turn player) then holds priority", async () => {
    const game = await lockedAB();
    expect(monkItem(game)).toMatchObject({ cardId: "monk", controller: P1, targets: ["A", "B"], triggered: true });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { body: 0, order: 1 } });
    expect(game.zoneOf("monk")).toBe("base");
  });

  test("(d) three picks are rejected — 'up to two' caps the set at 2", async () => {
    const game = await monkPlayed();
    await expect(game.p1.pick("A", "B", "C")).rejects.toThrow();
  });

  // ── (a) Gust on A in response ────────────────────────────────────────────────────────────────

  test("(a) P2 may respond with Gust on A (2 Might, at a battlefield); Gust sits above the Monk trigger and the trigger's target snapshot stays [A, B]", async () => {
    const game = await lockedAB();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.cast("gust", { targets: "A" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["monk", "gust"]);
    expect(monkItem(game)?.targets).toEqual(["A", "B"]);
    expect(game.p2.energy()).toBe(0);
  });

  test("(a) LIFO (337.4): Gust resolves first — A is in P1's hand while the Monk trigger, still targeting [A, B], waits", async () => {
    const game = await lockedAB();
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "A" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("A")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["monk"]);
    expect(monkItem(game)?.targets).toEqual(["A", "B"]);
    // no re-targeting dialog opens for P1: it is a plain priority window
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(a) the trigger then resolves on its remaining legal target only: B is buffed (+1 → 3 Might); A in hand is not; C was never chosen and cannot be substituted; nothing is asked at resolution (359.3.e.2/.4/.8)", async () => {
    const game = await lockedAB();
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "A" });
    await resolveChain(game);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("B")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("C")).toMatchObject({ isBuffed: false, might: 2 });
    expect(game.zoneOf("A")).toBe("hand");
    expect(game.state("A").isBuffed).toBe(false);
    expect(game.state("monk")).toMatchObject({ isBuffed: false, might: 4 }); // "other" — never himself
  });

  test("(a) A replayed afterwards is a NEW object (124): it enters unbuffed", async () => {
    const game = await lockedAB();
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "A" });
    await resolveChain(game);
    await game.p1.play("A", { to: "base" });
    await game.settle();
    expect(game.zoneOf("A")).toBe("base");
    expect(game.state("A")).toMatchObject({ isBuffed: false, might: 2 });
    expect(game.state("B").isBuffed).toBe(true);
  });

  test("(a) control — nobody responds: both A and B are buffed, C is not", async () => {
    const game = await lockedAB();
    await resolveChain(game);
    expect(game.state("A")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("B")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("C")).toMatchObject({ isBuffed: false, might: 2 });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) Shen played as a Reaction in response ────────────────────────────────────────────────

  test("(b) with the trigger finalized P1 may play Shen, Kinkou as a [Reaction] in response (3 + [order]); Shen enters the board and the target snapshot is still [A, B]", async () => {
    const game = await lockedAB();
    expect(game.p1.can("play", "shen")).toBe(true);
    await game.p1.play("shen", { to: "base" });
    expect(game.zoneOf("shen")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, order: 0 } });
    expect(monkItem(game)?.targets).toEqual(["A", "B"]);
  });

  test("(b) on resolution Shen is a mere bystander — NOT buffed; A and B are; no prompt offers to add him", async () => {
    const game = await lockedAB();
    await game.p1.play("shen", { to: "base" });
    await resolveChain(game);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("shen")).toMatchObject({ isBuffed: false, might: 3 });
    expect(game.state("A").isBuffed).toBe(true);
    expect(game.state("B").isBuffed).toBe(true);
    expect(game.state("C").isBuffed).toBe(false);
  });

  // ── (c) choosing fewer than two ──────────────────────────────────────────────────────────────

  test("(c) choosing only A at finalization is itself the decision: the item records [A], resolves buffing A alone, and nothing is asked at resolution although B and C were available", async () => {
    const game = await monkPlayed();
    await game.p1.pick("A");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(monkItem(game)?.targets).toEqual(["A"]);
    await resolveChain(game);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("A")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("B").isBuffed).toBe(false);
    expect(game.state("C").isBuffed).toBe(false);
  });

  test("(c) 'up to' includes ZERO (355.13): declining still finalizes the trigger (targets []) and it resolves doing nothing", async () => {
    const game = await monkPlayed();
    await game.p1.decline();
    expect(monkItem(game)).toMatchObject({ cardId: "monk", targets: [] });
    await resolveChain(game);
    expect(["A", "B", "C", "monk"].map((u) => game.state(u).isBuffed)).toEqual([false, false, false, false]);
    expect(game.zoneOf("monk")).toBe("base");
  });
});
