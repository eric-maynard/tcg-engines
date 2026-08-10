/**
 * Ruling abb596dddb1fb561 — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield "When you defend here, you may move a friendly unit here
 *     to base."
 *   × Irelia, Fervent (SFD-057 → sfd-057-221) · 4 Might · [Deflect] "When you choose or ready me, give me +1 Might this turn."
 *
 * Q: Does Irelia get +1 for being chosen by the Reaver's Row trigger even if she is ultimately NOT moved to base?
 * A: Yes. She is chosen when the Row's trigger is put on the chain, so her +1 triggers right then. The "may" (move or not) is decided
 *    when the Row's ability RESOLVES; whichever way you decide, the +1 she already got stays for the turn.
 * Rules: 383.4.b (choosing a target on finalize fires "when you choose me"), 355.5, 359 ("may" performed at resolution) — FAQ #8628.
 * RULING-CONFLICT: riftjudge abb596dddb1fb561 (FAQ #8628 lineage, pre-Unleashed) puts the move-or-not decision at RESOLUTION. CR 383.3.a
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

/** P2's turn. P1 controls the live Row with Irelia (4) and a 3-Might Guard. P2's 2-Might Poker attacks from base. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "row", IRELIA, "irelia")
    .unit(P1, "row", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 2, name: "Poker" }, "poker");
}

/**
 * Poker attacks the Row; P1 gets the Row's trigger onto the chain with Irelia as the chosen unit (answering an up-front opt-in with YES
 * if the engine asks one before the choice — the ruling places the real "may" at resolution).
 */
async function rowTriggerChoosingIrelia(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("poker", "row");
  expect(game.state("irelia").combatRole).toBe("defender");
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    const rowItem = game.chain().find((c) => c.cardId === "row");
    if (rowItem?.targets?.includes("irelia")) {
      break;
    }
    if (d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "row") {
      await game.p1.yes();
    } else if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key)).toContain("irelia");
      await game.p1.pick("irelia");
    } else {
      break;
    }
  }
  expect(game.chain().find((c) => c.cardId === "row")).toMatchObject({ controller: P1, targets: ["irelia"], triggered: true });
  return game;
}

/** Pass priority (accepting any trigger-order offer) until the Row's item is the top of the chain and about to resolve, or the chain is empty. */
async function resolveDownToRow(game: Game): Promise<void> {
  for (let i = 0; i < 12 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "order" && d.seat === P1) {
      await game.acceptTriggerOrder();
    } else if (d?.kind === "action" && d.context === "chain") {
      if (game.chain().length === 1 && game.chain()[0]?.cardId === "row") {
        return;
      }
      await game.seat(d.seat).passPriority();
    } else {
      return;
    }
  }
}

describe("Ruling abb596dddb1fb561 — Irelia keeps the +1 for being CHOSEN by Reaver's Row, whether or not she is moved", () => {
  test("choosing Irelia as the Row's trigger goes on the chain fires her 'when you choose me': she is +1 (→ 5) while the Row's item is still unresolved and she is still at the Row", async () => {
    const game = await rowTriggerChoosingIrelia();
    await resolveDownToRow(game); // lets Irelia's own trigger (above the Row's) resolve, stops at the Row item
    expect(game.chain().map((c) => c.cardId)).toEqual(["row"]);
    expect(game.locationOf("irelia")).toBe("row");
    expect(game.state("irelia")).toMatchObject({ might: 5, mightModifier: 1 });
  });

  test("deciding to move: the Row resolves, Irelia goes to base and keeps her +1 there (5 Might)", async () => {
    const game = await rowTriggerChoosingIrelia();
    await resolveDownToRow(game);
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes();
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("irelia")).toBe("base");
    expect(game.state("irelia")).toMatchObject({ might: 5, mightModifier: 1 });
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT (see header): CR 383.3.a.1 — no move-or-not question at resolution; the chosen unit is moved. The part of
  // the ruling that stands: the +1 for being CHOSEN is earned at finalization and kept regardless.
  test("CR 383.3.a.1 (contra ruling abb596dddb1fb561) — the Row resolves without asking again: Irelia is moved to base and keeps the +1 she got for being chosen (5 Might)", async () => {
    const game = await rowTriggerChoosingIrelia();
    await resolveDownToRow(game);
    expect(game.state("irelia").mightModifier).toBe(1); // already earned
    let asked = false;
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        asked = true;
        await game.p1.no();
        break;
      }
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(asked).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("irelia")).toBe("base");
    expect(game.state("irelia")).toMatchObject({ might: 5, mightModifier: 1 });
    expect(game.violations()).toEqual([]);
  });
});
