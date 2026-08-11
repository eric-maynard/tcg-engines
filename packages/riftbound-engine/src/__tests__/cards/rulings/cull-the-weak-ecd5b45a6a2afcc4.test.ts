/**
 * Ruling ecd5b45a6a2afcc4 — Cull the Weak (OGN-209 → ogn-209-298) · Spell · Order · 2+[order] · "Each player kills one of their units."
 *   × Immortal Phoenix (ogn-037-298) 3 Might "[Assault 2] … When you kill a unit with a spell, you may pay [1][fury] to play me from your trash."
 *   (× Cull sfd-134-221 — same-name equipment, not involved.)
 *
 * Q: My OPPONENT plays Cull the Weak and I kill one of my units to it — can I bring back Immortal Phoenix from my trash?
 * A: No. "When you kill a unit with a spell" needs YOUR spell to do the killing; choosing which of your units dies to the
 *    opponent's Cull the Weak is not you killing a unit with a spell.
 * Rules: 428 (kill; the killer is the source's controller), Immortal Phoenix's trigger condition, 383.3.b (its [1][fury] is
 *        paid as the trigger is finalized).
 */
import { describe, expect, test } from "bun:test";
import type { Game, Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";
const IMMORTAL_PHOENIX = "ogn-037-298";

/**
 * `caster`'s turn holding Cull the Weak with 2+[order]. P1 always has Immortal Phoenix in the trash and a spare [1][fury]
 * to pay for it; each player has exactly one small unit in base (so "one of their units" needs no pick).
 */
function board(caster: Seat) {
  return scenario()
    .turn(3)
    .active(caster)
    .resources(P2, caster === P2 ? { energy: 2, power: { order: 1 } } : {})
    .resources(P1, caster === P1 ? { energy: 3, power: { fury: 1, order: 1 } } : { energy: 1, power: { fury: 1 } })
    .unit(P1, "base", { might: 2, name: "P1 Pawn" }, "pawn1")
    .unit(P2, "base", { might: 2, name: "P2 Pawn" }, "pawn2")
    .trash(P1, IMMORTAL_PHOENIX, "phoenix")
    .hand(caster, CULL_THE_WEAK, "cull");
}

/** Cast Cull the Weak and pass priority until it has resolved (both pawns dead). Stops at whatever comes next. */
async function cullResolves(game: Game, caster: Seat): Promise<void> {
  await game.seat(caster).cast("cull");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: caster })]);
  for (let i = 0; i < 6 && game.chain().some((c) => c.cardId === "cull"); i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if (d?.kind === "pick") {
      await game.seat(d.seat).pick(d.options[0]!.key);
    } else {
      break;
    }
  }
  expect(game.zoneOf("cull")).toBe("trash");
  expect(game.zoneOf("pawn1")).toBe("trash");
  expect(game.zoneOf("pawn2")).toBe("trash");
}

const phoenixOffer = (game: Game) => {
  const d = game.decision();
  return d?.kind === "yes-no" && d.seat === P1 && (d.source?.cardId === "phoenix" || /Phoenix/.test(d.prompt));
};

describe("Ruling ecd5b45a6a2afcc4 — Immortal Phoenix needs YOUR spell to do the killing", () => {
  test("control — P1's OWN Cull the Weak kills P1's pawn: Phoenix's trigger IS offered to P1 (pay [1][fury] at finalization); accepting plays the Phoenix from the trash to P1's base", async () => {
    const game = await board(P1).build();
    await cullResolves(game, P1);
    expect(phoenixOffer(game)).toBe(true);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "FIN" });
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "phoenix", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.zoneOf("phoenix")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  // Expected: the OPPONENT's (P2's) Cull the Weak killed P1's pawn — P1 merely chose which unit — so "when YOU kill a unit
  // with a spell" is not met for P1: no Phoenix prompt, Phoenix stays in the trash, P1 keeps its [1][fury], and play returns
  // to P2's main phase. Actual: the engine offers P1 the Phoenix trigger (Pay [1][fury] …) after P2's Cull resolves.
  test("ruling ecd5b45a6a2afcc4 — Immortal Phoenix is NOT offered to P1 when P2's Cull the Weak killed P1's unit", async () => {
    const game = await board(P2).build();
    await cullResolves(game, P2);
    expect(phoenixOffer(game)).toBe(false);
    expect(game.chain().some((c) => c.cardId === "phoenix")).toBe(false);
    await game.settle(); // (passive policy would decline a stray offer — the assertions above are the point)
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("either way the opponent's spell never revives it for free: declining/absent, Phoenix is still in P1's trash after P2's Cull and P2's turn simply continues", async () => {
    const game = await board(P2).build();
    await cullResolves(game, P2);
    if (phoenixOffer(game)) {
      await game.p1.no();
    }
    await game.settle();
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });
});
