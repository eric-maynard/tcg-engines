/**
 * Ruling 1e8583a2a2998ef5 — Sett, Brawler (OGN-164 → ogn-164-298) · Champion · Body · 4 Might
 *     "When I'm played and when I conquer, buff me. Spend my buff: Give me +4 [Might] this turn."
 *   × Monastery of Hirana (OGN-282 → ogn-282-298) · Battlefield · "When you conquer here, you may spend a buff to draw 1."
 *
 * Q: Sett conquers the Monastery — may I order the triggers so Sett buffs himself first and the Monastery then spends
 *    that very buff to draw?
 * A: Yes. Both "when … conquer" triggers fire together; their controller orders them: Monastery as link 1, Sett as
 *    link 2 → Sett resolves first (buff), Monastery second (spend it, draw 1). The Monastery needs no buff on the board
 *    to be put on the chain — it is a "may" whose cost is paid at resolution, with no target and no mandatory cost.
 * Rules: 383.3.d (controller orders simultaneous triggers), 336–340 (LIFO), 404 (optional costs paid on resolution),
 *        702 (Buff), 467 (Conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SETT = "ogn-164-298";
const MONASTERY = "ogn-282-298";

type OrderD = Extract<Decision, { kind: "order" }>;

/** P1's turn. P2 holds the (live) Monastery with Weak (1). Unbuffed Sett (4) in P1's base; optionally a buffed Pal in base too. */
function board(withBuffedPal: boolean) {
  const s = scenario()
    .battlefield("mon", { controller: P2, def: MONASTERY, inert: false })
    .unit(P2, "mon", { might: 1, name: "Weak" }, "weak")
    .unit(P1, "base", SETT, "sett");
  return withBuffedPal ? s.unit(P1, "base", { might: 2, name: "Pal" }, "pal", { buffed: true }) : s;
}

/** Sett attacks the Monastery; both pass focus; combat 4 into 1 → Sett conquers. Answers the Monastery's opt-in "yes" if asked early. Stops at the trigger-order offer (or whatever comes instead). */
async function settConquers(game: Game): Promise<void> {
  await game.p1.move("sett", "mon");
  await game.p1.passFocus();
  await game.p2.passFocus();
  for (let i = 0; i < 3; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
    } else if (d?.kind === "distribute") {
      await game.seat(d.seat).distribute({ ...(d.defaultAllocation ?? {}) });
    } else {
      break;
    }
  }
  expect(game.zoneOf("weak")).toBe("trash");
  expect(game.gameState.battlefields.mon?.controller).toBe(P1);
}

const key = (d: OrderD, card: string) => d.items.find((i) => i.card === card)?.key as string;

async function passBoth(game: Game): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    await game.seat(d!.seat).passPriority();
  }
}

/** At the Monastery's resolution: accept / name Sett's buff if the engine asks. */
async function spendSettsBuffIfAsked(game: Game): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const p = game.decision();
    if (p?.kind === "yes-no" && p.seat === P1) {
      await game.p1.yes();
    } else if (p?.kind === "pick" && p.seat === P1) {
      await game.p1.pick("sett");
    } else {
      break;
    }
  }
}

