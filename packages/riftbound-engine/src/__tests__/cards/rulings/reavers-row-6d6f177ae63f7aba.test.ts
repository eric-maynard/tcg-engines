/**
 * Ruling 6d6f177ae63f7aba — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield · "When you defend here, you may move a friendly unit here to base."
 *   × Irelia, Fervent (SFD-057 → sfd-057-221) · 4 Might · "[Deflect] When you choose or ready me, give me +1 [Might] this turn."
 *   (Amateur Recital unl-207-219 / Star Spring unl-215-219 / Valley of Idols unl-218-219 are cited as other "may" battlefields the same
 *    principle applies to; not separately encoded.)
 *
 * Q: If I put the Row's "may" trigger on the chain targeting Irelia, can I decline the move when it resolves but keep her +1 for being chosen?
 * A: No. Under the current rules the "may" is only the choice of whether to put the ability on the chain at all. Once it is on the chain
 *    targeting Irelia, the move is mandatory on resolution — she goes to base (with her +1).
 * Rules: 383.3.a (optional trigger: opt-in decided when it would go on the chain), 359 (resolution performs the instructions; no second opt-out).
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
    .unit(P1, "row", IRELIA, "irelia")
    .unit(P1, "row", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 2, name: "Poker" }, "poker");
}

/** Poker attacks; P1 answers the Row's opt-in with `optIn` and (if yes) names Irelia. */
async function attack(optIn: boolean): Promise<Game> {
  const game = await board().build();
  await game.p2.move("poker", "row");
  expect(game.state("irelia").combatRole).toBe("defender");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" } }); // THE "may": put it on the chain or not
  if (!optIn) {
    await game.p1.no();
    return game;
  }
  await game.p1.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "row" } });
  await game.p1.pick("irelia");
  return game;
}

describe("Ruling 6d6f177ae63f7aba — Reaver's Row's 'may' is spent on the opt-in; once on the chain targeting Irelia the move is mandatory", () => {
  test("opting in and choosing Irelia puts the Row's item on the chain targeting her — and choosing her fires her own +1 trigger", async () => {
    const game = await attack(true);
    const row = game.chain().find((c) => c.cardId === "row");
    expect(row).toMatchObject({ controller: P1, targets: ["irelia"], triggered: true });
    expect(game.locationOf("irelia")).toBe("row"); // not moved yet
    // Irelia's "when you choose me" is either its own chain item or already applied; either way she ends this sequence at +1.
    const ireliaItem = game.chain().some((c) => c.cardId === "irelia" && c.triggered);
    expect(ireliaItem || game.state("irelia").mightModifier === 1).toBe(true);
  });

  test("resolution: P1 is NOT asked a second time — no yes/no to 'actually move' — Irelia is moved to base, keeping her +1 (5 Might) there", async () => {
    const game = await attack(true);
    let secondOptOut = false;
    for (let i = 0; i < 12 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.source?.cardId === "row") {
        secondOptOut = true;
        break;
      }
      if (d?.kind === "order" && d.seat === P1) {
        await game.acceptTriggerOrder();
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(secondOptOut).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("irelia")).toBe("base");
    expect(game.state("irelia")).toMatchObject({ might: 5, mightModifier: 1 });
    // The combat carries on without her: Guard 3 vs Poker 2.
    await game.settle();
    expect(game.zoneOf("poker")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-row");
    expect(game.zoneOf("irelia")).toBe("base");
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("the only way to keep Irelia at the Row is to decline the 'may' up front — then nothing goes on the chain, she is never chosen, and gets no +1", async () => {
    const game = await attack(false);
    expect(game.chain().some((c) => c.cardId === "row")).toBe(false);
    expect(game.locationOf("irelia")).toBe("row");
    expect(game.state("irelia")).toMatchObject({ might: 4, mightModifier: 0 });
    await game.settle();
    expect(game.zoneOf("poker")).toBe("trash");
    expect(game.locationOf("irelia")).toBe("row");
  });
});
