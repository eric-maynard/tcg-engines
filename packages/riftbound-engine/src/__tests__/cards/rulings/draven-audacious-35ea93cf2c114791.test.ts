/**
 * Ruling 35ea93cf2c114791 — Draven, Audacious (SFD-148 → sfd-148-221) · 6 Might · "[Deflect] The first time I win a combat each
 *     turn, you score 1 point. When I die in combat, choose an opponent. They score 1 point."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Hidden · "If a friendly unit would die, kill this instead. Heal that
 *     unit, exhaust it, and recall it."
 *
 * Q: Draven takes lethal damage in combat but Zhonya's saves him — does the opponent still get his death point?
 * A: No. Zhonya's is a replacement effect ("instead"): the kill event is replaced — the Hourglass dies, Draven is healed,
 *    exhausted and recalled — so Draven never dies and "When I die in combat" never triggers. No point.
 * Rules: 366 / 366.1 / 369–372 (replacement effects replace the event entirely), 383.2 (a trigger needs its event),
 *        465.2.d (combat damage → lethal → kill attempt), 811 (Hidden gear played as a Reaction goes to base and waits).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAVEN_AUDACIOUS = "sfd-148-221";
const ZHONYAS = "ogn-077-298";

/** P1's turn. P2 holds bf1 with a 7-Might Wall (kills a lone 6-Might Draven). P1: Draven in base; Zhonya's face up in base if `withHourglass`. */
function board(withHourglass: boolean) {
  const s = scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7, name: "Wall" }, "wall")
    .unit(P1, "base", DRAVEN_AUDACIOUS, "draven");
  return withHourglass ? s.gear(P1, ZHONYAS, "hourglass") : s;
}

/** Draven attacks the Wall alone; both pass focus → combat damage (6 ↔ 7) is dealt. */
async function dravenCharges(game: Game): Promise<void> {
  await game.p1.move("draven", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  await game.p2.passFocus();
}

describe("Ruling 35ea93cf2c114791 — Zhonya's replaces Draven's combat death, so 'When I die in combat' never awards the point", () => {
  test("control (no Hourglass): Draven takes 7, dies in combat → his trigger goes on the chain and, on resolution, the chosen opponent (P2) scores 1", async () => {
    const game = await board(false).build();
    await dravenCharges(game);
    expect(game.zoneOf("draven")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "draven", controller: P1, triggered: true })]);
    expect(game.p2.points()).toBe(0);
    await game.settle(); // 2-player game: "choose an opponent" is forced
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("with Zhonya's in base: the lethal combat damage's kill is REPLACED — the Hourglass is killed instead; Draven is healed (0 damage), exhausted and recalled to base; his death trigger never appears and P2 scores nothing", async () => {
    const game = await board(true).build();
    expect(game.p1.legal().some((o) => o.card === "hourglass")).toBe(false); // nothing to activate — it just applies
    await dravenCharges(game);
    expect(game.chain().some((c) => c.cardId === "draven")).toBe(false); // no "When I die in combat" item, ever
    await game.settle();
    expect(game.zoneOf("hourglass")).toBe("trash");
    expect(game.zoneOf("draven")).toBe("base");
    expect(game.state("draven")).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
    expect(game.p1.trash()).toEqual(["hourglass"]);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.points()).toBe(0);
    expect(game.state("wall")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // healed at combat cleanup; P2 keeps bf1
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("summary steps 1–5 with the Hourglass HIDDEN: P1 flips it during the showdown (before damage); it lands in base, then replaces the kill exactly the same way — no point for P2", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 2, name: "Holder" }, "holder")
      .facedown(P1, "bf2", ZHONYAS, "hourglass")
      .unit(P2, "bf1", { might: 7, name: "Wall" }, "wall")
      .unit(P1, "base", DRAVEN_AUDACIOUS, "draven")
      .build();
    await game.p1.move("draven", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "hourglass")).toBe(true);
    await game.p1.reveal("hourglass"); // step 1: revealed during the showdown, before combat damage
    for (let i = 0; i < 4 && game.zoneOf("hourglass") !== "base"; i++) {
      await game.acting().pass();
    }
    expect(game.zoneOf("hourglass")).toBe("base");
    expect(game.state("draven").location).toBe("bf1"); // combat not resolved yet
    await game.settle(); // steps 2–4: damage dealt, kill attempted, replaced
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("hourglass")).toBe("trash");
    expect(game.state("draven")).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
    expect(game.p2.points()).toBe(0); // step 5
    expect(game.p1.points()).toBe(0);
  });
});
