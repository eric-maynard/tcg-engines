/**
 * Ruling 45b4d5271280582d — Bellows Breath (SFD-080 → sfd-080-221) · Action · [1][mind] · [Repeat] [1][mind]
 *     "Deal 1 to up to three units at the same location."
 *   × Traveling Merchant (OGN-185 → ogn-185-298) · 2 Might "When I move, discard 1, then draw 1."
 *   × Flash (OGS-011 → ogs-011-024) · Reaction · [2] "Move up to 2 friendly units to base."
 *
 * Q: I cast Bellows Breath with Repeat, one execution aimed at Kai'Sa (1 Might) at battlefield A and the other at a
 *    1-health Traveling Merchant at battlefield B. My opponent Flashes both units to base in response. Do they still
 *    take the damage and die?
 * A: Yes. Bellows Breath chooses UNITS, not a location; base is a legal place for it to hit them, and a lone target is
 *    always "at the same location" as itself. Flash resolves first, both sit in base, then each execution deals 1 to
 *    its unit where it now is — both die.
 * Rules: 359.3.e.2–3 (a target stays legal while it still meets the requirement), 820 (Repeat: independent executions),
 *        336/340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BELLOWS_BREATH = "sfd-080-221";
const TRAVELING_MERCHANT = "ogn-185-298";
const FLASH = "ogs-011-024";

/**
 * P1's turn with exactly [2] + 2 mind (base + Repeat). P2 holds bfA with Kaisa (1 Might) and bfB with a Traveling
 * Merchant carrying 1 damage (2 Might → one more kills it); P2 has Flash + [2] and one spare card to discard.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 2 } })
    .resources(P2, { energy: 2 })
    .battlefield("bfA", { controller: P2 })
    .battlefield("bfB", { controller: P2 })
    .unit(P2, "bfA", { might: 1, name: "Kaisa" }, "kaisa")
    .unit(P2, "bfB", TRAVELING_MERCHANT, "merchant", { damage: 1 })
    .hand(P1, BELLOWS_BREATH, "bellows")
    .hand(P2, FLASH, "flash")
    .hand(P2, { might: 5, name: "Spare" }, "spare");
}

/** Bellows (Repeat paid) → [kaisa | merchant]; P2 answers with Flash on both. Chain = [bellows, flash]. */
async function bellowsThenFlash(): Promise<Game> {
  const game = await board().build();
  const pairs = game.p1.option("cast", "bellows")?.fields.find((f) => f.name === "targets")?.options ?? [];
  expect(pairs).toContainEqual(["kaisa", "merchant"]); // two executions may aim at different locations
  await game.p1.cast("bellows", { repeat: 1, targets: ["kaisa", "merchant"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bellows", targets: ["kaisa", "merchant"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "flash")).toBe(true);
  await game.p2.cast("flash", { targets: ["kaisa", "merchant"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["bellows", "flash"]);
  expect(game.p2.energy()).toBe(0);
  return game;
}

/** Pass priority (answering P2's Merchant discard prompt with the Spare, if asked) until the chain has `n` items. */
async function resolveDownTo(game: Game, n: number): Promise<void> {
  for (let i = 0; i < 16 && game.chain().length > n; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "pick" && d.seat === P2) {
      const spare = d.options.find((o) => (o.card ?? o.key) === "spare") ?? d.options[0];
      await (spare ? game.p2.answer({ keys: [spare.key], kind: "pick" }) : game.p2.decline());
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else if (d.kind === "yes-no") {
      await game.seat(d.seat).no();
    } else {
      break;
    }
  }
}

describe("Ruling 45b4d5271280582d — Flashing Bellows Breath's targets to base does not save them", () => {
  test("Flash resolves first (LIFO): Kaisa and the Merchant are both in P2's base, undamaged by Bellows so far, and Bellows Breath is still on the chain with its two targets", async () => {
    const game = await bellowsThenFlash();
    await resolveDownTo(game, 1);
    // The Merchant's own "When I move" trigger may sit on top now; let it resolve too.
    for (let i = 0; i < 4 && game.chain().length > 1; i++) {
      await resolveDownTo(game, 1);
    }
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.locationOf("kaisa")).toBe("base");
    expect(game.locationOf("merchant")).toBe("base");
    expect(game.state("kaisa").damage).toBe(0);
    expect(game.state("merchant").damage).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bellows", targets: ["kaisa", "merchant"] })]);
  });

  test("Bellows Breath then resolves: each execution finds its unit at its CURRENT location (base is fine; a lone unit is 'at the same location' as itself) — both take 1 and die", async () => {
    const game = await bellowsThenFlash();
    await resolveDownTo(game, 0);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("bellows")).toBe("trash");
    expect(game.zoneOf("kaisa")).toBe("trash");
    expect(game.zoneOf("merchant")).toBe("trash");
    expect(game.p2.units()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: without Flash the two executions likewise kill both units where they stand (bfA / bfB)", async () => {
    const game = await board().build();
    await game.p1.cast("bellows", { repeat: 1, targets: ["kaisa", "merchant"] });
    await game.settle();
    expect(game.zoneOf("kaisa")).toBe("trash");
    expect(game.zoneOf("merchant")).toBe("trash");
  });
});
