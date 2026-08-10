/**
 * Ruling dc87737bfcf097d5 — Piercing Light (SFD-023 → sfd-023-221) · Spell · [2][fury]
 *     "Deal 2 to a unit at a battlefield, then deal 2 to up to one other unit."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [Hidden][Action] "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: I Piercing Light two units; the FIRST target is removed in response (e.g. Hidden Blade kills it). What happens?
 * A: The second target still takes its 2. "Then" is sequencing, not a condition; targets were locked at finalization; the
 *    instruction on the missing first target is skipped (do as much as you can) and the spell carries on to the second.
 * Rules: 355 (targets chosen on play), 356.3.e.6 / 356.3.e.11 (skip impossible instruction, partial resolution), 811 (Hidden).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PIERCING_LIGHT = "sfd-023-221";
const HIDDEN_BLADE = "ogn-213-298";

/** P1's turn, [2]+fury. P2 holds bf1 with X (3) and Y (2) and hid Hidden Blade there on an earlier turn. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "X" }, "X")
    .unit(P2, "bf1", { might: 2, name: "Y" }, "Y")
    .facedown(P2, "bf1", HIDDEN_BLADE, "blade")
    .hand(P1, PIERCING_LIGHT, "pl");
}

async function castAtXThenY(game: Game): Promise<void> {
  await game.p1.cast("pl", { targets: ["X", "Y"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pl", targets: ["X", "Y"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

describe("Ruling dc87737bfcf097d5 — Piercing Light's second target is still hit when the first is removed in response", () => {
  test("control: unopposed, X takes 2 (survives at 3 Might) and Y takes 2 and dies", async () => {
    const game = await board().build();
    await castAtXThenY(game);
    await game.settle();
    expect(game.zoneOf("pl")).toBe("trash");
    expect(game.state("X")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    expect(game.zoneOf("Y")).toBe("trash");
  });

  test("P2 reveals Hidden Blade in response and kills X (P2 draws 2); LIFO — Blade resolves first, X is gone before Piercing Light resolves", async () => {
    const game = await board().build();
    await castAtXThenY(game);
    expect(game.p2.can("reveal", "blade")).toBe(true);
    const handBefore = game.p2.hand().length;
    await game.p2.reveal("blade", { answers: ["X"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["pl", "blade"]);
    // Resolve just the Blade.
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "blade"); i++) {
      const d = game.decision();
      if (d?.kind !== "action" || d.context !== "chain") {
        break;
      }
      await game.seat(d.seat).passPriority();
    }
    expect(game.zoneOf("X")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(handBefore + 2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["pl"]); // Piercing Light still waiting, targets unchanged
  });

  test("…Piercing Light then resolves: the 'deal 2 to X' instruction is skipped, and Y STILL takes 2 and dies; the spell resolved (trash), not countered", async () => {
    const game = await board().build();
    await castAtXThenY(game);
    await game.p2.reveal("blade", { answers: ["X"] });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("pl")).toBe("trash");
    expect(game.zoneOf("X")).toBe("trash");
    expect(game.zoneOf("Y")).toBe("trash");
    expect(game.p2.trash()).toEqual(expect.arrayContaining(["X", "Y", "blade"]));
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
