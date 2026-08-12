/**
 * Ruling fbacd10edb7d6008 — Turn to Dust (UNL-070 → unl-070-219) · [2] "Give a gear [Temporary]."
 *   × Spinning Axe (SFD-186 → sfd-186-221) · Equipment +3, PRINTED [Temporary]
 *
 * Q: Is an Equipment still [Temporary] once it is attached, and would it die?
 * A: It depends where the keyword comes from.
 *    · PRINTED on the Equipment: its printed Rules Text is Inactive while attached, so it never triggers — it survives.
 *    · GRANTED by an outside effect (Turn to Dust): only PRINTED text goes inactive, so the granted [Temporary] stays
 *      active and kills the Equipment at the start of its controller's Beginning Phase.
 * Rules: 135.4 / 718.2 (an attached card's printed Rules Text is Inactive), Rules FAQ clarification 2026-04-29
 *        (granted text stays active), 816 ([Temporary]).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TURN_TO_DUST = "unl-070-219";
const SPINNING_AXE = "sfd-186-221";
const VANGUARD_SERGEANT = "ogn-219-298"; // vanilla 4-Might unit

/** P2's turn. P1's Sergeant (4) wears the Spinning Axe (+3 ⇒ 7). P2 holds Turn to Dust and [2]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { mind: 2 } })
    .unit(P1, "base", VANGUARD_SERGEANT, "sarge", { equippedWith: ["axe"] })
    .card("axe", { def: SPINNING_AXE, meta: { attachedTo: "sarge" }, owner: P1, zone: "base" })
    .hand(P2, TURN_TO_DUST, "dust");
}

async function toP1Beginning(game: Game): Promise<void> {
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
}

describe("Ruling fbacd10edb7d6008 — printed [Temporary] sleeps while attached; a granted one does not", () => {
  test("premise: the Axe is attached, carries PRINTED [Temporary], and adds +3 to its bearer", async () => {
    const game = await board().build();
    expect(game.state("axe")).toMatchObject({ attachedTo: "sarge", cardType: "equipment", controller: P1 });
    expect(game.state("axe").keywords).toContain("Temporary");
    expect(game.state("axe").grantedKeywords).toEqual([]);
    expect(game.state("sarge")).toMatchObject({ attachments: ["axe"], baseMight: 4, might: 7 });
  });

  test("PRINTED [Temporary], attached and untouched: nothing triggers at P1's Beginning Phase and the Axe survives", async () => {
    const game = await board().build();
    await toP1Beginning(game);
    expect(game.chain()).toEqual([]); // the printed keyword is Inactive while attached
    await game.settle();
    expect(game.zoneOf("axe")).toBe("base");
    expect(game.state("axe").attachedTo).toBe("sarge");
    expect(game.state("sarge").might).toBe(7);
    expect(game.violations()).toEqual([]);
  });

  test("GRANTED [Temporary] (Turn to Dust on the attached Axe) stays active — the Axe dies at the start of P1's Beginning Phase", async () => {
    const game = await board().build();
    await game.p2.cast("dust", { targets: "axe" });
    await game.settle();
    expect(game.state("axe").grantedKeywords.map((g) => g.keyword)).toContain("Temporary");
    expect(game.zoneOf("axe")).toBe("base"); // still attached; the trigger only fires next Beginning Phase
    await toP1Beginning(game);
    await game.settle();
    expect(game.zoneOf("axe")).toBe("trash");
    expect(game.state("sarge")).toMatchObject({ attachments: [], might: 4 }); // detached ⇒ back to base Might
    expect(game.violations()).toEqual([]);
  });

  test("detached, the PRINTED keyword wakes up again: a loose Spinning Axe dies at the start of P1's Beginning Phase", async () => {
    const game = await scenario()
      .active(P2)
      .gear(P1, SPINNING_AXE, "looseAxe")
      .build();
    expect(game.state("looseAxe").attachedTo).toBeUndefined();
    await game.p2.endTurn();
    await game.settle();
    expect(game.zoneOf("looseAxe")).toBe("trash");
  });
});
