/**
 * Interaction: Sprite token (ogn-274-298, made by Sprite Call ogn-094-298) · 3 Might · "[Temporary] (Kill
 *     me at the start of your Beginning Phase, before scoring.)"          — P1's ONLY unit at A
 *   × Block (ogn-057-298) · Calm Action spell · "[Hidden] [Action] Give a unit [Shield 3] and [Tank] this
 *     turn."                                                               — FACEDOWN at A
 *   × Mushroom Pouch (ogn-101-298) · Mind gear · "At the start of your Beginning Phase, if you control a
 *     facedown card at a battlefield, draw 1."                             — in P1's base
 *
 * Rules: 816.1 (Temporary is a TRIGGERED ability: "At the start of [controller's] Beginning Phase, before
 * scoring, kill this"), 315.2.a.1 → 315.2.b.2 (Beginning Step precedes the Scoring Step; the turn player
 * Holds what they control), 383.3.d (simultaneous triggers of one controller: that player orders them),
 * 383.2.a.1 / 383.2.c (an "if …" right after the condition is part of the trigger condition — checked
 * once, when it triggers, never re-checked on resolution), 190.4.a / 190.4.c / 323.6 (no units + Open
 * state → lose control at the following Cleanup), 323.7 (Hidden cards at a battlefield not controlled by
 * the same player → owner's trash), 469.2 / 471.1.a.1 (Hold; not subject to the Final-Point rule),
 * 472 / 323.1 (win checked at a Cleanup), 811.6 (a facedown card has Reaction).
 *
 * Question: 1v1 to 8, P1 at 7, controls A with only last turn's Sprite token, Block facedown at A,
 * Mushroom Pouch in base. P1's turn begins. (a) Do the Temporary kill and Pouch trigger together — who
 * orders them? (b) After the Sprite dies does P1 still Hold A for the win; when is control lost? (c)
 * What happens to the facedown Block; does Pouch still draw whatever the order? (d) Contrast: P1 also has
 * a non-Temporary unit at A.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_TOKEN = "ogn-274-298";
const BLOCK = "ogn-057-298";
const MUSHROOM_POUCH = "ogn-101-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * Turn 2, P2 active and about to end the turn. Victory Score 8, P1 on 7. P1 controls A with a Sprite
 * token (its only unit there unless `buddy`), Block facedown at A since turn 1, Mushroom Pouch in base.
 * P2 controls B with a vanilla guard (so P2 has something and A is P1's only battlefield).
 */
function board(opts: { buddy?: boolean } = {}) {
  const b = scenario()
    .turn(2)
    .active(P2)
    .victoryScore(8)
    .points(P1, 7)
    .points(P2, 2)
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", SPRITE_TOKEN, "sprite")
    .unit(P2, "bfB", { might: 2, name: "B Guard" }, "bGuard")
    .facedown(P1, "bfA", BLOCK, "block", { hiddenOnTurn: 1 })
    .gear(P1, MUSHROOM_POUCH, "pouch");
  return opts.buddy ? b.unit(P1, "bfA", { might: 2, name: "Buddy" }, "buddy") : b;
}

/** P2 ends the turn; P1's Beginning Phase starts and its start-of-phase triggers are put on the chain. */
async function p1TurnBegins(opts: { buddy?: boolean } = {}): Promise<{ game: Game; hand0: number }> {
  const game = await board(opts).build();
  const hand0 = game.p1.hand().length;
  await game.p2.endTurn();
  await game.acceptTriggerOrder(); // keep the listed order if the engine offers one (383.3.d soft offer)
  return { game, hand0 };
}

/** Both players pass priority once → the top item of the chain resolves. */
async function resolveTop(game: Game): Promise<void> {
  await game.p1.passPriority();
  await game.p2.passPriority();
}

