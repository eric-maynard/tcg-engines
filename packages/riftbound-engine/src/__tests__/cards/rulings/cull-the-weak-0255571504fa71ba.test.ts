/**
 * Ruling 0255571504fa71ba — Cull the Weak (OGN-209 → ogn-209-298) · Spell · Order · 2 + [order]
 *   "Each player kills one of their units."
 *   (The scrape also lists Cull sfd-134-221 — a name collision; the question is about Cull the Weak.)
 *
 * Q: Can my opponent play Cull the Weak if they control no units?
 * A: Yes. Cull the Weak does not target — each player's choice happens on resolution — so no unit is
 *    needed to put it on the chain. "Do as much as you can": the unit-less caster kills nothing, but you
 *    still must kill one of yours. Killing is an effect, not an additional cost.
 * Rules: 355 (targeting at play vs choice at resolution), 356.3.e.11 (do as much as you can).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";

describe("Ruling 0255571504fa71ba — Cull the Weak is playable with no friendly units; the opponent still kills one", () => {
  test("caster P1 controls no units: the spell is legal, costs 2 + [order], and goes on the chain with nothing chosen", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .unit(P2, "base", { might: 1, name: "Victim A" }, "va")
      .unit(P2, "base", { might: 4, name: "Victim B" }, "vb")
      .hand(P1, CULL_THE_WEAK, "cull")
      .build();
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.can("cast", "cull")).toBe(true);
    await game.p1.cast("cull");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // a cost was paid — no unit was
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P1 })]);
    expect(game.zoneOf("va")).toBe("base");
    expect(game.zoneOf("vb")).toBe("base");
  });

  test("on resolution the opponent P2 (who has units) is the one asked to choose one of THEIR units; it dies, the caster loses nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .unit(P2, "base", { might: 1, name: "Victim A" }, "va")
      .unit(P2, "base", { might: 4, name: "Victim B" }, "vb")
      .hand(P1, CULL_THE_WEAK, "cull")
      .build();
    await game.p1.cast("cull");
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : [];
    expect(offered).toEqual(["va", "vb"]);
    expect(d?.kind === "pick" ? d.allowDecline : true).toBe(false); // P2 MUST kill one
    await game.p2.pick("vb");
    await game.settle();
    expect(game.zoneOf("vb")).toBe("trash");
    expect(game.zoneOf("va")).toBe("base");
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("opponent with exactly one unit: no choice to make — that unit is killed", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Lonely" }, "lonely")
      .hand(P1, CULL_THE_WEAK, "cull")
      .build();
    await game.p1.cast("cull");
    await game.settle();
    if (game.decision()?.kind === "pick" && game.actingSeat() === P2) {
      await game.p2.pick("lonely");
      await game.settle();
    }
    expect(game.zoneOf("lonely")).toBe("trash");
    expect(game.zoneOf("cull")).toBe("trash");
  });

  test("neither player controls a unit: still legal to play; it resolves doing nothing (do as much as you can)", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { order: 1 } }).hand(P1, CULL_THE_WEAK, "cull").build();
    expect(game.p1.can("cast", "cull")).toBe(true);
    await game.p1.cast("cull");
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  });
});
