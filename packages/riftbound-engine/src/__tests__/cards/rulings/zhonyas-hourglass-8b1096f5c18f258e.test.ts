/**
 * Ruling 8b1096f5c18f258e — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · 2 · [Hidden]
 *   "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × B.F. Sword (sfd-161-221) · Equipment · +3 [Might] — attached to the saved unit
 *   (+ Stupefy ogn-095-298 "-1 [Might] this turn, min 1. Draw 1." and Void Seeker ogn-024-298 "Deal 4 …" as the threat.)
 *
 * Q: When Zhonya's replacement saves a unit with Equipment attached, does the Equipment stay attached?
 * A: Yes. The unit never leaves the board (it is recalled, not killed), so it keeps everything on it: attached Equipment,
 *    other temporary effects, and also negative ones like -[Might] this turn.
 * Rules: 453.1 (a Recall leaves damage/status/layer alterations untouched unless stated), 370/372 (the replacement does
 *        exactly heal / exhaust / recall), 744 (Equipment stays attached while the unit remains in play).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const BF_SWORD = "sfd-161-221";
const STUPEFY = "ogn-095-298";
const VOID_SEEKER = "ogn-024-298";

/** P2's turn with Stupefy + Void Seeker paid. P1's Guard (2) wearing B.F. Sword (+3 ⇒ 5) holds bf1; Zhonya's face up in P1's base. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 4, power: { fury: 1, mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard", { equippedWith: ["sword"] })
    .card("sword", { def: BF_SWORD, meta: { attachedTo: "guard" }, owner: P1, zone: "bf1" })
    .gear(P1, ZHONYAS, "zh")
    .hand(P2, STUPEFY, "stupefy")
    .hand(P2, VOID_SEEKER, "vs");
}

/** Stupefy the Guard (5 → 4), then Void Seeker for 4: lethal — Zhonya's replaces the death. */
async function guardSavedByZhonyas(): Promise<Game> {
  const game = await board().build();
  expect(game.state("guard")).toMatchObject({ attachments: ["sword"], might: 5 });
  await game.p2.cast("stupefy", { targets: "guard" });
  await game.settle();
  expect(game.state("guard")).toMatchObject({ might: 4, mightModifier: -1 });
  await game.p2.cast("vs", { targets: "guard" });
  await game.settle();
  expect(game.zoneOf("vs")).toBe("trash");
  expect(game.zoneOf("zh")).toBe("trash"); // "kill this instead"
  return game;
}

describe("Ruling 8b1096f5c18f258e — a unit recalled by Zhonya's keeps its Equipment (and its -Might)", () => {
  test("the save: Zhonya's is killed instead; the Guard is healed, exhausted and recalled to base — it never left the board (not in the trash)", async () => {
    const game = await guardSavedByZhonyas();
    expect(game.state("guard")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.p1.trash()).not.toContain("guard");
  });

  test("B.F. Sword STAYS ATTACHED through the recall: still on the Guard, not in the trash, its +3 still counted", async () => {
    const game = await guardSavedByZhonyas();
    expect(game.state("guard").attachments).toEqual(["sword"]);
    expect(game.state("sword").attachedTo).toBe("guard");
    expect(game.zoneOf("sword")).not.toBe("trash");
    expect(game.state("guard").baseMight).toBe(2);
    expect(game.state("guard").might).toBe(4); // 2 + 3 (sword) - 1 (Stupefy, still on)
  });

  test("negative temporary effects remain too: Stupefy's -1 [Might] is still on the recalled Guard this turn, and only expires at end of turn (back to 5 with the Sword)", async () => {
    const game = await guardSavedByZhonyas();
    expect(game.state("guard").mightModifier).toBe(-1);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("guard")).toMatchObject({ attachments: ["sword"], might: 5, mightModifier: 0, zone: "base" });
    expect(game.violations()).toEqual([]);
  });
});
