/**
 * Ruling 4562a494c2ab1521 — Cull the Weak (OGN-209 → ogn-209-298) · Spell · Order · [2][order]
 *   "Each player kills one of their units."
 *   (The scrape files it under "Cull" (sfd-134-221, an Equipment) — a name collision; the question is about
 *    the spell Cull the Weak.)
 *
 * Q: Can I play Cull the Weak if I have no unit?
 * A: Yes. It targets nothing when played, so board state is irrelevant to putting it on the chain. "Do as much
 *    as you can": with no unit you kill nothing, but the opponent must still kill one of theirs. Killing is the
 *    spell's effect, not an additional cost — otherwise you would need a unit to play it.
 * Rules: 055 / 356.3.e (do as much as you can), 355 (targets are chosen at play; this spell chooses none),
 *        356.1 (costs vs effects).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 1, name: "Runt" }, "runt")
    .hand(P1, CULL_THE_WEAK, "cull");
}

describe("Ruling 4562a494c2ab1521 — Cull the Weak with no friendly units: legal to play, opponent still kills one", () => {
  test("no units required: with zero friendly units the cast is legal, asks for no target, and the full [2][order] is paid (the kill is not a cost)", async () => {
    const game = await board().build();
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.can("cast", "cull")).toBe(true);
    // Nothing is targeted at play time: the only variant carries an empty target list.
    const targets = game.p1.option("cast", "cull")?.fields.find((f) => f.name === "targets");
    expect(targets?.max ?? 0).toBe(0);
    expect((targets?.options ?? [[]]).flat()).toEqual([]);
    await game.p1.cast("cull");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P1 })]);
    // Nothing died by merely playing it.
    expect(game.zoneOf("holder")).toBe("battlefield-bf1");
    expect(game.zoneOf("runt")).toBe("base");
  });

  test("do as much as you can: P1 kills nothing; P2 (who has units) must choose one of THEIRS — a compulsory pick for P2 — and it dies", async () => {
    const game = await board().build();
    await game.p1.cast("cull");
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : [];
    expect(offered).toEqual(["holder", "runt"]);
    expect(d?.kind === "pick" ? d.allowDecline : true).toBe(false);
    await game.p2.pick("runt");
    await game.settle();
    expect(game.zoneOf("runt")).toBe("trash");
    expect(game.zoneOf("holder")).toBe("battlefield-bf1");
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — if the kill were a COST a unit-less caster couldn't play it; instead even with NO units on either side it is playable and simply resolves doing nothing", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { order: 1 } }).hand(P1, CULL_THE_WEAK, "cull").build();
    expect(game.p1.can("cast", "cull")).toBe(true);
    await game.p1.cast("cull");
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  });
});
