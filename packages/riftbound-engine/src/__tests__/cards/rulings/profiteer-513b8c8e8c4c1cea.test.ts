/**
 * Ruling 513b8c8e8c4c1cea — Profiteer (VEN-082 → ven-082-166) · 4 Might · "When you play me, you may disempower something
 *   you control to empower a legend, unit, or gear."
 *   × Tail-Cloaked Matriarch (VEN-104 → ven-104-166) · "[Empower] [2][chaos] … When I become [Empowered], you may choose a
 *   unit in your trash with Energy cost no more than [3] and Power cost no more than [rainbow]. Play it to your base, ignoring its cost."
 *
 * Q: Can Profiteer disempower a card and then empower that SAME card (e.g. Tail-Cloaked Matriarch)?
 * A: Yes — no "another/different" wording, so the same permanent may fill both roles. The Matriarch must already be
 *    Empowered (you can't disempower what isn't); disempower then empower makes her "become Empowered" again, so her
 *    trigger fires and you may play a ≤3-cost unit from trash for free.
 * Rules: 827 (disempower requires Empowered), 441.1 (Empowered state), 355 (same object for two roles absent "another").
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const PROFITEER = "ven-082-166";
const TAIL_CLOAKED_MATRIARCH = "ven-104-166";
const CHEAP = { cardType: "unit", energyCost: 2, might: 2, name: "Cheap Body" } as const;
const BIG = { cardType: "unit", energyCost: 5, might: 5, name: "Big Body" } as const;

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1's turn, exactly [4] for Profiteer. Matriarch in base (Empowered or not per case); trash: a 2-cost and a 5-cost unit. */
function board(matriarchEmpowered: boolean) {
  return scenario()
    .resources(P1, { energy: 4 })
    .unit(P1, "base", TAIL_CLOAKED_MATRIARCH, "tcm", matriarchEmpowered ? { empowered: true } : undefined)
    .trash(P1, CHEAP, "cheap")
    .trash(P1, BIG, "big")
    .hand(P1, PROFITEER, "prof");
}

/** Play Profiteer, accept its opt-in, name the Matriarch for BOTH roles whenever asked; stop at the Matriarch's own opt-in. */
async function profiteerLoopsMatriarch(game: Game): Promise<{ disempoweredFirst: boolean }> {
  await game.p1.play("prof");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "prof" } });
  await game.p1.yes();
  let sawDisempowered = false;
  let disempoweredFirst = false;
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.source?.cardId === "tcm") {
      break;
    }
    if (d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "prof") {
      expect(d.options.map((o) => o.card ?? o.key)).toContain("tcm"); // the same card is a legal choice for each role
      await game.p1.pick("tcm");
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.acting().passPriority();
    } else {
      break;
    }
    if (!game.state("tcm").isEmpowered) {
      sawDisempowered = true;
    } else if (sawDisempowered) {
      disempoweredFirst = true;
    }
  }
  return { disempoweredFirst };
}

describe("Ruling 513b8c8e8c4c1cea — Profiteer may disempower and re-empower the same Tail-Cloaked Matriarch", () => {
  test("Matriarch already Empowered: Profiteer disempowers her FIRST, then empowers her — she 'becomes Empowered' and her own trigger fires (opt-in offered)", async () => {
    const game = await board(true).build();
    expect(game.state("tcm").isEmpowered).toBe(true);
    const { disempoweredFirst } = await profiteerLoopsMatriarch(game);
    expect(disempoweredFirst).toBe(true);
    expect(game.state("tcm").isEmpowered).toBe(true);
    expect(game.zoneOf("prof")).toBe("base");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "tcm" } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tcm", controller: P1, triggered: true })]);
  });

  test("…accepting the Matriarch's trigger: only the ≤[3] unit in trash is offered, and it is played to base for free", async () => {
    const game = await board(true).build();
    await profiteerLoopsMatriarch(game);
    await game.p1.yes();
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        expect(d.options.map((o) => o.card ?? o.key)).toEqual(["cheap"]); // Big Body (5) is not eligible
        await game.p1.pick("cheap");
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.acting().passPriority();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("cheap")).toBe("base");
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.p1.energy()).toBe(0); // 4 for Profiteer; the trash unit cost nothing
    expect(game.state("tcm").isEmpowered).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("Matriarch NOT already Empowered: there is nothing to disempower, so Profiteer's ability can't get going — she stays un-Empowered and nothing leaves the trash", async () => {
    const game = await board(false).build();
    await game.p1.play("prof");
    const d = game.decision();
    if (d?.kind === "yes-no" && d.source?.cardId === "prof") {
      // If asked at all, "yes" must not be a payable answer.
      expect(d.canAccept).toBe(false);
      await game.p1.no();
    }
    await game.settle();
    expect(game.zoneOf("prof")).toBe("base");
    expect(game.state("tcm").isEmpowered).toBe(false);
    expect(game.zoneOf("cheap")).toBe("trash");
    expect(game.chain()).toEqual([]);
  });
});
