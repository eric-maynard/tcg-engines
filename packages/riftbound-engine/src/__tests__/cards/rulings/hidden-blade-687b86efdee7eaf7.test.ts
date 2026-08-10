/**
 * Ruling 687b86efdee7eaf7 — Hidden Blade (OGN-213 → ogn-213-298) · [Hidden] [Action] · [2][order] · "Kill a unit at a battlefield. Its
 *     controller draws 2."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction · [1] · "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Flash (OGS-011 → ogs-011-024) · Reaction · [2] · "Move up to 2 friendly units to base."
 *
 * Q: What happens when Hidden Blade is chained with Gust or Flash in either order (same unit)?
 * A: LIFO. Blade first on the chain, Gust/Flash on top → Gust/Flash resolves first (unit to hand / to base), Blade then resolves with
 *    no effect and NOBODY draws. Gust/Flash first, Blade on top → Blade kills the unit and its controller draws 2, then Gust/Flash
 *    resolves with no effect on it. A spell without a legal target still resolves, stays paid and is discarded; a multi-target Flash
 *    still moves its other unit.
 * Rules: 340 (LIFO), 359.3.e (instruction with an illegal/missing target is skipped; linked "its controller draws 2" too),
 *        425.1.c (no refunds), 811 (Hidden → played from facedown as a Reaction, here).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const GUST = "ogn-169-298";
const FLASH = "ogs-011-024";

/**
 * P2's turn (turn 3). P1 controls bf1 with a 4-Might Holder and Hidden Blade facedown there (hidden on an earlier turn); P1 also holds a
 * Gust with [1]. P2 attacks bf1 with U (3) and Buddy (2) from base and holds Gust + Flash with [3].
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 3 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Holder" }, "holder")
    .facedown(P1, "bf1", HIDDEN_BLADE, "hb")
    .unit(P2, "base", { might: 3, name: "U" }, "U")
    .unit(P2, "base", { might: 2, name: "Buddy" }, "buddy")
    .hand(P1, GUST, "gustP1")
    .hand(P2, GUST, "gustP2")
    .hand(P2, FLASH, "flash");
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);

/** U + Buddy attack bf1; the showdown opens with P2 (attacker) holding Focus. */
async function attacked(): Promise<Game> {
  const game = await board().build();
  await game.p2.move(["U", "buddy"], "bf1");
  expect(game.state("U")).toMatchObject({ combatRole: "attacker", zone: "battlefield-bf1" });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  return game;
}

/** P1 flips Hidden Blade at bf1 onto U (for [0]). */
async function revealBladeOnU(game: Game): Promise<void> {
  expect(game.p1.can("reveal", "hb")).toBe(true);
  const energy = game.p1.energy();
  await game.p1.reveal("hb");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 }); // "Kill a unit at a battlefield" — chosen as it is played
  expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toContain("U");
  await game.p1.pick("U");
  expect(game.chain().at(-1)).toMatchObject({ cardId: "hb", controller: P1, targets: ["U"] });
  expect(game.p1.energy()).toBe(energy); // nothing paid for the hidden play
}

async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind !== "action") {
      break;
    }
    await game.seat(d.seat).passPriority();
  }
  expect(game.chain()).toEqual([]);
}

describe("Ruling 687b86efdee7eaf7 — Hidden Blade vs Gust / Flash on the same unit: pure LIFO", () => {
  test("Blade chain 1, Gust chain 2: Gust returns U to P2's hand first; Blade resolves with no effect — nobody draws; both spells in trash, Gust's [1] stays spent", async () => {
    const game = await attacked();
    await game.p2.passFocus();
    await revealBladeOnU(game);
    await game.p1.passPriority();
    await game.p2.cast("gustP2", { targets: "U" });
    expect(chainIds(game)).toEqual(["hb", "gustP2"]);
    const p2Hand = game.p2.hand().length; // flash
    const p1Hand = game.p1.hand().length;
    await drainChain(game);
    expect(game.zoneOf("U")).toBe("hand");
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.zoneOf("gustP2")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 1); // + U returned, and NO 2 drawn
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.p2.energy()).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("Blade chain 1, Flash chain 2: Flash moves U to base first; Blade resolves with no effect — U alive in base, nobody draws", async () => {
    const game = await attacked();
    await game.p2.passFocus();
    await revealBladeOnU(game);
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["U"] });
    expect(chainIds(game)).toEqual(["hb", "flash"]);
    const p2Hand = game.p2.hand().length;
    await drainChain(game);
    expect(game.state("U")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand); // no draw
  });

  test("Gust chain 1, Blade chain 2: Blade resolves first — U is killed and its controller (P2) draws 2; Gust then resolves with no effect (U is in the trash, not in hand)", async () => {
    const game = await attacked();
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.cast("gustP1", { targets: "U" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // P1 keeps priority…
    await revealBladeOnU(game); // …and stacks the Blade on top of its own Gust
    expect(chainIds(game)).toEqual(["gustP1", "hb"]);
    const p2Hand = game.p2.hand().length;
    await drainChain(game);
    expect(game.zoneOf("U")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.zoneOf("gustP1")).toBe("trash");
    expect(game.p1.energy()).toBe(0); // Gust paid, did nothing, no refund
    expect(game.violations()).toEqual([]);
  });

  test("Flash chain 1 (on U AND Buddy), Blade chain 2: Blade kills U first (P2 draws 2); Flash then does as much as it can — nothing for U, but Buddy still goes home", async () => {
    const game = await attacked();
    await game.p2.cast("flash", { targets: ["U", "buddy"] });
    expect(chainIds(game)).toEqual(["flash"]);
    await game.p2.passPriority();
    await revealBladeOnU(game);
    expect(chainIds(game)).toEqual(["flash", "hb"]);
    const p2Hand = game.p2.hand().length;
    await drainChain(game);
    expect(game.zoneOf("U")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.zoneOf("buddy")).toBe("base");
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.p2.energy()).toBe(1);
  });
});
