/**
 * Ruling 0c2c00a707720e5d — Thermo Beam (OGN-022 → ogn-022-298) · Spell · Fury · [5][fury][fury] · [Action] "Kill all gear."
 *   × Warmog's Armor (sfd-108-221) · Equipment · +1 — attached to a unit;  × Zhonya's Hourglass (ogn-077-298) — a loose gear.
 *
 * Q: Can spells/abilities target and kill ATTACHED Equipment?
 * A: Yes. Attached Equipment is still gear (its type line stays active), so "kill all gear" — or anything that affects
 *    gear — hits attached Equipment too.
 * Rules: 137/150 (Equipment is a gear subtype; attached it keeps its types), 718 (attach/detach), 415 (kill).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const THERMO_BEAM = "ogn-022-298";
const WARMOGS = "sfd-108-221";
const ZHONYAS = "ogn-077-298";

/** P2's turn with [5][fury][fury]. P1: Knight (3) in base wearing Warmog's (+1 → 4) and a loose Zhonya's; P2: a loose gear of their own. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 5, power: { fury: 2 } })
    .unit(P1, "base", { might: 3, name: "Knight" }, "knight", { equippedWith: ["wm"] } as Record<string, unknown>)
    .card("wm", { def: WARMOGS, meta: { attachedTo: "knight" } as Record<string, unknown>, owner: P1, zone: "base" })
    .gear(P1, ZHONYAS, "zh")
    .gear(P2, { cardType: "gear", energyCost: 1, name: "Their Trinket" }, "trinket")
    .hand(P2, THERMO_BEAM, "beam");
}

describe("Ruling 0c2c00a707720e5d — 'kill all gear' kills attached Equipment too", () => {
  test("setup: Warmog's is ATTACHED to the Knight (attachments = [wm], Knight 3 + 1 = 4) and still reads as gear", async () => {
    const game = await board().build();
    expect(game.state("knight")).toMatchObject({ attachments: ["wm"], might: 4 });
    expect(game.state("wm")).toMatchObject({ attachedTo: "knight", zone: "base" });
    expect(["gear", "equipment"]).toContain(game.state("wm").cardType);
  });

  test("Thermo Beam resolves: EVERY gear dies — the attached Warmog's, the loose Zhonya's and P2's own trinket all go to their owners' trashes; the Knight lives on unequipped at 3", async () => {
    const game = await board().build();
    await game.p2.cast("beam");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("beam")).toBe("trash");
    expect(game.zoneOf("wm")).toBe("trash");
    expect(game.p1.trash()).toContain("wm");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("trinket")).toBe("trash");
    expect(game.state("knight")).toMatchObject({ attachments: [], might: 3, zone: "base" });
    expect(game.state("wm").attachedTo).toBeUndefined();
    expect(game.p1.gear()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
