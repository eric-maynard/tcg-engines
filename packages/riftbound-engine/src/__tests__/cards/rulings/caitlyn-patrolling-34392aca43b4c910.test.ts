/**
 * Ruling 34392aca43b4c910 — Caitlyn, Patrolling (OGN-068 → ogn-068-298) · 3 Might ·
 *     "I must be assigned combat damage last." ([Backline])
 *   × Doran's Shield (sfd-033-221) · Equipment · +1 Might · "[Tank] (I must be assigned combat damage first.)"
 *     — the way a Backline unit is given Tank.
 *
 * Q: What happens when a Backline unit is given Tank?
 * A: The two demands are exclusionary, so the player ASSIGNING the damage picks which one to obey: they may
 *    assign to Caitlyn first (Tank) or last (Backline). They may not split the difference — she has to sit
 *    wholly in one of those two slots.
 * Rules: 465.2.c.8 (exclusionary assignment requirements: the assigning player chooses one to apply),
 *        465.2.c.3/.c.4 (lethal in full before moving on; no overkill while units remain unassigned),
 *        718.3/435 (an attached Equipment grants its Effect Text and Might bonus to its wearer).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CAITLYN = "ogn-068-298";
const DORANS_SHIELD = "sfd-033-221";

/**
 * P2's turn. P1 defends bf1 with Caitlyn (3 + Shield = 4 Might, Backline AND Tank) plus two bare 2-Might
 * allies. P2's 6-Might Raider attacks — six damage among 4 + 2 + 2 of Might, so the order genuinely matters.
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", CAITLYN, "cait", { equippedWith: ["shield"] } as Record<string, unknown>)
    .card("shield", { def: DORANS_SHIELD, meta: { attachedTo: "cait" } as Record<string, unknown>, owner: P1, zone: "bf1" })
    .unit(P1, "bf1", { might: 2, name: "Ally A" }, "A")
    .unit(P1, "bf1", { might: 2, name: "Ally B" }, "B")
    .unit(P2, "base", { might: 6, name: "Raider" }, "raider");
}

/** Attack and pass Focus on both sides until P2 is asked how to assign the 6 combat damage. */
async function toAssignment(game: Game): Promise<Decision | null> {
  await game.p2.move("raider", "bf1");
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main" || !d.passKey) {
      return d;
    }
    await game.acting().pass();
  }
  return game.decision();
}

describe("Ruling 34392aca43b4c910 — Tank on a Backline unit: the assigning player picks which demand to obey", () => {
  test("setup: Caitlyn wears the Shield, so she carries BOTH keywords and is a 4", async () => {
    const game = await board().build();
    expect(game.state("cait")).toMatchObject({ attachments: ["shield"], baseMight: 3, might: 4 });
    expect(game.state("cait").keywords).toContain("Backline");
    expect(game.state("cait").keywords).toContain("Tank");
  });

  test("P2 is the one asked how to assign, and may obey TANK: Caitlyn takes her lethal 4 first and dies", async () => {
    const game = await board().build();
    const d = await toAssignment(game);
    expect(d).toMatchObject({ kind: "distribute", seat: P2 });
    expect(d && d.kind === "distribute" ? d.total : 0).toBe(6);
    expect((await game.p2.try((p) => p.distribute({ A: 2, B: 0, cait: 4 }))).ok).toBe(true);
    await game.settle();
    expect(game.zoneOf("cait")).toBe("trash");
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.zoneOf("B")).toBe("battlefield-bf1");
    expect(game.zoneOf("raider")).toBe("trash"); // 4 + 2 + 2 back
  });

  test("…or BACKLINE instead: the two allies are assigned their lethal 2 each and Caitlyn takes the leftover 2, surviving", async () => {
    const game = await board().build();
    const d = await toAssignment(game);
    expect(d).toMatchObject({ kind: "distribute", seat: P2 });
    expect((await game.p2.try((p) => p.distribute({ A: 2, B: 2, cait: 2 }))).ok).toBe(true);
    await game.settle();
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.zoneOf("B")).toBe("trash");
    expect(game.zoneOf("cait")).toBe("battlefield-bf1");
    expect(game.state("cait").damage).toBe(0); // healed when combat ended
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
