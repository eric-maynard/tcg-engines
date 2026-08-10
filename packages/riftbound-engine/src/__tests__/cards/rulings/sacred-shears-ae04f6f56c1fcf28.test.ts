/**
 * Ruling ae04f6f56c1fcf28 — Sacred Shears (SFD-172 → sfd-172-221) · Equipment +1 · Effect text "[Deathknell] — Draw 1."
 *   × Windsinger (SFD-138 → sfd-138-221) · 1 Might [2] · "Hidden. When you play me, you may return another unit at a battlefield with
 *     3 [Might] or less to its owner's hand."   (worn by a 2-Might Sand Soldier unit token → 3 Might.)
 *
 * Q: My Sand Soldier wearing Sacred Shears is returned to hand by Windsinger — do I draw from the Shears?
 * A: No. [Deathknell] is "When I die"; being returned to hand is not dying (a token just ceases to exist), so nothing triggers and
 *    no card is drawn.
 * Rules: 808 (Deathknell = when killed / put into trash from the board), 186.1 (a token leaving the board ceases to exist),
 *        718.3 (Equipment effect text is conferred to the wearer), 719.5 (wearer leaves → Equipment detaches, stays yours).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SACRED_SHEARS = "sfd-172-221";
const WINDSINGER = "sfd-138-221";
const HEXTECH_RAY = "ogn-009-298";
const SAND_SOLDIER = { cardType: "unit", isToken: true, might: 2, name: "Sand Soldier", tags: ["Sand Soldier"] } as const;

/** P2's turn. P1's Sand Soldier token (2 +1 Shears = 3) holds bf1 wearing Sacred Shears. P2: Windsinger + [2], Hextech Ray + [1][fury]. Known P1 deck. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", SAND_SOLDIER, "token-soldier", { equippedWith: ["shears"] } as Record<string, unknown>)
    .card("shears", { def: SACRED_SHEARS, meta: { attachedTo: "token-soldier" } as Record<string, unknown>, owner: P1, zone: "bf1" })
    .unit(P1, "bf1", { might: 4, name: "Anchor" }, "anchor")
    .hand(P2, WINDSINGER, "windsinger")
    .hand(P2, HEXTECH_RAY, "ray")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

describe("Ruling ae04f6f56c1fcf28 — bouncing the Shears-wearing Sand Soldier is not a death: no Deathknell draw", () => {
  test("setup: the token wears the Shears (2 → 3 Might, within Windsinger's '3 or less') and is a token", async () => {
    const game = await board().build();
    expect(game.state("token-soldier")).toMatchObject({ attachments: ["shears"], isToken: true, might: 3, zone: "battlefield-bf1" });
  });

  test("ruling: P2 plays Windsinger and returns the Sand Soldier — the token ceases to exist, the Shears detach back to P1 (not trashed), and P1 draws NOTHING", async () => {
    const game = await board().build();
    await game.p2.play("windsinger", { to: "base" });
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P2) {
        await game.p2.yes();
      } else if (d?.kind === "pick" && d.seat === P2) {
        expect(d.options.map((o) => o.card ?? o.key)).toContain("token-soldier");
        await game.p2.pick("token-soldier");
      } else if (d?.kind === "action" && game.chain().length > 0) {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("windsinger")).toBe("base");
    expect(game.has("token-soldier") ? game.zoneOf("token-soldier") : "gone").not.toBe("battlefield-bf1");
    expect(["gone", "hand"]).toContain(game.has("token-soldier") ? game.zoneOf("token-soldier") : "gone");
    expect(game.p1.trash()).not.toContain("token-soldier");
    // No Deathknell: no chain item ever, no draw.
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand().filter((c) => c === "d1" || c === "d2")).toEqual([]);
    expect(game.p1.deck().slice(0, 2)).toEqual(["d1", "d2"]);
    // The Shears are not killed either — they detach and stay P1's, off the token.
    expect(game.zoneOf("shears")).not.toBe("trash");
    expect(game.state("shears")).toMatchObject({ attachedTo: undefined, owner: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: KILLING the same token (Hextech Ray, 3 damage) IS a death — the conferred Deathknell draws P1 exactly 1", async () => {
    const game = await board().build();
    await game.p2.cast("ray", { targets: "token-soldier" });
    await game.settle();
    expect(game.has("token-soldier") ? game.zoneOf("token-soldier") : "gone").not.toBe("battlefield-bf1");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.zoneOf("shears")).not.toBe("trash");
  });
});
