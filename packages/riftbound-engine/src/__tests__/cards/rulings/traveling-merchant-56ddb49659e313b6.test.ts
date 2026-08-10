/**
 * Ruling 56ddb49659e313b6 — Traveling Merchant (OGN-185 → ogn-185-298) · 2 Might · "When I move, discard 1, then draw 1."
 *   × Fight or Flight (OGN-168 → ogn-168-298) · [Hidden] [Action] "Move a unit from a battlefield to its base."
 *   × Jinx, Rebel (OGN-202 → ogn-202-298) · 5 Might "When you discard one or more cards, ready me and give me +1 [Might] this turn."
 *
 * Q: If the Merchant moves again in response to its own move trigger (Fight or Flight), does each discard trigger Jinx separately?
 * A: Yes. Two move triggers (same chain) → two separate discards → two separate Jinx triggers: Jinx ends at +2 Might.
 * Rules: 383 (each event triggers separately; multiple triggers may share a chain), 811 (Hidden card played as a Reaction).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MERCHANT = "ogn-185-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";
const JINX = "ogn-202-298";

/**
 * P1's turn 3. P1 holds bf1 with a Holder and hid Fight or Flight there earlier; Merchant (ready) and an EXHAUSTED Jinx in base;
 * hand = two junk cards to discard; known deck top d1, d2.
 */
function board() {
  return scenario()
    .turn(3)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .facedown(P1, "bf1", FIGHT_OR_FLIGHT, "fof")
    .unit(P1, "base", MERCHANT, "merchant")
    .unit(P1, "base", JINX, "jinx", { exhausted: true })
    .unit(P2, "bf2", { might: 2, name: "Guard" }, "guard")
    .hand(P1, { cardType: "unit", energyCost: 4, might: 4, name: "Junk A" }, "junkA")
    .hand(P1, { cardType: "unit", energyCost: 4, might: 4, name: "Junk B" }, "junkB")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** Merchant → bf1 (trigger #1 on the chain); P1 answers by playing the hidden Fight or Flight on the Merchant. */
async function moveAndBounce(): Promise<Game> {
  const game = await board().build();
  expect(game.state("jinx")).toMatchObject({ isExhausted: true, might: 5 });
  await game.p1.move("merchant", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "fof")).toBe(true);
  await game.p1.reveal("fof", { answers: ["merchant"] });
  for (let i = 0; i < 3; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "merchant")) {
      await game.p1.pick("merchant");
    } else {
      break;
    }
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["merchant", "fof"]);
  return game;
}

/** Resolve everything, discarding Junk A first, then Junk B. */
async function resolveAll(game: Game): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      return;
    }
    if (d.kind === "pick" && d.seat === P1) {
      const keys = d.options.map((o) => o.card ?? o.key);
      await game.p1.pick(keys.includes("junkA") ? "junkA" : keys.includes("junkB") ? "junkB" : keys[0]!);
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "order") {
      await game.seat(d.seat).order([]);
    } else {
      return;
    }
  }
}

describe("Ruling 56ddb49659e313b6 — Merchant bounced by Fight or Flight in response to its own trigger: two discards, two Jinx triggers, +2", () => {
  test("Fight or Flight resolves first and sends the Merchant home — a second 'When I move' trigger joins the first on the SAME chain", async () => {
    const game = await moveAndBounce();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Fight or Flight resolves
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.locationOf("merchant")).toBe("base");
    const merchantItems = game.chain().filter((c) => c.cardId === "merchant" && c.triggered);
    expect(merchantItems).toHaveLength(2);
  });

  test("both triggers resolve: two discards (Junk A, Junk B → trash) and two draws (d1, d2); each discard triggered Jinx separately → Jinx readied and 5 + 1 + 1 = 7 this turn", async () => {
    const game = await moveAndBounce();
    await resolveAll(game);
    expect(game.zoneOf("junkA")).toBe("trash");
    expect(game.zoneOf("junkB")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.state("jinx")).toMatchObject({ isReady: true, might: 7, mightModifier: 2 });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
    // "this turn"
    await game.advanceTurn();
    expect(game.state("jinx").might).toBe(5);
  });

  test("control: a single move (no Fight or Flight) is one discard and Jinx +1 only", async () => {
    const game = await board().build();
    await game.p1.move("merchant", "bf1");
    await resolveAll(game);
    expect(game.zoneOf("junkA")).toBe("trash");
    expect(game.zoneOf("junkB")).toBe("hand");
    expect(game.state("jinx")).toMatchObject({ isReady: true, might: 6 });
  });
});
