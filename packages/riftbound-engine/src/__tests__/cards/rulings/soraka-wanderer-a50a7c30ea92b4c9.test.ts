/**
 * Ruling a50a7c30ea92b4c9 — Soraka, Wanderer (SFD-173 → sfd-173-221) · 4 Might · "If another unit you control here would die, if it
 *     has less Might than me, instead heal it, exhaust it, and recall it."
 *   × Blade of the Ruined King (SFD-178 → sfd-178-221) · Equipment · +4 · "[Equip] — [order], Kill a friendly unit"
 *   (fodder: Watchful Sentry ogn-096-298, 1 Might, "[Deathknell] — Draw 1" — so a real death would be visible as a draw)
 *
 * Q: Can you kill a unit for the Blade's Equip cost and have Soraka save it?
 * A: Yes. Soraka replaces the death (heal, exhaust, recall) and the Equip cost still counts as paid — the Blade attaches.
 * Rules: 404 (paying costs), 371–373 (replacement effects apply to "would die"), 818 (Equip), 415 (a saved unit did not die).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SORAKA = "sfd-173-221";
const BOTRK = "sfd-178-221";
const WATCHFUL_SENTRY = "ogn-096-298";

/** P1's turn with exactly {order: 1}. P1's base: Soraka (4), a ready Watchful Sentry (1), Anchor (3), the loose Blade. Known deck top. */
function board() {
  return scenario()
    .resources(P1, { energy: 0, power: { order: 1 } })
    .unit(P1, "base", SORAKA, "soraka")
    .unit(P1, "base", WATCHFUL_SENTRY, "sentry")
    .unit(P1, "base", { might: 3, name: "Anchor" }, "anchor")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .gear(P1, BOTRK, "botrk")
    .deck(P1, ["ogn-175-298"], ["d1"]);
}

/** Activate the Blade's [Equip] onto Anchor, feeding the Sentry to "Kill a friendly unit". */
async function equipKillingSentry(game: Game): Promise<void> {
  const variants = game.p1
    .legal()
    .filter((o) => o.moveId === "equipCard")
    .flatMap((o) => o.variants)
    .map((v) => ({ sacrificeId: v.params.sacrificeId, unitId: v.params.unitId }));
  expect(variants).toContainEqual({ sacrificeId: "sentry", unitId: "anchor" });
  await game.p1.choose("equipCard", { params: { equipmentId: "botrk", unitId: "anchor" }, sacrifice: "sentry" });
  expect(game.p1.power("order")).toBe(0); // the [order] part is paid
}

describe("Ruling a50a7c30ea92b4c9 — Soraka saves the unit killed for Blade of the Ruined King's Equip cost, and the cost still counts", () => {
  test("paying the cost: the Sentry (1 < Soraka's 4, same location) 'would die' → instead it is healed, EXHAUSTED and recalled (stays in base) — not in the trash, no Deathknell draw", async () => {
    const game = await board().build();
    expect(game.state("sentry")).toMatchObject({ isReady: true, location: "base", might: 1 });
    await equipKillingSentry(game);
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("base");
    expect(game.state("sentry")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.hand()).toEqual([]); // Deathknell never triggered — it did not die
    expect(game.p1.deck()[0]).toBe("d1");
  });

  test("…and the Equip is still considered paid: the Blade attaches to Anchor (3 + 4 = 7)", async () => {
    const game = await board().build();
    await equipKillingSentry(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("botrk")).toMatchObject({ attachedTo: "anchor", controller: P1 });
    expect(game.state("anchor")).toMatchObject({ attachments: ["botrk"], might: 7 });
    expect(game.state("soraka")).toMatchObject({ location: "base", might: 4 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — no Soraka: the Sentry really dies for the cost (trash, Deathknell draws d1) and the Blade attaches all the same", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0, power: { order: 1 } })
      .unit(P1, "base", WATCHFUL_SENTRY, "sentry")
      .unit(P1, "base", { might: 3, name: "Anchor" }, "anchor")
      .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
      .gear(P1, BOTRK, "botrk")
      .deck(P1, ["ogn-175-298"], ["d1"])
      .build();
    await equipKillingSentry(game);
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.state("anchor")).toMatchObject({ attachments: ["botrk"], might: 7 });
  });
});
