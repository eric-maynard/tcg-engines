/**
 * Ruling 0aacd2f79d3e8aec — Heedless Resurrection (unl-142-219) · Reaction spell · Chaos · 2 + [chaos]
 *   "As an additional cost to play this, kill a friendly unit. Play a unit from your trash that costs no
 *    more Energy and no more Power than the killed unit, ignoring its cost."
 *   × Hard Bargain (sfd-136-221) "[Reaction] [Repeat][2] Counter a spell unless its controller pays [2]."
 *
 * Q: If Heedless Resurrection is countered, is the killed unit returned?
 * A: No. The kill is an additional cost, paid while playing the spell — before it could ever resolve. A
 *    countered spell does nothing and leaves the chain (425.1.a); countering never refunds costs, including
 *    additional costs (425.1.c, 425.1.c.1). The killed unit stays dead; nothing is played from the trash.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HEEDLESS = "unl-142-219";
const HARD_BARGAIN = "sfd-136-221";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn with exactly 2 + [chaos]. P1: "victim" (3-cost, 3 Might) in base to kill, "corpse" (2-cost) in
 * trash to resurrect. P2: Hard Bargain + 2 energy. After paying for Heedless P1 has 0 energy, so the [2]
 * ransom can never be met → the counter sticks.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .resources(P2, { energy: 2 })
    .unit(P1, "base", { energyCost: 3, might: 3, name: "Victim" }, "victim")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .trash(P1, { energyCost: 2, might: 2, name: "Corpse" }, "corpse")
    .hand(P1, HEEDLESS, "heedless")
    .hand(P2, HARD_BARGAIN, "hb");
}

/**
 * Cast Heedless Resurrection killing "victim". The rules-correct bundle names the kill as `sacrifice`;
 * fall back to whatever single-card argument the engine currently exposes so the counter tests can run.
 */
async function castHeedless(game: Game): Promise<void> {
  const r = await game.p1.try((p) => p.cast("heedless", { sacrifice: "victim" }));
  if (!r.ok) {
    const t = await game.p1.try((p) => p.cast("heedless", { targets: "victim" }));
    if (!t.ok) {
      await game.p1.cast("heedless");
    }
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["heedless"]);
}

/** P2 Hard-Bargains the Heedless Resurrection and everyone passes until the chain is empty. */
async function counterIt(game: Game): Promise<void> {
  await game.p1.passPriority();
  await game.p2.cast("hb", { targets: "heedless" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["heedless", "hb"]);
  game.script(P1, [(d) => (d.kind === "yes-no" ? false : undefined)]); // cannot / will not pay [2]
  await game.settle();
  expect(game.chain()).toEqual([]);
}

describe("Ruling 0aacd2f79d3e8aec — a countered Heedless Resurrection does not give the killed unit back", () => {
  // Expected: the kill is an ADDITIONAL COST — it is paid as Heedless Resurrection is played, so the victim
  // is already in the trash while the spell is still sitting on the chain awaiting responses (425.1.c.1).
  // Actual: the engine does not model the "kill a friendly unit" additional cost; the victim stays in base
  // (it is merely offered as a `targets` choice) and no `sacrifice` argument exists.
  test("ruling 0aacd2f79d3e8aec — the friendly unit is killed as a COST, up front: victim is in the trash while Heedless is still on the chain", async () => {
    const game = await board().build();
    const sac = game.p1.option("cast", "heedless")?.fields.find((f) => f.arg === "sacrifice");
    expect(sac?.options ?? []).toEqual(["victim"]); // only FRIENDLY units
    await game.p1.cast("heedless", { sacrifice: "victim" });
    expect(game.zoneOf("heedless")).toBe("chain");
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("corpse")).toBe("trash"); // nothing resurrected before resolution
  });

  // Expected: after Hard Bargain counters it, the victim is STILL in the trash (cost not refunded), the
  // corpse was never played, Heedless is in the trash. Actual: victim never died (see above) → in base.
  test("ruling 0aacd2f79d3e8aec — countered by Hard Bargain: the killed unit is NOT returned (stays in trash), nothing is resurrected", async () => {
    const game = await board().build();
    await castHeedless(game);
    await counterIt(game);
    expect(game.zoneOf("heedless")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p1.units()).not.toContain("victim");
    expect(game.zoneOf("corpse")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["corpse", "heedless", "victim"]);
  });

  test("countered: Heedless Resurrection does nothing (the corpse stays in the trash), goes to the trash itself, and its 2 + [chaos] are not refunded (425.1.a, 425.1.c)", async () => {
    const game = await board().build();
    await castHeedless(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await counterIt(game);
    expect(game.zoneOf("heedless")).toBe("trash");
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.zoneOf("corpse")).toBe("trash");
    expect(game.p1.units("base")).not.toContain("corpse");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } }); // no refund
    expect(game.p2.energy()).toBe(0);
    expect(game.zoneOf("bystander")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
