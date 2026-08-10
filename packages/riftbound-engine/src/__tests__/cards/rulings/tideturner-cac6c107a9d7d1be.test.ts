/**
 * Ruling cac6c107a9d7d1be — Tideturner (OGN-199 → ogn-199-298) · Unit · Chaos · 2 · 2 Might
 *     "[Hidden] When you play me, you may choose a unit you control at another location. Move me to its location and it
 *      to my original location."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · "[Hidden] If a friendly unit would die, kill this instead. Heal
 *     that unit, exhaust it, and recall it."
 *
 * Q: Can I flip a Tideturner hidden at battlefield B to switch it with something at battlefield A while A is attacked?
 * A: Yes — Tideturner's ability works across battlefields. Likewise a Zhonya's hidden at A can be flipped to save a unit
 *    at B (when flipped, the Hourglass is recalled to your base).
 * Rules: 811 (a hidden card gains [Reaction] and is played from its battlefield), 811.1.d.2 (Tideturner's "another
 *        location" target is chosen freely), 811.1.d.1 + 518 (hidden gear enters there, then is recalled to base),
 *        464.2.c.3.a (a unit arriving mid-combat becomes a defender), 372 (replacement effects).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIDETURNER = "ogn-199-298";
const ZHONYAS = "ogn-077-298";

/** P2's turn 3. P1 holds bfA (Anchor 3) and bfB (Bee 2). P2's Raider waits in base. `hidden` is facedown for P1 at `at`. */
function board(hidden: string, alias: string, at: "bfA" | "bfB", raiderMight: number) {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P1 })
    .unit(P1, "bfA", { might: 3, name: "Anchor" }, "anchor")
    .unit(P1, "bfB", { might: 2, name: "Bee" }, "bee")
    .facedown(P1, at, hidden, alias)
    .unit(P2, "base", { might: raiderMight, name: "Raider" }, "raider");
}

async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling cac6c107a9d7d1be — hidden Tideturner / Zhonya's work across battlefields", () => {
  test("Raider attacks bfA; with Focus, P1 flips the Tideturner hidden at bfB — it is played AT bfB and offers the swap with Anchor (at bfA, 'another location')", async () => {
    const game = await board(TIDETURNER, "tt", "bfB", 4).build();
    await game.p2.move("raider", "bfA");
    expect(game.state("anchor").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "tt")).toBe(true); // legal although the showdown is at the OTHER battlefield
    await game.p1.reveal("tt");
    expect(game.locationOf("tt")).toBe("bfB");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "tt" } });
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
      await game.p1.pick("anchor");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tt", targets: ["anchor"], triggered: true })]);
  });

  test("the swap resolves across battlefields mid-combat: Tideturner → bfA (now the defender there), Anchor → bfB; the combat at bfA then resolves against Tideturner (2 < 4: it dies, P2 conquers A) while Anchor is safe at B", async () => {
    const game = await board(TIDETURNER, "tt", "bfB", 4).build();
    await game.p2.move("raider", "bfA");
    await game.p2.passFocus();
    await game.p1.reveal("tt");
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("anchor");
    }
    await resolveChain(game);
    expect(game.locationOf("tt")).toBe("bfA");
    expect(game.locationOf("anchor")).toBe("bfB");
    expect(game.state("tt").combatRole).toBe("defender");
    expect(game.state("anchor").combatRole).toBeNull();
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, controller: P1 });
    await game.settle(); // both pass focus → combat: Raider 4 vs Tideturner 2
    expect(game.zoneOf("tt")).toBe("trash");
    expect(game.zoneOf("anchor")).toBe("battlefield-bfB");
    expect(game.zoneOf("bee")).toBe("battlefield-bfB");
    expect(game.gameState.battlefields.bfA?.controller).toBe(P2);
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("similarly Zhonya's: hidden at bfA, flipped while bfB is attacked — it is recalled to P1's base on being played, and then saves the Bee dying at bfB (Hourglass killed instead; Bee healed, exhausted, recalled)", async () => {
    const game = await board(ZHONYAS, "zh", "bfA", 5).build();
    await game.p2.move("raider", "bfB");
    expect(game.state("bee").combatRole).toBe("defender");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "zh")).toBe(true);
    await game.p1.reveal("zh");
    await resolveChain(game);
    expect(game.zoneOf("zh")).toBe("base"); // flipped at A → recalled to base
    expect(game.p1.gear()).toContain("zh");
    await game.settle(); // combat at B: Raider 5 vs Bee 2 → Bee would die
    expect(game.zoneOf("zh")).toBe("trash"); // killed instead
    expect(game.zoneOf("bee")).toBe("base"); // recalled, not dead
    expect(game.state("bee")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("anchor")).toBe("battlefield-bfA");
    expect(game.gameState.battlefields.bfB?.controller).toBe(P2); // B fell — but the unit lived
    expect(game.violations()).toEqual([]);
  });
});
