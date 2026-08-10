/**
 * Ruling b037ae6732f6ab99 — Monastery of Hirana (OGN-282 → ogn-282-298) "When you conquer here, you may spend a buff to draw 1."
 *   × Sett, Brawler (OGN-164) "When I'm played and when I conquer, buff me. …"
 *   × Qiyana, Victorious (OGN-155 → ogn-155-298) "When I conquer, draw 1 or channel 1 rune exhausted."
 *   × Sigil of the Storm (OGN-287 → ogn-287-298) "When you conquer here, you must recycle one of your runes."
 *
 * Q: A unit with a Conquer ability conquers a battlefield that also has a Conquer trigger — what order do they resolve in?
 * A: They trigger simultaneously and their controller CHOOSES the order (e.g. Sett's buff before the Monastery's spend-a-buff draw, or
 *    Sigil's recycle before/after Qiyana's channel).
 * Rules: 383.3.c/d (simultaneous triggers controlled by one player are ordered by that player), 340 (LIFO resolution).
 * Model note / RULING-CONFLICT on the Sett example: CR 383.3.a/.b, 204.3.a, 740.4.a.2 make the Monastery's "spend a buff TO draw"
 *    its BASE COST, paid while the trigger is FINALIZED — and both conquer triggers are finalized before either resolves (383.3.d
 *    orders FINALIZED items). So the order P1 picks never lets Sett's fresh conquer buff pay the Monastery (Unleashed-era ruling
 *    202877fb824b2d2b says so explicitly); with no buff on the board the Monastery's item is removed unasked (404.2) and there is
 *    nothing to order. The ordering point itself stands and is exercised with a pre-existing buff (Pal) and with Qiyana × Sigil.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MONASTERY = "ogn-282-298";
const SETT_BRAWLER = "ogn-164-298";
const QIYANA = "ogn-155-298";
const SIGIL = "ogn-287-298";

type OrderDecision = Extract<Decision, { kind: "order" }>;

/** Unbuffed Sett (4) in P1's base (+ optionally a buffed Pal to pay the Monastery with); P2 holds the live Monastery with a 1-Might Sentry. */
function settBoard(withBuffedPal = true) {
  const s = scenario()
    .battlefield("mona", { controller: P2, def: MONASTERY, inert: false, owner: P2 })
    .unit(P2, "mona", { might: 1, name: "Sentry" }, "sentry")
    .unit(P1, "base", SETT_BRAWLER, "sett");
  return withBuffedPal ? s.unit(P1, "base", { might: 2, name: "Pal" }, "pal", { buffed: true }) : s;
}

/** Qiyana (4) in P1's base with NO runes in the pool (12 in the rune deck); P2 holds the live Sigil with a 1-Might Sentry. */
function qiyanaBoard() {
  return scenario()
    .battlefield("sigil", { controller: P2, def: SIGIL, inert: false, owner: P2 })
    .unit(P2, "sigil", { might: 1, name: "Sentry" }, "sentry")
    .unit(P1, "base", QIYANA, "qiyana");
}

/** Conquer with `unit` at `bf`; answer the battlefield's opt-in (if any) YES; stop AT the trigger-order decision and return it. */
async function conquerToOrderPrompt(game: Game, unit: string, bf: string): Promise<OrderDecision> {
  await game.p1.move(unit, bf);
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind === "order") {
      break;
    }
    if (d?.kind === "action" && (d.context === "showdown" || d.context === "chain")) {
      await game.acting().pass();
    } else if (d?.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
    } else if (d?.kind === "pick" && d.seat === P1 && d.semantics === "mode") {
      await game.p1.chooseMode(1); // Qiyana: mode chosen at finalization — "channel 1 rune exhausted"
    } else {
      break;
    }
  }
  expect(game.zoneOf("sentry")).toBe("trash");
  expect(game.p1.points()).toBe(1);
  const d = game.decision();
  expect(d).toMatchObject({ kind: "order", seat: P1 }); // the ruling: P1 is asked to order the simultaneous conquer triggers
  return d as OrderDecision;
}

