/**
 * Ruling fc9e3d2669655b78 — Temporal Breach (VEN-066 → ven-066-166) · Mind · [2][mind] · [Hidden]
 *     "Banish a unit, then its owner plays it to the same location, ignoring its cost."
 *   (× Baited Hook OGN-242 is cited only for the FAQ precedent "a pending unit on the chain prevents loss of control".)
 *
 * Q: My unit holds a battlefield. On the OPPONENT's turn I flip a hidden Temporal Breach on it. Does replaying it start a new
 *    showdown/combat or conquer? Do I lose control of the battlefield while it is banished?
 * A: No and no. The whole banish-and-replay happens while the chain is resolving (Closed State), so the empty-battlefield control
 *    check never runs; when the unit re-enters you still control that battlefield, so it does not apply Contested — no showdown,
 *    no combat, no conquer.
 * Rules: 190.4 / 323.6 (control lapses only at an Open-State cleanup), 190.3.a.1 (Contested only if the controller doesn't already
 *        control the battlefield), 811 (hidden card played with priority at Reaction speed).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEMPORAL_BREACH = "ven-066-166";
const DISCIPLINE = "ogn-058-298"; // P2's chain-opener: "[Reaction] Give a unit +2 [Might] this turn. Draw 1."

/**
 * Turn 3, P2's turn. P1 holds bf1 with a 3-Might Sentinel (1 damage marked, to show the replay is a fresh object) and hid Temporal
 * Breach there earlier. P2: a Grunt in base and Discipline + [2] to open a chain with.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Sentinel" }, "sent", { damage: 1 })
    .unit(P2, "bf2", { might: 2, name: "Watch" }, "watch")
    .unit(P2, "base", { might: 2, name: "Grunt" }, "grunt")
    .facedown(P1, "bf1", TEMPORAL_BREACH, "breach")
    .hand(P2, DISCIPLINE, "disc");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P2 Disciplines its Grunt (opening a chain) and passes; P1, now with priority, flips Temporal Breach onto the Sentinel. */
async function breachOnOwnSentinel(game: Game): Promise<void> {
  await game.p2.cast("disc", { targets: "grunt" });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "breach")).toBe(true);
  await game.p1.reveal("breach");
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    expect(d.options.map((o) => o.card ?? o.key)).toEqual(["sent"]); // from Hidden: only units at THIS battlefield
    await game.p1.pick("sent");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["disc", "breach"]);
  expect(game.chain().at(-1)).toMatchObject({ cardId: "breach", controller: P1, targets: ["sent"] });
}

/** Resolve the chain step by step, recording bf1's controller after every move. */
async function resolveWatchingControl(game: Game): Promise<(string | null)[]> {
  const seen: (string | null)[] = [game.gameState.battlefields.bf1?.controller ?? null];
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options.find((o) => o.key === "battlefield-bf1" || o.key === "bf1")?.key ?? d.options[0]!.key);
    } else {
      break;
    }
    seen.push(game.gameState.battlefields.bf1?.controller ?? null);
  }
  return seen;
}

describe("Ruling fc9e3d2669655b78 — Temporal Breach on your own battlefield unit during the opponent's turn: no control loss, no showdown, no conquer", () => {
  test("P1 can flip the hidden Breach on the opponent's turn once P1 has priority, targeting its own Sentinel at that battlefield", async () => {
    const game = await board().build();
    await breachOnOwnSentinel(game);
    expect(game.zoneOf("breach")).toBe("chain");
  });

  test("control of bf1 is P1's at EVERY observable step of the resolution — the banish→replay happens in a Closed State, so it never lapses", async () => {
    const game = await board().build();
    await breachOnOwnSentinel(game);
    const seen = await resolveWatchingControl(game);
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.every((c) => c === P1)).toBe(true);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("the Sentinel comes back to the SAME battlefield as a fresh object (damage gone), for free; Breach is in P1's trash", async () => {
    const game = await board().build();
    await breachOnOwnSentinel(game);
    await resolveWatchingControl(game);
    await game.settle();
    expect(game.zoneOf("sent")).toBe("battlefield-bf1");
    expect(game.state("sent")).toMatchObject({ controller: P1, damage: 0, might: 3 });
    expect(game.zoneOf("breach")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("no Contested status, no showdown, no combat and no conquer/point: P2 is simply back in its open main phase", async () => {
    const game = await board().build();
    await breachOnOwnSentinel(game);
    await resolveWatchingControl(game);
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.state("sent").combatRole ?? null).toBeFalsy();
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
