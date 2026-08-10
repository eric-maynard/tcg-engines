/**
 * Interaction: Void Seeker (ogn-024-298) · Spell · Fury · 3 + [fury] · "[Action] Deal 4 to a unit at a
 *     battlefield. Draw 1."
 *   × Discipline (ogn-058-298) · Spell · Calm · 2 · "[Reaction] Give a unit +2 [Might] this turn. Draw 1."
 *   × Wind Wall (ogn-064-298) · Spell · Calm · 3 + [calm][calm] · "[Reaction] Counter a spell."
 *
 * Rules: 338.1.b.1 / 339.1 (resolution needs ALL players to pass IN SEQUENCE with no item added in
 * between), 339.2 (otherwise Priority goes to the next player in turn order), 337.4 (after
 * finalizing an item its controller holds Priority), 340.1 (only the NEWEST item resolves per
 * all-pass round), 340.4 (chain not empty → the controller of the newest REMAINING item gains
 * Priority and a fresh round starts), 340.2 (chain empty → Open), 425.1.a (a countered spell does
 * nothing and goes to trash), 359.3.c.
 *
 * Question: P1's turn. P1 Void Seekers P2's 3-Might X and passes; P2 Disciplines X and passes.
 *   (a) Nothing resolves — P2's Discipline broke the pass sequence; Priority goes to P1 (339.2).
 *   (b) P1 Wind Walls Discipline, P1 pass, P2 pass → ONLY Wind Wall resolves (Discipline countered,
 *       P2 draws nothing); Priority then goes to the controller of the newest remaining item, Void
 *       Seeker → P1 (340.4).
 *   (c) Void Seeker does not auto-resolve: it needs its own P1-pass, P2-pass round; then 4 to X (3)
 *       kills it and P1 draws 1.
 *   (d) Control: P1 passes instead of Wind Walling → Discipline resolves (X 5, P2 draws), Priority
 *       P1, another full round → Void Seeker: 4 to a 5-Might X → survives; P1 draws 1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_SEEKER = "ogn-024-298";
const DISCIPLINE = "ogn-058-298";
const WIND_WALL = "ogn-064-298";

function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { calm: 2, fury: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Vanilla X" }, "X")
    .hand(P1, VOID_SEEKER, "voidSeeker")
    .hand(P1, WIND_WALL, "windWall")
    .hand(P2, DISCIPLINE, "discipline");
}

const chainOf = (game: Game) => game.chain().map((i) => `${i.cardId}/${i.controller}`);
const priority = (game: Game) => game.gameState.interaction?.chain?.activePlayer;
const passed = (game: Game) => game.gameState.interaction?.chain?.passedPlayers ?? [];

/** P1: Void Seeker → X, pass. P2: Discipline → X, pass. */
async function afterBrokenSequence(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("voidSeeker", { targets: "X" });
  await game.p1.passPriority();
  await game.p2.cast("discipline", { targets: "X" });
  expect(priority(game)).toBe(P2); // 337.4: P2 finalized Discipline → P2 holds Priority
  expect(passed(game)).toEqual([]); // adding an item wiped P1's earlier pass
  await game.p2.passPriority();
  return game;
}