/** Order so that `topCard`'s trigger is on top (resolves first), then drain the chain answering prompts with `onPrompt`. */
async function orderTopAndResolve(game: Game, d: OrderDecision, topCard: string, onPrompt: (d: Decision) => Promise<boolean> = async () => false): Promise<void> {
  const top = d.items.find((it) => it.card === topCard)?.key as string;
  const rest = d.items.filter((it) => it.card !== topCard).map((it) => it.key);
  await game.p1.order([...rest, top]); // last = top of the chain = resolves first
  for (let i = 0; i < 16; i++) {
    const cur = game.decision();
    if (!cur || (cur.kind === "action" && cur.context === "main")) {
      break;
    }
    if (cur.kind === "action") {
      await game.acting().pass();
    } else if (!(await onPrompt(cur))) {
      break;
    }
  }
  expect(game.chain()).toEqual([]);
}

describe("Ruling b037ae6732f6ab99 — simultaneous Conquer triggers: their controller picks the order", () => {
  test("Sett conquers the Monastery (a buff on Pal pays its cost at finalization): both triggers (Sett's buff, Monastery's draw) are P1's and P1 is asked to ORDER them", async () => {
    const game = await settBoard().build();
    const d = await conquerToOrderPrompt(game, "sett", "mona");
    expect(d.items.map((it) => it.card).sort()).toEqual(["mona", "sett"]);
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["mona", "sett"]);
    expect(game.state("pal").isBuffed).toBe(false); // 383.3.b.1 — the Monastery's cost, already paid
  });

  for (const top of ["sett", "mona"] as const) {
    test(`${top === "sett" ? "Sett's buff FIRST, then the Monastery draws" : "Monastery draws FIRST, then Sett buffs himself"} — either order: P1 +1 card, Sett ends buffed (his fresh buff was never the payment), Pal unbuffed`, async () => {
      const game = await settBoard().build();
      const d = await conquerToOrderPrompt(game, "sett", "mona");
      const handBefore = game.p1.hand().length;
      await orderTopAndResolve(game, d, top, async (p) => {
        if (p.kind === "yes-no") {
          await (p.canAccept === false ? game.p1.no() : game.p1.yes());
          return true;
        }
        return false;
      });
      expect(game.p1.hand()).toHaveLength(handBefore + 1);
      expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
      expect(game.state("pal").isBuffed).toBe(false);
    });
  }

  // RULING-CONFLICT (see header): the ruling's "Sett's buff before the Monastery's spend" example assumes a resolution-time spend.
  test("CR 383.3.b / 404.2 (contra the ruling's Sett example) — with NO buff anywhere the Monastery's trigger never reaches the chain: no opt-in, nothing to order, Sett just buffs himself, no card", async () => {
    const game = await settBoard(false).build();
    await game.p1.move("sett", "mona");
    let sawOrder = false;
    let sawOptIn = false;
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "order") {
        sawOrder = true;
        await game.acceptTriggerOrder();
      } else if (d.kind === "yes-no") {
        sawOptIn = true;
        await game.p1.no();
      } else if (d.kind === "action") {
        await game.acting().pass();
      } else {
        break;
      }
    }
    expect(game.p1.points()).toBe(1);
    expect(sawOptIn).toBe(false);
    expect(sawOrder).toBe(false);
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("Qiyana conquers the Sigil with an empty rune pool: P1 orders; Qiyana's channel FIRST then the Sigil recycles that very rune → 0 runes; the other order leaves the channeled rune → 1 rune", async () => {
    // Order A: Qiyana first.
    const a = await qiyanaBoard().build();
    expect(a.p1.runes()).toEqual([]);
    const da = await conquerToOrderPrompt(a, "qiyana", "sigil");
    expect(da.items.map((it) => it.card).sort()).toEqual(["qiyana", "sigil"]);
    const answerQiyana = (game: Game) => async (p: Decision) => {
      if (p.kind === "pick" && p.seat === P1) {
        await game.p1.answer({ keys: [String(p.options[0]?.key)], kind: "pick" }); // the Sigil's rune, if it asks
        return true;
      }
      if (p.kind === "yes-no") {
        await game.p1.yes();
        return true;
      }
      return false;
    };
    await orderTopAndResolve(a, da, "qiyana", answerQiyana(a));
    expect(a.p1.runes()).toHaveLength(0); // channeled, then recycled by the Sigil

    // Order B: Sigil first.
    const b = await qiyanaBoard().build();
    const db = await conquerToOrderPrompt(b, "qiyana", "sigil");
    await orderTopAndResolve(b, db, "sigil", answerQiyana(b));
    expect(b.p1.runes()).toHaveLength(1); // Sigil found nothing; Qiyana then channeled one (exhausted)
    expect(b.p1.runes({ ready: false })).toHaveLength(1);
  });
});
