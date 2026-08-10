/**
 * Ruling cc1cda30fb80a423 — Ride the Wind (ogn-173-298) × Temporal Breach (ven-066-166) × Fizz, Trickster (sfd-140-221)
 *   × Hard Bargain (sfd-136-221)
 *   Ride the Wind — [Action] · [2][chaos]: "Move a friendly unit and ready it."
 *   Temporal Breach — [Hidden] · [2]+1: "Banish a unit, then its owner plays it to the same location, ignoring its cost."
 *   Fizz — Unit · [3][chaos]: "When you play me, you may play a spell from your trash with Energy cost ≤ [3], ignoring
 *   its Energy cost. Recycle that spell after you play it."
 *   Hard Bargain — [Reaction] · [2] · [Repeat][2]: "Counter a spell unless its controller pays [2]."
 *
 * Q: Opponent plays Ride the Wind. Can I flip a hidden Temporal Breach on my Fizz at that battlefield so Fizz's play
 *    effect plays Hard Bargain from my trash to counter Ride the Wind — or is Fizz's effect a separate chain?
 * A: Same chain. Breach (Reaction from hidden) resolves on top of Ride the Wind: Fizz is banished and replayed there;
 *    his trigger is added to the still-open chain; it plays Hard Bargain (free — no power cost) onto that chain above
 *    Ride the Wind; Hard Bargain resolves first and counters it unless its controller pays [2].
 * Rules: 330–333 (one chain until empty), 401.2 (triggers join the existing chain), 811 (play from hidden), 356.1.b.
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const TEMPORAL_BREACH = "ven-066-166";
const FIZZ = "sfd-140-221";
const HARD_BARGAIN = "sfd-136-221";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P2's turn 3 with exactly [2][chaos] (Ride the Wind — nothing left for Hard Bargain's ransom). P2's Rider (exhausted) in
 * base; bf2 empty. P1 controls bf1 with Fizz standing there and Temporal Breach facedown there (hidden earlier); Hard
 * Bargain is in P1's trash; P1 has NO resources (the flip is [0], Fizz's replay and Hard Bargain are free).
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", FIZZ, "fizz")
    .facedown(P1, "bf1", TEMPORAL_BREACH, "breach")
    .trash(P1, HARD_BARGAIN, "bargain")
    .unit(P2, "base", { might: 3, name: "Rider" }, "rider", { exhausted: true })
    .hand(P2, RIDE_THE_WIND, "ride")
    .deck(P1, ["ogn-175-298"], ["p1top"]);
}

/** P2 casts Ride the Wind on the Rider (→ bf2 if asked now); P2 passes; P1 flips Temporal Breach on Fizz. */
async function rideThenBreach(game: Game): Promise<void> {
  await game.p2.cast("ride", { targets: "rider" });
  for (let i = 0; i < 2; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      const key = d.options.find((o) => o.key === "battlefield-bf2")?.key ?? d.options[0]!.key;
      await game.p2.pick(key);
    }
  }
  expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["ride"]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "breach")).toBe(true);
  await game.p1.reveal("breach", { answers: ["fizz"] });
  for (let i = 0; i < 2; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "fizz")) {
      await game.p1.pick("fizz");
    }
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["ride", "breach"]);
}

/**
 * Drive the chain from here: pass priorities, accept Fizz's "you may", name Hard Bargain, aim it at Ride the Wind,
 * decline the Repeat; stop as soon as `until` holds or at a prompt for P2.
 */
