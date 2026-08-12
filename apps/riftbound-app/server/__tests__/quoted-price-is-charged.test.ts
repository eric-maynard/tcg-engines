/**
 * A QUOTED PRICE MUST BE THE PRICE THAT WILL BE CHARGED (rule 356.4), and a
 * SHORTFALL MUST NAME WHAT IS MISSING (357.1 / 357.1.a / 429.3).
 *
 * The snapshot is what the browser prices a card from, so these two must hold
 * through the SERVER surface, not only inside the engine:
 *
 *   1. a DISCOUNTED play (Atakhan's optional "kill a friendly unit" additional
 *      cost, unl-170-219 × Magma Wurm ogn-011-298) quotes the reduced
 *      [2][order][order] and takes exactly that from the pool — never the
 *      printed [10][order][order][order]; and when only the pips are missing,
 *      the pay line names the PIPS, not "4 missing Energy" (356.6 / 206);
 *   2. a FREE play that still owes Power (The Harrowing ogn-198-298 "play a unit
 *      from your trash, ignoring its Energy cost", 356.1.b.2) lists the unit it
 *      cannot pay for AND says which pips are owed, and charges exactly those
 *      pips (and no Energy) when they are pooled.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "@tcg/riftbound/harness";
import type { GameSession } from "../state";
import { buildAvailableMoves, buildGameSnapshot, buildReachablePlays } from "../snapshot";

const ATAKHAN = "unl-170-219"; // [10] + [order]x3; may kill a friendly unit for a per-cost discount
const WURM = "ogn-011-298"; // [8] + [fury]
const HARROWING = "ogn-198-298"; // [6] + [chaos][chaos]; plays a unit from the trash, Energy waived
const SIVIR = "sfd-120-221"; // [6] + [body]x3

function sessionOf(engine: unknown): GameSession {
  return {
    clients: new Map(),
    engine: engine as GameSession["engine"],
    log: [],
    playerNames: { [P1]: "Dev", [P2]: "Opp" },
    players: [P1, P2],
    sandbox: true,
    seq: 0,
  };
}

type Pool = { energy: number; power: Record<string, number> };

function poolOf(snapshot: ReturnType<typeof buildGameSnapshot>, seat: string): Pool {
  const pools = snapshot.runePools as Record<string, Pool | undefined>;
  return { energy: pools[seat]?.energy ?? 0, power: { ...(pools[seat]?.power ?? {}) } };
}

const totalPower = (p: Pool) => Object.values(p.power).reduce((a, n) => a + (n ?? 0), 0);

describe("a discounted play: quoted price === charged price (356.4 / 206)", () => {
  /** 6 Energy and the two [order] pips pooled — enough only for the DISCOUNTED cost. */
  function board(order: number) {
    return scenario()
      .resources(P1, { energy: 6, power: { order } })
      .unit(P1, "base", WURM, "wurm")
      .hand(P1, ATAKHAN, "ata");
  }

  test("the move the client is offered quotes [2][order][order], and playing it takes exactly that", async () => {
    const game = await board(2).build();
    const session = sessionOf(game.engine);

    const move = buildAvailableMoves(session, P1).find(
      (m) => m.moveId === "playUnit" && (m.params as { cardId?: string }).cardId === game.card("ata"),
    );
    expect(move).toBeDefined();
    const quote = (move?.params as { quote?: { energy: number; power: Record<string, number>; any?: number } })
      .quote;
    // The printed cost is [10] + [order]x3; the offered play is the discounted one.
    expect(quote).toMatchObject({ energy: 2, power: { order: 2 } });

    const before = poolOf(buildGameSnapshot(session, P1), P1);
    await game.p1.play("ata", { payOptional: true, sacrifice: "wurm" });
    await game.settle();
    const after = poolOf(buildGameSnapshot(session, P1), P1);

    expect(before.energy - after.energy).toBe(quote?.energy);
    expect(totalPower(before) - totalPower(after)).toBe(
      (quote?.any ?? 0) + Object.values(quote?.power ?? {}).reduce((a, n) => a + (n ?? 0), 0),
    );
    // …and the engine's own oracle agrees, so no invariant is tripped by a
    // correctly-charged discounted play.
    expect(game.violations()).toEqual([]);
  });

  test("a pip-only shortfall names the PIPS: the pay line the snapshot ships owes [order][order] and no Energy", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6 })
      .runes(P1, "order", 2)
      .unit(P1, "base", WURM, "wurm")
      .hand(P1, ATAKHAN, "ata")
      .build();
    const session = sessionOf(game.engine);

    const row = buildReachablePlays(session, P1).find((r) => r.cardId === game.card("ata"));
    expect(row).toBeDefined();
    // Pricing the PRINTED cost here reported "4 missing Energy" — the shortfall
    // of a variant nobody was offered.
    expect(row?.needsAdd.energy).toBeUndefined();
    expect(row?.needsAdd.power).toEqual({ order: 2 });
    expect(row?.needsAdd.reason).toContain("[order][order]");

    // The named fix is the whole fix: two recycles make the play legal, and it
    // is then charged the price that was quoted all along.
    const [r1, r2] = game.p1.runes();
    await game.p1.recycleRune(r1, "order");
    await game.p1.recycleRune(r2, "order");
    const before = poolOf(buildGameSnapshot(session, P1), P1);
    await game.p1.play("ata", { payOptional: true, sacrifice: "wurm" });
    await game.settle();
    const after = poolOf(buildGameSnapshot(session, P1), P1);
    expect({ energy: before.energy - after.energy, power: totalPower(before) - totalPower(after) }).toEqual({
      energy: 2,
      power: 2,
    });
  });
});

