/**
 * Ruling c18b66d5ca5bda0d — Whirlwind (OGN-187 → ogn-187-298) · Spell · [3][chaos]
 *   "Starting with the next player, each player may return a unit to its owner's hand."
 *   × Tianna Crownguard (SFD-060 → sfd-060-221) · [Deflect] · 4 [Might] as the protected unit.
 *   × Cleave (OGN-004 → ogn-004-298) as the spell that DOES choose her, × Salvage (OGN-224 → ogn-224-298) as the
 *     spell that chooses her Equipment, × Hexdrinker (SFD-102 → sfd-102-221) · [Deflect] as a second source.
 *
 * Q: When is [Deflect] paid and when is it not?
 * A: It is an additional Power cost an opponent owes for CHOOSING the unit with a spell or ability. Whirlwind, which
 *    hands each player their own choice rather than choosing for them, owes nothing; Cleave, which names her, does.
 *    Several [Deflect] sources on one unit are summed, and [Deflect] on the unit does not shield its Equipment.
 * Rules: 809.1.c ([Deflect] = surcharge per choice), 809.1.d (unpayable ⇒ not a legal choice), 809.2 (sources sum),
 *        352.10.d (programmatic / per-player selections are not targets).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WHIRLWIND = "ogn-187-298";
const TIANNA_CROWNGUARD = "sfd-060-221";
const CLEAVE = "ogn-004-298";
const SALVAGE = "ogn-224-298";
const HEXDRINKER = "sfd-102-221";

/** P1's turn. Tianna ([Deflect]) at P2's bf1, a P1 body beside her. P1's pool covers Whirlwind and nothing more. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", TIANNA_CROWNGUARD, "tianna")
    .unit(P1, "bf1", { might: 3, name: "Mine" }, "mine")
    .hand(P1, WHIRLWIND, "ww");
}

describe("Ruling c18b66d5ca5bda0d — what [Deflect] does and does not tax, with Whirlwind as the untaxed case", () => {
  test("Whirlwind names nobody, so it casts for exactly its printed cost next to a [Deflect] unit", async () => {
    const game = await board().resources(P1, { energy: 3, power: { chaos: 1 } }).build();
    expect(game.state("tianna").keywords).toContain("Deflect");
    const targets = game.p1.option("cast", "ww")?.fields.find((f) => f.arg === "targets");
    expect(targets === undefined || targets.max === 0).toBe(true);
    await game.p1.cast("ww");
    expect(game.p1.resources()).toMatchObject({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
  });

  test("each player then makes their OWN return choice — P2 (the next player) is asked first", async () => {
    const game = await board().resources(P1, { energy: 3, power: { chaos: 1 } }).build();
    await game.p1.cast("ww");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P2, timing: "RES" });
    await game.p2.decline();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // then the caster
    await game.p1.decline();
    await game.settle();
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.zoneOf("tianna")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Cleave, which chooses her, is only offered her when the extra Power is in the pool", async () => {
    const poor = await board().hand(P1, CLEAVE, "cleave").resources(P1, { energy: 1 }).build();
    expect(poor.p1.option("cast", "cleave")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["mine"]]);
    expect((await poor.p1.try((p) => p.cast("cleave", { targets: "tianna" }))).ok).toBe(false);

    const rich = await board().hand(P1, CLEAVE, "cleave").resources(P1, { energy: 1, power: { rainbow: 1 } }).build();
    await rich.p1.cast("cleave", { targets: "tianna" });
    expect(rich.p1.resources()).toMatchObject({ energy: 0, power: { rainbow: 0 } });
  });

  test("[Deflect] sources sum: Tianna wearing a Hexdrinker costs TWO Power to choose, not one", async () => {
    const one = await board()
      .card("hex", { def: HEXDRINKER, meta: { attachedTo: "tianna" } as Record<string, unknown>, owner: P2, zone: "bf1" })
      .hand(P1, CLEAVE, "cleave")
      .resources(P1, { energy: 1, power: { rainbow: 1 } })
      .build();
    expect(one.state("hex").attachedTo).toBe("tianna");
    expect(one.p1.option("cast", "cleave")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["mine"]]);

    const two = await board()
      .card("hex", { def: HEXDRINKER, meta: { attachedTo: "tianna" } as Record<string, unknown>, owner: P2, zone: "bf1" })
      .hand(P1, CLEAVE, "cleave")
      .resources(P1, { energy: 1, power: { rainbow: 2 } })
      .build();
    await two.p1.cast("cleave", { targets: "tianna" });
    expect(two.p1.resources()).toMatchObject({ energy: 0, power: { rainbow: 0 } });
  });

  test("[Deflect] on the unit does not protect the Equipment: Salvage kills her Hexdrinker with no surcharge", async () => {
    const game = await board()
      .card("hex", { def: HEXDRINKER, meta: { attachedTo: "tianna" } as Record<string, unknown>, owner: P2, zone: "bf1" })
      .hand(P1, SALVAGE, "salvage")
      .resources(P1, { energy: 2, power: { order: 1 } })
      .build();
    await game.p1.cast("salvage", { targets: "hex" });
    expect(game.p1.resources()).toMatchObject({ energy: 0, power: { order: 0 } }); // printed cost only
    await game.settle();
    expect(game.zoneOf("hex")).toBe("trash");
    expect(game.zoneOf("tianna")).toBe("battlefield-bf1");
  });
});
