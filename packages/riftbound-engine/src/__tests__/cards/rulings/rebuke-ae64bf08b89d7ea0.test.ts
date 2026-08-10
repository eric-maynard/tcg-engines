/**
 * Ruling ae64bf08b89d7ea0 — Rebuke (OGN-172 → ogn-172-298) · [2][chaos][chaos] Action "Return a unit at a battlefield to its owner's hand."
 *   × Challenge (OGN-128 → ogn-128-298) · [2][body] Action "Choose a friendly unit and an enemy unit. They deal damage equal to their
 *     Mights to each other."
 *
 * Q: Opponent moves onto my occupied battlefield, passes Focus, and I (defender) Rebuke their unit. Can they Challenge before Rebuke
 *    resolves?
 * A: No. With Rebuke on the chain only Reactions may be played; Challenge is an Action. By the time Actions are legal again the chain
 *    has resolved and the Rebuked unit is gone (in hand), so Challenge can't use it anyway.
 * Rules: 338.1.a.1–2 (Closed state: only Reaction-timed plays), 340 (resolve), 355.8 (needs a legal target).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REBUKE = "ogn-172-298";
const CHALLENGE = "ogn-128-298";

/** P2's turn ("the opponent"). P1 holds bf1 with a Defender (2) and has Rebuke + [2][chaos][chaos]. P2: Attacker (3) in base, Challenge + [2][body]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { chaos: 2 } })
    .resources(P2, { energy: 2, power: { body: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Defender" }, "def")
    .unit(P2, "base", { might: 3, name: "Attacker" }, "atk")
    .hand(P1, REBUKE, "rebuke")
    .hand(P2, CHALLENGE, "challenge");
}

/** Attacker → bf1 (combat showdown, P2 has Focus); P2 passes Focus; P1 Rebukes the Attacker and passes priority to P2. */
async function rebukeOnTheChain(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("atk", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  // In the OPEN showdown (no chain) Challenge would be a legal Action for P2 — the contrast.
  expect(game.p2.can("cast", "challenge")).toBe(true);
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("rebuke", { targets: "atk" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rebuke", controller: P1, targets: ["atk"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling ae64bf08b89d7ea0 — no Challenge in response to Rebuke; afterwards the unit is gone", () => {
  test("with Rebuke on the chain P2 holds priority but Challenge (an Action) is NOT playable — forcing it is refused and the chain is unchanged", async () => {
    const game = await rebukeOnTheChain();
    expect(game.p2.can("cast", "challenge")).toBe(false);
    const r = await game.p2.try((p) => p.cast("challenge", { targets: ["atk", "def"] }));
    expect(r.ok).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["rebuke"]);
    expect(game.zoneOf("challenge")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 2, power: { body: 1 } });
  });

  test("the chain resolves completely: the Attacker returns to P2's hand; only now could Actions be played — but Challenge cannot use the Rebuked unit: it is no longer on the board", async () => {
    const game = await rebukeOnTheChain();
    await game.p2.passPriority(); // both passed → Rebuke resolves
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("rebuke")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("hand");
    expect(game.p2.hand()).toContain("atk");
    // Whatever window P2 gets next, Challenge can no longer pair the (gone) Attacker with the Defender.
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "action", seat: P2 });
    const r = await game.p2.try((p) => p.cast("challenge", { targets: ["atk", "def"] }));
    expect(r.ok).toBe(false);
    expect(game.p2.can("cast", "challenge")).toBe(false); // P2 has no unit on the board at all now
    // The attack fizzled: Defender untouched, bf1 still P1's.
    expect(game.state("def")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.violations()).toEqual([]);
  });
});
