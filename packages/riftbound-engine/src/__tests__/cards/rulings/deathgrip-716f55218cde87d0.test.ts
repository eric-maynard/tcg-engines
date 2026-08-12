/**
 * Ruling 716f55218cde87d0 — Deathgrip (SFD-163 → sfd-163-221) · Reaction · [2]
 *   "Kill a friendly unit. If you do, give +[Might] equal to its Might to another friendly unit this turn.
 *    Draw 1."
 *   × Doran's Blade (sfd-095-221) · Equipment · "[Equip] [body]" · +2 Might while attached.
 *
 * Q: Can I Deathgrip an equipped unit (so the buff counts the weapon's Might too) and then attach that
 *    weapon to another unit during the showdown?
 * A: The buff does count the equipment — the killed unit's Might includes it. But the freed gear cannot be
 *    re-attached: [Equip] is a base-speed, main-phase action and there is no permission to attach gear
 *    inside a showdown. It stays unattached (giving nobody a bonus) until it is recalled in the cleanup.
 * Rules: 137.3.a (a gear's Might bonus only applies to the unit it is attached to), 347 (only Action /
 *        Reaction speed inside a showdown — [Equip] is neither), 452.1 (unattached gear is recalled).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEATHGRIP = "sfd-163-221";
const DORANS_BLADE = "sfd-095-221";

/**
 * P2's turn: P2's Striker attacks bf1, which P1 holds with an equipped 3-Might Bearer (5 with the Blade)
 * and a 2-Might Ally. P1 has Deathgrip and plenty of [body] Power to pay an [Equip] with.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 4, power: { body: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Bearer" }, "bearer", { equippedWith: ["blade"] })
    .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
    .gear(P1, DORANS_BLADE, "blade", { attachedTo: "bearer" })
    .unit(P2, "base", { might: 4, name: "Striker" }, "striker")
    .hand(P1, DEATHGRIP, "dg");
}

/** P2 attacks and passes Focus; P1 Deathgrips the equipped Bearer and pumps the Ally. */
async function deathgripDuringShowdown(): Promise<Game> {
  const game = await board().build();
  expect(game.state("bearer").might).toBe(5); // 3 printed + Doran's Blade
  await game.p2.move("striker", "bf1");
  await game.p2.passFocus();
  expect(game.actingSeat()).toBe(P1);

  await game.p1.cast("dg", { targets: "bearer" });
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind === "action" && game.chain().length > 0) await game.acting().passPriority();
    else if (d?.kind === "pick") await game.seat(d.seat).pick(d.options.find((o) => (o.card ?? o.key) === "ally")?.key ?? d.options[0]!.key);
    else break;
  }
  return game;
}

describe("Ruling 716f55218cde87d0 — the buff counts the weapon, but the freed weapon cannot be re-equipped mid-showdown", () => {
  test("the Bearer's Might INCLUDES the Blade, so killing it hands the Ally +5 (2 → 7)", async () => {
    const game = await deathgripDuringShowdown();
    expect(game.zoneOf("bearer")).toBe("trash");
    expect(game.state("ally").might).toBe(7); // 2 + the killed unit's 5
  });

  test("the Blade detaches and gives nobody a bonus, and no [Equip] action is available to P1 during the showdown", async () => {
    const game = await deathgripDuringShowdown();
    expect(game.state("blade").attachedTo).toBeUndefined();
    expect(game.state("ally").might).toBe(7); // 2 + 5 buff, NOT 2 + 5 + 2

    await game.p2.passFocus(); // Focus back to P1 — the best window they could possibly have
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.legal().map((o) => o.verb)).not.toContain("equip");
    expect(game.p1.can("equip", "blade")).toBe(false);
    expect((await game.p1.try((p) => p.playGear("blade", { costTarget: "ally" }))).ok).toBe(false);
  });

  test("after the showdown the Blade is still unattached and back at base; the Ally kept the buff, not the weapon", async () => {
    const game = await deathgripDuringShowdown();
    await game.settle();
    expect(game.state("blade").attachedTo).toBeUndefined();
    expect(game.zoneOf("blade")).toBe("base");
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
    expect(game.state("ally").might).toBe(7);
    expect(game.zoneOf("striker")).toBe("trash"); // the 7-Might Ally saw off the 4-Might attacker
    expect(game.violations()).toEqual([]);
  });
});
