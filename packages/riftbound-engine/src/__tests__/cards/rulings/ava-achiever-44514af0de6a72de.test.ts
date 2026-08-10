/**
 * Ruling 44514af0de6a72de — Ava Achiever (OGN-107 → ogn-107-298) · Unit · Mind · 5 · 4 Might
 *   "When I attack, you may pay [mind] to play a card with [Hidden] from your hand, ignoring its cost. If it's a
 *    unit, play it here."
 *   × Teemo, Strategist (OGN-121 → ogn-121-298) · [Hidden] unit · "When I defend, …"
 *   (+ Black Market Broker sfd-121-221 "When you play a card from face down, play a Gold gear token exhausted" as
 *    the observable stand-in for a "played from hidden" trigger — Teemo's own such text was errata'd away.)
 *
 * Q: Ava's attack trigger plays a [Hidden] card from hand — does that count as playing it "from hidden"?
 * A: No. Playing a card that HAS [Hidden] from hand is not playing it from face down; "from hidden" triggers do
 *    not fire. (Teemo played this way arrives at Ava's battlefield.)
 * Rules: 811.1.c.3 (playing FROM facedown), 419.1 (zone played from), 108.2.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const AVA = "ogn-107-298";
const TEEMO = "ogn-121-298";
const BROKER = "sfd-121-221";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn. P1: Ava + Black Market Broker in base, Teemo (Hidden unit) in hand, exactly 1 mind power and 0 energy
 * (Teemo's 2 must be ignored). P2 holds bf1 with a 1-might Wall.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 0, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", AVA, "ava")
    .unit(P1, "base", BROKER, "broker")
    .unit(P2, "bf1", { might: 1, name: "Wall" }, "wall")
    .hand(P1, TEEMO, "teemo");
}

function goldTokens(game: Game): string[] {
  return game.findAll({ name: "Gold", owner: P1 }).filter((id) => game.zoneOf(id) !== "gone");
}

/** Ava attacks bf1, P1 accepts the [mind] opt-in, the trigger resolves and Teemo is the card played. */
async function avaPlaysTeemo(game: Game): Promise<void> {
  await game.p1.move("ava", "bf1");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "ava" } });
  await game.p1.yes();
  // Drain priority until the play prompt (if any) or Teemo has landed.
  for (let i = 0; i < 6 && game.zoneOf("teemo") === "hand"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("teemo");
    } else if (d?.kind === "action" && (d.context === "chain" || d.context === "showdown")) {
      await game.acting().pass();
    } else {
      break;
    }
  }
}

describe("Ruling 44514af0de6a72de — Ava plays a [Hidden] card from HAND, which is not 'from hidden'", () => {
  test("Ava's attack trigger: pay [mind], Teemo (a [Hidden] unit) is played from hand to Ava's battlefield ignoring its cost", async () => {
    const game = await board().build();
    await avaPlaysTeemo(game);
    expect(game.p1.power("mind")).toBe(0);
    expect(game.p1.energy()).toBe(0); // Teemo's [2] ignored
    expect(game.locationOf("teemo")).toBe("bf1"); // "play it here"
    expect(game.state("teemo").isHidden).toBe(false); // played face up as a unit, not hidden
  });

  test("that play is from HAND, not from face down: a 'when you play a card from face down' trigger (Broker) does NOT fire", async () => {
    const game = await board().build();
    await avaPlaysTeemo(game);
    // No Broker trigger anywhere on the chain, and no Gold token was made.
    expect(game.chain().some((c) => c.cardId === "broker")).toBe(false);
    await game.settle();
    expect(goldTokens(game)).toEqual([]);
    expect(game.p1.gear()).toEqual([]);
  });

  test("contrast — the same Teemo actually played FROM face down does fire the Broker's 'from face down' trigger", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 0 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .unit(P1, "base", BROKER, "broker")
      .facedown(P1, "bf1", TEEMO, "teemo", { hiddenOnTurn: 2 })
      .build();
    expect(game.p1.can("reveal", "teemo")).toBe(true);
    await game.p1.reveal("teemo");
    await game.settle();
    expect(game.locationOf("teemo")).toBe("bf1");
    expect(goldTokens(game)).toHaveLength(1);
  });

  test("Teemo played into Ava's attack is an attacker there, so his own 'When I defend' does not trigger", async () => {
    const game = await board().build();
    await avaPlaysTeemo(game);
    expect(game.chain().some((c) => c.cardId === "teemo" && c.triggered)).toBe(false);
    await game.settle();
    // Combat: Ava 4 + Teemo 2 vs Wall 1 → P1 conquers bf1; Teemo never defended.
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
