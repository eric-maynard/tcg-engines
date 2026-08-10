/**
 * Ruling e88d99a3f6ba9b67 — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield
 *     "When you defend here, you may move a friendly unit here to base."
 *   × Overzealous Fan (SFD-128 → sfd-128-221) · Unit · 2 Might · "When I defend, you may kill me to move an attacking unit to its base."
 *
 * Q: Opponent moves into my Reaver's Row where my Overzealous Fan is — can I order the defend triggers so the Fan's
 *    ability resolves before the Row's?
 * A: Yes. Both are your "when I/you defend" triggers from one event; as their controller you choose their order on the
 *    chain — put the Fan on last and it resolves first (bounce an attacker), then the Row (pull a friendly unit home).
 *    Targets are named as the triggers go on the chain. (riftjudge adds: the Fan's kill is a cost "paid at resolution".)
 * Rules: 383.3.d (controller orders simultaneous triggers), 340.1 (LIFO), 383.3.a/b + 204.3.a (a "you may [cost] to"
 *        trigger's cost is paid as it is FINALIZED — the CR's own example is Overzealous Fan), 402.2 (targets at finalization).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const OVERZEALOUS_FAN = "sfd-128-221";

/** P1's turn. P2 holds Reaver's Row (live text) with Overzealous Fan, Buddy (2) and Pal (2). P1's Charger (5) and Runner (3) attack together. */
function board() {
  return scenario()
    .battlefield("row", { controller: P2, def: REAVERS_ROW, inert: false })
    .unit(P2, "row", OVERZEALOUS_FAN, "fan")
    .unit(P2, "row", { might: 2, name: "Buddy" }, "buddy")
    .unit(P2, "row", { might: 2, name: "Pal" }, "pal")
    .unit(P1, "base", { might: 5, name: "Charger" }, "charger")
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner");
}

interface Step {
  readonly kind: Decision["kind"];
  readonly seat: string;
  readonly timing?: string;
  readonly source?: string;
  readonly cards: readonly string[];
  readonly fanZone: string;
}

/**
 * Both attackers move into the Row. Drive P2's finalization dialog: accept the Fan (naming Charger), accept the Row
 * (naming Buddy), and when the 383.3.d order offer appears put the FAN LAST (top). Stops with the finalized chain and
 * priority. Returns every prompt seen, in order.
 */
async function attackAndOrderFanOnTop(game: Game): Promise<Step[]> {
  const steps: Step[] = [];
  await game.p1.move(["charger", "runner"], "row");
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || d.kind === "action") {
      break;
    }
    const cards = d.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : d.kind === "order" ? d.items.map((o) => o.card ?? o.key) : [];
    steps.push({ cards, fanZone: game.zoneOf("fan"), kind: d.kind, seat: d.seat, source: d.source?.cardId, timing: d.timing });
    if (d.kind === "yes-no") {
      await game.p2.yes();
    } else if (d.kind === "pick" && cards.includes("charger")) {
      await game.p2.pick("charger");
    } else if (d.kind === "pick" && cards.includes("buddy")) {
      await game.p2.pick("buddy");
    } else if (d.kind === "order") {
      const fanKey = d.items.find((o) => o.card === "fan")!.key;
      const rowKey = d.items.find((o) => o.card === "row")!.key;
      await game.p2.order([rowKey, fanKey]); // first = bottom, last = top → resolves first
    } else {
      break;
    }
  }
  return steps;
}

