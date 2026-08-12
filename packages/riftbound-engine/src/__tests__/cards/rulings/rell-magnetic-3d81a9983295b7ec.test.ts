/**
 * Ruling 3d81a9983295b7ec — Rell, Magnetic (SFD-024 → sfd-024-221) · 4 Might
 *   "[Tank] When I attack, you may play an Equipment with Energy cost no more than [2], ignoring its
 *    cost. If you do, then do this: Attach it to me."
 *   × Sacred Shears (sfd-172-221) — an Equipment costing [2] AND [order], with [Equip] [order].
 *
 * Q: Do I have to pay the Power cost of an Equipment played through Rell's ability?
 * A: No. "Ignoring its cost" zeroes BOTH the Energy and the Power cost, and the attachment happens as
 *    part of the ability, so the [Equip] cost is not paid either. Nothing at all leaves the pool.
 * Rules: 353.1.a ("ignoring its cost" sets base Energy and Power to 0), 356.1.a.
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RELL = "sfd-024-221";
const SACRED_SHEARS = "sfd-172-221"; // [2] + [order]; [Equip] [order]
const BF_SWORD = "sfd-161-221"; // [4] — too expensive for Rell's filter

/** Rell in P1's base, P2 holding bf1; P1 has NO resources whatsoever. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", RELL, "rell")
    .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
    .hand(P1, SACRED_SHEARS, "shears");
}

describe("Ruling 3d81a9983295b7ec — Rell's Equipment play ignores Energy AND Power (and the [Equip] cost)", () => {
  test("with an empty pool, attacking Rell still plays and attaches a [2] + [order] Equipment", async () => {
    const game = await board().build();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("shears").energyCost).toBe(2);
    expect(game.state("shears").powerCost).toEqual(["order"]);

    await game.p1.move("rell", "bf1");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    await game.p1.yes();

    // The card is picked as the ability RESOLVES.
    await game.p1.passPriority();
    await game.p2.passPriority();
    const pick = game.decision() as Extract<Decision, { kind: "pick" }>;
    expect(pick).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed", timing: "RES" });
    expect(pick.options.map((o) => o.card)).toEqual(["shears"]);
    await game.p1.pick("shears");
    await game.settle();

    // Free in every sense: no Energy, no Power, no [Equip] cost.
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("shears").attachedTo).toBe("rell");
    expect(game.state("rell").attachments).toEqual(["shears"]);
    expect(game.zoneOf("shears")).toBe("battlefield-bf1"); // it rides along with Rell
    expect(game.violations()).toEqual([]);
  });

  test("an Equipment costing more than [2] is not a candidate", async () => {
    const game = await board().hand(P1, BF_SWORD, "sword").build();
    await game.p1.move("rell", "bf1");
    await game.p1.yes();
    await game.p1.passPriority();
    await game.p2.passPriority();
    const pick = game.decision() as Extract<Decision, { kind: "pick" }>;
    expect(pick.options.map((o) => o.card)).toEqual(["shears"]); // the [4] Sword is absent
    await game.p1.pick("shears");
    await game.settle();
    expect(game.zoneOf("sword")).toBe("hand");
  });

  test("declining the pick leaves the Equipment in hand and nothing attached", async () => {
    const game = await board().build();
    await game.p1.move("rell", "bf1");
    await game.p1.yes();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.decline();
    await game.settle();
    expect(game.zoneOf("shears")).toBe("hand");
    expect(game.state("rell").attachments).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("declining the trigger outright asks nothing further", async () => {
    const game = await board().build();
    await game.p1.move("rell", "bf1");
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.zoneOf("shears")).toBe("hand");
  });
});
