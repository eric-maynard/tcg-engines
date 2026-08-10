/**
 * Ruling b032ee8e64067a77 — Not So Fast (SFD-045 → sfd-045-221) · Reaction [2][calm] "Counter an enemy spell or ability that chooses a
 *     friendly unit or gear."
 *   × Cull the Weak (OGN-209 → ogn-209-298) · [2][order] Action "Each player kills one of their units." (Cull sfd-134-221: name-clash only.)
 *
 * Q: Does Not So Fast counter Cull the Weak?
 * A: No. Cull the Weak neither chooses nor targets a unit — each player picks which of their units dies as it RESOLVES — so it does not
 *    "choose a friendly unit or gear" and Not So Fast cannot be played against it.
 * Rules: 355 (targets = play-time choices), 355.8 (no legal object → can't play), 422.1.a (each player picks on resolution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const CULL_THE_WEAK = "ogn-209-298";
/** Inline enemy Action that DOES choose a friendly unit (contrast): deal 1 to a unit. */
const POKE = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Poke",
  timing: "action",
} as const;

/** P2's turn with [3] + order. P1: Scout (2) in base, Not So Fast + [2][calm]. P2: Grunt (3) in base, Cull the Weak + Poke. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { order: 1 } })
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 3, name: "Grunt" }, "grunt")
    .hand(P2, CULL_THE_WEAK, "cull")
    .hand(P2, POKE, "poke")
    .hand(P1, NOT_SO_FAST, "nsf");
}

describe("Ruling b032ee8e64067a77 — Not So Fast can't counter Cull the Weak (it chooses no unit)", () => {
  test.failing("BUG: Cull the Weak is cast with NO chosen unit; with priority P1's Not So Fast is not castable — Cull is never offered as its object and forcing it is refused", async () => {
    const game = await board().build();
    expect(game.p2.option("cast", "cull")?.fields.find((f) => f.arg === "targets")?.options ?? [[]]).toEqual([[]]); // nothing to choose at play time
    await game.p2.cast("cull");
    const item = game.chain()[0];
    expect(item).toMatchObject({ cardId: "cull", controller: P2 });
    expect(item?.targets ?? []).toEqual([]);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    const offered = (game.p1.option("cast", "nsf")?.fields.find((f) => f.arg === "targets")?.options ?? []).flat();
    expect(offered).not.toContain("cull");
    expect(game.p1.can("cast", "nsf")).toBe(false);
    const r = await game.p1.try((p) => p.cast("nsf", { targets: "cull" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("nsf")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 1 } });
  });

  test.failing("BUG: …so Cull the Weak resolves: each player kills one of THEIR units (chosen on resolution) — Scout and Grunt both die", async () => {
    const game = await board().build();
    await game.p2.cast("cull");
    await game.p2.passPriority();
    await game.p1.passPriority();
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "pick") {
        await game.seat(d.seat).answer({ keys: [d.options[0]!.key], kind: "pick" });
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("contrast: an enemy spell that DOES choose P1's Scout (Poke) is a legal object — Not So Fast counters it, Scout unharmed", async () => {
    const game = await board().build();
    await game.p2.cast("poke", { targets: "scout" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "nsf")).toBe(true);
    await game.p1.cast("nsf", { targets: "poke" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.zoneOf("poke")).toBe("trash");
    expect(game.state("scout")).toMatchObject({ damage: 0, zone: "base" });
  });
});
