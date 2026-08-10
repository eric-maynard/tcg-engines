/**
 * Ruling fa716c53e553f4f1 — Akshan, Mischievous (SFD-109 → sfd-109-221) · [4] (+ optional [body][body]) · 4 Might
 *   "[Weaponmaster] You may pay [body][body] as an additional cost to play me. When you play me, if you paid the additional
 *    cost, move an enemy gear to your base. You control it until I leave the board. If it's an Equipment, attach it to me."
 *   × Hexdrinker (SFD-102 → sfd-102-221) · Equipment · +1 Might · "[Equip] [body] — [Deflect]" (Deflect in its effect box)
 *
 * Q: Must I pay the Deflect cost for Akshan to steal a Hexdrinker that is equipped to an enemy unit?
 * A: No. Akshan's trigger chooses the EQUIPMENT card, not the unit wearing it. An attached Hexdrinker grants Deflect to the
 *    unit it is attached to; the equipment card itself does not have Deflect, so choosing it incurs no Deflect payment.
 *    The Hexdrinker detaches from the enemy unit and attaches to Akshan.
 * Rules: 809 (Deflect: pay [A] to choose the object that HAS Deflect), 718–721 (an attached Equipment's effect text applies
 *        to the equipped unit), 434.1 (attach).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AKSHAN = "sfd-109-221";
const HEXDRINKER = "sfd-102-221";

type PickD = Extract<Decision, { kind: "pick" }>;

/**
 * P1's turn. P2's Bruiser (3) at P2's bf1 wears P2's Hexdrinker (→ 4, Deflect); P2 also has a loose Trinket so Akshan's
 * choice is a real prompt. P1 holds Akshan with EXACTLY [4] + [body][body] — not one spare power for any Deflect surcharge.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { body: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Bruiser" }, "bruiser", { equippedWith: ["hex"] } as Record<string, unknown>)
    .card("hex", { def: HEXDRINKER, meta: { attachedTo: "bruiser" } as Record<string, unknown>, owner: P2, zone: "bf1" })
    .gear(P2, { cardType: "gear", name: "Trinket" }, "trinket")
    .hand(P1, AKSHAN, "akshan");
}

/** P1 plays Akshan paying [body][body]; returns the trigger's "which enemy gear" prompt. */
async function playAkshanPaid(game: Game): Promise<PickD> {
  expect(game.state("hex")).toMatchObject({ attachedTo: "bruiser", controller: P2 });
  expect(game.state("bruiser")).toMatchObject({ attachments: ["hex"], might: 4 });
  await game.p1.play("akshan", { payOptional: true, to: "base" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  return d as PickD;
}

describe("Ruling fa716c53e553f4f1 — Akshan steals an equipped Hexdrinker without paying Deflect", () => {
  test("the equipped Bruiser is the one with Deflect; the attached Hexdrinker is offered to Akshan's trigger with NO Deflect surcharge, and is choosable with an empty pool", async () => {
    const game = await board().build();
    expect(game.state("bruiser").keywords).toContain("Deflect"); // granted to the unit by the attached Hexdrinker
    const d = await playAkshanPaid(game);
    const offered = d.options.map((o) => o.card ?? o.key).toSorted();
    expect(offered).toEqual(["hex", "trinket"]); // gear cards are the choices — never the Bruiser
    const hexOpt = d.options.find((o) => (o.card ?? o.key) === "hex");
    expect(hexOpt?.deflect ?? 0).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } }); // nothing left to pay with — and nothing is asked
  });

  test("resolution: the Hexdrinker detaches from the Bruiser (back to 3, no Deflect), moves to P1's side under P1's control and attaches to Akshan (4 + 1 = 5) — P1 paid nothing beyond [4][body][body]", async () => {
    const game = await board().build();
    await playAkshanPaid(game);
    await game.p1.pick("hex");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("hex")).toMatchObject({ attachedTo: "akshan", controller: P1, location: "base", owner: P2 });
    expect(game.state("akshan")).toMatchObject({ attachments: ["hex"], might: 5, zone: "base" });
    expect(game.state("bruiser")).toMatchObject({ attachments: [], might: 3, zone: "battlefield-bf1" });
    expect(game.state("bruiser").keywords).not.toContain("Deflect");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.p2.gear()).toEqual(["trinket"]);
    expect(game.violations()).toEqual([]);
  });
});
