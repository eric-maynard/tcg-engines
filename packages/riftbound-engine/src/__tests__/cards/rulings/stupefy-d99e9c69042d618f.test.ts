/**
 * Ruling d99e9c69042d618f — Stupefy (OGN-095 → ogn-095-298) · Reaction · Mind · 1 · "Give a unit -1 [Might] this turn, to a
 *     minimum of 1 [Might]. Draw 1."
 *   × Riposte (SFD-206 → sfd-206-221) · Reaction · Body/Order · 2 + power · "Choose a friendly unit and a spell. Counter that spell
 *     and give that unit +[Might] equal to that spell's Energy cost this turn."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction · Calm · 1+[calm] · "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *
 * Q: A Stupefies a unit; B Ripostes (choosing Stupefy and that unit); A Defies A's OWN Stupefy. When Riposte resolves, does the
 *    unit still get +Might?
 * A: No. Defy resolves first and counters Stupefy (off the chain, to trash). Riposte then resolves with its spell target gone:
 *    "counter that spell" can't be performed and the +Might "equal to that spell's Energy cost" reads a null target → no bonus.
 * Rules: 359.3.e.7 / .10 (instruction on an unavailable target is skipped), 359.3.e.12 (checks on a missing target return null), 336 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STUPEFY = "ogn-095-298";
const RIPOSTE = "sfd-206-221";
const DEFY = "ogn-045-298";

/**
 * P1 (= A)'s turn: Stupefy + Defy in hand, exactly [2] + [calm]. P2 (= B): a 4-Might Guard in base, Riposte + [2] and power for it.
 * Known deck top for A (Stupefy would draw).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .resources(P2, { energy: 2, power: { body: 1, order: 1, rainbow: 2 } })
    .unit(P2, "base", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
    .hand(P1, STUPEFY, "stupefy")
    .hand(P1, DEFY, "defy")
    .hand(P2, RIPOSTE, "riposte")
    .deck(P1, ["ogn-175-298"], ["d1"]);
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);

/** A: Stupefy → Guard. B: Riposte (Guard + Stupefy). A: Defy → Stupefy. Chain = [stupefy, riposte, defy], A holding priority. */
async function buildTheChain(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("stupefy", { targets: "guard" });
  await game.p1.passPriority();
  expect(game.p2.can("cast", "riposte")).toBe(true);
  await game.p2.cast("riposte", { targets: "guard" }); // the lone spell on the chain (Stupefy) is the forced spell choice
  expect(game.chain().at(-1)).toMatchObject({ cardId: "riposte", controller: P2 });
  expect((game.chain().at(-1)?.targets ?? []).includes("guard")).toBe(true);
  await game.p2.passPriority();
  expect(game.p1.can("cast", "defy")).toBe(true);
  const defyTargets = (game.p1.option("cast", "defy")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
  expect(defyTargets).toContain("stupefy"); // your own spell is a legal Defy target
  await game.p1.cast("defy", { targets: "stupefy" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  expect(chainIds(game)).toEqual(["stupefy", "riposte", "defy"]);
  return game;
}

describe("Ruling d99e9c69042d618f — Defy your own Stupefy out from under Riposte: Riposte gives no Might", () => {
  test("LIFO step 1 — Defy resolves: Stupefy is countered, leaves the chain for A's trash (no -1, no draw); Riposte still waiting", async () => {
    const game = await buildTheChain();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(chainIds(game)).toEqual(["riposte"]);
    expect(game.state("guard").might).toBe(4);
    expect(game.p1.hand()).toEqual([]); // Stupefy never drew
  });

  test("LIFO step 2 — Riposte resolves with its spell target gone: nothing to counter and the '+Might equal to that spell's cost' is null → the Guard stays exactly 4", async () => {
    const game = await buildTheChain();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("riposte")).toBe("trash");
    expect(game.state("guard")).toMatchObject({ might: 4, mightModifier: 0 });
    expect(game.p2.energy()).toBe(0); // Riposte's cost is not refunded
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — A does NOT Defy: Riposte counters Stupefy itself and the Guard gets +1 (Stupefy's Energy cost) → 5 this turn", async () => {
    const game = await board().build();
    await game.p1.cast("stupefy", { targets: "guard" });
    await game.p1.passPriority();
    await game.p2.cast("riposte", { targets: "guard" });
    await game.settle();
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.zoneOf("riposte")).toBe("trash");
    expect(game.state("guard")).toMatchObject({ might: 5, mightModifier: 1 });
    expect(game.p1.hand()).toEqual(["defy"]); // countered: no draw (only the unplayed Defy)
  });
});
