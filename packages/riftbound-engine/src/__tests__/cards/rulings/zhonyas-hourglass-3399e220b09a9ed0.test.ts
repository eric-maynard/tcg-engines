/**
 * Ruling 3399e220b09a9ed0 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · 2 · [Hidden]
 *   "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Icathian Rain (OGN-248 → ogn-248-298) · Spell · 7+[R][R][R] · "Deal 2 to a unit." ×6
 *   (Anivia, Primal ogn-148-298 supplies the in-combat "your unit dies during the showdown" kill.)
 *
 * Q: Can you flip a hidden Zhonya's AFTER your unit dies in a combat showdown, choosing not to save the unit and just
 *    getting the Hourglass into base instead?
 * A: Yes — while the battlefield is contested control does not change, so the hidden card is still yours to reveal
 *    after the death; Zhonya's goes to base and the unit stays dead. Outside combat (e.g. Icathian Rain kills your last
 *    unit there) losing control before flipping loses the hidden Zhonya's. To actually save the unit you must reveal
 *    BEFORE it dies.
 * Rules: 181.4 / 190.4 (control during a contested combat vs. lapsing outside combat), 811 (Hidden: reveal as a
 *        Reaction; hidden card is trashed when you lose control of the battlefield), 369–372 (replacement effect).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const ICATHIAN_RAIN = "ogn-248-298";
const ANIVIA = "ogn-148-298";

/** P2's turn. P1 controls bf1 with a 2-Might Pawn and a facedown Zhonya's; P2's Anivia (attack: 3 to all enemies here) in base. */
function combatBoard() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Pawn" }, "pawn")
    .facedown(P1, "bf1", ZHONYAS, "zh")
    .unit(P2, "base", ANIVIA, "anivia");
}

describe("Ruling 3399e220b09a9ed0 — hidden Zhonya's after a death: fine inside a combat showdown, lost outside one", () => {
  test("in combat: Anivia's attack trigger kills the Pawn mid-showdown; bf1 stays CONTESTED and still controlled by P1, so P1 may still reveal the hidden Zhonya's — it goes to base and the Pawn stays dead", async () => {
    const game = await combatBoard().build();
    await game.p2.move("anivia", "bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["anivia"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // P1 deliberately does NOT flip yet → trigger resolves, 3 ≥ 2
    expect(game.zoneOf("pawn")).toBe("trash");
    // Control does not change while contested (P1 has no unit there any more).
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(game.zoneOf("zh")).toBe("facedown-bf1"); // not lost
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "zh")).toBe(true);
    await game.p1.reveal("zh");
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("zh")).toBe("base"); // the Hourglass is simply "recalled"/played to base
    expect(game.p1.gear()).toContain("zh");
    expect(game.zoneOf("pawn")).toBe("trash"); // choosing not to save it: it stays dead
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 }); // Anivia conquers the empty field
    expect(game.zoneOf("zh")).toBe("base"); // and P1 keeps the gear for later
    expect(game.violations()).toEqual([]);
  });

  test("to SAVE the unit you must reveal first: flipping Zhonya's in response to Anivia's trigger puts it in base before the damage, so the Pawn's death is replaced — Hourglass killed instead, Pawn healed, exhausted, recalled to base", async () => {
    const game = await combatBoard().build();
    await game.p2.move("anivia", "bf1");
    await game.p2.passPriority();
    expect(game.p1.can("reveal", "zh")).toBe(true);
    await game.p1.reveal("zh");
    for (let i = 0; i < 4 && game.zoneOf("zh") !== "base"; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.zoneOf("pawn")).toBe("battlefield-bf1");
    // Now let Anivia's trigger resolve.
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("zh")).toBe("trash"); // "kill this instead"
    expect(game.zoneOf("pawn")).toBe("base"); // recalled
    expect(game.state("pawn")).toMatchObject({ damage: 0, isExhausted: true });
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("outside combat: Icathian Rain kills P1's last unit at bf1 while P1 declines to flip; control lapses at once and the hidden Zhonya's is LOST to the trash — nothing left to reveal", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 7, power: { rainbow: 3 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Pawn" }, "pawn")
      .facedown(P1, "bf1", ZHONYAS, "zh")
      .unit(P2, "base", { might: 8, name: "Bystander" }, "big")
      .hand(P2, ICATHIAN_RAIN, "rain")
      .build();
    await game.p2.cast("rain", { targets: ["pawn", "pawn", "pawn", "big", "big", "big"] });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.p2.passPriority();
    // P1 COULD flip here (before the death) …
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "zh")).toBe(true);
    // … but passes instead; Rain resolves, Pawn dies (no combat, no contest).
    await game.p1.passPriority();
    expect(game.zoneOf("rain")).toBe("trash");
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.zoneOf("zh")).toBe("trash"); // the hidden card is lost with the battlefield
    expect(game.p1.can("reveal", "zh")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "zh")).toBe(false);
    expect(game.state("big")).toMatchObject({ damage: 6, zone: "base" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
