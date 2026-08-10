/**
 * Ruling 08c11414fba04921 — Zaun Warrens (OGN-298 → ogn-298-298) · Battlefield "When you conquer here, discard 1,
 *   then draw 1."
 *   × Reaver's Row (OGN-285 → ogn-285-298) · Battlefield "When you defend here, you may move a friendly unit here
 *     to base."
 *   × a "when I defend" unit (Ahri, Inquisitive ogn-119-298 "When I attack or defend, give an enemy unit here -2
 *     [Might] this turn…") and a "when I attack" unit (Yasuo, Remorseful ogn-076-298) as the attacker.
 *   (OGN-189 Kayn, Unleashed is cited only in a damage-assignment aside.)
 *
 * Q1: Is the Zaun Warrens conquer effect mandatory?  A1: Yes — no "may": you must discard 1, then draw 1.
 * Q2: With a "when I defend" unit at Reaver's Row, can I order those triggers?  A2: Yes. Attacker's triggers
 *     go on the chain first (ordered by the attacker), then the defender's (ordered by the defender), so the
 *     defender chooses whether their unit's defend trigger goes before or after Reaver's Row.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZAUN_WARRENS = "ogn-298-298";
const REAVERS_ROW = "ogn-285-298";
const AHRI_INQUISITIVE = "ogn-119-298";
const YASUO_REMORSEFUL = "ogn-076-298";
const GUST = "ogn-169-298"; // just a known card to hold in hand

describe("Ruling 08c11414fba04921 (1) — Zaun Warrens' conquer effect is mandatory", () => {
  test("conquering Zaun Warrens: P1 MUST discard (a no-decline pick, not a 'you may'), then draws 1", async () => {
    const game = await scenario()
      .battlefield("warrens", { controller: null, def: ZAUN_WARRENS, inert: false })
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .hand(P1, GUST, "held")
      .hand(P1, GUST, "spare")
      .build();
    const deck = game.p1.deck().length;
    await game.p1.move("scout", "warrens");
    const r = await game.settle(); // showdown passes → conquer → Warrens trigger resolves → discard prompt
    expect(game.gameState.battlefields.warrens?.controller).toBe(P1);
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, allowDecline: false, min: 1 });
    expect((d as Extract<Decision, { kind: "pick" }>).options.map((o) => o.card ?? o.key).toSorted()).toEqual(["held", "spare"]);
    // Declining is not an option.
    const declined = await game.p1.try((p) => p.decline());
    expect(declined.ok).toBe(false);
    await game.p1.pick("held");
    await game.settle();
    expect(game.zoneOf("held")).toBe("trash");
    expect(game.zoneOf("spare")).toBe("hand");
    expect(game.p1.hand()).toHaveLength(2); // 2 − 1 discarded + 1 drawn
    expect(game.p1.deck()).toHaveLength(deck - 1);
    expect(game.violations()).toEqual([]);
  });
});

/** P1's turn. Reaver's Row is P2's with Ahri (defend trigger) + Buddy; P1's Yasuo (attack trigger) attacks it. */
function rowBoard() {
  return scenario()
    .battlefield("row", { controller: P2, def: REAVERS_ROW, inert: false })
    .unit(P2, "row", AHRI_INQUISITIVE, "ahri")
    .unit(P2, "row", { might: 2, name: "Buddy" }, "buddy")
    .unit(P1, "base", YASUO_REMORSEFUL, "yasuo");
}

/** Answer the finalization prompts (Yasuo's target, Row opt-in + target) up to P2's trigger-order offer. */
async function upToDefenderOrder(game: Game): Promise<Extract<Decision, { kind: "order" }>> {
  await game.p1.move("yasuo", "row");
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || d.kind === "action" || d.kind === "order") {
      break;
    }
    if (d.kind === "pick" && d.seat === P1) {
      await game.p1.pick("ahri"); // Yasuo's damage target
    } else if (d.kind === "yes-no" && d.seat === P2) {
      await game.p2.yes(); // use Reaver's Row
    } else if (d.kind === "pick" && d.seat === P2) {
      await game.p2.pick("buddy"); // Row moves Buddy home
    } else {
      break;
    }
  }
  const d = game.decision();
  expect(d).toMatchObject({ kind: "order", seat: P2 });
  return d as Extract<Decision, { kind: "order" }>;
}

describe("Ruling 08c11414fba04921 (2) — attacker's triggers first, then the DEFENDER orders their 'when I defend' trigger vs Reaver's Row", () => {
  test("combat opens with the attacker's trigger (Yasuo, P1) at the bottom and both defender triggers (Ahri + Reaver's Row, P2) above it; P2 is offered the ORDER decision over exactly those two", async () => {
    const game = await rowBoard().build();
    const d = await upToDefenderOrder(game);
    expect(d.items.map((i) => i.card).toSorted()).toEqual(["ahri", "row"]);
    const chain = game.chain();
    expect(chain[0]).toMatchObject({ cardId: "yasuo", controller: P1, triggered: true });
    expect(chain.slice(1).every((c) => c.controller === P2 && c.triggered)).toBe(true);
  });

  test("P2 may put Reaver's Row BELOW Ahri (Ahri resolves first, then Row, then Yasuo's attack trigger last)", async () => {
    const game = await rowBoard().build();
    const d = await upToDefenderOrder(game);
    const rowKey = d.items.find((i) => i.card === "row")!.key;
    const ahriKey = d.items.find((i) => i.card === "ahri")!.key;
    await game.p2.order([rowKey, ahriKey]); // first = bottom, last = top
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo", "row", "ahri"]);
    // Resolve top-down and watch the order of effects.
    for (let i = 0; i < 4 && game.chain().length === 3; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("yasuo").might).toBe(4); // Ahri's -2 resolved first
    expect(game.locationOf("buddy")).toBe("row"); // Row not yet
    for (let i = 0; i < 4 && game.chain().length === 2; i++) {
      await game.acting().passPriority();
    }
    expect(game.locationOf("buddy")).toBe("base"); // then Row
    expect(game.state("ahri").damage).toBe(0); // Yasuo's (attacker's) trigger is still waiting at the bottom
    for (let i = 0; i < 4 && game.chain().length === 1; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ahri")).toBe("trash"); // Yasuo's current Might (6 − 2 = 4) is lethal to 3-Might Ahri
  });

  test("…or the other way round: Ahri BELOW Reaver's Row (Row resolves first, then Ahri)", async () => {
    const game = await rowBoard().build();
    const d = await upToDefenderOrder(game);
    const rowKey = d.items.find((i) => i.card === "row")!.key;
    const ahriKey = d.items.find((i) => i.card === "ahri")!.key;
    await game.p2.order([ahriKey, rowKey]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo", "ahri", "row"]);
    for (let i = 0; i < 4 && game.chain().length === 3; i++) {
      await game.acting().passPriority();
    }
    expect(game.locationOf("buddy")).toBe("base"); // Row first
    expect(game.state("yasuo").might).toBe(6); // Ahri not yet
    for (let i = 0; i < 4 && game.chain().length === 2; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("yasuo").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });
});
