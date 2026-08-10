/**
 * Ruling 2fc514de88527995 — Stalwart Poro (OGN-052 → ogn-052-298) · Unit · Calm · 2 · 2 Might · [Shield]
 *   × Guardian Angel (SFD-051 → sfd-051-221) · Equipment · +1 Might — appends "If I would die, kill Guardian Angel
 *     instead. Heal me, exhaust me, and recall me."
 *   × Bellows Breath (SFD-080 → sfd-080-221) · Action · [1][mind] · [Repeat][1][mind] "Deal 1 to up to three units
 *     at the same location."
 *   × Imperial Decree (OGN-221 → ogn-221-298) · Action · [5][order][order] "When any unit takes damage this turn, kill it."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) — "works the same way".
 *
 * Q: My Poro wears Guardian Angel; the opponent plays Imperial Decree, then Bellows Breath with Repeat at the Poro.
 * A: The Poro dies. The repeated Bellows deals damage twice → TWO separate Decree kill triggers, which only go on
 *    the chain once Bellows has fully finished. The first kill to resolve is replaced by Guardian Angel (GA killed,
 *    Poro healed/exhausted/recalled to base); the other kill trigger still resolves and kills the Poro in base —
 *    the Decree trigger tracks the unit, not its location.
 * Rules: 820.1.d (Repeat executes the instruction twice), 383 / 359.3 (triggers created mid-resolution pend until the
 *        spell finishes), 370–373 (a replacement applies to one event), 359.3.f (kill follows the unit).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STALWART_PORO = "ogn-052-298";
const GUARDIAN_ANGEL = "sfd-051-221";
const BELLOWS_BREATH = "sfd-080-221";
const IMPERIAL_DECREE = "ogn-221-298";
const ZHONYAS = "ogn-077-298";

/**
 * P2's turn with exactly Decree ([5]+2 order) + repeated Bellows ([2]+2 mind). P1 holds bf1 with Stalwart Poro wearing
 * Guardian Angel (2+1 = 3 Might, so 2 damage is NOT lethal by itself — every death here comes from the Decree).
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 7, power: { mind: 2, order: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", STALWART_PORO, "poro", { equippedWith: ["ga"] } as Record<string, unknown>)
    .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "poro" } as Record<string, unknown>, owner: P1, zone: "bf1" })
    .hand(P2, IMPERIAL_DECREE, "decree")
    .hand(P2, BELLOWS_BREATH, "bellows");
}

/** Same, but the Poro is bare and P1 has a face-up Zhonya's Hourglass in base instead. */
function boardZhonyas() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 7, power: { mind: 2, order: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", STALWART_PORO, "poro")
    .gear(P1, ZHONYAS, "zhonyas")
    .hand(P2, IMPERIAL_DECREE, "decree")
    .hand(P2, BELLOWS_BREATH, "bellows");
}

async function decreeThenRepeatedBellows(game: Game): Promise<void> {
  await game.p2.cast("decree");
  await game.settle();
  expect(game.zoneOf("decree")).toBe("trash");
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  await game.p2.cast("bellows", { repeat: 1, targets: ["poro"] });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0, order: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bellows", triggered: false })]);
}

/** Pass priority for both players until Bellows has left the chain; accept P2's trigger-order offer if one appears. */
async function resolveBellowsOnly(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.zoneOf("bellows") === "chain"; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.zoneOf("bellows")).toBe("trash");
  const d = game.decision();
  if (d?.kind === "order") {
    expect(d.seat).toBe(P2); // both Decree triggers are P2's — P2 orders them (383.3.d)
    await game.acceptTriggerOrder();
  }
}

const decreeTriggers = (game: Game) => game.chain().filter((c) => c.triggered);

describe("Ruling 2fc514de88527995 — repeated Bellows under Imperial Decree makes two kill triggers; Guardian Angel eats one, the other kills the Poro", () => {
  test("premise: Poro + Guardian Angel is 3 Might at bf1, so the 2 total damage is not lethal on its own", async () => {
    const game = await board().build();
    expect(game.state("poro")).toMatchObject({ attachments: ["ga"], location: "bf1", might: 3 });
  });

  test("Bellows (Repeat) resolves completely first: Poro has taken 1+1 = 2 and is still at bf1; only THEN do two separate Decree triggers (P2's) sit on the chain", async () => {
    const game = await board().build();
    await decreeThenRepeatedBellows(game);
    await resolveBellowsOnly(game);
    expect(game.state("poro")).toMatchObject({ damage: 2, location: "bf1" });
    expect(game.zoneOf("ga")).not.toBe("trash");
    expect(decreeTriggers(game)).toHaveLength(2);
    expect(decreeTriggers(game).every((c) => c.controller === P2)).toBe(true);
  });

  test("the first kill trigger to resolve is replaced by Guardian Angel: GA → trash, Poro healed, exhausted and recalled to base — one Decree trigger still on the chain", async () => {
    const game = await board().build();
    await decreeThenRepeatedBellows(game);
    await resolveBellowsOnly(game);
    // Resolve exactly one trigger.
    for (let i = 0; i < 6 && decreeTriggers(game).length === 2; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else if (d?.kind === "order") {
        await game.acceptTriggerOrder();
      } else {
        break;
      }
    }
    expect(decreeTriggers(game)).toHaveLength(1);
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.state("poro")).toMatchObject({ damage: 0, isExhausted: true, might: 2 });
  });

  test("the remaining kill trigger then finds the Poro in base and kills it: Poro AND Guardian Angel both end in P1's trash", async () => {
    const game = await board().build();
    await decreeThenRepeatedBellows(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["ga", "poro"]);
    expect(game.p1.units()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: an UN-repeated Bellows makes only one kill trigger, which Guardian Angel absorbs — Poro survives exhausted in base", async () => {
    const game = await board().build();
    await game.p2.cast("decree");
    await game.settle();
    await game.p2.cast("bellows", { targets: ["poro"] });
    await game.settle();
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.state("poro")).toMatchObject({ damage: 0, isExhausted: true });
  });

  test("'works the same way with Zhonya's Hourglass': Hourglass spent on the first kill, the second kill trigger still kills the Poro", async () => {
    const game = await boardZhonyas().build();
    await decreeThenRepeatedBellows(game);
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
  });
});