describe("Temporary Sprite alone at A × facedown Block × Mushroom Pouch — no Hold for the 8th point", () => {
  // ── (a) both trigger at the start of the Beginning Phase ─────────────────────────────────

  test("(a) at the start of P1's Beginning Phase BOTH abilities are on the chain together — the Sprite's Temporary kill (816.1) and Mushroom Pouch (its 'if you control a facedown card' condition is true now, 383.2.a.1) — before any scoring", async () => {
    const { game, hand0 } = await p1TurnBegins();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    const items = game.chain();
    expect(items).toHaveLength(2);
    expect(items.map((c) => c.cardId).sort()).toEqual(["pouch", "sprite"]);
    expect(items.every((c) => c.triggered && c.controller === P1)).toBe(true);
    // Nothing has happened yet: Sprite alive, A controlled, Block hidden, 7 points, no card drawn.
    expect(game.zoneOf("sprite")).toBe("battlefield-bfA");
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.zoneOf("block")).toBe("facedown-bfA");
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  // BUG — expected (383.3.d): the two abilities trigger simultaneously ("At the start of your Beginning
  // Phase") and share a controller, so P1 is asked to order them on the chain (the harness surfaces this
  // as an `order` decision for P1 listing both items). Actual: the engine pushes the [Temporary] item
  // first and Mushroom Pouch on top of it as separate batches, so P1 is never offered the choice (and the
  // "Sprite dies first while Pouch is still on the chain" line cannot be exercised).
  test("(a) same controller, simultaneous triggers → P1 chooses their order on the chain (383.3.d)", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    const items = d?.kind === "order" ? d.items.map((i) => i.card ?? i.key) : [];
    expect(items).toHaveLength(2);
  });

  test("(a)/(c) while a trigger is on the chain the facedown Block could be flipped as a Reaction (811.6) — it is on P1's menu (its only possible object being the doomed Sprite)", async () => {
    const { game } = await p1TurnBegins();
    expect(game.p1.can("reveal", "block")).toBe(true);
    expect(game.p1.legal().map((o) => o.key)).toContain("revealHidden:block");
  });

  // ── (b)/(c) resolution in the engine's listed order: Pouch (top) first, then the Sprite ─────

  test("(c) Mushroom Pouch resolves first here: P1 draws 1 — while the Sprite's kill is still on the chain, A is still P1's and Block is still facedown (Closed state: no control check yet, 190.4.c/323.6)", async () => {
    const { game, hand0 } = await p1TurnBegins();
    expect(game.chain().at(-1)?.cardId).toBe("pouch"); // top of chain
    await resolveTop(game);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["sprite"]);
    expect(game.zoneOf("sprite")).toBe("battlefield-bfA");
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.zoneOf("block")).toBe("facedown-bfA");
    expect(game.phase()).toBe("beginning");
  });

  test("(b) the Temporary item resolves: the Sprite token is killed and ceases to exist; with the chain empty the Open-state Cleanup strips P1's control of the now-empty A (323.6) — all still 'before scoring'", async () => {
    const { game } = await p1TurnBegins();
    await resolveTop(game); // Pouch
    await resolveTop(game); // Sprite
    expect(game.has("sprite")).toBe(false);
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.p1.units("bfA")).toEqual([]);
    expect(game.gameState.battlefields.bfA?.controller).toBe(null);
  });

  test("(c) in that same Cleanup the facedown Block is removed to P1's TRASH, revealed (323.7) — not to hand, not left at A", async () => {
    const { game } = await p1TurnBegins();
    await resolveTop(game);
    await resolveTop(game);
    expect(game.zoneOf("block")).toBe("trash");
    expect(game.state("block").isHidden).toBe(false);
    expect(game.p1.facedown("bfA")).toEqual([]);
    expect(game.p1.trash()).toEqual(["block"]);
    expect(game.p1.hand()).not.toContain("block");
  });

  test("(b) Scoring Step: A is uncontrolled → no Hold, no point — P1 stays on 7, does NOT win, and the turn simply continues into P1's main phase (hand: +1 Pouch, +1 normal draw)", async () => {
    const { game, hand0 } = await p1TurnBegins();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.p1.points()).toBe(7);
    expect(game.p2.points()).toBe(2);
    expect(game.gameState.battlefields.bfA?.controller).toBe(null);
    expect(game.gameState.scoredThisTurn?.[P1] ?? []).toEqual([]);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
    expect(game.violations()).toEqual([]);
  });

  // ── (d) contrast: another, non-Temporary unit keeps A ────────────────────────────────────

  test("(d) with a non-Temporary Buddy also at A: the Sprite still dies and Pouch still draws, but P1 keeps control of A (190.4.a) and Block stays facedown", async () => {
    const { game, hand0 } = await p1TurnBegins({ buddy: true });
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["pouch", "sprite"]);
    await resolveTop(game);
    await resolveTop(game);
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.p1.units("bfA")).toEqual(["buddy"]);
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.zoneOf("block")).toBe("facedown-bfA");
    expect(game.state("block").isHidden).toBe(true);
  });

  test("(d) …then the Scoring Step HOLDS A for the 8th point — Hold is not subject to the Final-Point restriction (469.2, 471.1.a.1) — and P1 wins at the following Cleanup, still in the Beginning Phase (472/323.1)", async () => {
    const { game } = await p1TurnBegins({ buddy: true });
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.zoneOf("block")).toBe("facedown-bfA");
    expect(game.violations()).toEqual([]);
  });
});
