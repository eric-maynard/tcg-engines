/**
 * Ruling 175c2600b96d12be — Spinning Axe (SFD-186 → sfd-186-221) · Equipment +3 "[Quick-Draw] [Equip][rainbow] [Temporary]"
 *   × Turn to Dust (UNL-070 → unl-070-219) · Spell [2] "Give a gear [Temporary]."
 *
 * Q: If I give an equipment Temporary, does it die?
 * A: Depends on where Temporary came from. PRINTED Temporary (Spinning Axe) is inactive while the equipment is
 *    attached, so an attached Axe does not die. GRANTED Temporary (Turn to Dust) stays active while attached and
 *    kills it at the start of its controller's next Beginning Phase — also when granted on top of a printed copy.
 * Rules: 135.4 / 718.2 (attached equipment's printed text is inactive), Temporary keyword, 340 (granted text).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SPINNING_AXE = "sfd-186-221";
const TURN_TO_DUST = "unl-070-219";

/**
 * P1's turn. P2's 2-Might Bearer in base wearing Spinning Axe (+3 → 5); P2 also wears a plain +1 Sword on a
 * second unit. P1 holds Turn to Dust with [2].
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", { might: 2, name: "Bearer" }, "bearer", { equippedWith: ["axe"] })
    .card("axe", { def: SPINNING_AXE, meta: { attachedTo: "bearer" }, owner: P2, zone: "base" })
    .unit(P2, "base", { might: 2, name: "Squire" }, "squire", { equippedWith: ["sword"] })
    .card("sword", {
      def: { cardType: "equipment", energyCost: 1, mightBonus: 1, name: "Plain Sword" },
      meta: { attachedTo: "squire" },
      owner: P2,
      zone: "base",
    })
    .hand(P1, TURN_TO_DUST, "dust")
    .resources(P1, { energy: 2 });
}

describe("Ruling 175c2600b96d12be — printed Temporary is inactive on attached equipment; granted Temporary is not", () => {
  test("premise: Spinning Axe is attached (Bearer 2 + 3 = 5) and carries printed Temporary", async () => {
    const game = await board().build();
    expect(game.state("axe")).toMatchObject({ attachedTo: "bearer", controller: P2 });
    expect(game.state("bearer").might).toBe(5);
    expect(game.state("axe").keywords).toContain("Temporary");
  });

  test("printed Temporary on an ATTACHED Spinning Axe does NOT kill it at the start of its controller's Beginning Phase (135.4 / 718.2)", async () => {
    const game = await board().build();
    await game.advanceTurn(); // P1 ends → P2's Beginning Phase runs
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("axe")).toBe("base");
    expect(game.state("axe").attachedTo).toBe("bearer");
    expect(game.state("bearer").might).toBe(5);
    expect(game.violations()).toEqual([]);
  });

  test("control: an UNATTACHED Spinning Axe's printed Temporary is active and kills it at the start of its controller's Beginning Phase", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .gear(P2, SPINNING_AXE, "looseAxe")
      .build();
    expect(game.state("looseAxe").attachedTo).toBeUndefined();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("looseAxe")).toBe("trash");
  });

  test("GRANTED Temporary (Turn to Dust) on an attached plain equipment stays active → it dies at the start of P2's Beginning Phase; the bearer stays", async () => {
    const game = await board().build();
    await game.p1.cast("dust", { targets: "sword" });
    await game.settle();
    expect(game.zoneOf("dust")).toBe("trash");
    expect(game.state("sword").keywords).toContain("Temporary");
    expect(game.state("sword").attachedTo).toBe("squire");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("sword")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("base");
    expect(game.state("squire")).toMatchObject({ attachments: [], might: 2 });
    expect(game.violations()).toEqual([]);
  });

  // Expected: the granted Temporary is a second, ACTIVE instance → the attached Axe dies at P2's Beginning Phase.
  // Actual: the engine treats the attached Axe's Temporary as wholly inactive (printed copy shadows the grant) → it survives.
  test("ruling 175c2600b96d12be — printed + granted: Turn to Dust on the attached Spinning Axe should kill it at P2's Beginning Phase; engine keeps it alive", async () => {
    const game = await board().build();
    await game.p1.cast("dust", { targets: "axe" });
    await game.settle();
    expect(game.state("axe").grantedKeywords.map((k) => k.keyword)).toContain("Temporary");
    expect(game.state("axe").attachedTo).toBe("bearer");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("axe")).toBe("trash");
    expect(game.zoneOf("bearer")).toBe("base");
    expect(game.state("bearer")).toMatchObject({ attachments: [], might: 2 });
    expect(game.violations()).toEqual([]);
  });
});
