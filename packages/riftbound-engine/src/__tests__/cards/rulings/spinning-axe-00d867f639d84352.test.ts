/**
 * Ruling 00d867f639d84352 — Spinning Axe (SFD-186 → sfd-186-221) · Equipment · Fury/Chaos · [2][rainbow] · +3
 *     "[Quick-Draw] [Equip] [rainbow] [Temporary] (If this is unattached, kill it at the start of its controller's Beginning Phase.)"
 *
 * Q: Can I Equip a Temporary gear like Spinning Axe before my Beginning Phase so it isn't destroyed?
 * A: No. Equip is an activated ability without Action/Reaction, usable only at base speed in your own Action (main) phase.
 *    Temporary triggers at the start of your Beginning Phase, which comes first: Beginning Phase → Temporary kills the gear →
 *    Action phase (where you could have equipped).
 * Rules: 816 (Temporary), 315 (Beginning Phase precedes the Action Phase), 151.2 / Equip (activated at base speed on your turn).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SPINNING_AXE = "sfd-186-221";

/** P2's turn (turn 2). P1 has an UNATTACHED Spinning Axe and a Bearer in base, plus two ready runes it could tap for the Equip cost. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 2, name: "Bearer" }, "bearer")
    .gear(P1, SPINNING_AXE, "axe")
    .runes(P1, "fury", 2)
    .unit(P2, "base", { might: 2, name: "Grunt" }, "grunt");
}

describe("Ruling 00d867f639d84352 — you can't Equip a Temporary gear before your Beginning Phase; Temporary kills it first", () => {
  test("during the opponent's turn P1 has no way to Equip (no legal action at all in P2's open main phase)", async () => {
    const game = await board().build();
    expect(game.state("axe").attachedTo).toBeUndefined();
    expect(game.p1.legal().some((o) => o.verb === "equip" || o.key.startsWith("equipCard"))).toBe(false);
    expect(game.p1.legal().filter((o) => o.verb !== "concede")).toEqual([]);
  });

  test("P2 ends the turn → P1's BEGINNING Phase: the Temporary kill is already on the chain and P1's only options are pass/concede — Equip is not available before the Action phase", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "axe" })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    const equipOffered = () => game.p1.legal().some((o) => o.verb === "equip" || o.key.startsWith("equipCard") || o.verb === "activate");
    expect(equipOffered()).toBe(false);
    // Even after tapping runes for the [rainbow] (adding resources is always allowed), Equip stays unavailable here.
    await game.p1.tapRunes(2);
    expect(game.p1.energy()).toBe(2);
    expect(equipOffered()).toBe(false);
    expect(game.zoneOf("axe")).toBe("base"); // still there, but nothing can save it
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("axe")).toBe("trash");
  });

  test("sequence: the Temporary item resolves and the Axe is killed; only THEN does P1 reach the main (Action) phase — with no Axe left to equip", async () => {
    const game = await board().build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("axe")).toBe("trash");
    expect(game.state("bearer")).toMatchObject({ attachments: [], might: 2 });
    expect(game.p1.legal().some((o) => o.verb === "equip" || o.key.startsWith("equipCard"))).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("control: in P1's own main phase an unattached Axe CAN be equipped (base speed) for [rainbow] — that window just never opens before the Beginning Phase", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .unit(P1, "base", { might: 2, name: "Bearer" }, "bearer")
      .gear(P1, SPINNING_AXE, "axe")
      .build();
    expect(game.phase()).toBe("main");
    expect(game.p1.legal().some((o) => o.verb === "equip" || o.key.startsWith("equipCard"))).toBe(true);
    await game.p1.choose("equipCard:-", { params: { equipmentId: "axe", unitId: "bearer" } });
    await game.settle();
    expect(game.state("axe").attachedTo).toBe("bearer");
    expect(game.state("bearer").might).toBe(5);
    expect(game.p1.power("fury")).toBe(0);
  });
});
