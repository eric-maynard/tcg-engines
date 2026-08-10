/**
 * Ruling 0fe2856182397693 — Wildclaw Shaman (OGN-147 → ogn-147-298) · 4 · 3 Might
 *   "When you play me, you may spend a buff to buff me and ready me."
 *   × Cithria of Cloudfield (ogn-139-298; VEN-089 is a reprint) · 1 Might · "When you play another unit, buff me."
 *
 * Q: Cithria is already buffed; I play Wildclaw Shaman and spend Cithria's buff for its ability. Can Cithria
 *    then be buffed again by her own trigger?
 * A: Yes. Playing the Shaman triggers Cithria (a new unit entered play) even though her buff is spent on the
 *    Shaman; her trigger then buffs her again. Nuance: the two triggers are simultaneous, so you order them —
 *    with an UNBUFFED Cithria you could resolve her buff first and then spend that buff to ready the Shaman.
 * Rules: 383.3.d (controller orders simultaneous triggers), 383.3.a/b (opt-in + spend cost), 702.2 (buffs).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WILDCLAW_SHAMAN = "ogn-147-298";
const CITHRIA = "ogn-139-298";

function board(cithriaBuffed: boolean) {
  return scenario()
    .resources(P1, { energy: 4 })
    .unit(P1, "base", CITHRIA, "cithria", cithriaBuffed ? { buffed: true } : undefined)
    .unit(P2, "base", { might: 2, name: "Bystander" }, "foe")
    .hand(P1, WILDCLAW_SHAMAN, "shaman");
}

/**
 * Drive the post-play chain: accept the Shaman's opt-in, put `onTop` on top if an order is offered, pass
 * priority otherwise. Returns whether P1 was asked the opt-in and whether an order was offered.
 */
async function drive(game: Game, onTop: "shaman" | "cithria"): Promise<{ optIn: boolean; ordered: boolean }> {
  const seen = { optIn: false, ordered: false };
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "yes-no" && d.seat === P1) {
      seen.optIn = true;
      await game.p1.yes();
    } else if (d.kind === "order" && d.seat === P1) {
      seen.ordered = true;
      const key = (c: string) => d.items.find((it) => it.card === c)?.key as string;
      const bottom = onTop === "shaman" ? "cithria" : "shaman";
      await game.p1.order([key(bottom), key(onTop)]); // last = top = resolves first
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "pick" && d.options.length === 1) {
      await game.seat(d.seat).pick(d.options[0]?.key as string);
    } else {
      break;
    }
  }
  return seen;
}

describe("Ruling 0fe2856182397693 — Wildclaw Shaman spending Cithria's buff; Cithria's own play trigger buffs her again", () => {
  test("playing the Shaman with a buffed Cithria: P1 is asked the Shaman's 'you may spend a buff' opt-in and Cithria's trigger is on the chain too", async () => {
    const game = await board(true).build();
    expect(game.state("cithria")).toMatchObject({ isBuffed: true, might: 2 });
    await game.p1.play("shaman");
    expect(game.p1.energy()).toBe(0);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "shaman" } });
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["cithria", "shaman"]);
    expect(game.chain().every((c) => c.triggered)).toBe(true);
  });

  // Expected: Shaman's ability spends Cithria's buff (Shaman → buffed 4 Might and READY), and Cithria's "when
  // you play another unit" trigger then buffs her again → she ends buffed at 2. (Either because the spend is the
  // trigger's base cost paid at finalization, 383.3.b, or because P1 orders the Shaman trigger to resolve first.)
  // Actual: the engine stacks Cithria's trigger on top with no order offered and only spends the buff when the
  // Shaman trigger resolves — Cithria's trigger resolves first as a no-op (already buffed), then her buff is
  // spent: she ends UNBUFFED at 1.
  test("ruling 0fe2856182397693 — after spending her buff on the Shaman, Cithria is buffed again by her own trigger (ends buffed, 2 Might; Shaman 4 & ready); engine leaves her unbuffed", async () => {
    const game = await board(true).build();
    await game.p1.play("shaman");
    const seen = await drive(game, "shaman");
    expect(seen.optIn).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.state("shaman")).toMatchObject({ isBuffed: true, isReady: true, might: 4 });
    expect(game.state("cithria")).toMatchObject({ isBuffed: true, might: 2 });
  });

  // Expected (nuance): with an UNBUFFED Cithria both triggers still fire simultaneously; P1 orders Cithria's on
  // top → she is buffed → the Shaman's trigger then spends that buff → Shaman buffed + ready, Cithria back to 1.
  // Actual: with no buff on the board at trigger time the Shaman's ability is never put on the chain / offered,
  // and no order decision exists — Shaman stays exhausted and unbuffed, Cithria keeps her new buff.
  test("ruling 0fe2856182397693 (nuance) — unbuffed Cithria: order her trigger first, then spend that fresh buff to buff+ready the Shaman; engine never offers the Shaman's ability", async () => {
    const game = await board(false).build();
    expect(game.state("cithria").isBuffed).toBe(false);
    await game.p1.play("shaman");
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["cithria", "shaman"]);
    const seen = await drive(game, "cithria");
    expect(seen.ordered).toBe(true); // P1 chose the order (383.3.d)
    expect(game.chain()).toEqual([]);
    expect(game.state("shaman")).toMatchObject({ isBuffed: true, isReady: true, might: 4 });
    expect(game.state("cithria")).toMatchObject({ isBuffed: false, might: 1 });
  });

  test("baseline the ruling relies on — playing ANY unit triggers Cithria: with the Shaman's opt-in declined, Cithria (unbuffed) simply gets buffed and the Shaman enters exhausted, unbuffed", async () => {
    const game = await board(false).build();
    await game.p1.play("shaman");
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no") {
        await game.p1.no();
      } else if (d?.kind === "action" && d.context === "chain" && d.passKey) {
        await game.seat(d.seat).pass();
      } else if (d?.kind === "order") {
        await game.acceptTriggerOrder();
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("cithria")).toMatchObject({ isBuffed: true, might: 2 });
    expect(game.state("shaman")).toMatchObject({ isBuffed: false, isExhausted: true, might: 3, zone: "base" });
  });
});