describe("Ruling e88d99a3f6ba9b67 — P2 orders its two defend triggers; Fan on top resolves before Reaver's Row", () => {
  test("the attack raises BOTH of P2's defend triggers, and every question about them (opt-ins, targets, order) is P2's — including an explicit ORDER decision listing the Fan and the Row (383.3.d)", async () => {
    const game = await board().build();
    const steps = await attackAndOrderFanOnTop(game);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((s) => s.seat === P2)).toBe(true);
    const order = steps.find((s) => s.kind === "order");
    expect(order).toBeDefined();
    expect([...order!.cards].sort()).toEqual(["fan", "row"]);
    expect(order!.timing).toBe("FIN");
  });

  test("targets are named as the triggers go on the chain: the Fan's attacker (Charger | Runner) and the Row's friendly unit here are FIN-time picks, asked before anyone gets priority", async () => {
    const game = await board().build();
    const steps = await attackAndOrderFanOnTop(game);
    const fanPick = steps.find((s) => s.kind === "pick" && s.cards.includes("charger"));
    expect(fanPick).toMatchObject({ seat: P2, timing: "FIN" });
    expect([...fanPick!.cards].sort()).toEqual(["charger", "runner"]);
    const rowPick = steps.find((s) => s.kind === "pick" && s.cards.includes("buddy"));
    expect(rowPick).toMatchObject({ seat: P2, timing: "FIN" });
    expect(rowPick!.cards).not.toContain("charger"); // friendly units here only
    // First priority decision only comes after all of that.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  // RULING-CONFLICT: riftjudge e88d99a3f6ba9b67 (citing FAQ #6503) says killing the Fan is a cost paid at RESOLUTION, so the
  // Fan must still be there when its item resolves; CR 383.3.b / 204.3.a (which names Overzealous Fan as its example) say a
  // "you may [cost] to …" trigger's cost is its base cost, paid when the item is FINALIZED — engine follows CR: the Fan is
  // killed the moment P2 accepts, before the order is even chosen and before any priority pass.
  test("the Fan's 'kill me' is paid at finalization: it is in P2's trash as soon as P2 accepts — already so at the order prompt, with nothing resolved yet", async () => {
    const game = await board().build();
    const steps = await attackAndOrderFanOnTop(game);
    const acceptFan = steps.findIndex((s) => s.kind === "yes-no" && s.source === "fan");
    expect(acceptFan).toBeGreaterThanOrEqual(0);
    expect(steps[acceptFan]!.fanZone).toBe("battlefield-row"); // alive when asked
    const order = steps.find((s) => s.kind === "order")!;
    expect(order.fanZone).toBe("trash"); // dead before ordering / priority
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.locationOf("charger")).toBe("row"); // …while its effect has NOT happened yet
    expect(game.locationOf("buddy")).toBe("row");
  });

  test("with the Fan placed last the chain is [Row (bottom), Fan (top)]: the Fan resolves FIRST — Charger is moved to P1's base — while the Row's item still waits", async () => {
    const game = await board().build();
    await attackAndOrderFanOnTop(game);
    expect(game.chain().map((c) => c.cardId)).toEqual(["row", "fan"]);
    expect(game.chain().every((c) => c.triggered && c.controller === P2)).toBe(true);
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "fan"); i++) {
      await game.seat(game.decision()!.seat).passPriority();
    }
    expect(game.locationOf("charger")).toBe("base");
    expect(game.state("charger").combatRole ?? null).toBeNull();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", triggered: true })]);
    expect(game.locationOf("buddy")).toBe("row"); // not yet
  });

  test("then Reaver's Row resolves: Buddy is moved to P2's base; the combat goes on with Runner (3) vs Pal (2) — Pal dies, Runner conquers the Row for P1", async () => {
    const game = await board().build();
    await attackAndOrderFanOnTop(game);
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.seat(game.decision()!.seat).passPriority();
    }
    expect(game.locationOf("buddy")).toBe("base");
    expect(game.locationOf("charger")).toBe("base");
    expect(game.state("runner")).toMatchObject({ combatRole: "attacker", location: "row" });
    expect(game.state("pal")).toMatchObject({ combatRole: "defender", location: "row" });
    await game.settle();
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.locationOf("runner")).toBe("row");
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — accepting the listed order the other way (Row on top) resolves the Row's move first: Buddy is home while Charger is still attacking", async () => {
    const game = await board().build();
    await game.p1.move(["charger", "runner"], "row");
    for (let i = 0; i < 16; i++) {
      const d = game.decision();
      if (!d || d.kind === "action") {
        break;
      }
      if (d.kind === "yes-no") {
        await game.p2.yes();
      } else if (d.kind === "pick") {
        const want = d.options.find((o) => o.card === "charger" || o.card === "buddy") ?? d.options[0];
        await game.p2.pick(want!.key);
      } else if (d.kind === "order") {
        const fanKey = d.items.find((o) => o.card === "fan")!.key;
        const rowKey = d.items.find((o) => o.card === "row")!.key;
        await game.p2.order([fanKey, rowKey]); // Row last = top
      } else {
        break;
      }
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["fan", "row"]);
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "row"); i++) {
      await game.seat(game.decision()!.seat).passPriority();
    }
    expect(game.locationOf("buddy")).toBe("base");
    expect(game.state("charger")).toMatchObject({ combatRole: "attacker", location: "row" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan" })]);
  });
});
