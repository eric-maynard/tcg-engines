/**
 * Ruling 9f85db293c00290e — Consult the Past (OGN-083 → ogn-083-298) [Hidden][Reaction] · [4] "Draw 2."
 *   × Virtuoso (UNL-181 → unl-181-219, Jhin Legend) "When you play a spell, if you spent [4] or more, you may banish it. …"
 *   × Applied Researchers (VEN-055 → ven-055-166) "[Empowered][>] Your spells cost [1][rainbow] less, to a minimum of [1]."
 *
 * Q: With an empowered Applied Researchers out I play Consult the Past for 3 instead of 4 — does Virtuoso still banish it?
 * A: No. Virtuoso checks the energy actually SPENT, not the printed cost; 3 < 4, so the trigger's condition fails and no
 *    banish is offered. Paying the full 4 (no discount) does qualify.
 * Rules: 382 (triggered ability with an intervening "if" condition), 356 (costs actually paid), 828 (Empowered).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CONSULT_THE_PAST = "ogn-083-298";
const VIRTUOSO = "unl-181-219";
const APPLIED_RESEARCHERS = "ven-055-166";

/** P1's turn: Virtuoso legend, exactly 4 energy, Consult the Past in hand; optionally an EMPOWERED Applied Researchers in base. */
function board(withResearchers: boolean) {
  const s = scenario()
    .legend(P1, VIRTUOSO, "virtuoso")
    .resources(P1, { energy: 4 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .hand(P1, CONSULT_THE_PAST, "consult");
  return withResearchers ? s.unit(P1, "base", APPLIED_RESEARCHERS, "ar", { empowered: true }) : s;
}

/** Resolve everything, answering YES to any Virtuoso opt-in; report whether one was offered. */
async function resolveWatchingVirtuoso(game: Game): Promise<boolean> {
  let offered = false;
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      expect(d.source?.cardId).toBe("virtuoso");
      offered = true;
      await game.p1.yes();
      continue;
    }
    if (d?.kind === "action" && d.context === "chain") {
      await game.acting().passPriority();
      continue;
    }
    break;
  }
  await game.settle();
  return offered;
}

describe("Ruling 9f85db293c00290e — Virtuoso counts energy SPENT: a Consult the Past discounted to 3 is not banished", () => {
  test("premise: the empowered Researchers discount Consult the Past (printed 4) to 3 — P1 keeps 1 of its 4 energy", async () => {
    const game = await board(true).build();
    expect(game.state("ar").isEmpowered).toBe(true);
    expect(game.state("consult").energyCost).toBe(4);
    await game.p1.cast("consult");
    expect(game.p1.energy()).toBe(1); // spent 3
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "consult", controller: P1 })]);
  });

  test("spent 3 → the spell resolves (draw 2) but Virtuoso's 'if you spent [4] or more' fails: no banish offer, Consult the Past goes to the trash", async () => {
    const game = await board(true).build();
    const deckBefore = game.p1.deck().length;
    await game.p1.cast("consult");
    const offered = await resolveWatchingVirtuoso(game);
    expect(offered).toBe(false);
    expect(game.zoneOf("consult")).toBe("trash");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(2); // drew 2
    expect(game.p1.deck()).toHaveLength(deckBefore - 2);
    expect(game.p1.energy()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("control: without the discount P1 spends the full 4 → Virtuoso offers 'you may banish it'; accepting banishes Consult the Past", async () => {
    const game = await board(false).build();
    await game.p1.cast("consult");
    expect(game.p1.energy()).toBe(0); // spent 4
    const offered = await resolveWatchingVirtuoso(game);
    expect(offered).toBe(true);
    expect(game.zoneOf("consult")).toBe("banishment");
    expect(game.p1.hand()).toHaveLength(2);
  });
});
