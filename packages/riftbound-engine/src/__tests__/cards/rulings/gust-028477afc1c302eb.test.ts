/**
 * Ruling 028477afc1c302eb — Gust (OGN-169 → ogn-169-298) · Spell · Chaos · [1] · Reaction
 *   "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Vayne, Hunter (OGN-035 → ogn-035-298) · Champion Unit · Fury · [4][fury] · 2 Might
 *     "[Assault 3] … If an opponent controls a battlefield, I enter ready. …"
 *
 * Q: Can Gust be used on an attacking Vayne "before Assault takes effect"?
 * A: No. Assault is a passive that switches on the moment the unit is designated Attacker, which happens in
 *    the Cleanup right after the move — before anyone can cast anything. By the first spell window Vayne is
 *    already 5 Might and out of Gust's range. (Attack/defend TRIGGERS come later, on the Initial Chain.)
 * Rules: 464.2.c.3 (designations assigned as combat opens), 807.1.c (Assault live while attacker),
 *        464.2.f.1/347 (first play opportunity is the showdown after that Cleanup).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const VAYNE = "ogn-035-298";

/** P1's turn. Vayne (2, Assault 3) ready in P1's base; P2 holds bf1 with a 2-Might unit and has Gust + [1]. */
function board() {
  return scenario()
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", VAYNE, "vayne")
    .unit(P2, "bf1", { might: 2, name: "Lookout" }, "lookout")
    .hand(P2, GUST, "gust");
}

describe("Ruling 028477afc1c302eb — Assault is on before any Gust window", () => {
  test("premise: in base Vayne is a 2-Might non-attacker (Gust-sized)", async () => {
    const game = await board().build();
    expect(game.state("vayne").might).toBe(2);
    expect(game.state("vayne").combatRole).not.toBe("attacker");
  });

  test("the moment the move's Cleanup completes Vayne is the Attacker at 5 Might — no chain/priority window happened in between (464.2.c.3, 807.1.c)", async () => {
    const game = await board().build();
    await game.p1.move("vayne", "bf1");
    // Straight into the (open) combat showdown: no Initial Chain because nobody has attack/defend triggers.
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.state("vayne").combatRole).toBe("attacker");
    expect(game.state("vayne").might).toBe(5);
    expect(game.state("lookout").combatRole).toBe("defender");
  });

  // When P2 first gets to act (Focus passed in the showdown) Vayne is already 5 Might, so Gust's
  // "3 [Might] or less" requirement excludes it — only the 2-Might Lookout is offered and naming Vayne is
  // rejected outright (355.8).
  test("at P2's first opportunity Gust does NOT even offer the 5-Might attacking Vayne — only Lookout is a legal target; naming Vayne is rejected (355.8)", async () => {
    const game = await board().build();
    await game.p1.move("vayne", "bf1");
    await game.p1.passFocus();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "gust")).toBe(true);
    const targets = game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options;
    expect(targets).toEqual([["lookout"]]);
    const r = await game.p2.try((p) => p.cast("gust", { targets: "vayne" }));
    expect(r.ok).toBe(false);
    expect(game.locationOf("vayne")).toBe("bf1");
  });

  // rule 355.8 — by P2's first chance to cast, Vayne is a 5-Might attacker and is no longer a legal
  // choice at all; the only unit Gust can name at bf1 is the 2-Might Lookout, and Vayne rides out the
  // showdown as the attacker.
  test("P2's first chance to cast Gust is in that showdown; by then Gust can only take the Lookout — Vayne (5) stays at bf1 as the attacker", async () => {
    const game = await board().build();
    await game.p1.move("vayne", "bf1");
    await game.p1.passFocus();
    expect(game.actingSeat()).toBe(P2);
    expect(game.state("vayne").might).toBe(5); // already out of range at P2's first opportunity
    await game.p2.cast("gust", { targets: "lookout" });
    expect(game.p2.energy()).toBe(0);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("lookout")).toBe("hand");
    expect(game.zoneOf("vayne")).toBe("battlefield-bf1");
    expect(game.state("vayne")).toMatchObject({ combatRole: "attacker", might: 5 });
    expect(game.p1.hand()).not.toContain("vayne");
  });

  test("letting combat run: Vayne fights at 5 → Lookout (2) dies, Vayne survives (2 damage < 5) and conquers bf1", async () => {
    const game = await board().build();
    await game.p1.move("vayne", "bf1");
    await game.settle();
    // Vayne's "When I conquer, you may pay [1]" opt-in may be offered — decline it if so.
    for (let i = 0; i < 3; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.no();
        await game.settle();
      }
    }
    expect(game.zoneOf("lookout")).toBe("trash");
    expect(game.locationOf("vayne")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
