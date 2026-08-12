/**
 * Ruling 44428f5704230141 — Blade of the Ruined King (SFD-178 → sfd-178-221) · Equipment · [3][order] · +4
 *   "[Equip] — [order], Kill a friendly unit"
 *   × [Weaponmaster] (Sentinel Adept, SFD-008 → sfd-008-221) "When you play me, you may [Equip] one of
 *     your Equipment to me for [rainbow] less, even if it's already attached."
 *
 * Q: Does Weaponmaster let you ignore the Blade's kill cost?
 * A: No. Weaponmaster only makes the Equip cost cheaper by one Power; every non-Power part of that cost
 *    — here "Kill a friendly unit" — is still owed and must be paid. (Only Quick-Draw skips the Equip
 *    cost entirely.)
 * Rules: 821.1.c (Weaponmaster equips for the Equip cost reduced by [rainbow]), 818.1.b–c (the Equip
 *        cost is everything printed after [Equip]), 205/404.1 (costs must be paid in full).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const BOTRK = "sfd-178-221";
const SENTINEL_ADEPT = "sfd-008-221"; // [Weaponmaster], 3 energy, 3 Might
const SKYFALL = "sfd-030-221"; // Equip [1][fury], +2 — a plain Equipment for contrast

/** P1's turn with [3][order]: the Blade in base, the Weaponmaster in hand, plus whatever fodder the case wants. */
function board(opts: { fodder?: boolean } = {}) {
  const s = scenario().resources(P1, { energy: 3, power: { order: 1 } }).gear(P1, BOTRK, "botrk").hand(P1, SENTINEL_ADEPT, "adept");
  return opts.fodder ? s.unit(P1, "base", { might: 1, name: "Fodder" }, "fodder") : s;
}

/** Play the Adept and report the Weaponmaster prompt (a pick over the Equipment you control). */
async function playAdept(game: Game): Promise<string[]> {
  await game.p1.play("adept");
  const d = game.decision();
  return d?.kind === "pick" && d.seat === P1 ? d.options.map((o) => String(o.card ?? o.key)) : [];
}

describe("Ruling 44428f5704230141 — Weaponmaster discounts the Blade's Power, never its 'kill a friendly unit'", () => {
  test("premise: the Blade's Equip cost is [order] PLUS a kill; Weaponmaster's discount is one Power ([rainbow])", async () => {
    const game = await board({ fodder: true }).build();
    expect(game.state("botrk").rulesText).toMatch(/Kill a friendly unit/i);
    expect(game.state("adept").rulesText ?? "").toMatch(/\[rainbow\] less/i);
  });

  test("ruling 44428f5704230141 — with a second friendly unit to kill, Weaponmaster equips the Blade: the Fodder DIES, and the [order] is what the discount ate", async () => {
    const game = await board({ fodder: true }).build();
    const offered = await playAdept(game);
    expect(offered).toContain("botrk");
    await game.p1.pick("botrk");
    await game.settle({ policy: "first" });
    expect(game.state("botrk").attachedTo).toBe("adept");
    expect(game.state("adept").might).toBe(7); // 3 + 4
    expect(game.zoneOf("fodder")).toBe("trash"); // the kill part of the cost was still paid
    expect(game.p1.power("order")).toBe(1); // the [order] was covered by the [rainbow] discount
    expect(game.violations()).toEqual([]);
  });

  test("no other friendly unit: the kill cannot be paid, so the Blade cannot be Weaponmastered on — the Adept enters bare", async () => {
    const game = await board().build();
    const offered = await playAdept(game);
    expect(offered).not.toContain("botrk");
    if (game.decision()?.kind === "pick") {
      await game.p1.decline();
    }
    await game.settle();
    expect(game.state("botrk").attachedTo).toBeUndefined();
    expect(game.state("adept")).toMatchObject({ attachments: [], might: 3 });
    expect(game.p1.power("order")).toBe(1);
  });

  test("the Adept itself is not acceptable fodder either — killing the holder to equip the holder is no way round the cost", async () => {
    const game = await board().build();
    await playAdept(game);
    if (game.decision()?.kind === "pick") {
      await game.p1.decline();
      await game.settle();
    }
    expect(game.zoneOf("adept")).toBe("base");
    expect(game.state("botrk").attachedTo).toBeUndefined();
  });

  test("contrast — a Power-only Equip cost really is fully covered: Skyfall ([1][fury]) attaches for just the [1]", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { fury: 1 } })
      .gear(P1, SKYFALL, "sky")
      .hand(P1, SENTINEL_ADEPT, "adept")
      .build();
    await game.p1.play("adept", { answers: ["sky"] });
    await game.settle();
    expect(game.state("sky").attachedTo).toBe("adept");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
  });
});
