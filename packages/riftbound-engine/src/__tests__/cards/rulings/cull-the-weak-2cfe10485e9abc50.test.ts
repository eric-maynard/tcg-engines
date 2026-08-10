/**
 * Ruling 2cfe10485e9abc50 — Cull the Weak (OGN-209 → ogn-209-298) · Spell · Order · 2 + [order]
 *   "Each player kills one of their units."
 *   (The scrape also lists Cull sfd-134-221 — a name collision; the question is about Cull the Weak.)
 *
 * Q: Can I play Cull the Weak when I control no units and my opponent controls exactly one?
 * A: Yes. It does not target — the choice of unit is made on resolution — so it is legal to play with
 *    no friendly unit. On resolution the caster's half is skipped (do as much as you can) and the
 *    opponent must still kill their one unit.
 * Rules: 355 (choice at resolution ≠ target at play), 356.3.e.11 (partial resolution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Lone Enemy" }, "lone")
    .hand(P1, CULL_THE_WEAK, "cull");
}

describe("Ruling 2cfe10485e9abc50 — Cull the Weak with 0 friendly units vs an opponent with 1", () => {
  test("step 1: it is legal to play with no friendly unit; the cost is paid and it goes on the chain with nothing chosen", async () => {
    const game = await board().build();
    expect(game.p1.units()).toEqual([]);
    expect(game.p2.units()).toEqual(["lone"]);
    expect(game.p1.can("cast", "cull")).toBe(true);
    // No target is demanded at play time (it does not target).
    const targets = game.p1.option("cast", "cull")?.fields.find((f) => f.name === "targets");
    expect((targets?.options ?? []).flat()).toEqual([]); // no card is chosen as it is played
    expect(targets?.min ?? 0).toBe(0);
    await game.p1.cast("cull");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P1 })]);
    expect(game.zoneOf("lone")).toBe("battlefield-bf1");
  });

  test("steps 2-4: it resolves; the caster kills nothing (has nothing), the opponent's single unit is killed", async () => {
    const game = await board().build();
    await game.p1.cast("cull");
    await game.settle();
    // With exactly one unit the opponent's "choice" is forced; tolerate an explicit prompt for P2.
    if (game.decision()?.kind === "pick" && game.actingSeat() === P2) {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
      await game.p2.pick("lone");
      await game.settle();
    }
    expect(game.zoneOf("lone")).toBe("trash");
    expect(game.p2.units()).toEqual([]);
    expect(game.p1.units()).toEqual([]);
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
