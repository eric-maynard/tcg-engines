/**
 * Interaction: Rocket Barrage (sfd-077-221) · Spell · Mind · 4 + [mind] · standard timing
 *     "[Repeat] [4][mind] (You may pay the additional cost to repeat this spell's effect, and may
 *      make different choices.)  Choose one — • Deal 4 to a unit in a base. • Kill a gear."
 *   × Gold (sfd-t03) · Gear Token — "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]."
 *
 * Rules: 355.1.a / 820.1.d (Repeat is an optional additional cost decided while playing), 355.3 /
 * 355.5 / 820.2 / 820.2.a (each execution's mode AND target are chosen, in a declared order, during
 * Make Relevant Choices — public on the chain), 355.15 (locked once finalized), 355.8 (a mode with
 * no valid target cannot be selected), 359.3.e.2 / .e.5 / .e.7 (a target that left the board is
 * illegal → that instruction is skipped, the rest still executes — Void Seeker principle),
 * 359.3.e.1, 429.2 (Add abilities resolve immediately, can't be reacted to), 186.1 (a token put
 * into a non-board zone ceases to exist).
 *
 * Question: P1's turn, open state. P2 has a READY Gold token and a 4-Might unit V in base; no other
 * gear. P1 casts Rocket Barrage paying Repeat: execution #1 = Kill a gear → Gold, #2 = Deal 4 → V.
 *   (a) modes+targets fixed at play time and visible to P2 before responding;
 *   (b) P2 cashes Gold in response → on resolution #1 fizzles (no re-target / no mode swap), #2
 *       still deals 4 to V (dies); P2 keeps the floated [rainbow];
 *   (c) no response → Gold killed, then V takes 4 and dies;
 *   (d) no gear anywhere → "Kill a gear" unselectable for either execution; both may be "Deal 4"
 *       on the same V (two sequential deals).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ROCKET_BARRAGE = "sfd-077-221";
const GOLD = "sfd-t03";
const DEAL_4 = 0; // printed bullet order
const KILL_GEAR = 1;

/** P1 to act with exactly 8 energy + 2 mind (base + Repeat). P2: ready Gold token + 4-Might V in base. */
function board(withGold = true) {
  const s = scenario()
    .resources(P1, { energy: 8, power: { mind: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Frontliner" }, "front") // at a battlefield: never a Deal-4 target
    .unit(P2, "base", { might: 4, name: "Victim" }, "v")
    .hand(P1, ROCKET_BARRAGE, "rb");
  return withGold ? s.gear(P2, GOLD, "gold") : s;
}

/** P1 casts with Repeat paid: #1 Kill a gear → gold, #2 Deal 4 → v. */
async function castKillGoldThenShootV(game: Game): Promise<void> {
  await game.p1.cast("rb", { modes: [KILL_GEAR, DEAL_4], repeat: 1, targets: ["gold", "v"] });
}

type RepeatExecution = { _chosenIndex?: number; _chosenTargets?: string[] };

/** Per-execution { mode, targets } recorded on the (public) chain item. */
function executionsOnChain(game: Game): { mode: number | undefined; targets: string[] }[] {
  const item = game.gameState.interaction?.chain?.items?.[0] as { effect?: { effects?: RepeatExecution[] } } | undefined;
  return (item?.effect?.effects ?? []).map((e) => ({ mode: e._chosenIndex, targets: [...(e._chosenTargets ?? [])] }));
}

describe("Rocket Barrage [Repeat] (kill Gold / deal 4) × Gold cashed in response", () => {
  // ── (a) choices are made and locked at play time, publicly ─────────────────────────────────

  test("(a) Repeat is decided as the spell is played: 8 energy + 2 mind buys ONE chain item carrying both executions; pool emptied (355.1.a, 820.1.d)", async () => {
    const game = await board().build();
    expect(game.p1.option("cast", "rb")?.fields.find((f) => f.arg === "repeat")).toMatchObject({ max: 1, min: 0 });
    await castKillGoldThenShootV(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "rb", controller: P1, triggered: false, type: "spell" });
    expect(game.zoneOf("rb")).toBe("chain");
  });

  test("(a) both executions' mode AND target are fixed in declared order before anyone gets priority: #1 Kill-a-gear→Gold, #2 Deal-4→V (355.3, 355.5, 820.2.a)", async () => {
    const game = await board().build();
    await castKillGoldThenShootV(game);
    // Nothing further is asked of P1 — the next decision is the priority window itself.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(executionsOnChain(game)).toEqual([
      { mode: KILL_GEAR, targets: ["gold"] },
      { mode: DEAL_4, targets: ["v"] },
    ]);
  });

  test("(a) P2 sees the chosen targets (in order) on the chain item when P2 receives priority, and may respond with Gold's Reaction", async () => {
    const game = await board().build();
    await castKillGoldThenShootV(game);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    const seen = game.p2.view().chain;
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ cardId: "rb", controller: P1, targets: ["gold", "v"] });
    expect(game.p2.can("activate", "gold")).toBe(true);
  });

  // ── (b) P2 cashes Gold in response ──────────────────────────────────────────────────────────

  test("(b) Gold's [Add] resolves immediately (never joins the chain): Gold leaves the board as its own cost and P2 floats 1 [rainbow] while Rocket Barrage still waits (429.2)", async () => {
    const game = await board().build();
    await castKillGoldThenShootV(game);
    await game.p1.passPriority();
    await game.p2.activate("gold");
    expect(game.chain().map((i) => i.cardId)).toEqual(["rb"]);
    expect(game.p2.gear()).toEqual([]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.zoneOf("rb")).toBe("chain");
    expect(game.state("v").damage).toBe(0); // nothing has resolved yet
  });

  test("(b) on resolution execution #1 fizzles (its only target left the board) but execution #2 is independent: V is dealt 4 and dies; nothing else is touched; P2 keeps the [rainbow] (359.3.e.5/.7, 359.3.e.1)", async () => {
    const game = await board().build();
    await castKillGoldThenShootV(game);
    await game.p1.passPriority();
    await game.p2.activate("gold");
    const s = await game.settle();
    expect(s.reason).toBe("open"); // no re-target / mode prompt was raised (355.15)
    expect(game.zoneOf("v")).toBe("trash");
    expect(game.state("front")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("rb")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(b) choices are locked (355.15): with a SECOND enemy gear on the board, the fizzled 'Kill a gear' does not re-target it", async () => {
    const game = await board().gear(P2, GOLD, "gold2").build();
    await castKillGoldThenShootV(game);
    await game.p1.passPriority();
    await game.p2.activate("gold");
    await game.settle();
    expect(game.zoneOf("gold2")).toBe("base"); // untouched
    expect(game.zoneOf("v")).toBe("trash");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
  });

  // ── (c) contrast: no response ───────────────────────────────────────────────────────────────

  test("(c) no response: Gold is killed (off the board), then V takes 4 and dies; P2 gains no power; spell to trash (820.2.a)", async () => {
    const game = await board().build();
    await castKillGoldThenShootV(game);
    await game.settle();
    expect(game.p2.gear()).toEqual([]);
    expect(game.zoneOf("v")).toBe("trash");
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("rb")).toBe("trash");
    expect(game.state("front").damage).toBe(0);
  });

  // 186.1: a token put into a non-board zone ceases to exist — the killed Gold is not a card sitting
  // in P2's trash.
  test("(c) a killed Gold TOKEN ceases to exist — it must not remain in P2's trash (186.1)", async () => {
    const game = await board().build();
    await castKillGoldThenShootV(game);
    await game.settle();
    expect(game.p2.gear()).toEqual([]);
    expect(game.p2.trash()).not.toContain("gold");
    expect(game.zoneOf("gold")).toBe("gone");
  });

  // ── (d) variant: no gear anywhere ───────────────────────────────────────────────────────────

  test("(d) with no gear on the board 'Kill a gear' is not a selectable mode (355.8): absent from the mode menu and rejected for either execution", async () => {
    const game = await board(false).build();
    const modeField = game.p1.option("cast", "rb")?.fields.find((f) => f.name === "mode");
    expect(modeField?.options).toEqual([DEAL_4]);
    expect(modeField?.labels).toEqual(["Deal 4 to a unit in a base"]);
    const first = await game.p1.try((p) => p.cast("rb", { modes: [KILL_GEAR, DEAL_4], repeat: 1, targets: ["v"] }));
    expect(first.ok).toBe(false);
    const second = await game.p1.try((p) => p.cast("rb", { modes: [DEAL_4, KILL_GEAR], repeat: 1, targets: ["v"] }));
    expect(second.ok).toBe(false);
    expect(game.zoneOf("rb")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 8, power: { mind: 2 } });
  });

  test("(d) both executions may be 'Deal 4' naming the SAME unit V (820.2.a): one chain item with targets [v, v]; V (4 Might) ends in the trash", async () => {
    const game = await board(false).build();
    await game.p1.cast("rb", { modes: [DEAL_4, DEAL_4], repeat: 1, targets: ["v", "v"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toHaveLength(1);
    expect(executionsOnChain(game)).toEqual([
      { mode: DEAL_4, targets: ["v"] },
      { mode: DEAL_4, targets: ["v"] },
    ]);
    await game.settle();
    expect(game.zoneOf("v")).toBe("trash");
    expect(game.zoneOf("rb")).toBe("trash");
  });

  test("(d) the two deals are sequential and cumulative: an 8-Might base unit named twice takes 4 + 4 and dies, a 9-Might one survives with 8 damage", async () => {
    const eight = await board(false).unit(P2, "base", { might: 8, name: "Eight" }, "big").build();
    await eight.p1.cast("rb", { modes: [DEAL_4, DEAL_4], repeat: 1, targets: ["big", "big"] });
    await eight.settle();
    expect(eight.zoneOf("big")).toBe("trash");
    expect(eight.zoneOf("v")).toBe("base");

    const nine = await board(false).unit(P2, "base", { might: 9, name: "Nine" }, "huge").build();
    await nine.p1.cast("rb", { modes: [DEAL_4, DEAL_4], repeat: 1, targets: ["huge", "huge"] });
    await nine.settle();
    expect(nine.state("huge")).toMatchObject({ damage: 8, zone: "base" });
  });
});
