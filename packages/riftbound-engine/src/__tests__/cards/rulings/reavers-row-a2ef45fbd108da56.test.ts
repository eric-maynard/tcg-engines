/**
 * Ruling a2ef45fbd108da56 — Reaver's Row (OGN-285 → ogn-285-298) Battlefield "When you defend here, you may move a friendly unit
 *   here to base."  × Irelia, Fervent (SFD-057 → sfd-057-221) 4 Might "[Deflect] When you choose or ready me, give me +1 [Might] this turn."
 *
 * Q: Is the Row's target chosen when the trigger is put on the chain, and can you then decline to move it when it resolves?
 * A: Yes and yes (per this ruling): the target is chosen as the trigger goes on the chain; when it resolves the player decides
 *    whether to actually move the chosen unit. This lets you "choose" a unit like Irelia (for her +1) without moving her.
 *    [Note: sibling ruling 6d6f177ae63f7aba states the newer reading — the "may" is spent on the opt-in and the move is then
 *     mandatory. This file encodes a2ef45fbd108da56 as written.]
 * Rules: 383.4.f (defend trigger), 355.5/355.7 (targets chosen at finalization), 383.3.a ("may" triggers).
 * RULING-CONFLICT: riftjudge a2ef45fbd108da56 (FAQ #8628 lineage, pre-Unleashed) puts the move-or-not decision at RESOLUTION. CR 383.3.a
 *    ("you may" as the FIRST part of a trigger's effect is decided during FINALIZATION), 383.3.a.1 (that decision "is solely
 *    whether or not to perform said triggered ability" — there is no second say) and Unleashed-era ruling 6d6f177ae63f7aba on
 *    this exact card ("once it's on the chain, the effect is mandatory") say the opposite. Engine follows the CR: opt-in and
 *    target at finalization (Irelia still gets her +1 for being chosen — 383.4.b.2), then the chosen unit IS moved.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const IRELIA = "sfd-057-221";

/** P2's turn. P1 holds the live Row with Irelia (4) and a Guard (3). P2's Poker (2) attacks from base. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .unit(P1, "row", IRELIA, "irelia")
    .unit(P1, "row", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 2, name: "Poker" }, "poker");
}

/** Poker attacks; P1 opts in to the Row trigger and names Irelia as its target. */
async function rowTargetsIrelia(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("poker", "row");
  expect(game.state("irelia").combatRole).toBe("defender");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" } });
  await game.p1.yes();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "row" } });
  expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["guard", "irelia"]);
  await game.p1.pick("irelia");
  return game;
}

describe("Ruling a2ef45fbd108da56 — Reaver's Row: target on the chain, move-or-not on resolution", () => {
  test("the target IS chosen as the trigger is put on the chain: the Row's item carries Irelia as its target before anything resolves, and 'choosing' her fires her +1", async () => {
    const game = await rowTargetsIrelia();
    expect(game.chain().find((c) => c.cardId === "row")).toMatchObject({ controller: P1, targets: ["irelia"], triggered: true });
    expect(game.locationOf("irelia")).toBe("row"); // nothing moved yet
    // Irelia's "When you choose me" — its own chain item or already applied.
    const ireliaPending = game.chain().some((c) => c.cardId === "irelia" && c.triggered);
    expect(ireliaPending || game.state("irelia").mightModifier === 1).toBe(true);
    // Let everything up to (not including) the Row item resolve; Irelia ends at +1 either way.
    for (let i = 0; i < 8 && game.chain().length > 1 && game.decision()?.kind === "action"; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("irelia").mightModifier).toBe(1);
  });

  // RULING-CONFLICT (see header): CR 383.3.a / 383.3.a.1 — the "may" was the finalization opt-in; the Row's item then resolves
  // WITHOUT a second question and the chosen unit is moved. Irelia keeps the +1 she got for being chosen either way.
  test("CR 383.3.a.1 (contra ruling a2ef45fbd108da56) — no 'move it or not' at resolution: once opted in and chosen, Irelia IS moved to base (with her +1)", async () => {
    const game = await rowTargetsIrelia();
    let askedAtResolution = false;
    for (let i = 0; i < 12 && (game.chain().length > 0 || game.decision()?.kind !== "action"); i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "row") {
        askedAtResolution = true;
        await game.p1.no();
        continue;
      }
      if (d?.kind === "order" && d.seat === P1) {
        await game.acceptTriggerOrder();
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(askedAtResolution).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("irelia")).toBe("base"); // moved …
    expect(game.state("irelia")).toMatchObject({ might: 5, mightModifier: 1 }); // … and buffed for being chosen
  });

  test("choosing to move: the chosen Irelia goes to base with her +1; the Guard stays and wins the combat", async () => {
    const game = await rowTargetsIrelia();
    for (let i = 0; i < 12 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "row") {
        await game.p1.yes(); // if asked, move her
      } else if (d?.kind === "order" && d.seat === P1) {
        await game.acceptTriggerOrder();
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("irelia")).toBe("base");
    expect(game.state("irelia")).toMatchObject({ might: 5, mightModifier: 1 });
    await game.settle();
    expect(game.zoneOf("poker")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-row");
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
