/**
 * Ruling 328f30a7449ebe65 — ([Weaponmaster] is a play trigger only; no specific card named)
 *   Stand-ins: Veteran Poro (SFD-099 → sfd-099-221) · [2] · 2 [Might] · "[Weaponmaster] (When you play me, you
 *   may [Equip] one of your Equipment to me for [rainbow] less, even if it's already attached.)" and
 *   B.F. Sword (SFD-161 → sfd-161-221) · Equipment · +3 [Might] · "[Equip] [order]".
 *
 * Q: Is Weaponmaster's free equip only available as you play the unit, or does it stay live while the unit is on
 *    the board so you can equip a weapon to it at any time?
 * A: Only as you play it. Weaponmaster is a triggered ability with a Play Effect; the discount applies during that
 *    trigger's resolution and nowhere else. Once the unit is on the board the keyword does nothing, and any later
 *    equipping must pay the Equipment's own [Equip] cost in full.
 * Rules: 821.1 ([Weaponmaster] is a triggered "when you play me" ability), 821.3 (no function while on the board),
 *        435.1 (an unattached Equipment's own [Equip] is the only other route, at full cost).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, scenario } from "../../../harness";

const VETERAN_PORO = "sfd-099-221";
const BF_SWORD = "sfd-161-221";

/** P1's turn with [2] for the Poro and one [order] in the pool; the Sword sits unattached in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .gear(P1, BF_SWORD, "sword")
    .hand(P1, VETERAN_PORO, "poro");
}

/** Play the Poro and take the Weaponmaster offer. */
async function equippedOnPlay(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("poro");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "equip" });
  expect((d as PickDecision).options.map((o) => o.card)).toContain("sword");
  await game.p1.pick("sword");
  await game.settle();
  return game;
}

describe("Ruling 328f30a7449ebe65 — Weaponmaster fires only as the unit is played, and does nothing afterwards", () => {
  test("as the Poro is played the offer is made, and taking it attaches the Sword for [rainbow] less — the [order] in my pool is untouched", async () => {
    const game = await equippedOnPlay();
    expect(game.state("sword").attachedTo).toBe("poro");
    expect(game.state("poro")).toMatchObject({ attachments: ["sword"], might: 5 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 1 } }); // only the Poro's [2] was paid
  });

  test("declining the offer leaves the Sword unattached — and the offer never comes back: nothing on the board re-opens Weaponmaster", async () => {
    const game = await board().build();
    await game.p1.play("poro");
    expect(game.decision()).toMatchObject({ kind: "pick", semantics: "equip" });
    await game.p1.decline();
    await game.settle();
    expect(game.state("sword").attachedTo).toBeUndefined();
    expect(game.state("poro").might).toBe(2);
    expect(game.p1.legal().some((o) => /weaponmaster/i.test(JSON.stringify(o)))).toBe(false);
    expect(game.p1.can("activate", "poro")).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("with the Poro already on the board the only way to equip it is the Sword's own [Equip] [order] — at full cost, no reduction", async () => {
    const game = await board().build();
    await game.p1.play("poro");
    await game.p1.decline();
    await game.settle();
    expect(game.p1.power("order")).toBe(1);
    await game.p1.do("equipCard", { equipmentId: "sword", unitId: "poro" });
    await game.settle();
    expect(game.state("sword").attachedTo).toBe("poro");
    expect(game.p1.power("order")).toBe(0); // the full [Equip] cost was paid this time
    expect(game.violations()).toEqual([]);
  });

  test("and with no [order] to pay, an on-board Poro simply cannot be equipped — Weaponmaster offers nothing to fall back on", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .gear(P1, BF_SWORD, "sword")
      .hand(P1, VETERAN_PORO, "poro")
      .build();
    await game.p1.play("poro");
    await game.p1.decline();
    await game.settle();
    const attempt = await game.p1.try((p) => p.do("equipCard", { equipmentId: "sword", unitId: "poro" }));
    expect(attempt.ok).toBe(false);
    expect(game.state("sword").attachedTo).toBeUndefined();
    expect(game.state("poro").might).toBe(2);
  });
});