async function drive(game: Game, until: () => boolean): Promise<Decision[]> {
  const seen: Decision[] = [];
  for (let i = 0; i < 30 && !until(); i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    seen.push(d);
    if (d.kind === "action") {
      if (d.context === "chain" && d.passKey) {
        await game.seat(d.seat).passPriority();
        continue;
      }
      break;
    }
    if (d.seat === P2) {
      break; // P2's ransom question — the caller answers it
    }
    if (d.kind === "yes-no") {
      // Fizz's "you may play a spell from your trash" → yes; a Repeat / optional-cost offer → no.
      await (d.source?.cardId === "fizz" ? game.p1.yes() : game.p1.no());
    } else if (d.kind === "pick") {
      const want = ["bargain", "ride", "battlefield-bf1", "bf1"].map((k) => d.options.find((o) => (o.card ?? o.key) === k || o.key === k)).find(Boolean);
      if (want) {
        await game.p1.pick(want.card ?? want.key);
      } else if (d.allowDecline) {
        await game.p1.decline();
      } else {
        await game.p1.pick(d.options[0]!.key);
      }
    } else if (d.kind === "integer") {
      await game.p1.chooseX(d.min);
    } else {
      break;
    }
  }
  return seen;
}

describe("Ruling cc1cda30fb80a423 — Breach → Fizz → Hard Bargain all land on Ride the Wind's chain and counter it", () => {
  test("hidden Temporal Breach is a legal [0] Reaction to Ride the Wind and goes on the SAME chain above it", async () => {
    const game = await board().build();
    await rideThenBreach(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()[0]).toMatchObject({ cardId: "ride", controller: P2 });
    expect(game.chain()[1]).toMatchObject({ cardId: "breach", controller: P1 });
  });

  test("Breach resolves with Ride the Wind still waiting below: Fizz is banished and replayed to bf1 for free, and his play trigger joins THIS chain (Ride the Wind has not resolved — the Rider hasn't moved)", async () => {
    const game = await board().build();
    await rideThenBreach(game);
    await drive(game, () => game.chain().some((c) => c.cardId === "fizz" && c.triggered));
    expect(game.zoneOf("breach")).toBe("trash");
    expect(game.zoneOf("fizz")).toBe("battlefield-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // replay ignored Fizz's cost
    const ids = game.chain().map((c) => c.cardId);
    expect(ids[0]).toBe("ride");
    expect(ids).toContain("fizz");
    expect(game.zoneOf("ride")).toBe("chain");
    expect(game.locationOf("rider")).toBe("base");
    expect(game.state("rider").isExhausted).toBe(true);
  });

  test("Fizz's trigger plays Hard Bargain from the trash for free onto the same chain, targeting Ride the Wind, which is STILL below it", async () => {
    const game = await board().build();
    await rideThenBreach(game);
    await drive(game, () => game.chain().some((c) => c.cardId === "bargain"));
    const chain = game.chain();
    expect(chain[0]).toMatchObject({ cardId: "ride", controller: P2 });
    expect(chain.at(-1)).toMatchObject({ cardId: "bargain", controller: P1, triggered: false });
    // Ride the Wind is the ONLY spell it can name (355.4 — a forced single object is bound without asking).
    expect(chain.at(-1)?.targets ?? ["ride"]).toEqual(["ride"]);
    expect(chain.filter((c) => c.type === "spell").map((c) => c.cardId)).toEqual(["ride", "bargain"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // energy ignored, no power cost to pay
    expect(game.locationOf("rider")).toBe("base"); // Ride the Wind never got to resolve in between
  });

  test("Hard Bargain resolves first (LIFO): P2 can't pay the [2] → Ride the Wind is countered — the Rider never moves or readies; Hard Bargain is recycled (Fizz), the chain empties back to P2's main phase", async () => {
    const game = await board().build();
    await rideThenBreach(game);
    await drive(game, () => game.chain().some((c) => c.cardId === "bargain"));
    // Resolve Hard Bargain: P2 (Ride the Wind's controller) is asked about the [2] it cannot afford.
    await drive(game, () => false);
    const ransom = game.decision();
    if (ransom?.kind === "yes-no" && ransom.seat === P2) {
      expect(ransom.canAccept).toBe(false);
      await game.p2.no();
    }
    await drive(game, () => game.chain().length === 0);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ride")).toBe("trash"); // countered
    expect(game.locationOf("rider")).toBe("base");
    expect(game.state("rider").isExhausted).toBe(true); // never readied
    expect(game.p2.units("bf2")).toEqual([]);
    expect(game.zoneOf("bargain")).toBe("mainDeck"); // "Recycle that spell after you play it"
    expect(game.zoneOf("fizz")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
