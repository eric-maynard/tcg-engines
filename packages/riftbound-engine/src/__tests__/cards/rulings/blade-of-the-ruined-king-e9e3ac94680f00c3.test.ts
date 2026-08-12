/**
 * Ruling e9e3ac94680f00c3 — Blade of the Ruined King (SFD-178 → sfd-178-221) · Equipment · [3][order]
 *   "[Equip] — [order], Kill a friendly unit"
 *   × [Weaponmaster] (Sentinel Adept SFD-008 → sfd-008-221) "When you play me, you may [Equip] one of your Equipment
 *     to me for [rainbow] less."
 *   × Skyfall of Areion (SFD-030 → sfd-030-221) · "[Equip] [1][fury]"
 *
 * Q: Do I pay Power for Weaponmaster?
 * A: Yes — the Equip cost minus [rainbow] (one Power of any Domain). A one-pip Equip like the Blade's [order] becomes
 *    free; an Equip of [1][fury] still owes its [1] Energy. And the NON-Power parts are never reduced: the Blade's
 *    "kill a friendly unit" must still be paid in full.
 * Rules: 821.1.c (Weaponmaster reduces the Equip cost by [A] Power), 204.1 (a cost is paid in full otherwise).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLADE = "sfd-178-221";
const SKYFALL = "sfd-030-221";
const SENTINEL_ADEPT = "sfd-008-221"; // [3], 3 Might, [Weaponmaster]

/** P1's turn. The Blade sits unattached in play; a 2-Might Chaff is the intended sacrifice. */
function bladeBoard(energy: number, power: Record<string, number> = {}) {
  return scenario()
    .battlefield("bf1", { controller: null })
    .gear(P1, BLADE, "blade")
    .unit(P1, "base", { might: 2, name: "Chaff" }, "chaff")
    .hand(P1, SENTINEL_ADEPT, "adept")
    .resources(P1, { energy, power });
}

/** Play the Weaponmaster with an EMPTY Power pool; his trigger is asking which Equipment to attach. */
async function weaponmasterPrompt(): Promise<Game> {
  const game = await bladeBoard(3).build();
  await game.p1.play("adept", { to: "base" });
  expect(game.p1.energy()).toBe(0);
  expect(game.p1.power("order")).toBe(0);
  return game;
}

describe("Ruling e9e3ac94680f00c3 — Weaponmaster pays the Equip cost minus [rainbow], and never reduces the non-Power parts", () => {
  test("premise: without Weaponmaster the Blade's Equip needs the [order] — with an empty pool it is not offered", async () => {
    // two units, so a unit remains to attach to after the kill
    const twoUnits = (power: Record<string, number>) =>
      scenario()
        .battlefield("bf1", { controller: null })
        .gear(P1, BLADE, "blade")
        .unit(P1, "base", { might: 2, name: "Chaff" }, "chaff")
        .unit(P1, "base", { might: 4, name: "Hero" }, "hero")
        .resources(P1, { energy: 0, power })
        .build();
    const empty = await twoUnits({});
    expect(empty.p1.legal().map((o) => o.key)).not.toContain("equipCard:-");
    const paid = await twoUnits({ order: 1 });
    const opt = paid.p1.legal().find((o) => o.key === "equipCard:-");
    expect(opt).toBeDefined();
    expect(opt?.fields.find((f) => f.name === "sacrificeId")?.options).toBeDefined(); // the kill is part of that cost
  });

  test("through Weaponmaster the single [order] pip is fully covered by the [rainbow] reduction: offered on an empty pool", async () => {
    const game = await weaponmasterPrompt();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d.prompt).toContain("Weaponmaster");
    expect(d.options.map((o) => o.key)).toEqual(["blade"]);
  });

  test("…but the 'kill a friendly unit' half is still paid in full", async () => {
    const game = await weaponmasterPrompt();
    await game.p1.pick("blade");
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("chaff");
    }
    await game.settle();
    expect(game.state("blade").attachedTo).toBe("adept");
    expect(game.zoneOf("chaff")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("order")).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("an Equip of [1][fury]: the [fury] is waived, the [1] Energy is not — with nothing left over it is not offered", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .gear(P1, SKYFALL, "skyfall")
      .hand(P1, SENTINEL_ADEPT, "adept")
      .resources(P1, { energy: 3 }) // exactly the Adept's cost — nothing left for the remaining [1]
      .build();
    await game.p1.play("adept", { to: "base" });
    const d = game.decision() as PickDecision;
    expect(d.prompt).toContain("Weaponmaster");
    expect(d.options).toEqual([]);
    expect(game.state("skyfall").attachedTo).toBeUndefined();
  });

  test("…and with one spare Energy it IS offered, charging exactly that [1] (no [fury] needed)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .gear(P1, SKYFALL, "skyfall")
      .hand(P1, SENTINEL_ADEPT, "adept")
      .resources(P1, { energy: 4 })
      .build();
    await game.p1.play("adept", { to: "base" });
    expect(game.p1.energy()).toBe(1);
    expect((game.decision() as PickDecision).options.map((o) => o.key)).toEqual(["skyfall"]);
    await game.p1.pick("skyfall");
    await game.settle();
    expect(game.state("skyfall").attachedTo).toBe("adept");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("fury")).toBe(0);
  });
});