describe("a free play that still owes Power: the entry says what is missing (356.1.b.2 / 357.1.a)", () => {
  /** P1 holds exactly The Harrowing's own cost, plus `body` body Power for Sivir. */
  function board(body: number) {
    return scenario()
      .resources(P1, { energy: 6, power: { body, chaos: 2 } })
      .trash(P1, SIVIR, "sivir")
      .hand(P1, HARROWING, "har")
      .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander");
  }

  test("with no body Power, Sivir is still LISTED as the spell's object and the entry is flagged with the pips it owes", async () => {
    const game = await board(0).build();
    const field = game.p1.option("cast", "har")?.fields.find((f) => f.name === "targets");
    const index = (field?.options ?? []).findIndex((v) => (Array.isArray(v) ? v[0] : v) === game.card("sivir"));
    expect(index).toBeGreaterThanOrEqual(0);
    expect(field?.unaffordable?.[index]).toBe(true);
    expect(field?.needsAdd?.power).toEqual({ body: 3 });
    expect(field?.needsAdd?.reason).toContain("[body]");

    // The Energy half really is waived — what is owed is Power only.
    expect(field?.needsAdd?.energy).toBeUndefined();
  });

  test("with [body]x3 pooled the quoted pips are exactly what the pool loses — and no Energy is taken", async () => {
    const game = await board(3).build();
    const session = sessionOf(game.engine);
    const field = game.p1.option("cast", "har")?.fields.find((f) => f.name === "targets");
    // Payable now: the entry carries no shortfall.
    expect(field?.unaffordable ?? []).not.toContain(true);

    const before = poolOf(buildGameSnapshot(session, P1), P1);
    await game.p1.cast("har", { targets: "sivir" });
    await game.settle();
    const after = poolOf(buildGameSnapshot(session, P1), P1);

    // The spell itself cost [6][chaos][chaos]; Sivir added [body]x3 and 0 Energy.
    expect(before.energy - after.energy).toBe(6);
    expect((before.power.body ?? 0) - (after.power.body ?? 0)).toBe(3);
    expect(game.zoneOf("sivir")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("one pip short is still short: nothing is spent on Sivir and she stays in the trash (357.1)", async () => {
    const game = await board(2).build();
    const session = sessionOf(game.engine);
    const before = poolOf(buildGameSnapshot(session, P1), P1);
    await game.p1.cast("har", { targets: "sivir" });
    await game.settle();
    const after = poolOf(buildGameSnapshot(session, P1), P1);

    expect(game.zoneOf("sivir")).toBe("trash");
    // Only the spell was paid for — a partial payment is never taken.
    expect(before.energy - after.energy).toBe(6);
    expect(after.power.body ?? 0).toBe(2);
  });
});
