/**
 * Ruling 445563aa61a7f05a — Temporal Breach (VEN-066 → ven-066-166)
 *   Spell · Mind · 2 energy + 1 power: "[Hidden] Banish a unit, then its owner plays it to the same
 *    location, ignoring its cost."
 *   × Rockfall Path (sfd-216-221) Battlefield: "Units can't be played here."
 *
 * Q: What happens if Temporal Breach banishes a unit at Rockfall Path?
 * A: The unit is banished, but its owner cannot play it back to Rockfall Path — that play instruction is
 *    skipped as impossible. The spell still resolves; the earlier banish is unaffected, so the unit stays
 *    in its owner's banishment.
 * Rules: 358.3.a (impossible instruction is skipped, resolution continues).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TEMPORAL_BREACH = "ven-066-166";
const ROCKFALL_PATH = "sfd-216-221";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit, cost 3

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn with exactly [2][mind]. P2's damaged, exhausted Skulker sits at bf1 — which is Rockfall Path
 * (abilities live) when `rockfall`, else an inert battlefield. P2 has 0 resources (the replay ignores cost).
 */
function board(rockfall: boolean) {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 1 } })
    .battlefield("bf1", rockfall ? { controller: P2, def: ROCKFALL_PATH, inert: false } : { controller: P2 })
    .unit(P2, "bf1", SKULKER, "victim", { damage: 1, exhausted: true })
    .hand(P1, TEMPORAL_BREACH, "breach");
}

/** Cast Temporal Breach on the victim (choice supplied at play time or on resolution) and resolve it. */
async function breach(game: Game): Promise<void> {
  await game.p1.cast("breach", { answers: ["victim"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  let stop = await game.settle();
  if (stop.reason === "unanswered" && game.decision()?.seat === P1) {
    await game.p1.pick("victim");
    stop = await game.settle({ policy: "first" }); // P2's replay has a fixed destination; take forced steps
  }
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("breach")).toBe("trash");
}

describe("Ruling 445563aa61a7f05a — Temporal Breach into Rockfall Path: banished, not replayed", () => {
  test("Temporal Breach is castable on P1's turn for [2] + 1 [mind] and goes on the chain", async () => {
    const game = await board(true).build();
    expect(game.p1.can("cast", "breach")).toBe(true);
    await game.p1.cast("breach", { answers: ["victim"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["breach"]);
  });

  // Rockfall Path's "Units can't be played here" removes bf1 from the legal play destinations.
  test("ruling 445563aa61a7f05a (premise) — Rockfall Path is not a legal destination for playing a unit", async () => {
    const game = await scenario()
      .resources(P2, { energy: 3 })
      .active(P2)
      .battlefield("bf1", { controller: P2, def: ROCKFALL_PATH, inert: false })
      .unit(P2, "bf1", { might: 2, name: "Holder" }, "holder")
      .hand(P2, SKULKER, "fresh")
      .build();
    const dests = game.p2.option("play", "fresh")?.fields.find((f) => f.arg === "to")?.options ?? [];
    expect(dests).toContain("base");
    expect(dests).not.toContain("battlefield-bf1");
    const r = await game.p2.try((p) => p.play("fresh", { to: "bf1" }));
    expect(r.ok).toBe(false);
  });

  // Expected (control, ordinary battlefield): the unit is banished and immediately re-played by its owner P2
  // to bf1 ignoring cost — it comes back as a fresh object (no damage), P2 pays nothing, banishment is empty.
  // Actual: Temporal Breach resolves as a no-op (its effect text is not parsed) — the unit is never banished
  // and keeps its damage.
  test("ruling 445563aa61a7f05a (control) — at a normal battlefield the unit is banished then replayed to bf1 for free as a fresh unit; engine does nothing", async () => {
    const game = await board(false).build();
    await breach(game);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.zoneOf("victim")).toBe("battlefield-bf1");
    expect(game.state("victim").damage).toBe(0); // new object after zone change
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} }); // "ignoring its cost"
  });

  // Expected: banish happens; the replay to Rockfall Path is impossible and skipped (358.3.a) → the unit
  // remains in P2's banishment, is on no battlefield / base, and P2 paid nothing.
  // Actual: no-op — the unit is still sitting at bf1.
  test("ruling 445563aa61a7f05a — at Rockfall Path the unit ends in its owner's BANISHMENT (replay skipped); engine leaves it on the battlefield", async () => {
    const game = await board(true).build();
    await breach(game);
    expect(game.zoneOf("victim")).toBe("banishment");
    expect(game.p2.banishment()).toEqual(["victim"]);
    expect(game.p2.units()).toEqual([]);
    expect(game.p2.hand()).not.toContain("victim");
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
  });
});