describe("Pass sequence resets whenever an item is added (Void Seeker / Discipline / Wind Wall)", () => {
  // ── (a) ─────────────────────────────────────────────────────────────────────────────────────

  test("(a) P1 passed BEFORE Discipline existed and P2 passed after adding it: nothing resolves — X untouched, nobody drew, both spells still on the chain (339.1)", async () => {
    const game = await afterBrokenSequence();
    expect(chainOf(game)).toEqual([`voidSeeker/${P1}`, `discipline/${P2}`]);
    expect(game.state("X")).toMatchObject({ damage: 0, might: 3, zone: "battlefield-bf1" });
    expect(game.p1.hand()).toEqual(["windWall"]);
    expect(game.p2.hand()).toEqual([]);
    expect(game.zoneOf("voidSeeker")).toBe("chain");
    expect(game.zoneOf("discipline")).toBe("chain");
  });

  test("(a) Priority goes to the next player in turn order after P2's pass = P1, with only P2 recorded as having passed (339.2)", async () => {
    const game = await afterBrokenSequence();
    expect(priority(game)).toBe(P1);
    expect(passed(game)).toEqual([P2]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "windWall")).toBe(true); // P1 may still respond
  });

  // ── (b) ─────────────────────────────────────────────────────────────────────────────────────

  test("(b) Wind Wall offers both spells as targets; cast on Discipline it becomes the newest item and its controller P1 keeps Priority with a clean pass record (337.4)", async () => {
    const game = await afterBrokenSequence();
    const offered = game.p1.option("cast", "windWall")?.fields.find((f) => f.arg === "targets")?.options;
    expect(offered).toEqual(expect.arrayContaining([["voidSeeker"], ["discipline"]]));
    await game.p1.cast("windWall", { targets: "discipline" });
    expect(chainOf(game)).toEqual([`voidSeeker/${P1}`, `discipline/${P2}`, `windWall/${P1}`]);
    expect(priority(game)).toBe(P1);
    expect(passed(game)).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
  });

  test("(b) P1 pass → P2 pass: ONLY the newest item Wind Wall resolves — Discipline is countered to trash without effect (X still 3, P2 draws nothing); Void Seeker remains (340.1, 425.1.a)", async () => {
    const game = await afterBrokenSequence();
    await game.p1.cast("windWall", { targets: "discipline" });
    await game.p1.passPriority();
    expect(chainOf(game)).toHaveLength(3); // one pass is not a sequence
    await game.p2.passPriority();
    expect(game.zoneOf("windWall")).toBe("trash");
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.state("X")).toMatchObject({ damage: 0, might: 3 });
    expect(game.p2.hand()).toEqual([]);
    expect(chainOf(game)).toEqual([`voidSeeker/${P1}`]);
  });

  test("(b) after that resolution Priority goes to the controller of the newest REMAINING item (Void Seeker → P1), with a fresh, empty pass record (340.4)", async () => {
    const game = await afterBrokenSequence();
    await game.p1.cast("windWall", { targets: "discipline" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(priority(game)).toBe(P1);
    expect(passed(game)).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  // ── (c) ─────────────────────────────────────────────────────────────────────────────────────

  test("(c) Void Seeker does NOT resolve automatically, nor after P1's pass alone — only after P2 passes too; then 4 to X (3 Might) kills it and P1 draws 1; chain empty → Open (339.1, 340.2)", async () => {
    const game = await afterBrokenSequence();
    await game.p1.cast("windWall", { targets: "discipline" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Wind Wall
    expect(game.zoneOf("voidSeeker")).toBe("chain");
    expect(game.state("X").damage).toBe(0);
    await game.p1.passPriority();
    expect(game.zoneOf("voidSeeker")).toBe("chain"); // still needs P2's pass
    expect(priority(game)).toBe(P2);
    const hand0 = game.p1.hand().length;
    await game.p2.passPriority();
    expect(game.zoneOf("voidSeeker")).toBe("trash");
    expect(game.zoneOf("X")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (d) control line ───────────────────────────────────────────────────────────────────────

  test("(d) control: P1 passes instead — P2-pass then P1-pass IS a full sequence → Discipline resolves (X 5 Might, P2 draws 1); Priority back to P1 for Void Seeker (340.4)", async () => {
    const game = await afterBrokenSequence();
    const p2hand0 = game.p2.hand().length;
    await game.p1.passPriority();
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.state("X")).toMatchObject({ damage: 0, might: 5 });
    expect(game.p2.hand()).toHaveLength(p2hand0 + 1);
    expect(chainOf(game)).toEqual([`voidSeeker/${P1}`]);
    expect(priority(game)).toBe(P1);
    expect(passed(game)).toEqual([]);
  });

  test("(d) control: another full round (P1 pass, P2 pass) resolves Void Seeker — 4 to the now 5-Might X: it survives with 4 damage; P1 draws 1", async () => {
    const game = await afterBrokenSequence();
    await game.p1.passPriority(); // Discipline resolves
    const hand0 = game.p1.hand().length;
    await game.p1.passPriority();
    expect(game.zoneOf("voidSeeker")).toBe("chain");
    await game.p2.passPriority();
    expect(game.zoneOf("voidSeeker")).toBe("trash");
    expect(game.state("X")).toMatchObject({ damage: 4, might: 5, zone: "battlefield-bf1" });
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
