/**
 * Ruling 754ec60724a493fd — Mirror Image (UNL-200 → unl-200-219) · Spell · 3 + [rainbow][rainbow] · "Choose a unit. Play a ready
 *   Reflection unit token to your base. It becomes a copy of that unit. Give it [Temporary]."   × Reflection token (unl-t06)
 *   Empower source used: Punching Poro (ven-007-166) · 2 Might · "[Empower] — Discard 1. [Empowered][>] I have +1 [Might]."
 *
 * Q: Does Mirror Image copy the Empowered status of the chosen unit?
 * A: No. A copy takes only copyable (printed) traits — name, Might, rules text (including the printed Empower ability) — never
 *    granted/appended state such as being Empowered. The Reflection arrives un-Empowered at base Might and would have to be
 *    Empowered separately.
 * Rules: 477 (copy = copyable characteristics only; nothing granted/appended), 827 (Empower / Empowered).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const MIRROR_IMAGE = "unl-200-219";
const PUNCHING_PORO = "ven-007-166";
const FILLER = { cardType: "unit", energyCost: 1, might: 1, name: "Filler" } as const;

function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 3, power: { mind: 1, order: 1 } })
    .unit(P1, "base", PUNCHING_PORO, "poro")
    .hand(P1, FILLER, "fodder1")
    .hand(P1, FILLER, "fodder2")
    .hand(P1, MIRROR_IMAGE, "mirror");
}

/** Empower the Poro (discard fodder1) and let it resolve. */
async function empowerPoro(game: Game): Promise<void> {
  expect(game.state("poro")).toMatchObject({ isEmpowered: false, might: 2 });
  await game.p1.activate("poro", 0, { discard: "fodder1" });
  await game.settle();
  expect(game.zoneOf("fodder1")).toBe("trash");
  expect(game.state("poro")).toMatchObject({ isEmpowered: true, might: 3 });
}

/** Cast Mirror Image on the (empowered) Poro; return the Reflection's id. */
async function reflectPoro(game: Game): Promise<string> {
  const before = game.p1.base();
  await game.p1.cast("mirror", { targets: "poro" });
  await game.settle();
  expect(game.zoneOf("mirror")).toBe("trash");
  const fresh = game.p1.base().filter((id) => !before.includes(id) && game.state(id).isToken);
  expect(fresh).toHaveLength(1);
  return fresh[0] as string;
}

describe("Ruling 754ec60724a493fd — Mirror Image does not copy the Empowered status", () => {
  test("the Reflection copies the Poro's printed traits (name, 2 base Might, rules text incl. Empower) but is NOT Empowered: it sits at 2 Might while the original stays Empowered at 3", async () => {
    const game = await board().build();
    await empowerPoro(game);
    const tok = await reflectPoro(game);
    expect(game.state(tok)).toMatchObject({ controller: P1, isReady: true, isToken: true, name: "Punching Poro", zone: "base" });
    expect(game.state(tok).baseMight).toBe(2);
    expect(game.state(tok).isEmpowered).toBe(false);
    expect(game.state(tok).might).toBe(2); // no "+1 while Empowered"
    expect(game.state(tok).keywords).toContain("Temporary");
    // The original is untouched.
    expect(game.state("poro")).toMatchObject({ isEmpowered: true, might: 3 });
    expect(game.violations()).toEqual([]);
  });

  test("the copied (printed) Empower ability is there: the Reflection can be Empowered SEPARATELY afterwards (discard 1) and only then gets +1 Might", async () => {
    const game = await board().build();
    await empowerPoro(game);
    const tok = await reflectPoro(game);
    expect(game.state(tok).isEmpowered).toBe(false);
    expect(game.p1.can("activate", tok)).toBe(true);
    await game.p1.activate(tok, 0, { discard: "fodder2" });
    await game.settle();
    expect(game.zoneOf("fodder2")).toBe("trash");
    expect(game.state(tok)).toMatchObject({ isEmpowered: true, might: 3 });
    expect(game.violations()).toEqual([]);
  });
});
