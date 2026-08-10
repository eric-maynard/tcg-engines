/**
 * Ruling cb85a94461e61027 — Breakneck Mech (SFD-071 → sfd-071-221) · Unit · Mind · 8 · 7 Might · MECH
 *     "Your Mechs have [Deflect] and [Ganking]. I enter ready if you control another Mech."
 *   (× any other Mech; the scrape lists Rumble, Hotheaded sfd-026-221 — here a printed 3-Might Mech token.)
 *
 * Q: Do multiple Breakneck Mechs stack "your Mechs have Deflect and Ganking"?
 * A: Deflect stacks — each grant is Deflect 1 and granted Deflect values are summed, so with two Breakneck Mechs
 *    your Mechs have Deflect 2 (an opponent pays 2 extra Power to choose one). Ganking is redundant in multiples:
 *    two grants behave exactly like one.
 * Rules: 735.1.b.3 (bare Deflect = 1), 735.2 (granted Deflect sums), 736.2 (multiple Ganking redundant), 809.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BREAKNECK_MECH = "sfd-071-221";
const CLEAVE = "ogn-004-298"; // Fury Action [1]: "Give a unit [Assault 3] this turn." — a cheap opposing targeted spell
const MECH_TOKEN = { cardType: "unit", isToken: true, might: 3, name: "Mech", tags: ["Mech"] } as const;

/** P2's turn with [1] + `spare` fury. P1: `mechs` Breakneck Mechs in base + a Mech token at P1's bf1. P2: a plain unit + Cleave. */
function board(mechs: 1 | 2, spare: number) {
  let s = scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1, power: { fury: spare } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", MECH_TOKEN, "m1")
    .unit(P2, "bf2", { might: 2, name: "Theirs" }, "theirs")
    .hand(P2, CLEAVE, "cleave")
    .unit(P1, "base", BREAKNECK_MECH, "b1");
  if (mechs === 2) {
    s = s.unit(P1, "base", BREAKNECK_MECH, "b2");
  }
  return s;
}

type G = Awaited<ReturnType<ReturnType<typeof board>["build"]>>;
const cleaveTargets = (game: G) => (game.p2.option("cast", "cleave")?.fields.find((f) => f.arg === "targets")?.options ?? []).flat() as string[];

describe("Ruling cb85a94461e61027 — Deflect from two Breakneck Mechs sums to Deflect 2", () => {
  test("baseline, ONE Breakneck Mech: the Mech token has Deflect (1) — P2 can choose it with Cleave for 1 extra Power, not for 0", async () => {
    const none = await board(1, 0).build();
    expect(none.state("m1").keywords).toEqual(expect.arrayContaining(["Deflect", "Ganking"]));
    expect(cleaveTargets(none)).not.toContain("m1");
    const one = await board(1, 1).build();
    expect(cleaveTargets(one)).toContain("m1");
    await one.p2.cast("cleave", { targets: "m1" });
    expect(one.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // [1] + 1 Deflect
  });

  test("TWO Breakneck Mechs: 1 spare Power is no longer enough to choose the Mech token — it needs 2 (Deflect 2)", async () => {
    const one = await board(2, 1).build();
    expect(cleaveTargets(one)).toContain("theirs");
    expect(cleaveTargets(one)).not.toContain("m1");
    const r = await one.p2.try((p) => p.cast("cleave", { targets: "m1" }));
    expect(r.ok).toBe(false);
    const two = await board(2, 2).build();
    expect(cleaveTargets(two)).toContain("m1");
    await two.p2.cast("cleave", { targets: "m1" });
    expect(two.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // [1] + 2 Deflect
    await two.settle();
    expect(two.state("m1").keywords).toContain("Assault");
    expect(two.violations()).toEqual([]);
  });

  test("the Breakneck Mechs are Mechs too: each of them likewise costs 2 extra to choose with two on the board", async () => {
    const one = await board(2, 1).build();
    expect(cleaveTargets(one)).not.toContain("b1");
    const two = await board(2, 2).build();
    expect(cleaveTargets(two)).toEqual(expect.arrayContaining(["b1", "b2", "m1", "theirs"]));
  });
});

describe("Ruling cb85a94461e61027 — Ganking from two Breakneck Mechs is simply Ganking", () => {
  test("with one OR two Breakneck Mechs the token can gank bf1 → bf2 exactly the same way (one move, exhausts, opens the showdown)", async () => {
    for (const n of [1, 2] as const) {
      const game = await board(n, 0).active(P1).build();
      expect(game.state("m1").keywords).toContain("Ganking");
      expect(game.p1.can("gank", "m1")).toBe(true);
      await game.p1.gank("m1", "bf2");
      expect(game.state("m1")).toMatchObject({ isExhausted: true, zone: "battlefield-bf2" });
      expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
      // No "second" gank or extra movement is on offer from the doubled grant.
      expect(game.p1.legal().some((o) => (o.verb === "gank" || o.verb === "move") && o.card === "m1")).toBe(false);
    }
  });
});
