/**
 * Ruling bb323016c585be59 — Retreat (OGN-104 → ogn-104-298) × Hidden Blade (OGN-213 → ogn-213-298)
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) × Flash (OGS-011 → ogs-011-024)
 *   Retreat ([1], Reaction): "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *   Hidden Blade ([2][order], Hidden/Action): "Kill a unit at a battlefield. Its controller draws 2."
 *   Zhonya's: "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   Flash (Reaction): "Move up to 2 friendly units to base."
 *
 * Q: If I Retreat the unit my opponent's Hidden Blade targets, does its controller still draw 2?
 * A: No. Targets are re-checked on resolution; a retreated unit is no longer "a unit at a battlefield", so the whole
 *    instruction — including "its controller draws 2", which depends on that unit — is ignored (the spell still resolves).
 *    Nuances: if the unit instead DIES-but-is-saved (Zhonya's) the draw still happens (it was a legal target when Hidden Blade
 *    resolved); moving it to base (Flash) makes it illegal like Retreat does → no draw.
 * Rules: 355.12 / 359.3.f, 359.3.f.2.a (dependent instruction with a null referent is ignored), 370–373 (Zhonya's replacement).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RETREAT = "ogn-104-298";
const HIDDEN_BLADE = "ogn-213-298";
const ZHONYAS = "ogn-077-298";
const FLASH = "ogs-011-024";

/** P1's turn with exactly [2][order]; P2 holds bf1 with a 3-Might Victim. Extra P2 cards per case. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
    .hand(P1, HIDDEN_BLADE, "blade");
}

/** P1 casts Hidden Blade on the Victim and passes; returns P2's hand size at that point (the draw baseline). */
async function bladeOnVictim(game: Game): Promise<number> {
  await game.p1.cast("blade", { targets: "victim" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, targets: ["victim"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game.p2.hand().length;
}

describe("Ruling bb323016c585be59 — Retreating Hidden Blade's target: no kill and NO 'its controller draws 2'", () => {
  test("P2 Retreats the Victim in response: Retreat resolves first (Victim → P2's hand, P2 channels 1 rune exhausted); Hidden Blade then finds no legal target — P2 draws nothing, yet the spell still resolves to the trash", async () => {
    const game = await board().resources(P2, { energy: 1 }).hand(P2, RETREAT, "retreat").build();
    const runesBefore = game.p2.runes().length;
    await bladeOnVictim(game);
    await game.p2.cast("retreat", { targets: "victim" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "retreat"]);
    await game.acting().passPriority();
    await game.acting().passPriority(); // Retreat
    expect(game.zoneOf("victim")).toBe("hand");
    expect(game.p2.runes()).toHaveLength(runesBefore + 1);
    expect(game.p2.runes({ ready: false })).toHaveLength(1); // channeled exhausted
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
    const handWithVictim = game.p2.hand();
    expect(handWithVictim).toEqual(["victim"]);
    await game.acting().passPriority();
    await game.acting().passPriority(); // Hidden Blade
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash"); // it did resolve
    expect(game.zoneOf("victim")).toBe("hand"); // not killed
    expect(game.p2.hand()).toEqual(["victim"]); // and NO two cards drawn
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control — no response: the Victim at bf1 is killed and its controller (P2) draws 2", async () => {
    const game = await board().build();
    const handBefore = await bladeOnVictim(game);
    await game.p2.passPriority();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(handBefore + 2);
  });

  test("nuance — the Victim 'dies' but Zhonya's Hourglass saves it (killed instead; Victim healed, exhausted, recalled): it WAS a legal target at a battlefield when Hidden Blade resolved, so P2 still draws 2", async () => {
    const game = await board().gear(P2, ZHONYAS, "zhonyas").build();
    const handBefore = await bladeOnVictim(game);
    await game.p2.passPriority();
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim")).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
    expect(game.p2.hand()).toHaveLength(handBefore + 2);
    expect(game.violations()).toEqual([]);
  });

  test("nuance — moving the Victim to base instead (Flash) also leaves 'a unit at a battlefield' unmet: it survives in base and P2 draws nothing", async () => {
    const game = await board().resources(P2, { energy: 2 }).hand(P2, FLASH, "flash").build();
    await bladeOnVictim(game);
    await game.p2.cast("flash", { targets: ["victim"] });
    const handAfterFlash = game.p2.hand().length;
    await game.settle();
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(handAfterFlash);
    expect(game.violations()).toEqual([]);
  });
});
