/**
 * Ruling fc26b9e73c5d8d36 — Gust (OGN-169 → ogn-169-298) · Reaction [1] "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Solari Shieldbearer (OGN-051 → ogn-051-298) · Unit · Calm · [3] · 2 Might "When you play me, stun a unit."
 *
 * Q: If the source of a triggered ability is removed (Gust the Shieldbearer in response to its play trigger), does the
 *    trigger still resolve?
 * A: Yes. Once a triggered ability is on the chain, removing its source does not stop it; it resolves as fully as it can.
 *    (The source only had to be in the right zone when the condition was met.)
 * Rules: 383.1–383.3 (triggered abilities become chain items independent of their source), 359.3 (resolve as much as possible),
 *        340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const SHIELDBEARER = "ogn-051-298";

/** P1's turn; P1 holds bf1 (Anchor there) and plays the Shieldbearer TO bf1 so Gust ("at a battlefield") can reach it. P2: Brute (5) at bf2, Gust + [1]. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { calm: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 4, name: "Anchor" }, "anchor")
    .unit(P2, "bf2", { might: 5, name: "Brute" }, "brute")
    .hand(P1, SHIELDBEARER, "solari")
    .hand(P2, GUST, "gust");
}

/** Shieldbearer played to bf1 targeting the Brute with its stun; P1 passes; P2 Gusts the Shieldbearer in response. */
async function gustInResponse(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("solari", { to: "bf1" });
  // The play trigger is finalized at once: its target is chosen now (FIN) and it sits on the chain.
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("brute");
  }
  expect(game.zoneOf("solari")).toBe("battlefield-bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "solari", controller: P1, targets: ["brute"], triggered: true })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "gust")).toBe(true);
  await game.p2.cast("gust", { targets: "solari" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["solari", "gust"]);
  return game;
}

describe("Ruling fc26b9e73c5d8d36 — a trigger already on the chain resolves even after its source is Gusted away", () => {
  test("Gust resolves first (LIFO): the Shieldbearer is back in P1's hand while its 'stun a unit' trigger is STILL on the chain", async () => {
    const game = await gustInResponse();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("solari")).toBe("hand");
    expect(game.p1.hand()).toContain("solari");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "solari", triggered: true })]);
    expect(game.state("brute").isStunned).toBe(false); // not yet
  });

  test("then the source-less trigger resolves anyway: the Brute IS stunned", async () => {
    const game = await gustInResponse();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("solari")).toBe("hand");
    expect(game.state("brute").isStunned).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance — the source must be on the board when the condition happens: a Shieldbearer sitting in the trash/hand triggers nothing when some other unit is played", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 5, name: "Brute" }, "brute")
      .trash(P1, SHIELDBEARER, "deadSolari")
      .hand(P1, SHIELDBEARER, "handSolari")
      .hand(P1, { cardType: "unit", energyCost: 2, might: 2, name: "Recruit" }, "recruit")
      .build();
    await game.p1.play("recruit");
    expect(game.chain().filter((c) => c.triggered)).toEqual([]);
    await game.settle();
    expect(game.state("brute").isStunned).toBe(false);
  });
});
