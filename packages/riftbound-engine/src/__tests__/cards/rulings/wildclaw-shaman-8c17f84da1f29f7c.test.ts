/**
 * Ruling 8c17f84da1f29f7c — Wildclaw Shaman (OGN-147 → ogn-147-298, 4, 3 Might: "When you play me, you may spend a buff
 *   to buff me and ready me.") × Cithria of Cloudfield (ogn-139-298: "When you play another unit, buff me.")
 *   (the ruling also cites ven-089/ogn-224 Salvage as the pre-errata "targets on the chain" contrast.)
 *
 * Q: Shaman is played with only an UNBUFFED Cithria on board. Does Shaman's trigger need a buff to exist when it goes
 *    on the chain, or only when it resolves?
 * A (riftjudge, pre-Unleashed): Only on resolution — it does not target. Both triggers go on the chain together; order them
 *    so Cithria's resolves first (she gets a buff), then Shaman's resolves and spends that buff.
 *
 * RULING-CONFLICT: riftjudge 8c17f84da1f29f7c treats "spend a buff" as a resolution-time instruction. CR 383.3.a (the leading
 * "you may" is decided during FINALIZATION), 383.3.b / 204.3.a / 740.4.a.2 ("[spend a buff] TO [buff me and ready me]" right
 * after that "you may" is a cost within instructions = the trigger's BASE COST, "paid on finalization … in order to place the
 * triggered ability on the chain") and 383.3.b.1 / 404.2 (unpayable ⇒ the Pending item is removed, never a chain item) say the
 * buff must exist — on a unit you control (745.2) — when the item is FINALIZED; both play triggers are finalized as one batch
 * (383.3.d orders finalized items), i.e. before Cithria's resolves. Unleashed-era ruling 202877fb824b2d2b (Sett × Monastery,
 * same shape) agrees with the CR. It is true that nothing is TARGETED (the buffed unit is a named cost object, 355.10.c.1).
 * Engine follows the CR; the facets below encode the CR line and the part of the ruling that stands (no target).
 * Rules: 383.3.a/b/d, 404.2, 355.10 (resolution instructions vs targets), 702/745 (buffs, spending).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const WILDCLAW_SHAMAN = "ogn-147-298";
const CITHRIA = "ogn-139-298";

function board(extraBuffedPal = false) {
  const s = scenario().resources(P1, { energy: 4 }).unit(P1, "base", CITHRIA, "cithria").hand(P1, WILDCLAW_SHAMAN, "shaman");
  return extraBuffedPal ? s.unit(P1, "base", { might: 2, name: "Pal" }, "pal", { buffed: true }) : s;
}

async function drain(game: Game): Promise<{ optIn: boolean; ordered: boolean }> {
  const seen = { optIn: false, ordered: false };
  for (let i = 0; i < 12; i++) {
    const d: Decision | null = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "yes-no") {
      seen.optIn = true;
      await game.seat(d.seat).yes();
    } else if (d.kind === "order") {
      seen.ordered = true;
      const cith = d.items.find((it) => it.card === "cithria")?.key as string;
      const rest = d.items.filter((it) => it.card !== "cithria").map((it) => it.key);
      await game.p1.order([...rest, cith]); // Cithria on top → resolves first (the ruling's line)
    } else if (d.kind === "pick") {
      await game.seat(d.seat).pick(d.options[0]?.key as string);
    } else if (d.kind === "action") {
      await game.acting().passPriority();
    } else {
      break;
    }
  }
  return seen;
}

describe("Ruling 8c17f84da1f29f7c (RULING-CONFLICT → CR 383.3.b) — the Shaman's 'spend a buff' is due at FINALIZATION; an unbuffed board cannot pay it", () => {
  test("CR 383.3.b.1 / 404.2 (contra the ruling) — Shaman played with only an UNBUFFED Cithria: the Shaman's item is removed unasked (no opt-in), only Cithria's trigger reaches the chain, so there is nothing to order", async () => {
    const game = await board().build();
    expect(game.state("cithria").isBuffed).toBe(false);
    await game.p1.play("shaman");
    expect(game.decision()?.kind).not.toBe("yes-no");
    await game.acceptTriggerOrder();
    expect(game.chain().map((c) => c.cardId)).toEqual(["cithria"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("CR line played out — Cithria resolves and is buffed; the Shaman never spends it: Cithria ends buffed (2 Might), Shaman exhausted, unbuffed 3", async () => {
    const game = await board().build();
    await game.p1.play("shaman");
    const seen = await drain(game);
    expect(seen).toEqual({ optIn: false, ordered: false });
    expect(game.chain()).toEqual([]);
    expect(game.state("cithria")).toMatchObject({ isBuffed: true, might: 2 });
    expect(game.state("shaman")).toMatchObject({ isBuffed: false, isExhausted: true, might: 3 });
    expect(game.violations()).toEqual([]);
  });

  // What the ruling gets right: nothing is TARGETED. With a buff that exists (Pal's) the opt-in is asked at finalization, the
  // lone payable buff is named as a cost object and spent at once (Cithria — unbuffed — is not even a candidate), and P1 then
  // orders its two finalized items; Cithria on top resolves first and gets her own buff, the Shaman then buffs + readies itself.
  test("355.10.c.1 / 383.3.b — with a buffed Pal: opt-in (FIN) spends PAL's buff immediately (no target chosen), P1 orders the two items, Cithria's resolves first (buffed) and the Shaman's then buffs + readies it; Cithria KEEPS her buff", async () => {
    const game = await board(true).build();
    await game.p1.play("shaman");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "shaman", pendingChoiceType: "opt-in" }, timing: "FIN" });
    await game.p1.yes();
    expect(game.state("pal").isBuffed).toBe(false); // paid now — the only buff you controlled
    expect(game.chain().find((c) => c.cardId === "shaman")?.targets).toBeUndefined(); // a cost object, not a target
    const seen = await drain(game);
    expect(seen.ordered).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.state("cithria")).toMatchObject({ isBuffed: true, might: 2 });
    expect(game.state("shaman")).toMatchObject({ isBuffed: true, isReady: true, might: 4 });
    expect(game.state("pal").isBuffed).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
