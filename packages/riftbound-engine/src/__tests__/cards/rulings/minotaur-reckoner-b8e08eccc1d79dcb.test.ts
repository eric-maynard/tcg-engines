/**
 * Ruling b8e08eccc1d79dcb — Minotaur Reckoner (SFD-014 → sfd-014-221) · Unit · Fury · 5 · 5 Might — "Units can't move to base."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · [Action] "Move a friendly unit and ready it."
 *   × Reaver's Row (OGN-285 → ogn-285-298) · Battlefield "When you defend here, you may move a friendly unit here to base."
 *   (Tideturner ogn-199-298 is cited as another "move" effect; the two above cover the class.)
 *
 * Q: With Minotaur Reckoner on the board, can a unit still be moved to base by an EFFECT (Ride the Wind etc.) rather than
 *    its own Standard Move?
 * A: No. "Units can't move to base" blocks every Move to base, not just the Standard Move. The spell/ability still
 *    resolves; the move instruction just fails (other instructions, e.g. "ready it", still happen). Recalls are not
 *    moves and still work.
 * Rules: 359.3.e.6 (impossible instruction is skipped, rest resolves), 450 (Move), 451 (Recall is not a Move).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MINOTAUR_RECKONER = "sfd-014-221";
const RIDE_THE_WIND = "ogn-173-298";
const REAVERS_ROW = "ogn-285-298";
/** Inline [Action] spell: "Recall a friendly unit." (rule 451 — not a Move) */
const RECALL = {
  abilities: [{ effect: { target: { controller: "friendly", type: "unit" }, type: "recall" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Recall",
  timing: "action",
} as const;

/** P1's turn. P2's Minotaur Reckoner sits in P2's base. P1 holds bf1 with an EXHAUSTED Scout (3) and a Buddy (2); bf2 is empty. Ride the Wind + Recall in hand. */
function board(opts: { minotaur?: boolean } = {}) {
  const s = scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 3, name: "Scout" }, "scout", { exhausted: true })
    .unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .hand(P1, RECALL, "rc");
  return opts.minotaur === false ? s.unit(P2, "base", { might: 5, name: "Plain Ox" }, "ox") : s.unit(P2, "base", MINOTAUR_RECKONER, "mino");
}

/** Cast Ride the Wind on the Scout and name `dest` when the destination is asked; resolve the chain. */
async function rideScoutTo(game: Game, dest: "base" | "battlefield-bf2"): Promise<void> {
  await game.p1.cast("rtw", { targets: "scout" });
  for (let i = 0; i < 8 && game.zoneOf("rtw") !== "trash"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options.find((o) => o.key === dest || o.key === dest.replace("battlefield-", ""))?.key ?? dest);
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.zoneOf("rtw")).toBe("trash");
}

describe("Ruling b8e08eccc1d79dcb — Minotaur Reckoner stops ALL moves to base (spells and triggers too); recalls still work", () => {
  test("control (no Reckoner): a unit at a battlefield may Standard-Move to base, and Ride the Wind can send the Scout to base (readied)", async () => {
    const game = await board({ minotaur: false }).build();
    expect(game.p1.can("standardMove:to:base")).toBe(true);
    await rideScoutTo(game, "base");
    expect(game.zoneOf("scout")).toBe("base");
    expect(game.state("scout").isReady).toBe(true);
  });

  test("with the (enemy) Reckoner out: P1's units carry the restriction and the Standard Move to base is not even offered", async () => {
    const game = await board().build();
    expect(game.state("scout").keywords).toContain("NoMoveToBase");
    expect(game.p1.can("standardMove:to:base")).toBe(false);
    const r = await game.p1.try((p) => p.move("scout", "base"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("scout")).toBe("battlefield-bf1");
  });

  test("Ride the Wind naming base as the destination: the spell resolves, the MOVE fails (Scout stays at bf1) but 'ready it' still happens", async () => {
    const game = await board().build();
    expect(game.state("scout").isExhausted).toBe(true);
    await rideScoutTo(game, "base");
    expect(game.zoneOf("scout")).toBe("battlefield-bf1");
    expect(game.state("scout").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 0 } }); // paid, no refund
    expect(game.violations()).toEqual([]);
  });

  test("Ride the Wind to ANOTHER BATTLEFIELD is unaffected: Scout moves bf1 → bf2, readied", async () => {
    const game = await board().build();
    await rideScoutTo(game, "battlefield-bf2");
    expect(game.zoneOf("scout")).toBe("battlefield-bf2");
    expect(game.state("scout").isReady).toBe(true);
  });

  test("Reaver's Row ('when you defend here, you may move a friendly unit here to base'): the Reckoner itself attacks, P1 says yes and names Buddy — the trigger resolves but Buddy does NOT move", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1, def: REAVERS_ROW, inert: false })
      .unit(P1, "bf1", { might: 3, name: "Scout" }, "scout")
      .unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy")
      .unit(P2, "base", MINOTAUR_RECKONER, "mino")
      .build();
    await game.p2.move("mino", "bf1");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "bf1" } });
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("buddy");
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("buddy")).toBe("battlefield-bf1");
    expect(game.zoneOf("scout")).toBe("battlefield-bf1");
  });

  test("control for Reaver's Row: with a plain 5-Might attacker instead of the Reckoner, the same yes + Buddy DOES move Buddy to base", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1, def: REAVERS_ROW, inert: false })
      .unit(P1, "bf1", { might: 3, name: "Scout" }, "scout")
      .unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy")
      .unit(P2, "base", { might: 5, name: "Plain Ox" }, "ox")
      .build();
    await game.p2.move("ox", "bf1");
    await game.p1.yes();
    await game.p1.pick("buddy");
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("buddy")).toBe("base");
  });

  test("a RECALL is not a move: 'Recall a friendly unit' on Buddy sends it to base despite the Reckoner", async () => {
    const game = await board().build();
    await game.p1.cast("rc", { targets: "buddy" });
    await game.settle();
    expect(game.zoneOf("rc")).toBe("trash");
    expect(game.zoneOf("buddy")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