describe("Ruling 1e8583a2a2998ef5 — order Sett's conquer-buff under the Monastery so the Monastery can spend it", () => {
  // With NO buff anywhere, conquering still puts BOTH triggers on the chain and offers P1 their order;
  // Sett on top → buff; the Monastery then spends that buff on resolution → draw 1.
  test("ruling 1e8583a2a2998ef5 — the Monastery's trigger goes on the chain with no buff yet and spends the buff Sett gains first", async () => {
    const game = await board(false).build();
    const hand = game.p1.hand().length;
    await settConquers(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    const od = d as OrderD;
    expect(od.items.map((i) => i.card).sort()).toEqual(["mon", "sett"]);
    await game.p1.order([key(od, "mon"), key(od, "sett")]); // Monastery = link 1 (bottom), Sett = link 2 (top)
    expect(game.chain().map((c) => c.cardId)).toEqual(["mon", "sett"]);
    await passBoth(game); // Sett resolves: buff me
    expect(game.state("sett").isBuffed).toBe(true);
    expect(game.chain().map((c) => c.cardId)).toEqual(["mon"]);
    await passBoth(game); // Monastery resolves: spend a buff → draw 1
    await spendSettsBuffIfAsked(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("sett").isBuffed).toBe(false);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.p1.points()).toBe(1);
  });

  test("mechanism (a buff already exists on Pal, so the engine does raise the Monastery trigger): both conquer triggers hit the chain together and P1 is offered their ORDER; Monastery link 1 / Sett link 2 → Sett resolves first (buffed while the Monastery is still pending), then the Monastery resolves and P1 draws 1", async () => {
    const game = await board(true).build();
    const hand = game.p1.hand().length;
    await settConquers(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    const od = d as OrderD;
    expect(od.items.map((i) => i.card).sort()).toEqual(["mon", "sett"]);
    await game.p1.order([key(od, "mon"), key(od, "sett")]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["mon", "sett"]);
    await passBoth(game);
    expect(game.state("sett").isBuffed).toBe(true); // Sett resolved first
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.chain().map((c) => c.cardId)).toEqual(["mon"]);
    await passBoth(game);
    await spendSettsBuffIfAsked(game);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  // rule 404: the Monastery's "spend a buff" is a cost paid when its chain item RESOLVES — so with Sett ordered on
  // top, Pal's pre-existing buff is untouched while Sett resolves, and at the Monastery's resolution P1 may spend
  // SETT's fresh buff (Sett ends unbuffed, Pal keeps its buff, P1 drew 1).
  test("ruling 1e8583a2a2998ef5 — the Monastery's buff is paid on resolution, so Sett's own new buff can be the one spent", async () => {
    const game = await board(true).build();
    const hand = game.p1.hand().length;
    await settConquers(game);
    const od = game.decision() as OrderD;
    expect(od.kind).toBe("order");
    expect(game.state("pal").isBuffed).toBe(true); // nothing paid yet — the item is merely pending
    await game.p1.order([key(od, "mon"), key(od, "sett")]);
    await passBoth(game); // Sett: buff me
    expect(game.state("sett").isBuffed).toBe(true);
    expect(game.state("pal").isBuffed).toBe(true);
    await passBoth(game); // Monastery: NOW spend a buff — P1 names Sett's
    await spendSettsBuffIfAsked(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("sett").isBuffed).toBe(false);
    expect(game.state("pal").isBuffed).toBe(true);
    expect(game.p1.hand()).toHaveLength(hand + 1);
  });

  test("the order matters: Sett link 1 / Monastery link 2 → the Monastery resolves FIRST, before Sett has any buff of his own; Sett buffs afterwards and still has that buff at the end", async () => {
    const game = await board(true).build();
    const hand = game.p1.hand().length;
    await settConquers(game);
    const od = game.decision() as OrderD;
    expect(od.kind).toBe("order");
    await game.p1.order([key(od, "sett"), key(od, "mon")]); // Monastery on top
    expect(game.chain().map((c) => c.cardId)).toEqual(["sett", "mon"]);
    await passBoth(game); // Monastery resolves — Sett is unbuffed, so only Pal's buff can pay
    for (let i = 0; i < 3; i++) {
      const p = game.decision();
      if (p?.kind === "yes-no" && p.seat === P1) {
        await game.p1.yes();
      } else if (p?.kind === "pick" && p.seat === P1) {
        expect(p.options.map((o) => o.card ?? o.key)).toEqual(["pal"]);
        await game.p1.pick("pal");
      } else {
        break;
      }
    }
    expect(game.state("pal").isBuffed).toBe(false);
    expect(game.state("sett").isBuffed).toBe(false);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    await passBoth(game); // Sett resolves: buff me
    expect(game.chain()).toEqual([]);
    expect(game.state("sett").isBuffed).toBe(true);
  });
});
