/**
 * Ruling 6b1d43f1b5e3b4a9 — Ferrous Forerunner (SFD-021 → sfd-021-221) · 6 Might · "[Deathknell] — Play two 3 [Might] Mech unit
 *     tokens to your base."
 *   × Possession (OGN-203 → ogn-203-298) "Choose an enemy unit at a battlefield. Take control of it and recall it."
 *   × Cull the Weak (OGN-209 → ogn-209-298) "Each player kills one of their units."
 *   (Hostile Takeover sfd-202-221 / Cull sfd-134-221 are cited as equivalent steal / kill routes.)
 *
 * Q: I steal the opponent's Ferrous Forerunner and then kill it — do I get the Deathknell before it goes to THEIR trash?
 * A: Yes. Deathknell captures the unit's information right before it dies, including its controller at that moment: the
 *    player controlling it when it died gets the two 3-Might Mechs, even though the card goes to its owner's trash.
 * Rules: 808 (Deathknell), 370.1.a (look-back information of a card leaving the board), 108 (owner vs controller), 425 (to owner's trash).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FERROUS_FORERUNNER = "sfd-021-221";
const POSSESSION = "ogn-203-298";
const CULL_THE_WEAK = "ogn-209-298";

/** P1's turn: Possession ([8]+3 chaos) + Cull the Weak ([2]+order), exactly that much. P2 owns Forerunner at bf1 and a Pawn (1) in base. P1 has no units. */
function board() {
  return scenario()
    .resources(P1, { energy: 10, power: { chaos: 3, order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", FERROUS_FORERUNNER, "forerunner")
    .unit(P2, "base", { might: 1, name: "Pawn" }, "pawn")
    .hand(P1, POSSESSION, "possession")
    .hand(P1, CULL_THE_WEAK, "cull");
}

const mechs = (game: Game) => game.findAll({ name: "Mech" }).filter((id) => game.zoneOf(id) !== "gone");

async function steal(game: Game): Promise<void> {
  await game.p1.cast("possession", { targets: "forerunner" });
  await game.settle();
  expect(game.state("forerunner")).toMatchObject({ controller: P1, location: "base", owner: P2 });
  expect(game.p1.units()).toEqual(["forerunner"]);
}

async function cull(game: Game): Promise<void> {
  await game.p1.cast("cull", { targets: "forerunner" });
  for (let i = 0; i < 10; i++) {
    await game.settle();
    const d = game.decision();
    if (!d || d.kind === "action") {
      break;
    }
    if (d.kind === "pick") {
      await game.seat(d.seat).pick(d.options[0]?.key as string);
    } else {
      break;
    }
  }
}

describe("Ruling 6b1d43f1b5e3b4a9 — a stolen Ferrous Forerunner's Deathknell pays out to whoever controlled it when it died", () => {
  test("Possession: P1 takes control of P2's Forerunner and recalls it to P1's base (still OWNED by P2)", async () => {
    const game = await board().build();
    await steal(game);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0, order: 1 } });
  });

  test("Cull the Weak then kills it as P1's unit: the card goes to its OWNER's (P2's) trash …", async () => {
    const game = await board().build();
    await steal(game);
    await cull(game);
    expect(game.zoneOf("forerunner")).toBe("trash");
    expect(game.p2.trash()).toContain("forerunner");
    expect(game.p1.trash()).not.toContain("forerunner");
    expect(game.zoneOf("pawn")).toBe("trash"); // P2's own cull
  });

  test("… but the Deathknell resolves for P1 (controller at death): the two 3-Might Mech tokens are played to P1's base, none to P2's", async () => {
    const game = await board().build();
    await steal(game);
    expect(mechs(game)).toEqual([]);
    await cull(game);
    const tokens = mechs(game);
    expect(tokens).toHaveLength(2);
    for (const t of tokens) {
      expect(game.state(t)).toMatchObject({ controller: P1, isToken: true, location: "base", might: 3 });
    }
    expect(game.p1.units("base").sort()).toEqual([...tokens].sort());
    expect(game.p2.units()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control: if P2's own Forerunner dies un-stolen, P2 gets the Mechs", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "base", FERROUS_FORERUNNER, "forerunner")
      .unit(P1, "base", { might: 1, name: "Pawn" }, "pawn")
      .hand(P1, CULL_THE_WEAK, "cull")
      .build();
    await game.p1.cast("cull", { targets: "pawn" });
    for (let i = 0; i < 10; i++) {
      await game.settle();
      const d = game.decision();
      if (!d || d.kind === "action") {
        break;
      }
      if (d.kind === "pick") {
        await game.seat(d.seat).pick(d.options[0]?.key as string);
      }
    }
    expect(game.zoneOf("forerunner")).toBe("trash");
    const tokens = mechs(game);
    expect(tokens).toHaveLength(2);
    for (const t of tokens) {
      expect(game.state(t).controller).toBe(P2);
    }
  });
});
