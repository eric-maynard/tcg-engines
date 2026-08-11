/**
 * Interaction: Mister Root (unl-127-219) × Treasure Hunter (sfd-130-221) × Hostile Takeover (sfd-202-221)
 *
 *   Mister Root — unit, 2, 1 Might: "[Accelerate] … When I move to a battlefield, gain 2 XP."
 *   Treasure Hunter — unit, 2, 1 Might: "When I move, play a Gold gear token exhausted."
 *   Hostile Takeover — Mind/Order spell, 5 + [C][C], [Hidden]: "Take control of an enemy unit at a battlefield.
 *     Ready it. … Lose control of that unit and recall it at end of turn. (Send it to base. This isn't a move.)"
 *
 * Question: P1's turn, both 0 XP. P2 controls bf1 with D (5) and a facedown Hostile Takeover. P1 group-moves
 * Mister Root + Treasure Hunter base → bf1 as ONE Standard Move. (a) How many triggers, whose, who orders,
 * before or after combat opens? (b) P2 flips HT on Mister Root while both triggers are on the chain — who
 * gains the 2 XP when Root's trigger resolves: P1 (controller when it triggered) or P2 (controls the source
 * now)? If P2 had taken Treasure Hunter instead, for whom is the Gold played? (c) After the chain: who
 * attacks/defends, outcome? (d) End of turn recall — does it fire the move triggers? Contrast: P2 genuinely
 * controls Root and moves it itself.
 *
 * Rules: 144.3 (one move action), 453 (one Cleanup), 383.3.d (controller orders simultaneous triggers),
 * 460 / 323.12 (combat cannot open until the chain is empty), 811.1.b (facedown = Reaction timing, needs a
 * chain/showdown), 191.4.a / 191.4.b (ability controller fixed when it triggered; later control change of the
 * source is irrelevant), 359.3.f.4, 477.1.a, 323.2.b (designations re-sorted by controller), 456.1 (recall
 * is not a move).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MISTER_ROOT = "unl-127-219";
const TREASURE_HUNTER = "sfd-130-221";
const HOSTILE_TAKEOVER = "sfd-202-221";

/** P1's turn, both 0 XP. P2: D (5) at bf1 + facedown Hostile Takeover there. P1: Root + Hunter in base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Defender" }, "D")
    .facedown(P2, "bf1", HOSTILE_TAKEOVER, "ht")
    .unit(P1, "base", MISTER_ROOT, "root")
    .unit(P1, "base", TREASURE_HUNTER, "hunter");
}

/** ONE standard move of both units into bf1; accept the listed trigger order; P1 (first priority) passes → P2 holds priority. */
async function groupMoveAndPassToP2(game: Game): Promise<void> {
  await game.p1.move(["root", "hunter"], "bf1");
  await game.acceptTriggerOrder();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.pass();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

/** P2 flips Hostile Takeover for [0] choosing `victim`; then everyone passes until the chain is empty (combat NOT yet resolved). */
async function flipTakeoverOn(game: Game, victim: string): Promise<void> {
  await game.p2.reveal("ht", { answers: [victim] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["root", "hunter", "ht"]);
  for (let i = 0; i < 12 && game.chain().length > 0; i++) {
    const d = game.decision();
    expect(d?.kind).toBe("action");
    await game.acting().pass();
  }
  expect(game.chain()).toEqual([]);
}

function goldOf(game: Game, seat: "p1" | "p2"): string[] {
  return game[seat].gear().filter((id) => game.state(id).isToken && game.state(id).name === "Gold");
}

describe("Mister Root + Treasure Hunter group move × Hostile Takeover flipped mid-chain", () => {
  test("(a) one move → one batch: exactly two P1 triggers pending together, P1 is offered their order (383.3.d), and no showdown has opened yet (460)", async () => {
    const game = await board().build();
    await game.p1.move(["root", "hunter"], "bf1");
    const d = game.decision();
    expect(d).toMatchObject({ defaultable: true, kind: "order", seat: P1 });
    expect(d?.kind === "order" ? d.items.map((i) => i.card).sort() : []).toEqual(["hunter", "root"]);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "root", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "hunter", controller: P1, triggered: true }),
    ]);
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
  });

  test("(a) with nobody interfering both triggers resolve BEFORE combat opens: P1 XP 2 + an exhausted Gold in P1's base, THEN the showdown at bf1 with P1 attacking", async () => {
    const game = await board().build();
    await game.p1.move(["root", "hunter"], "bf1");
    await game.acceptTriggerOrder();
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().pass();
    }
    expect(game.p1.xp()).toBe(2);
    expect(game.p2.xp()).toBe(0);
    const gold = goldOf(game, "p1");
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0] as string)).toMatchObject({ controller: P1, isExhausted: true, location: "base" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1" });
  });

  test("(b) the facedown Hostile Takeover is playable for [0] exactly because a chain exists (811.1.b): offered to P2 once it holds priority, both movers are legal picks", async () => {
    const game = await board().build();
    expect(game.p2.legal().map((o) => o.key)).not.toContain("revealHidden:ht"); // Neutral Open on P1's turn: nothing for P2
    await groupMoveAndPassToP2(game);
    expect(game.p2.can("reveal", "ht")).toBe(true);
    await game.p2.reveal("ht");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "ht" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["hunter", "root"]);
    await game.p2.pick("root");
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} }); // flipped for [0]
    expect(game.chain().at(-1)).toMatchObject({ cardId: "ht", controller: P2 });
  });

  test("(b) HT resolves first (LIFO): P2 controls a READIED Mister Root — yet Root's already-pending trigger is still P1's: P1 gains the 2 XP, P2 gains nothing (191.4.a/b)", async () => {
    const game = await board().build();
    await groupMoveAndPassToP2(game);
    await game.p2.reveal("ht", { answers: ["root"] });
    // Resolve just HT.
    for (let i = 0; i < 6 && game.chain().length > 2; i++) {
      await game.acting().pass();
    }
    expect(game.state("root")).toMatchObject({ controller: P2, isReady: true, location: "bf1", owner: P1 });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "root", controller: P1 }),
      expect.objectContaining({ cardId: "hunter", controller: P1 }),
    ]);
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().pass();
    }
    expect(game.p1.xp()).toBe(2);
    expect(game.p2.xp()).toBe(0);
    expect(goldOf(game, "p1")).toHaveLength(1);
    expect(goldOf(game, "p2")).toHaveLength(0);
  });

  test("(b') symmetric: P2 takes Treasure Hunter instead — its pending trigger is still P1's, so the Gold token is played exhausted into P1's base, none for P2; P1 still gets Root's 2 XP", async () => {
    const game = await board().build();
    await groupMoveAndPassToP2(game);
    await flipTakeoverOn(game, "hunter");
    expect(game.state("hunter").controller).toBe(P2);
    const gold = goldOf(game, "p1");
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0] as string)).toMatchObject({ controller: P1, isExhausted: true, location: "base", owner: P1 });
    expect(goldOf(game, "p2")).toHaveLength(0);
    expect(game.p1.xp()).toBe(2);
    expect(game.p2.xp()).toBe(0);
  });

  test("(c) after the chain empties designations re-sort by controller (323.2.b): P1 attacks with Treasure Hunter (1) into P2's D (5) + Mister Root (1) → Hunter dies, P2 keeps bf1, nobody scores", async () => {
    const game = await board().build();
    await groupMoveAndPassToP2(game);
    await flipTakeoverOn(game, "root");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1" });
    expect(game.p1.units("bf1")).toEqual(["hunter"]);
    expect(game.p2.units("bf1").sort()).toEqual(["D", "root"]);
    await game.settle();
    expect(game.zoneOf("hunter")).toBe("trash");
    expect(game.zoneOf("D")).toBe("battlefield-bf1");
    expect(game.state("root")).toMatchObject({ controller: P2, location: "bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("(d) end of turn: HT's 'lose control and recall' returns Mister Root to P1's base — a recall is not a move (456.1), so no XP for anyone", async () => {
    const game = await board().build();
    await groupMoveAndPassToP2(game);
    await flipTakeoverOn(game, "root");
    await game.settle();
    expect(game.p1.xp()).toBe(2);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("root")).toMatchObject({ controller: P1, location: "base", owner: P1 });
    expect(game.p1.xp()).toBe(2);
    expect(game.p2.xp()).toBe(0);
    expect(goldOf(game, "p1")).toHaveLength(1); // no second Gold either
    expect(game.violations()).toEqual([]);
  });

  test("(d, contrast) when P2 genuinely controls Mister Root and moves it itself, the trigger is P2's from the start (191.4.a): P2 gains the 2 XP", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: null })
      .card("root", { controller: P2, def: MISTER_ROOT, owner: P1, zone: "base" })
      .build();
    expect(game.state("root")).toMatchObject({ controller: P2, owner: P1 });
    await game.p2.move("root", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "root", controller: P2, triggered: true })]);
    await game.settle();
    expect(game.p2.xp()).toBe(2);
    expect(game.p1.xp()).toBe(0);
  });
});
