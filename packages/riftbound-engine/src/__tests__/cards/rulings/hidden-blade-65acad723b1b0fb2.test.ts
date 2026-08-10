/**
 * Ruling 65acad723b1b0fb2 — Hidden Blade (OGN-213 → ogn-213-298) · [Hidden] [Action] "Kill a unit at a battlefield. Its controller draws 2."
 *   × The Boss (Sett legend, OGN-269 → ogn-269-298) — the would-be follow-up recall.
 *
 * Q: Can I assign combat damage first, THEN flip Hidden Blade on my own unit (and Boss-recall it) so my damage still lands?
 * A: No. Hidden Blade must be played from facedown while you have priority/Focus BEFORE the combat damage step; once both
 *    players pass on an empty chain you go straight to damage and it is too late.
 *    If you do flip it in your window you kill your own unit and draw 2, but then deal 0 combat damage. If you pass/pass
 *    instead, (equal) units trade, you lose the battlefield, and the still-hidden Blade goes to the trash.
 * Rules: 465 (combat damage step has no priority), 343–345 (Focus/priority windows), 811 (hidden card lost with control).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const THE_BOSS = "ogn-269-298";

/** P2's turn. P1 (The Boss) holds bf1 with Pawn (3) and a facedown Hidden Blade; P2's Raider (3) attacks. Procedures surfaced, not auto-run. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .legend(P1, THE_BOSS, "boss")
    .resources(P1, { power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Pawn" }, "pawn")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"])
    .autoProcedures(false);
}

/** Procedures are surfaced (autoProcedures off): run any offered combat resolution, then settle. */
async function finishCombat(game: Game): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await game.settle();
    const d = game.decision();
    const proc = d?.kind === "action" ? d.options.find((o) => o.verb === "resolveCombat") : undefined;
    if (!d || !proc) {
      return;
    }
    await game.seat(d.seat).choose(proc.key);
  }
}

async function attackAndPassToP1(game: Game): Promise<void> {
  await game.p2.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
}

describe("Ruling 65acad723b1b0fb2 — Hidden Blade's window is BEFORE combat damage, never after assignment", () => {
  test("the legal window: with Focus on an empty chain during the showdown, P1 may flip the facedown Hidden Blade", async () => {
    const game = await board().build();
    await attackAndPassToP1(game);
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("reveal", "blade")).toBe(true);
  });

  test("pass/pass on the empty chain proceeds straight to combat damage — at that point revealing Hidden Blade is no longer an option for P1", async () => {
    const game = await board().build();
    await attackAndPassToP1(game);
    await game.p1.passFocus();
    // The only thing left is the combat-damage procedure; no seat is offered the reveal any more.
    const d = game.decision();
    expect(d?.kind).toBe("action");
    expect(d?.kind === "action" ? d.options.some((o) => o.verb === "resolveCombat") : false).toBe(true);
    expect(game.p1.can("reveal", "blade")).toBe(false);
    expect(game.p1.legal().map((o) => o.verb)).not.toContain("reveal");
  });

  test("if P1 lets damage happen (pass/pass): the 3s trade, both units die, P1 loses bf1 and the still-hidden Blade goes to the trash", async () => {
    const game = await board().build();
    await attackAndPassToP1(game);
    await game.p1.passFocus();
    await finishCombat(game);
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller ?? null).not.toBe(P1);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p1.hand()).toEqual([]); // no draw
    expect(game.violations()).toEqual([]);
  });

  test("if P1 flips Hidden Blade in the window on its own Pawn: Pawn dies, P1 draws 2 — and then deals 0 combat damage (Raider unhurt, conquers bf1)", async () => {
    const game = await board().build();
    await attackAndPassToP1(game);
    await game.p1.reveal("blade", { answers: ["pawn"] });
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    await finishCombat(game);
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.state("raider").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
