/**
 * Ruling 2bb881bbde4dece5 — Virtuoso (UNL-181 → unl-181-219) · Legend (Jhin)
 *   "When you play a spell, if you spent [4] or more, you may banish it. Then, if there are four spells banished with me, …"
 *   × Wind Wall (OGN-064 → ogn-064-298) [Reaction] counter a spell · × Irelia, Fervent (SFD-057 → sfd-057-221) "When you
 *   choose or ready me, give me +1 [Might] this turn." (the "when you choose" contrast the answer draws).
 *
 * Q: Does Virtuoso trigger when a 4-cost spell gets countered?
 * A: No. A countered spell is removed from the chain before resolving and is not considered "played" for play triggers,
 *    so "When you play a spell" never fires. By contrast "when you choose/target" abilities trigger when the spell is
 *    finalized on the chain, so they have already happened even if the spell is later countered.
 * Rules: 419.4.a / 419.4.a.1 (play triggers fire on resolution; countered ⇒ no trigger), 425.1.a–b (countered card does
 *        nothing, goes to trash, not "played" for triggers), 425.1.c (no refund), 419.4.b (Finalized plays still count for
 *        non-triggered checks such as Legion).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VIRTUOSO = "unl-181-219";
const WIND_WALL = "ogn-064-298"; // [Reaction] [3][calm][calm]: counter a spell
const IRELIA_FERVENT = "sfd-057-221";

/** Inline [4] Mind spell "Draw 1." — no targets, so only the play trigger is in question. */
const STUDY_4 = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 4,
  name: "Study 4",
  powerCost: [],
  rulesText: "Draw 1.",
  timing: "action",
} as const;

/** Inline [4] Body spell "Give a unit +2 [Might] this turn." — it CHOOSES a unit (for the Irelia contrast). */
const RALLY_4 = {
  abilities: [{ effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 4,
  name: "Rally 4",
  powerCost: [],
  rulesText: "Give a unit +2 [Might] this turn.",
  timing: "action",
} as const;

function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .resources(P2, { energy: 3, power: { calm: 2 } })
    .legend(P1, VIRTUOSO, "jhin")
    .unit(P1, "base", { might: 2, name: "Stagehand" }, "stagehand")
    .unit(P2, "base", { might: 2, name: "Heckler" }, "heckler")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"])
    .hand(P2, WIND_WALL, "ww");
}

/** P1 casts `spell` (spending exactly [4]); P1 passes; P2 answers with Wind Wall on it. */
async function castAndCounter(game: Game, spell: string, opts: Parameters<Game["p1"]["cast"]>[1] = {}): Promise<void> {
  await game.p1.cast(spell, opts);
  expect(game.p1.energy()).toBe(0); // spent [4] — Virtuoso's threshold is met IF the spell counts as played
  // Any "when you choose me" trigger (Irelia) is finalized right here, before priority; drain P1's side to P2's window.
  for (let i = 0; i < 6 && game.actingSeat() === P1; i++) {
    await game.p1.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.cast("ww", { targets: spell });
  expect(game.chain().map((c) => c.cardId)).toContain("ww");
}

describe("Ruling 2bb881bbde4dece5 — a countered [4] spell was never 'played': Virtuoso does not trigger", () => {
  test("control: the same [4] spell left alone resolves (P1 draws) and THEN Virtuoso's 'you may banish it' is asked", async () => {
    const game = await board().hand(P1, STUDY_4, "s4").build();
    await game.p1.cast("s4");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("s4")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jhin", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("s4")).toBe("banishment");
  });

  test("countered by Wind Wall: the spell leaves the chain unresolved (no draw), lands in P1's trash, costs are not refunded — and Virtuoso raises NO trigger: no chain item, no yes/no, nothing banished", async () => {
    const game = await board().hand(P1, STUDY_4, "s4").build();
    await castAndCounter(game, "s4");
    let virtuosoAsked = false;
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (game.chain().some((c) => c.cardId === "jhin") || (d.kind === "yes-no" && d.seat === P1)) {
        virtuosoAsked = true;
      }
      if (d.kind === "action") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(virtuosoAsked).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("s4")).toBe("trash"); // 425.1.a.1
    expect(game.p1.hand()).toEqual([]); // never resolved: no draw
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.energy()).toBe(0); // 425.1.c — no refund
    expect(game.violations()).toEqual([]);
  });

  test("419.4.b — the countered spell WAS finalized, so non-triggered 'have you played a card' checks (Legion) still see it: P1's played-cards tally stays at 1", async () => {
    const game = await board().hand(P1, STUDY_4, "s4").build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    await castAndCounter(game, "s4");
    await game.settle();
    expect(game.zoneOf("s4")).toBe("trash");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
  });

  test("contrast — 'when you choose me' (Irelia, Fervent) fires when the spell is FINALIZED: Irelia already has +1 Might by the time Wind Wall counters the Rally, and keeps it; the Rally's own +2 never lands; Virtuoso still silent", async () => {
    const game = await board().unit(P1, "base", IRELIA_FERVENT, "irelia").hand(P1, RALLY_4, "rally").build();
    expect(game.state("irelia").might).toBe(4);
    await game.p1.cast("rally", { targets: "irelia" });
    // Irelia's choose-trigger is on the chain above the Rally (or already resolved) before P2 can counter anything.
    for (let i = 0; i < 6 && game.actingSeat() === P1; i++) {
      await game.p1.passPriority();
    }
    // Let Irelia's trigger resolve if P2 must pass for it first, but counter the Rally as soon as it is the top spell.
    for (let i = 0; i < 6; i++) {
      const top = game.chain().at(-1);
      if (top?.cardId === "rally") {
        break;
      }
      await game.acting().passPriority();
    }
    expect(game.state("irelia").might).toBe(5); // +1 from being chosen — happened at finalization
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("ww", { targets: "rally" });
    await game.settle();
    expect(game.zoneOf("rally")).toBe("trash");
    expect(game.state("irelia").might).toBe(5); // kept the choose bonus; the countered Rally's +2 never applied
    expect(game.chain()).toEqual([]);
    expect(game.p1.banishment()).toEqual([]); // Virtuoso never triggered on the countered Rally
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
