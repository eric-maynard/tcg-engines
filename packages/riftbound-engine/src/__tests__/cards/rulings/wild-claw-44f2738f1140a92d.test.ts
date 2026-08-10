/**
 * Ruling 44f2738f1140a92d — filed under Wild Claw (VEN-089) but about Wildclaw Shaman (OGN-147 → ogn-147-298) · Unit ·
 *   Body · 4 · 3 Might "When you play me, you may spend a buff to buff me and ready me."
 *   × Cithria of Cloudfield (OGN-139 → ogn-139-298) · 1 Might "When you play another unit, buff me."
 *
 * Q: Do Wildclaw Shaman and Cithria combo — can you order Cithria's trigger first and spend her fresh buff to ready the
 *    Shaman?
 * A (riftjudge): yes — both trigger at once, stack Cithria's to resolve first, then spend her buff for the Shaman.
 * Rules: 383.3.b + 204.3.a (a cost right after a leading "you may" is the trigger's BASE COST, paid at FINALIZATION),
 *        402/404.2 (unpayable ⇒ the item is removed), 383.3.d (same-controller simultaneous triggers: you order them).
 * RULING-CONFLICT: riftjudge 44f2738f1140a92d assumes the buff is spent at RESOLUTION (after Cithria's item resolved);
 *    CR 383.3.b/204.3.a make "spend a buff" the Shaman item's base cost paid while the batch is FINALIZED — before any
 *    item (Cithria's included) can resolve — so a buff that only appears afterwards can't pay it (FIXER-PRIMER §2, the
 *    Monastery/Wildclaw line). Engine follows CR. The combo does work when a buff already exists at finalization.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const WILDCLAW_SHAMAN = "ogn-147-298";
const CITHRIA = "ogn-139-298";

/** P1's turn with the Shaman's 4 energy; Cithria in base (optionally already carrying a buff); Shaman in hand. */
function board(cithriaBuffed: boolean) {
  return scenario()
    .resources(P1, { energy: 4 })
    .unit(P1, "base", CITHRIA, "cithria", cithriaBuffed ? { buffed: true } : undefined)
    .hand(P1, WILDCLAW_SHAMAN, "shaman");
}

/** Drive to the open main phase, accepting any payable Shaman prompt and the default trigger order; records what was seen. */
async function drive(game: Game): Promise<{ shamanAsked: boolean; orderOffered: boolean }> {
  let shamanAsked = false;
  let orderOffered = false;
  for (let i = 0; i < 20; i++) {
    const d: Decision | null = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "yes-no" && d.source?.cardId === "shaman") {
      shamanAsked = true;
      await (d.canAccept === false ? game.p1.no() : game.p1.yes());
    } else if (d.kind === "order" && d.seat === P1) {
      orderOffered = true;
      await game.acceptTriggerOrder();
    } else if (d.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options[0]!.card ?? d.options[0]!.key);
    } else if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  return { orderOffered, shamanAsked };
}

describe("Ruling 44f2738f1140a92d — Wildclaw Shaman × Cithria of Cloudfield", () => {
  test("playing the Shaman triggers BOTH abilities at once: Cithria's 'you played another unit' item is on the chain immediately (the Shaman entered exhausted, unbuffed)", async () => {
    const game = await board(false).build();
    await game.p1.play("shaman");
    expect(game.zoneOf("shaman")).toBe("base");
    expect(game.state("shaman")).toMatchObject({ isBuffed: false, isExhausted: true });
    expect(game.chain()).toContainEqual(expect.objectContaining({ cardId: "cithria", controller: P1, triggered: true }));
  });

  // RULING-CONFLICT: riftjudge 44f2738f1140a92d says order Cithria first and spend her new buff when the Shaman's ability
  // resolves; CR 383.3.b / 204.3.a say "spend a buff" is paid at FINALIZATION, when no buff exists yet — engine follows CR.
  test("CR 383.3.b (contra ruling): with no buff on the board when the batch is finalized, the Shaman's 'spend a buff' cost is unpayable — its item is dropped without a usable prompt; Cithria's resolves and buffs HER; the Shaman ends exhausted and unbuffed", async () => {
    const game = await board(false).build();
    await game.p1.play("shaman");
    const seen = await drive(game);
    expect(seen.shamanAsked).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.state("cithria")).toMatchObject({ isBuffed: true, might: 2 });
    expect(game.state("shaman")).toMatchObject({ isBuffed: false, isExhausted: true, might: 3 });
    expect(game.violations()).toEqual([]);
  });

  test("the combo DOES work when a buff already exists at finalization (Cithria buffed earlier): P1 accepts, Cithria's buff is spent right then (FIN), P1 is offered the 383.3.d order of the two items, and on resolution the Shaman is buffed AND readied while Cithria's own trigger re-buffs her", async () => {
    const game = await board(true).build();
    expect(game.state("cithria")).toMatchObject({ isBuffed: true, might: 2 });
    await game.p1.play("shaman");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "shaman" }, timing: "FIN" });
    await game.p1.yes();
    expect(game.state("cithria").isBuffed).toBe(false); // paid at finalization
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["cithria", "shaman"]);
    expect(game.decision()).toMatchObject({ defaultable: true, kind: "order", seat: P1, timing: "FIN" });
    const seen = await drive(game);
    expect(seen.orderOffered).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.state("shaman")).toMatchObject({ isBuffed: true, isExhausted: false, might: 4 });
    expect(game.state("cithria")).toMatchObject({ isBuffed: true, might: 2 });
    expect(game.violations()).toEqual([]);
  });
});
