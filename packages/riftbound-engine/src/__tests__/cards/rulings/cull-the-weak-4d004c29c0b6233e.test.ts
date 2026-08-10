/**
 * Ruling 4d004c29c0b6233e — Cull the Weak (OGN-209 → ogn-209-298) · Spell · Order · [2][order]
 *     "Each player kills one of their units."
 *   (The scrape files it under Cull sfd-134-221 — a name collision; the question "Cull of the Weak" is about Cull the Weak.)
 *
 * Q: Do I need a unit myself to play Cull the Weak?
 * A: No. It targets nothing when played — each player's choice happens on resolution — so it is playable with an empty
 *    board. "Do as much as you can": you kill nothing, but the opponent must still kill one of theirs if they have any.
 *    The kill is part of the effect, not an additional cost.
 * Rules: 355 (targets chosen at play vs. choices on resolution), 356.3.e.11 (do as much as you can), 356.2 (costs).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";

/** P1's turn: P1 controls NO units, holds Cull the Weak with exactly [2][order]. P2 has two units in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .unit(P2, "base", { might: 1, name: "Minion" }, "minion")
    .unit(P2, "base", { might: 5, name: "Giant" }, "giant")
    .hand(P1, CULL_THE_WEAK, "cull");
}

describe("Ruling 4d004c29c0b6233e — Cull the Weak needs no unit of your own", () => {
  test("with zero friendly units the spell is legal; its cast asks for no target and no sacrifice — only [2][order] is paid — and it goes on the chain with nothing chosen", async () => {
    const game = await board().build();
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.can("cast", "cull")).toBe(true);
    const fields = game.p1.option("cast", "cull")?.fields ?? [];
    // Nothing needs to be chosen at play time: the only offered "targets" selection is the empty one.
    expect(fields.find((f) => f.name === "targets")?.options ?? [[]]).toEqual([[]]);
    expect(fields.map((f) => String(f.arg))).not.toContain("sacrifice"); // the kill is not an additional cost
    await game.p1.cast("cull", { targets: [] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P1 })]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
    expect(game.zoneOf("minion")).toBe("base");
    expect(game.zoneOf("giant")).toBe("base");
  });

  test("on resolution P1 (no units) simply kills nothing, while P2 is REQUIRED to choose one of their own units — P2's pick, not declinable — and it dies", async () => {
    const game = await board().build();
    await game.p1.cast("cull", { targets: [] });
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["giant", "minion"]);
    expect(d?.kind === "pick" ? d.allowDecline : true).toBe(false);
    await game.p2.pick("minion");
    await game.settle();
    expect(game.zoneOf("minion")).toBe("trash");
    expect(game.zoneOf("giant")).toBe("base");
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: when the caster DOES have a unit, both players kill one (P1's lone unit is forced)", async () => {
    const game = await board().unit(P1, "base", { might: 2, name: "Volunteer" }, "volunteer").build();
    await game.p1.cast("cull", { targets: [] }); // name nothing up front — the choices happen on resolution
    await game.settle();
    for (let i = 0; i < 3 && game.decision()?.kind === "pick"; i++) {
      const d = game.decision()!;
      await game.seat(d.seat).pick(d.seat === P2 ? "giant" : "volunteer");
      await game.settle();
    }
    expect(game.zoneOf("volunteer")).toBe("trash");
    expect(game.zoneOf("giant")).toBe("trash");
    expect(game.zoneOf("minion")).toBe("base");
  });
});
