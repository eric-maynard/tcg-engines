/**
 * Ruling bc39688295f5c3ce — Falling Star (OGN-029 → ogn-029-298) · Spell · Fury · 2+[fury][fury] · Action
 *     "Deal 3 to a unit. Deal 3 to a unit."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · 2 · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: The opponent Falling Stars two of my 3-Might units while I have a (face-up) Zhonya's Hourglass. Can I choose
 *    which unit is saved?
 * A: Yes. Both units would die at the same time (one spell's damage), so the Hourglass's controller chooses which
 *    death event it replaces. One Hourglass saves one unit; the other dies. It is a replacement effect (no chain) and
 *    must already be face-up before the damage is dealt.
 * Rules: 370.1.a.2 (simultaneous events), 371–373 (replacement controller chooses; applies once), 811 (a hidden
 *        Hourglass does nothing until played).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FALLING_STAR = "ogn-029-298";
const ZHONYAS = "ogn-077-298";

/** P1's turn with exactly 2+[fury][fury]. P2: Alpha (3) and Bravo (3) at P2's bf1, Charlie (3) in base, Zhonya's face-up in base (or hidden at bf1). */
function board(zhonyas: "face-up" | "hidden" = "face-up") {
  const s = scenario()
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Alpha" }, "alpha")
    .unit(P2, "bf1", { might: 3, name: "Bravo" }, "bravo")
    .unit(P2, "base", { might: 3, name: "Charlie" }, "charlie")
    .hand(P1, FALLING_STAR, "fs");
  return zhonyas === "face-up" ? s.gear(P2, ZHONYAS, "zhonyas") : s.facedown(P2, "bf1", ZHONYAS, "zhonyas");
}

/** P1 Falling Stars Alpha and Bravo (3 each); both players pass so it resolves — stops at the first non-priority prompt (or the open state). */
async function fallingStarOnAlphaAndBravo(game: Game): Promise<void> {
  await game.p1.cast("fs", { targets: ["alpha", "bravo"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fs", controller: P1, targets: ["alpha", "bravo"] })]);
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
}

describe("Ruling bc39688295f5c3ce — Zhonya's controller picks which Falling Star victim it saves", () => {
  // Both 3-damage hits land as one simultaneous event (the later instruction names a different unit, so no Cleanup
  // runs between them), both units "would die" together, and a `replacement-assign` decision surfaces to P2 (the
  // Hourglass's controller) naming Alpha and Bravo (rule 373).
  test("ruling bc39688295f5c3ce — both deaths are simultaneous, so P2 is asked which one Zhonya's saves", async () => {
    const game = await board().build();
    await fallingStarOnAlphaAndBravo(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P2, semantics: "replacement-assign", source: { cardId: "zhonyas" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["alpha", "bravo"]);
    expect(game.actingSeat()).toBe(P2);
    // Nothing has died while P2 decides.
    expect(game.zoneOf("alpha")).toBe("battlefield-bf1");
    expect(game.zoneOf("bravo")).toBe("battlefield-bf1");
    expect(game.zoneOf("zhonyas")).toBe("base");
  });

  // Expected (ruling): P2 may choose to save BRAVO (the second-named target) — Bravo healed/exhausted/recalled, Alpha
  // dies. Actual (engine): no choice; Alpha (first target) is always the one saved.
  test("ruling bc39688295f5c3ce — P2 choosing Bravo: Bravo is saved to base exhausted, Alpha dies, Hourglass consumed", async () => {
    const game = await board().build();
    await fallingStarOnAlphaAndBravo(game);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    await game.p2.pick("bravo");
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("bravo")).toBe("base");
    expect(game.state("bravo")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("alpha")).toBe("trash");
  });

  test("one Hourglass, one save: however it is assigned, exactly ONE of Alpha/Bravo survives (healed, exhausted, recalled to base), the other dies, and the Hourglass is killed instead — no chain item was ever created for it", async () => {
    const game = await board().build();
    await fallingStarOnAlphaAndBravo(game);
    // Answer the assignment if the engine offers it (ruling), otherwise it already applied it.
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      await game.p2.pick(d.options[0]?.key as string);
    }
    await game.settle();
    expect(game.zoneOf("fs")).toBe("trash");
    expect(game.zoneOf("zhonyas")).toBe("trash");
    const zones = [game.zoneOf("alpha"), game.zoneOf("bravo")].sort();
    expect(zones).toEqual(["base", "trash"]);
    const saved = game.zoneOf("alpha") === "base" ? "alpha" : "bravo";
    expect(game.state(saved)).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
    expect(game.zoneOf("charlie")).toBe("base"); // untouched
    expect(game.p2.gear()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("timing: a Zhonya's still HIDDEN (facedown at bf1) when the damage is dealt replaces nothing — both Alpha and Bravo die and P2 is never asked anything", async () => {
    const game = await board("hidden").build();
    await fallingStarOnAlphaAndBravo(game);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("alpha")).toBe("trash");
    expect(game.zoneOf("bravo")).toBe("trash");
    expect(game.p2.units("base")).toEqual(["charlie"]);
  });
});
