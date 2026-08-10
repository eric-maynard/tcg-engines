/**
 * Ruling 350728755fb5d864 — Cull the Weak (OGN-209 → ogn-209-298) · Spell · Order · 2 + [order]
 *     "Each player kills one of their units."
 *   × Cruel Patron (OGN-208 → ogn-208-298) · Unit · [4] · "As an additional cost to play me, kill a friendly unit."
 *   (The scrape also lists Cull sfd-134-221 — a name collision; irrelevant.)
 *
 * Q: Can I play Cull the Weak if I have no units?
 * A: Yes. It targets nothing when played — the kill choice happens on resolution — so board state doesn't matter.
 *    "Do as much as you can": you kill nothing, your opponent still kills one of theirs. Killing is the spell's
 *    EFFECT, not a cost — unlike Cruel Patron, whose kill IS an additional cost and so needs a unit to be played.
 * Rules: 355.10.e (not targeting), 356.3.e.11 (do as much as you can), 356.2 (additional costs must be payable).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";
const CRUEL_PATRON = "ogn-208-298";

/** P1's turn: P1 controls NO units, holds Cull the Weak and Cruel Patron with [6] + [order]. P2 has two units in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { order: 1 } })
    .unit(P2, "base", { might: 2, name: "Minnow" }, "minnow")
    .unit(P2, "base", { might: 5, name: "Whale" }, "whale")
    .hand(P1, CULL_THE_WEAK, "cull")
    .hand(P1, CRUEL_PATRON, "patron");
}

describe("Ruling 350728755fb5d864 — Cull the Weak needs no friendly unit; its kill is an effect, not a cost", () => {
  test("with zero friendly units Cull the Weak is legal, costs exactly 2 + [order], and goes on the chain choosing nothing", async () => {
    const game = await board().build();
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.can("cast", "cull")).toBe(true);
    await game.p1.cast("cull");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P1 })]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
  });

  test("on resolution P1 kills nothing (do as much as you can) while P2 must still choose and kill one of THEIR units — the choice surfaces to P2 and cannot be declined", async () => {
    const game = await board().build();
    await game.p1.cast("cull");
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["minnow", "whale"]);
    expect(d?.kind === "pick" ? d.allowDecline : true).toBe(false);
    await game.p2.pick("minnow");
    await game.settle();
    expect(game.zoneOf("minnow")).toBe("trash");
    expect(game.zoneOf("whale")).toBe("base");
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Cruel Patron's kill is an additional COST: with no friendly unit to kill it cannot be played even though P1 can afford [4]", async () => {
    const game = await board().build();
    expect(game.p1.energy()).toBeGreaterThanOrEqual(4);
    expect(game.p1.can("play", "patron")).toBe(false);
    const r = await game.p1.try((p) => p.play("patron"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("patron")).toBe("hand");
  });
});
