/**
 * Ruling fea15a0a3b0e530f — Hidden Blade (OGN-213 → ogn-213-298) · [Hidden][Action] · [2][order]
 *     "Kill a unit at a battlefield. Its controller draws 2."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Void Seeker (OGN-024 → ogn-024-298) · Action [3][fury] "Deal 4 to a unit at a battlefield. Draw 1."   (+ Flash ogs-011-024 as the response)
 *
 * Q: Does Hidden Blade's controller-of-the-target still draw 2 if the target becomes invalid before it resolves?
 * A: Only if the target is still legal when Hidden Blade resolves — "its controller" needs a valid target. Moved to base / gone ⇒
 *    no kill, no draw. If the death is merely REPLACED (Zhonya's), the target was legal ⇒ they still draw 2. Contrast Void
 *    Seeker: its "Draw 1" is the caster's and independent of the target, so it draws even when the target went illegal.
 * Rules: 359.3.e.2/359.3.e.5 (illegal target → that instruction and dependants not performed), 359.3.e.14 ("its controller"),
 *        366–373 (replacement keeps the event's target legal), 811 (from hidden: "here").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const ZHONYAS = "ogn-077-298";
const VOID_SEEKER = "ogn-024-298";
const FLASH = "ogs-011-024";

/** P1's turn. P2 holds bf1 with Mark (3) + Extra (2), Flash in hand + [2], deck d1.. P1: Hidden Blade + Void Seeker, [5] + order + fury. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { fury: 1, order: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Mark" }, "mark")
    .unit(P2, "bf1", { might: 2, name: "Extra" }, "extra")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P1, VOID_SEEKER, "vs")
    .hand(P2, FLASH, "flash")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["p1d1", "p1d2"])
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** P1 casts `spell` at Mark; P2 Flashes Mark to base in response; Flash resolves; the spell is left alone on the chain. */
async function flashMarkInResponseTo(spell: "blade" | "vs"): Promise<Game> {
  const game = await board().build();
  await game.p1.cast(spell, { targets: "mark" });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.cast("flash", { targets: ["mark"] });
  await game.p2.passPriority();
  await game.p1.passPriority(); // Flash resolves (LIFO)
  expect(game.locationOf("mark")).toBe("base");
  expect(game.chain().map((c) => c.cardId)).toEqual([spell]);
  return game;
}

describe("Ruling fea15a0a3b0e530f — Hidden Blade's 'its controller draws 2' needs a legal target at resolution", () => {
  test("target moved to base in response (Flash): Hidden Blade resolves with an illegal target — Mark lives, and P2 draws NOTHING", async () => {
    const game = await flashMarkInResponseTo("blade");
    await game.settle();
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("mark")).toBe("base");
    expect(game.p2.hand()).toEqual([]); // Flash spent, no d1/d2
    expect(game.p2.deck()[0]).toBe("d1");
    expect(game.p1.hand()).toEqual(["vs"]);
    expect(game.violations()).toEqual([]);
  });

  test("control — untouched, Hidden Blade kills Mark and ITS CONTROLLER (P2) draws 2", async () => {
    const game = await board().build();
    await game.p1.cast("blade", { targets: "mark" });
    await game.settle();
    expect(game.zoneOf("mark")).toBe("trash");
    expect(game.p2.hand().sort()).toEqual(["d1", "d2", "flash"]);
    expect(game.p1.hand()).toEqual(["vs"]);
  });

  test("nuance — death REPLACED by Zhonya's: Mark was a legal target when Hidden Blade resolved, so P2 still draws 2 (Zhonya's killed instead; Mark healed, exhausted, recalled)", async () => {
    const game = await board().gear(P2, ZHONYAS, "zhonya").build();
    await game.p1.cast("blade", { targets: "mark" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.zoneOf("mark")).toBe("base");
    expect(game.state("mark")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p2.hand().sort()).toEqual(["d1", "d2", "flash"]);
  });

  test("nuance — from hidden the target must still be HERE: Mark Flashed off bf1 makes the flipped Hidden Blade do nothing (no kill, no draw)", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4, name: "Sentinel" }, "sentinel")
      .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
      .unit(P2, "base", { might: 3, name: "Mark" }, "mark")
      .hand(P2, FLASH, "flash")
      .deck(P2, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"])
      .active(P2)
      .build();
    await game.p2.move("mark", "bf1"); // attack → showdown, P2 has Focus
    await game.p2.passFocus();
    expect(game.p1.can("reveal", "blade")).toBe(true);
    await game.p1.reveal("blade", { answers: ["mark"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, targets: ["mark"] })]);
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["mark"] });
    await game.settle();
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("mark")).toBe("base");
    expect(game.p2.hand()).toEqual([]); // no draw for the would-be victim's controller
    expect(game.p2.deck()[0]).toBe("d1");
  });

  test("contrast — Void Seeker's 'Draw 1' does not reference the target: Mark Flashed to base takes no damage, yet P1 (the caster) still draws 1", async () => {
    const game = await flashMarkInResponseTo("vs");
    await game.settle();
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.state("mark")).toMatchObject({ damage: 0, location: "base" });
    expect(game.p1.hand().sort()).toEqual(["blade", "p1d1"]);
    expect(game.p2.hand()).toEqual([]);
  });
});
