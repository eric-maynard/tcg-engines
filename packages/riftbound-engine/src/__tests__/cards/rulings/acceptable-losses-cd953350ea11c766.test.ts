/**
 * Ruling cd953350ea11c766 — Acceptable Losses (OGN-179 → ogn-179-298) · Action · Chaos · 1
 *     "Each player kills one of their gear."
 *   (× Cull the Weak OGN-209 "Each player kills one of their units" — same template; Cull SFD-134 is a name collision.)
 *
 * Q: Can Acceptable Losses be played if the caster has no gear but the opponent does?
 * A: Yes — exactly like Cull the Weak. It does not target; every player chooses their own gear at RESOLUTION,
 *    starting with the turn player and proceeding in turn order. A player with no gear just does nothing.
 * Rules: 355 (no targets), 422.1.a (each player chooses their own), 359.3.e.11 (do as much as you can), 118 (turn order).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ACCEPTABLE_LOSSES = "ogn-179-298";
const TRINKET = { cardType: "gear", energyCost: 1, name: "Trinket" } as const;
const BAUBLE = { cardType: "gear", energyCost: 1, name: "Bauble" } as const;

/** P1's turn with exactly [1] and NO gear; P2 has two gear (so a real choice exists). */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .unit(P1, "base", { might: 2, name: "Body" }, "body")
    .gear(P2, TRINKET, "p2trinket")
    .gear(P2, BAUBLE, "p2bauble")
    .hand(P1, ACCEPTABLE_LOSSES, "al");
}

describe("Ruling cd953350ea11c766 — Acceptable Losses with no gear of your own", () => {
  test("P1 controls no gear, P2 does: the spell is legal, costs [1], and goes on the chain with nothing chosen (it doesn't target)", async () => {
    const game = await board().build();
    expect(game.p1.gear()).toEqual([]);
    expect(game.p2.gear().toSorted()).toEqual(["p2bauble", "p2trinket"]);
    expect(game.p1.can("cast", "al")).toBe(true);
    const offered = (game.p1.option("cast", "al")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).not.toContain("p2trinket"); // P1 never chooses P2's gear
    expect(offered).not.toContain("p2bauble");
    await game.p1.cast("al", { targets: [] });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "al", controller: P1 })]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
  });

  test("at resolution P2 — not P1 — is asked which of ITS gear dies (no declining); P1 with no gear is never asked and kills nothing", async () => {
    const game = await board().build();
    await game.p1.cast("al", { targets: [] });
    let p1Picked = false;
    game.script(P1, [
      (d) => {
        if (d.kind === "pick") {
          p1Picked = true;
        }
        return undefined;
      },
    ]);
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", seat: P2 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["p2bauble", "p2trinket"]);
    await game.p2.pick("p2trinket");
    await game.settle();
    expect(p1Picked).toBe(false);
    expect(game.zoneOf("p2trinket")).toBe("trash");
    expect(game.zoneOf("p2bauble")).toBe("base");
    expect(game.zoneOf("body")).toBe("base"); // units are not gear
    expect(game.zoneOf("al")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("turn order: when BOTH players have a choice to make, the turn player (P1) chooses first, then P2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .gear(P1, TRINKET, "p1trinket")
      .gear(P1, BAUBLE, "p1bauble")
      .gear(P2, TRINKET, "p2trinket")
      .gear(P2, BAUBLE, "p2bauble")
      .hand(P1, ACCEPTABLE_LOSSES, "al")
      .build();
    await game.p1.cast("al", { targets: [] });
    const seatsAsked: string[] = [];
    for (let i = 0; i < 10; i++) {
      const stop = await game.settle();
      if (stop.reason !== "unanswered") {
        break;
      }
      const d = game.decision();
      if (d?.kind !== "pick") {
        break;
      }
      seatsAsked.push(d.seat);
      const mine = d.options.map((o) => o.card ?? o.key);
      // Each player is only ever offered their OWN gear.
      expect(mine.every((c) => c.startsWith(d.seat === P1 ? "p1" : "p2"))).toBe(true);
      await game.seat(d.seat).pick(d.options[0]?.key as string);
    }
    expect(seatsAsked).toEqual([P1, P2]);
    expect(game.p1.gear()).toHaveLength(1);
    expect(game.p2.gear()).toHaveLength(1);
    expect(game.zoneOf("al")).toBe("trash");
  });
});
