/**
 * Ruling af3d3166b881f7c2 — The Zero Drive (SFD-090 → sfd-090-221) · Equipment · Mind · [3]
 *   "[Equip] [1][mind] · [3][mind], Banish this: Play all units banished with this, ignoring their costs.
 *    (Use only if unattached.) · [Deathknell] — Banish me."
 *
 * Q: When a unit wearing the Zero Drive dies, does the order of "tap 3 / recycle" then banish matter, and
 *    how does the banish cost work?
 * A: When the wearer dies only the UNIT is banished; the Drive simply becomes unattached and stays on the
 *    board. Its ability cannot be used while attached. Later, unattached, you announce the ability and pay
 *    the Energy, the Power and "Banish this" together as one cost — [Add] abilities (tapping runes for
 *    Energy, recycling one for Power) may be used to fund it — and then every unit banished with the Drive
 *    is played for free.
 * Rules: 204.3/404.1 (all costs of an ability are paid at once, on activation), 429.3/357.1.a ([Add]
 *        abilities fund a payment), 718 (Equipment Effect Text is only live while attached).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const ZERO_DRIVE = "sfd-090-221";

/** Inline [1] Action "Kill a unit." — sets off the wearer's granted "[Deathknell] — Banish me". */
const SLAY = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Test Slay",
  timing: "action",
} as const;

const WEARER = { cardType: "unit", energyCost: 4, might: 4, name: "Drive Pilot" } as const;

/** P1's turn: `wearer` in base carrying the Drive, a Slay in hand, and `energy`/`mind` banked. */
function board(energy: number, mind: number) {
  return scenario()
    .resources(P1, { energy, power: { mind } })
    .unit(P1, "base", WEARER, "wearer", { equippedWith: ["zd"] } as Record<string, unknown>)
    .card("zd", { def: ZERO_DRIVE, meta: { attachedTo: "wearer" } as Record<string, unknown>, owner: P1, zone: "base" })
    .hand(P1, SLAY, "slay");
}

/** Kill the wearer: its granted Deathknell banishes it "with" the Drive. */
async function killWearer(game: Game): Promise<void> {
  await game.p1.cast("slay", { targets: "wearer" });
  await game.settle({ policy: "first" });
}

describe("Ruling af3d3166b881f7c2 — Zero Drive: only the wearer is banished; the ability is paid (banish included) later, unattached", () => {
  test("ruling: while ATTACHED the [3][mind], Banish this ability cannot be used — equipment extra abilities are off while worn", async () => {
    const game = await board(4, 1).build();
    expect(game.state("zd").attachedTo).toBe("wearer");
    expect(game.state("wearer").attachments).toEqual(["zd"]);
    expect(game.p1.can("activate", "zd")).toBe(false);
    expect((await game.p1.try((p) => p.activate("zd"))).ok).toBe(false);
    expect(game.zoneOf("zd")).toBe("base"); // nothing was banished by the attempt
  });

  test("ruling: the wearer dies ⇒ ONLY the unit is banished; the Drive stays on the board and becomes unattached", async () => {
    const game = await board(4, 1).build();
    await killWearer(game);
    expect(game.zoneOf("wearer")).toBe("banishment");
    expect(game.zoneOf("zd")).toBe("base"); // the equipment was NOT banished with it
    expect(game.state("zd").attachedTo).toBeUndefined();
    expect(game.state("zd").attachments).toEqual([]);
  });

  test("ruling: unattached, the ability becomes usable and its costs — [3], [mind] and 'Banish this' — are all paid at once", async () => {
    const game = await board(4, 1).build();
    await killWearer(game);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { mind: 1 } }); // 4 − 1 for the Slay
    expect(game.p1.can("activate", "zd")).toBe(true);
    await game.p1.activate("zd");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("zd")).toBe("banishment"); // "Banish this" was a COST, spent on announcement
  });

  test("ruling: the ability then plays every unit banished with the Drive, ignoring its cost", async () => {
    const game = await board(4, 1).build();
    await killWearer(game);
    await game.p1.activate("zd");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("wearer")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // the 4-cost unit cost nothing
    expect(game.violations()).toEqual([]);
  });

  test("ruling: with an empty pool the costs may be funded from runes first — tap 3 for Energy, recycle one Mind rune for Power, then activate", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .runes(P1, "mind", 4)
      .unit(P1, "base", WEARER, "wearer", { equippedWith: ["zd"] } as Record<string, unknown>)
      .card("zd", { def: ZERO_DRIVE, meta: { attachedTo: "wearer" } as Record<string, unknown>, owner: P1, zone: "base" })
      .hand(P1, SLAY, "slay")
      .build();
    await killWearer(game);
    expect(game.p1.can("activate", "zd")).toBe(false); // pool is empty
    await game.p1.tapRunes(3);
    await game.p1.recycleRune({ domain: "mind" }, "mind");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { mind: 1 } });
    await game.p1.activate("zd");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("zd")).toBe("banishment");
    expect(game.zoneOf("wearer")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
