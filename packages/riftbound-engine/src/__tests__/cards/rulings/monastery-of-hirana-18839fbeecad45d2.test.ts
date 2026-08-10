/**
 * Ruling 18839fbeecad45d2 — Monastery of Hirana (OGN-282 → ogn-282-298, Battlefield)
 *   "When you conquer here, you may spend a buff to draw 1."
 *   × Warmog's Armor (sfd-108-221, Equipment, +1) "When I conquer, buff me. (If I don't have a buff, I get a +1 [Might] buff.)"
 *
 * Q: If I spend my unit's buff on the Monastery's draw while it wears Warmog's Armor, do I get the buff back?
 * A: No. Spending removes the buff counter (702.2.b); Warmog's only buffs "when I conquer" — it has no text that
 *    restores a spent buff. Only a conquer BY THAT UNIT while equipped triggers Warmog's again and re-buffs it (and only
 *    if it has no buff, 702.3).
 * Rules: 702.2.b, 702.3 / 702.3.a, 718.3 (equipment confers its effect text on the wearer), 383.3.d (controller
 *        orders simultaneous triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MONASTERY = "ogn-282-298";
const WARMOGS = "sfd-108-221";

type Order = Extract<Decision, { kind: "order" }>;

/**
 * P1's turn. The Monastery (live, uncontrolled, empty) is bf1; a plain open bf2 beside it. P1's Monk (2 printed, already
 * BUFFED from an earlier conquer, wearing Warmog's → 2 + 1 buff + 1 armor = 4) and a plain 2-Might Scout wait in base.
 * P1's deck is known so draws are countable.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null, def: MONASTERY, inert: false })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: 2, name: "Monk" }, "monk", { buffed: true, equippedWith: ["armor"] })
    .card("armor", { def: WARMOGS, meta: { attachedTo: "monk" }, owner: P1, zone: "base" })
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** `unit` walks onto the empty `bf` → non-combat showdown → both pass → P1 conquers it. */
async function conquer(game: Game, unit: string, bf: string): Promise<void> {
  await game.p1.move(unit, bf);
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.gameState.battlefields[bf]?.controller).toBe(P1);
}

/** Answer the Monastery opt-in (yes) and, if the engine asks which buffed unit pays, name the Monk. */
async function spendMonksBuff(game: Game): Promise<void> {
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 }); // "you MAY spend a buff" is P1's decision
  expect(game.decision()?.prompt).toMatch(/Monastery/);
  await game.p1.yes();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "monk")) {
    await game.p1.pick("monk");
  }
}

async function drain(game: Game): Promise<void> {
  for (let i = 0; i < 10 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
}

describe("Ruling 18839fbeecad45d2 — a buff spent on the Monastery is gone; Warmog's does not hand it back", () => {
  test("premise: the buffed, armored Monk reads 4 (2 + buff + Warmog's +1)", async () => {
    const game = await board().build();
    expect(game.state("monk")).toMatchObject({
      attachments: ["armor"],
      baseMight: 2,
      isBuffed: true,
      might: 4,
    });
    expect(game.state("armor").attachedTo).toBe("monk");
  });

  test("P1 conquers the Monastery (with the Scout) and spends the armored Monk's buff: P1 draws 1, the Monk drops to 3 and STAYS unbuffed — Warmog's has nothing that answers a spend", async () => {
    const game = await board().build();
    await conquer(game, "scout", "bf1");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "bf1", controller: P1, triggered: true }),
    ]);
    await spendMonksBuff(game);
    await drain(game);
    expect(game.p1.hand()).toEqual(["d1"]); // drew 1 off the spent buff
    expect(game.state("monk").isBuffed).toBe(false); // 702.2.b — the counter is removed …
    expect(game.state("monk").might).toBe(3); // … 2 + armor only
    expect(game.chain()).toEqual([]); // … and no Warmog's trigger was created by the spend
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("armor").attachedTo).toBe("monk");
    // Still gone at the end of the turn and into the next.
    await game.advanceTurn();
    expect(game.state("monk")).toMatchObject({ isBuffed: false, might: 3 });
    expect(game.violations()).toEqual([]);
  });

  test("only a later conquer BY THE MONK re-triggers Warmog's: next turn it takes bf2 and gets a fresh +1 buff (back to 4)", async () => {
    const game = await board().build();
    await conquer(game, "scout", "bf1");
    await spendMonksBuff(game);
    await drain(game);
    expect(game.state("monk").isBuffed).toBe(false);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("monk").isBuffed).toBe(false); // nothing restored in the meantime
    await conquer(game, "monk", "bf2");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "monk", controller: P1, triggered: true }),
    ]); // "When I conquer, buff me"
    await drain(game);
    expect(game.state("monk")).toMatchObject({ isBuffed: true, might: 4 });
  });

  test("same conquer, same unit: if the armored Monk itself conquers the Monastery, both triggers fire and P1 orders them; with the Monastery resolving first the buff is spent (draw 1) and Warmog's OWN conquer trigger then re-buffs the now-unbuffed Monk (702.3) — a conquer buff, not a refund", async () => {
    const game = await board().build();
    await conquer(game, "monk", "bf1");
    await spendMonksBuff(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    const order = d as Order;
    expect(order.items.map((i) => i.card).sort()).toEqual(["bf1", "monk"]);
    const keyOf = (card: string) => order.items.find((i) => i.card === card)!.key;
    await game.p1.order([keyOf("monk"), keyOf("bf1")]); // first = bottom; Monastery on top → resolves first
    expect(game.chain().map((c) => c.cardId)).toEqual(["monk", "bf1"]);
    await drain(game);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.state("monk")).toMatchObject({ isBuffed: true, might: 4 }); // exactly one buff (702.3), from Warmog's conquer trigger
    expect(game.violations()).toEqual([]);
  });
});
