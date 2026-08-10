/**
 * Ruling 365759e6b0393f5f — Vilemaw's Lair (OGN-295 → ogn-295-298) · Battlefield · "Units can't move from here to base."
 *   × Azir, Ascendant (SFD-050 → sfd-050-221) · Unit · Calm · 6 · 6 Might
 *     "[calm]: [Action] — Choose a unit you control. Move me to its location and it to my original location. … Use only
 *      once per turn."
 *   (The scrape keys this under Vilemaw unl-060-219; the question is about Vilemaw's LAIR.)
 *
 * Q: With green Azir and Vilemaw's Lair, if I use Azir's swap does Azir stay at the Lair and does the other unit still
 *    move into the Lair?
 * A: Yes — both end up at the Lair. The activation is legal; whichever half of the swap would move a unit from the Lair
 *    to base simply fails ("can't move from here to base"), the other half happens. Azir at the Lair + target in base:
 *    Azir stays, target moves in. Azir in base + target at the Lair: Azir moves in, target stays.
 * Rules: 356.3.e.11 / 359.3.e.6 (do as much as you can; impossible part ignored), 105 (can't beats can), 446 (move).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VILEMAWS_LAIR = "ogn-295-298";
const AZIR = "sfd-050-221";

/** P1's turn, exactly one [calm]. Vilemaw's Lair (live) is P1's with an Anchor on it; Azir and Pal placed per case. */
function board(azirAt: "lair" | "base", palAt: "lair" | "base") {
  return scenario()
    .resources(P1, { power: { calm: 1 } })
    .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: false })
    .unit(P1, "lair", { might: 2, name: "Anchor" }, "anchor")
    .unit(P1, azirAt, AZIR, "azir")
    .unit(P1, palAt, { might: 3, name: "Pal" }, "pal");
}

/** Activate Azir, let the ability resolve, choosing Pal whenever a choice is surfaced. */
async function swapWithPal(game: Game): Promise<void> {
  expect(game.p1.can("activate", "azir")).toBe(true);
  const calmBefore = game.p1.power("calm");
  await game.p1.activate("azir");
  expect(game.p1.power("calm")).toBe(calmBefore - 1); // [calm] paid
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "azir", controller: P1, type: "ability" })]);
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key)).toContain("pal");
      await game.p1.pick("pal");
    } else if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.chain()).toEqual([]);
}

describe("Ruling 365759e6b0393f5f — Azir's swap across Vilemaw's Lair: the to-base half fails, both units end at the Lair", () => {
  test("Azir AT the Lair, Pal in base: activation is legal; Azir cannot leave the Lair for base so he STAYS, while Pal moves base → Lair", async () => {
    const game = await board("lair", "base").build();
    expect(game.state("azir").keywords).toContain("NoMoveToBase");
    await swapWithPal(game);
    expect(game.zoneOf("azir")).toBe("battlefield-lair");
    expect(game.zoneOf("pal")).toBe("battlefield-lair");
    expect(game.p1.units("lair").sort()).toEqual(["anchor", "azir", "pal"]);
    expect(game.p1.units("base")).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("Azir in BASE, Pal at the Lair: Azir moves base → Lair, but Pal cannot go Lair → base and STAYS — again both at the Lair", async () => {
    const game = await board("base", "lair").build();
    expect(game.state("pal").keywords).toContain("NoMoveToBase");
    await swapWithPal(game);
    expect(game.zoneOf("azir")).toBe("battlefield-lair");
    expect(game.zoneOf("pal")).toBe("battlefield-lair");
    expect(game.p1.units("base")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control: away from the Lair the swap is a full exchange (Azir base → bf, Pal bf → base)", async () => {
    const game = await scenario()
      .resources(P1, { power: { calm: 1 } })
      .battlefield("plain", { controller: P1 })
      .unit(P1, "plain", { might: 2, name: "Anchor" }, "anchor")
      .unit(P1, "base", AZIR, "azir")
      .unit(P1, "plain", { might: 3, name: "Pal" }, "pal")
      .build();
    await swapWithPal(game);
    expect(game.zoneOf("azir")).toBe("battlefield-plain");
    expect(game.zoneOf("pal")).toBe("base");
  });

  test("'Use only once per turn': after the swap the ability is no longer offered this turn even with another [calm]", async () => {
    const game = await board("base", "lair").resources(P1, { power: { calm: 2 } }).build();
    await swapWithPal(game);
    expect(game.p1.power("calm")).toBe(1);
    expect(game.p1.can("activate", "azir")).toBe(false);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.seat(P2).legal()).toEqual([]);
  });
});
