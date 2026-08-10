/**
 * Ruling 9cd002dc90669c2d — Possession (OGN-203 → ogn-203-298) · Spell · Chaos · [8][chaos]×3 · Action
 *     "Choose an enemy unit at a battlefield. Take control of it and recall it."
 *   × Portal Rescue (OGN-102 → ogn-102-298) · Spell · Mind · [3][mind] · Action
 *     "Banish a friendly unit, then its owner plays it to their base, ignoring its cost."
 *
 * Q: I take a unit with Possession, then Portal Rescue it. Does it come back to MY base or its owner's?
 * A: Its OWNER's base. Portal Rescue (errata) has the owner play it: banish the (controlled-but-not-owned) unit → it
 *    goes to its owner's banishment → its owner plays it to their base, ignoring its cost.
 * Rules: 127.1 (owner never changes), 108.2 / 455 (control), 426 (banish → owner's banishment), 359.3.e.6
 *        ("its owner plays it"), 350 (a played card is a new object under its player's control).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const POSSESSION = "ogn-203-298";
const PORTAL_RESCUE = "ogn-102-298";

/** P1's turn with exactly [11] + chaos×3 + mind×1. P2's Brute (5) stands at P2's bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 11, power: { chaos: 3, mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { energyCost: 5, might: 5, name: "Brute" }, "brute")
    .unit(P1, "base", { might: 1, name: "Pal" }, "pal")
    .hand(P1, POSSESSION, "possession")
    .hand(P1, PORTAL_RESCUE, "portal");
}

async function possessed(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("possession", { targets: "brute" });
  expect(game.p1.resources()).toEqual({ energy: 3, power: { chaos: 0, mind: 1 } });
  await game.settle();
  expect(game.zoneOf("possession")).toBe("trash");
  return game;
}

describe("Ruling 9cd002dc90669c2d — Portal Rescue on a Possessed unit returns it to its OWNER's base", () => {
  test("Possession: P1 controls the Brute (owner still P2) and it sits in P1's base", async () => {
    const game = await possessed();
    expect(game.state("brute")).toMatchObject({ controller: P1, location: "base", owner: P2, zone: "base" });
    expect(game.p1.units("base")).toContain("brute");
    expect(game.p2.units()).not.toContain("brute");
  });

  test("Portal Rescue may target it — it is a friendly (controlled) unit", async () => {
    const game = await possessed();
    const offered = (game.p1.option("cast", "portal")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered.toSorted()).toEqual(["brute", "pal"]);
  });

  test("resolving it: the Brute is banished and then played — by its OWNER, P2 — into P2's base for free; P1 no longer controls it and paid nothing extra", async () => {
    const game = await possessed();
    await game.p1.cast("portal", { targets: "brute" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, mind: 0 } });
    // Drive resolution; if the engine hands the "play it" step to a seat, the ruling says that seat is the OWNER (P2).
    for (let i = 0; i < 6; i++) {
      const s = await game.settle();
      if (s.reason !== "unanswered") {
        break;
      }
      const d = game.decision()!;
      expect(d.seat).toBe(P2);
      if (d.kind === "pick") {
        await game.p2.answer({ keys: [d.options[0]!.key], kind: "pick" });
      } else if (d.kind === "yes-no") {
        await game.p2.yes();
      } else {
        break;
      }
    }
    expect(game.zoneOf("portal")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("base");
    expect(game.state("brute")).toMatchObject({ controller: P2, location: "base", owner: P2 });
    expect(game.p2.units("base")).toContain("brute");
    expect(game.p1.units()).not.toContain("brute");
    expect(game.p2.banishment()).not.toContain("brute");
    expect(game.p1.banishment()).not.toContain("brute");
    expect(game.p2.energy()).toBe(0); // "ignoring its cost"
    expect(game.violations()).toEqual([]);
  });
});
