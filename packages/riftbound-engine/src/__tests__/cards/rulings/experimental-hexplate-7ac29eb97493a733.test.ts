/**
 * Ruling 7ac29eb97493a733 — Experimental Hexplate (SFD-073 → sfd-073-221) · Equipment · Mind · [1] · +1 Might
 *     "[Equip] [mind] — I am a Mech."
 *   × Rumble, Hotheaded (SFD-026 → sfd-026-221) "Your Mechs each have [Assault]. …"
 *   (Mech readers used as probes: Production Surge sfd-076-221 "This costs [2] less if you control a Mech";
 *    Breakneck Mech sfd-071-221 "I enter ready if you control another Mech".)
 *
 * Q: Does Experimental Hexplate count as a Mech while unequipped in base, or only when attached to a unit?
 * A: Only while attached. "I am a Mech" is Equipment effect text and applies only while the Equipment is
 *    attached; a loose Hexplate in base is not a Mech for anything.
 * Rules: 136.2 (Equipment effect text is active only while attached), 135.2 (tags).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXPLATE = "sfd-073-221";
const RUMBLE = "sfd-026-221";
const PRODUCTION_SURGE = "sfd-076-221"; // 4 + [mind]: "This costs [2] less if you control a Mech. Play a 3 [Might] Mech token. Draw 1."
const BREAKNECK_MECH = "sfd-071-221"; // 8 + [mind][mind], 7 Might Mech: "… I enter ready if you control another Mech."

const hasAssault = (game: Game, id: string) =>
  game.state(id).keywords.includes("Assault") || game.state(id).grantedKeywords.some((k) => k.keyword === "Assault");

/** Attach the loose Hexplate to `unit` (pays [mind]) and let the Equip item resolve. */
async function equip(game: Game, unit: string): Promise<void> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: "hex", unitId: unit } });
  await game.p1.pass();
  await game.p2.pass();
  expect(game.state("hex").attachedTo).toBe(unit);
}

describe("Ruling 7ac29eb97493a733 — a loose Hexplate is not a Mech; an attached one is", () => {
  test("UNEQUIPPED in base next to Rumble: nothing on P1's side reads as a Mech besides Rumble himself — the plate carries no Assault grant and neither does the vanilla Squire", async () => {
    const game = await scenario()
      .unit(P1, "base", RUMBLE, "rumble")
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .gear(P1, HEXPLATE, "hex")
      .build();
    expect(game.state("hex")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(hasAssault(game, "rumble")).toBe(true); // printed Mech
    expect(hasAssault(game, "hex")).toBe(false);
    expect(hasAssault(game, "squire")).toBe(false);
  });

  test("UNEQUIPPED: 'if you control a Mech' is FALSE — Production Surge is not discounted (needs the full [4]+[mind]; [2]+[mind] won't do)", async () => {
    const cheap = await scenario().resources(P1, { energy: 2, power: { mind: 1 } }).gear(P1, HEXPLATE, "hex").hand(P1, PRODUCTION_SURGE, "surge").build();
    expect(cheap.p1.can("cast", "surge")).toBe(false);
    const full = await scenario().resources(P1, { energy: 4, power: { mind: 1 } }).gear(P1, HEXPLATE, "hex").hand(P1, PRODUCTION_SURGE, "surge").build();
    expect(full.p1.can("cast", "surge")).toBe(true);
    // sanity: a real Mech on board DOES discount it to [2]
    const real = await scenario().resources(P1, { energy: 2, power: { mind: 1 } }).unit(P1, "base", BREAKNECK_MECH, "bm").hand(P1, PRODUCTION_SURGE, "surge").build();
    expect(real.p1.can("cast", "surge")).toBe(true);
  });

  test("UNEQUIPPED: Breakneck Mech played with only a loose Hexplate around does NOT 'control another Mech' → enters exhausted", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { mind: 2 } })
      .gear(P1, HEXPLATE, "hex")
      .hand(P1, BREAKNECK_MECH, "bm")
      .build();
    await game.p1.play("bm");
    await game.settle();
    expect(game.zoneOf("bm")).toBe("base");
    expect(game.state("bm").isExhausted).toBe(true);
  });

  test("ATTACHED to the Squire: now there IS a Mech — Rumble's 'Your Mechs each have [Assault]' reaches the plated Squire (3 Might with the +1)", async () => {
    const game = await scenario()
      .resources(P1, { power: { mind: 1 } })
      .unit(P1, "base", RUMBLE, "rumble")
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .gear(P1, HEXPLATE, "hex")
      .build();
    expect(hasAssault(game, "squire")).toBe(false);
    await equip(game, "squire");
    expect(game.state("squire")).toMatchObject({ attachments: ["hex"], might: 3 });
    expect(hasAssault(game, "squire")).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  // Expected: with the plate attached P1 controls a Mech, so Production Surge costs [2] less and is castable at
  // [2]+[mind]. Actual: the cost-reduction condition does not see the equipment-conferred Mech (only printed Mechs).
  test("ruling 7ac29eb97493a733 — attached Hexplate should satisfy Production Surge's 'if you control a Mech' discount", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { mind: 2 } })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .gear(P1, HEXPLATE, "hex")
      .hand(P1, PRODUCTION_SURGE, "surge")
      .build();
    await equip(game, "squire");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 1 } });
    expect(game.p1.can("cast", "surge")).toBe(true);
  });

  // Expected: the plated Squire is "another Mech", so Breakneck Mech enters READY. Actual: enters exhausted.
  test("ruling 7ac29eb97493a733 — attached Hexplate should count as 'another Mech' for Breakneck Mech's enter-ready", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { mind: 3 } })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .gear(P1, HEXPLATE, "hex")
      .hand(P1, BREAKNECK_MECH, "bm")
      .build();
    await equip(game, "squire");
    await game.p1.play("bm");
    await game.settle();
    expect(game.zoneOf("bm")).toBe("base");
    expect(game.state("bm").isReady).toBe(true);
  });
});
