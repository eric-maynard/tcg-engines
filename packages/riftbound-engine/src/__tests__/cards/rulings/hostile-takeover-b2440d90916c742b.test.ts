/**
 * Ruling b2440d90916c742b — Hostile Takeover (SFD-202 → sfd-202-221) · Spell · 5+[rainbow][rainbow] · [Hidden]
 *     "Take control of an enemy unit at a battlefield. Ready it. … Lose control of that unit and recall it at end of turn."
 *   × Grandmaster at Arms (SFD-193 → sfd-193-221, Jax legend) "[Exhaust]: Attach an attached Equipment you control to a
 *     unit you control."   (+ Long Sword sfd-022-221 · Equipment +2 · "[Equip] [fury]" as the attached gear)
 *
 * Q: My unit is possessed by Hostile Takeover and has Equipment attached — can I re-attach that Equipment elsewhere?
 * A: Not with the gear's own [Equip] (attached gear's text is inactive), but yes with external effects that move
 *    Equipment (Weaponmaster, Jax's legend). You still control the Equipment even though the unit is possessed.
 * Rules: 718.2 / 720 (attached → printed text inactive), 826 (Equip), 716–719 (attach), 108.2 (control).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HOSTILE_TAKEOVER = "sfd-202-221";
const GRANDMASTER_AT_ARMS = "sfd-193-221";
const LONG_SWORD = "sfd-022-221";

/**
 * P1's turn 3, Jax legend. P1's Knight (3, wearing Long Sword → 5) and Squire (2) in base; a spare [fury] so the Sword's
 * Equip cost is affordable. P2 holds bf2 with a Guard and has Hostile Takeover facedown there (hidden earlier).
 */
function board() {
  return scenario()
    .turn(3)
    .legend(P1, GRANDMASTER_AT_ARMS, "jax")
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Guard" }, "guard")
    .facedown(P2, "bf2", HOSTILE_TAKEOVER, "ht")
    .unit(P1, "base", { might: 3, name: "Knight" }, "knight", { equippedWith: ["sword"] })
    .card("sword", { def: LONG_SWORD, meta: { attachedTo: "knight" }, owner: P1, zone: "base" })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire");
}

/** Knight attacks bf2; P2 flips Hostile Takeover on it; everything resolves → P1's open main phase with a possessed Knight. */
async function possessed(): Promise<Game> {
  const game = await board().build();
  expect(game.state("knight")).toMatchObject({ attachments: ["sword"], controller: P1, might: 5 });
  await game.p1.move("knight", "bf2");
  await game.p1.passFocus();
  expect(game.p2.can("reveal", "ht")).toBe(true);
  await game.p2.reveal("ht", { answers: ["knight"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ht", controller: P2 })]);
  await game.settle();
  expect(game.zoneOf("ht")).toBe("trash");
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

const equipLines = (game: Game) =>
  game.p1
    .legal()
    .filter((o) => o.moveId === "equipCard")
    .flatMap((o) => o.variants.map((v) => v.params as { equipmentId?: string }))
    .filter((p) => p.equipmentId === "sword");

describe("Ruling b2440d90916c742b — a possessed unit's Equipment: no self-Equip hop, but Jax's legend can move it", () => {
  test("premise: Hostile Takeover resolves — P2 now CONTROLS the Knight (still owned by P1, still wearing the Sword), while the Sword itself is still controlled by P1", async () => {
    const game = await possessed();
    expect(game.state("knight")).toMatchObject({ attachments: ["sword"], controller: P2, owner: P1 });
    expect(game.p2.units()).toContain("knight");
    expect(game.p1.units()).not.toContain("knight");
    expect(game.state("sword")).toMatchObject({ attachedTo: "knight", controller: P1, owner: P1 });
  });

  test("the Sword's own [Equip] [fury] cannot be used to re-attach it (attached gear's text is inactive): no equip line is offered even with [fury] ready, and forcing it is rejected", async () => {
    const game = await possessed();
    expect(game.p1.power("fury")).toBe(1);
    expect(equipLines(game)).toEqual([]);
    const r = await game.p1.try((p) => p.do("equipCard", { equipmentId: "sword", unitId: "squire" }));
    expect(r.ok).toBe(false);
    expect(game.state("sword").attachedTo).toBe("knight");
    expect(game.p1.power("fury")).toBe(1);
  });

  test("an external effect works: Jax legend #1 ([Exhaust]: attach an attached Equipment you control to a unit you control) moves the Sword from the possessed Knight onto the Squire (2 → 4); the Knight drops to 3", async () => {
    const game = await possessed();
    expect(game.p1.can("activateAbility:jax#1")).toBe(true);
    await game.p1.activate("jax", 1);
    for (let i = 0; i < 8; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || d?.kind !== "pick") {
        break;
      }
      expect(d.seat).toBe(P1);
      const hit = d.options.find((o) => (o.card ?? o.key) === "sword") ?? d.options.find((o) => (o.card ?? o.key) === "squire");
      expect(hit).toBeDefined();
      // The possessed Knight is not "a unit you control" — never offered as the destination.
      expect(d.options.map((o) => o.card ?? o.key)).not.toContain("knight");
      await game.p1.pick((hit as { key: string }).key);
    }
    expect(game.state("jax").isExhausted).toBe(true);
    expect(game.state("sword")).toMatchObject({ attachedTo: "squire", controller: P1 });
    expect(game.state("squire")).toMatchObject({ attachments: ["sword"], might: 4 });
    expect(game.state("knight")).toMatchObject({ attachments: [], controller: P2, might: 3 });
    expect(game.violations()).toEqual([]);
  });
});
