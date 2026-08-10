/**
 * Ruling 3242368f2da134ce — Cull the Weak (OGN-209 → ogn-209-298) · Spell · Order · 2+[order]
 *   "Each player kills one of their units."
 *   (The scrape also lists Cull sfd-134-221 — a name collision; the ruling is about Cull the Weak.)
 *
 * Q: Can you play Cull the Weak if you own no units anywhere, and does the opponent still have to kill a unit?
 * A: Yes and yes. Killing your own unit is neither a cost nor a target, so the spell is legal with no units. "Do as
 *    much as you can": the opponent must kill one of theirs; you kill nothing.
 * Rules: 355 (no target required to play), 356.3.e.11 / 359 (do as much as you can).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";

/** P1's turn; P1 controls NO units anywhere; P2 has one unit in base and one at a battlefield. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "base", { might: 2, name: "Homebody" }, "home")
    .unit(P2, "bf1", { might: 4, name: "Holder" }, "holder")
    .hand(P1, CULL_THE_WEAK, "cull");
}

describe("Ruling 3242368f2da134ce — Cull the Weak with zero friendly units: legal, and the opponent must still kill", () => {
  test("P1 owns no units, yet Cull the Weak is legal: it is cast for 2+[order] with no target asked and goes on the chain", async () => {
    const game = await board().build();
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.can("cast", "cull")).toBe(true);
    const targetsField = game.p1.option("cast", "cull")?.fields.find((f) => f.name === "targets");
    expect(targetsField?.options ?? [[]]).toEqual([[]]); // the only variant: nothing of P1's to choose
    await game.p1.cast("cull");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P1 })]);
  });

  test("on resolution P2 is REQUIRED to choose one of their own units (no decline); it dies; P1, having none, kills nothing", async () => {
    const game = await board().build();
    await game.p1.cast("cull");
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["holder", "home"]);
    expect(d?.kind === "pick" ? d.allowDecline : true).toBe(false);
    expect(d?.kind === "pick" ? d.min : 0).toBe(1);
    await game.p2.pick("home");
    await game.settle();
    expect(game.zoneOf("home")).toBe("trash");
    expect(game.zoneOf("holder")).toBe("battlefield-bf1");
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
