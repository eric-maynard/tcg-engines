/**
 * Ruling a9394c30f4aa6725 — Hidden Blade (OGN-213 → ogn-213-298) · Spell · Order · [2][order] · Action · [Hidden]
 *     "Kill a unit at a battlefield. Its controller draws 2."
 *   × Flash (OGS-011 → ogs-011-024) · [2] Reaction · "Move up to 2 friendly units to base."
 *   × (nuance) Cull the Weak (OGN-209 → ogn-209-298) · [2][order] · "Each player kills one of their units." — does not target.
 *   (helper for "moved to a different battlefield at Reaction speed": Tideturner OGN-199 → ogn-199-298, [Hidden] 2-Might unit,
 *    "When you play me, you may choose a unit you control at another location. Move me to its location and it to my original location.")
 *
 * Q: How does Hidden Blade's targeting work when the opponent responds by moving the targeted unit?
 * A: The target (a unit at a battlefield) is locked when Hidden Blade is played and cannot be redirected; legality is
 *    rechecked on resolution. Moved to base (Flash) → illegal → the spell does nothing: no kill and, with no victim, no
 *    controller draws. Moved to a DIFFERENT battlefield (Blade played from hand) → still "a unit at a battlefield" → it
 *    works. Cull the Weak, by contrast, targets nothing: each player kills a unit chosen on resolution, whatever existed earlier.
 * Rules: 355.6/355.7 (targets fixed at finalization), 355.9 (recheck → no effect), 359.3.e.14 ("its controller" needs a
 *        killed unit), 811.1.d.2 (from-hidden plays are restricted to "here" — not the case from hand).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const FLASH = "ogs-011-024";
const CULL_THE_WEAK = "ogn-209-298";
const TIDETURNER = "ogn-199-298";

/** P1's turn 3. P2 holds bf1 (Target 4) and bf2 (Anchor 2, + a facedown Tideturner). P1: Hidden Blade in hand, [2][order]. P2: Flash + [2]. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Target" }, "target")
    .unit(P2, "bf2", { might: 2, name: "Anchor" }, "anchor")
    .facedown(P2, "bf2", TIDETURNER, "tt")
    .unit(P1, "base", { might: 1, name: "Pal" }, "pal")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P2, FLASH, "flash");
}

async function bladeOnTarget(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("blade", { targets: "target" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, targets: ["target"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

async function drain(game: Game): Promise<void> {
  for (let i = 0; i < 12 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      throw new Error(`P1 must never be asked to re-target Hidden Blade (got "${d.prompt}")`);
    }
    if (d?.kind === "yes-no" && d.seat === P2) {
      await game.p2.yes();
    } else if (d?.kind === "pick" && d.seat === P2) {
      const k = d.options.find((o) => o.card === "target")?.key ?? d.options[0]!.key;
      await game.p2.answer({ keys: [k], kind: "pick" });
    } else if (d?.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
}

describe("Ruling a9394c30f4aa6725 — Hidden Blade's locked target: to base ⇒ nothing happens; to another battlefield ⇒ still dies", () => {
  test("Flash in response moves the Target to base: Hidden Blade resolves and does NOTHING — no unit killed (not the Target, not anyone else), no re-target prompt, and NOBODY draws", async () => {
    const game = await bladeOnTarget();
    await game.p2.cast("flash", { targets: "target" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "flash"]);
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await drain(game);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("target")).toBe("base");
    expect(game.p2.trash()).toEqual(["flash"]);
    expect(game.p1.trash()).toEqual(["blade"]);
    expect(game.zoneOf("anchor")).toBe("battlefield-bf2");
    expect(game.zoneOf("pal")).toBe("base");
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("moved to a DIFFERENT battlefield instead (P2 flips Tideturner at bf2 and swaps it with the Target): the from-hand Blade still finds 'a unit at a battlefield' — the Target dies at bf2 and its controller P2 draws 2", async () => {
    const game = await bladeOnTarget();
    expect(game.p2.can("reveal", "tt")).toBe(true);
    await game.p2.reveal("tt");
    // Tideturner's play trigger (swap with the Target, P2's only unit at another location) resolves first.
    for (let i = 0; i < 8 && game.chain().length > 1; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P2) {
        await game.p2.yes();
      } else if (d?.kind === "pick" && d.seat === P2) {
        await game.p2.answer({ keys: [d.options.find((o) => o.card === "target")?.key ?? d.options[0]!.key], kind: "pick" });
      } else if (d?.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
    expect(game.zoneOf("tt")).toBe("battlefield-bf1");
    expect(game.zoneOf("target")).toBe("battlefield-bf2"); // relocated, but still at a battlefield
    const p2Hand = game.p2.hand().length;
    await drain(game);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("target")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.violations()).toEqual([]);
  });

  test("the target cannot be redirected: while the Blade is pending P1 has no way to re-aim it at the Anchor, and after the Flash fizzle the Anchor is untouched", async () => {
    const game = await bladeOnTarget();
    await game.p2.cast("flash", { targets: "target" });
    // No P1 option mentions choosing/retargeting; only pass/concede (and no spell to cast).
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(d?.kind === "action" ? d.options.map((o) => o.verb).toSorted() : []).toEqual(["concede", "passPriority"]);
    await drain(game);
    expect(game.zoneOf("anchor")).toBe("battlefield-bf2");
    expect(game.state("anchor").damage).toBe(0);
  });

  test("contrast — Cull the Weak does not target: P2 flips Tideturner in response, and on resolution P2 must still kill one of its units, chosen THEN — the newly arrived Tideturner is a legal choice", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Target" }, "target")
      .unit(P2, "bf2", { might: 2, name: "Anchor" }, "anchor")
      .facedown(P2, "bf2", TIDETURNER, "tt")
      .unit(P1, "base", { might: 1, name: "Pal" }, "pal")
      .hand(P1, CULL_THE_WEAK, "cull")
      .build();
    // No targets are named on the cast.
    const targetsField = game.p1.option("cast", "cull")?.fields.find((f) => f.name === "targets");
    expect(targetsField?.max ?? 0).toBe(0);
    expect((targetsField?.options ?? [[]]).flat()).toEqual([]);
    await game.p1.cast("cull");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P1 })]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
    await game.p1.passPriority();
    await game.p2.reveal("tt");
    for (let i = 0; i < 8 && game.chain().length > 1; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P2) {
        await game.p2.no(); // no swap needed — just get a third body on the board
      } else if (d?.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.p2.units().toSorted()).toEqual(["anchor", "target", "tt"]);
    // Resolve Cull the Weak: each player chooses on resolution.
    let p2Offered: string[] = [];
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain" && d.passKey) {
        await game.seat(d.seat).pass();
      } else if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("pal");
      } else if (d?.kind === "pick" && d.seat === P2) {
        expect(d).toMatchObject({ source: { cardId: "cull" } });
        p2Offered = d.options.map((o) => o.card ?? o.key).toSorted();
        await game.p2.pick("tt");
      } else {
        break;
      }
    }
    expect(p2Offered).toEqual(["anchor", "target", "tt"]);
    expect(game.zoneOf("tt")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.zoneOf("target")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([]);
  });
});
