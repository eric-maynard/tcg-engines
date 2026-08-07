/**
 * Hextech Anomaly — sfd-083-221 · Gear · Mind · 3 energy + [mind]
 *
 *   [Exhaust]: [Reaction] — Pay any amount of [rainbow] to [Add] that much Energy.
 *   (Abilities that add resources can't be reacted to.)
 *
 * Rules: 135.2.e.5.a ([rainbow] as a cost = Power of ANY domain — never Energy), 429.2/429.2.a
 * (Add abilities resolve as soon as they are finalized: no chain item, priority does not pass),
 * 429.3 (Add Reactions may even be used while paying costs), 813.1.c.2 (Reaction on an activated
 * ability: Closed states, any player's turn), 149.1 (gear enters ready), 317.2.d (unspent Energy is
 * lost in the Expiration Step), Awaken readies it on its controller's turn only.
 *
 * Head-judge corner cases considered:
 *   - X is paid in POWER (any mix of domains, or stored rainbow) and yields exactly X Energy; the
 *     power actually leaves the pool; X = 0 is a legal "any amount" (gear still exhausts, pool is
 *     untouched and stays numeric); X can never exceed the power held;
 *   - it never appears on the chain and P2 gets no window: after activating mid-chain on P2's turn
 *     the chain is unchanged and P1 still holds priority;
 *   - the fresh Energy is spendable at once (fund a Feral Strength in the same window) and whatever
 *     is left evaporates at end of turn;
 *   - exhausted → unusable until YOUR next Awaken (stays exhausted through P2's turn);
 *   - partner: Ancient Henge turns Energy into [rainbow]; Anomaly turns it back (round trip).
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, SeatHandle } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-083-221";
const HENGE = "sfd-117-221"; // Ancient Henge: [Exhaust]: [Reaction] — pay any amount of Energy to Add that much [rainbow]
const FERAL_STRENGTH = "sfd-034-221"; // [Reaction] 2 energy: +2 Might this turn
const CLEAVE = "ogn-004-298"; // [Action] 1-energy spell for P2 to open a chain

/**
 * Activate an "[Exhaust]: pay X …" Add ability choosing X, whichever way the engine exposes X
 * (an enumerated xAmount variant, an x field, or an integer prompt after activation).
 */
async function activateX(seat: SeatHandle, card: string, x: number): Promise<void> {
  const opt = seat.option("activate", card);
  const enumerated = opt?.variants.some((v) => v.params.xAmount !== undefined) ?? false;
  const field = opt?.fields.some((f) => f.name === "xAmount") ?? false;
  if (opt && (enumerated || field)) {
    await seat.choose(opt.key, { ...(field ? { x } : {}), ...(enumerated ? { params: { xAmount: x } } : {}) });
  } else {
    await seat.activate(card, 0);
  }
  const d = seat.game.decision();
  if (d?.kind === "integer" && d.seat === seat.seat) {
    await seat.chooseX(x);
  }
}

describe("Hextech Anomaly (sfd-083-221)", () => {
  test("costs 3 energy + 1 mind to play; lands in base as READY gear (149.1) and is activatable that turn", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { mind: 1 } }).hand(P1, CARD, "anom").build();
    await game.p1.play("anom");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("anom")).toBe("base");
    expect(game.p1.gear()).toContain("anom");
    expect(game.state("anom").isReady).toBe(true);
    expect(game.p1.can("activate", "anom")).toBe(true);
  });

  test("unaffordable without the [mind] (fury does not substitute) or with only 2 energy", async () => {
    expect((await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "anom").build()).p1.can("play", "anom")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, CARD, "anom").build()).p1.can("play", "anom")).toBe(false);
    expect((await scenario().resources(P1, { energy: 2, power: { mind: 1 } }).hand(P1, CARD, "anom").build()).p1.can("play", "anom")).toBe(false);
  });

  test("[Exhaust] + Add: activating exhausts it, opens no chain item and leaves P1 in an open main phase (429.2)", async () => {
    const game = await scenario().resources(P1, { power: { mind: 2 } }).gear(P1, CARD, "anom").build();
    await game.p1.activate("anom", 0);
    expect(game.state("anom").isExhausted).toBe(true);
    expect(game.chain()).toHaveLength(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "anom")).toBe(false); // already exhausted
  });

  test.failing("BUG: pay X [rainbow] = X POWER of any domain → Add exactly X Energy (X=2 of fury+fury: energy 0→2, fury 2→0)", async () => {
    // Expected: choosing X=2 spends both fury power and adds 2 Energy. Actual: no X is ever asked or
    // charged and the add-resource handler adds the raw `{variable:"x"}` object to the energy number.
    const game = await scenario().resources(P1, { energy: 0, power: { fury: 2 } }).gear(P1, CARD, "anom").build();
    await activateX(game.p1, "anom", 2);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0 } });
    expect(game.state("anom").isExhausted).toBe(true);
    expect(game.chain()).toHaveLength(0);
  });

  test.failing("BUG: mixed domains and stored rainbow all count as [rainbow]: mind 1 + calm 1 + rainbow 1 pays X=3 → +3 Energy", async () => {
    // Expected: 1 energy + 3 = 4 energy, every power bucket emptied. Actual: see above (no X, energy corrupted).
    const game = await scenario().resources(P1, { energy: 1, power: { calm: 1, mind: 1, rainbow: 1 } }).gear(P1, CARD, "anom").build();
    await activateX(game.p1, "anom", 3);
    expect(game.p1.energy()).toBe(4);
    expect(game.p1.power()).toBe(0);
  });

  test.failing("BUG: X = 0 is a legal 'any amount' — the gear exhausts, nothing is paid, nothing is added, Energy stays the NUMBER 1", async () => {
    // Expected: {energy: 1, power: {fury: 2}} untouched. Actual: energy becomes the string "1[object Object]".
    const game = await scenario().resources(P1, { energy: 1, power: { fury: 2 } }).gear(P1, CARD, "anom").build();
    await activateX(game.p1, "anom", 0);
    expect(game.state("anom").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 2 } });
  });

  test.failing("BUG: X may not exceed the Power held — with 1 power, X=2 is rejected and nothing changes", async () => {
    // Expected: an illegal X leaves the gear ready and the pool intact. Actual: any activation goes
    // through unpriced (no X exists), so the attempt 'succeeds'.
    const game = await scenario().resources(P1, { energy: 0, power: { mind: 1 } }).gear(P1, CARD, "anom").build();
    const r = await game.p1.try((p) => activateX(p, "anom", 2));
    expect(r.ok).toBe(false);
    expect(game.state("anom").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 1 } });
  });

  test("[Reaction]: usable on the opponent's turn inside their chain; it resolves at once — the chain is unchanged and P1 keeps priority (429.2.a)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .resources(P1, { power: { mind: 1 } })
      .unit(P2, "base", { might: 2 }, "theirs")
      .hand(P2, CLEAVE, "cleave")
      .gear(P1, CARD, "anom")
      .build();
    expect(game.p1.can("activate", "anom")).toBe(false); // P2's Neutral Open state: only P2 acts (316.5.b)
    await game.p2.cast("cleave", { targets: "theirs" });
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.actingSeat()).toBe(P1);
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.p1.can("activate", "anom")).toBe(true);
    await game.p1.activate("anom", 0);
    expect(game.state("anom").isExhausted).toBe(true);
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
    expect(game.actingSeat()).toBe(P1);
  });

  test("also usable with Focus during a showdown on your own turn (Reaction ⊇ Action)", async () => {
    const game = await scenario()
      .resources(P1, { power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3 }, "runner")
      .unit(P2, "bf1", { might: 2 }, "blocker")
      .gear(P1, CARD, "anom")
      .build();
    await game.p1.move("runner", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("activate", "anom")).toBe(true);
  });

  test.failing("BUG: the added Energy is real and immediate — X=2 from two calm power funds a 2-cost Feral Strength in the same turn", async () => {
    // Expected: 0 energy + Add 2 → cast Feral Strength (2) on ally → +2 Might, pool empty.
    // Actual: no Energy is produced (see the X bugs), so the spell is uncastable.
    const game = await scenario()
      .resources(P1, { energy: 0, power: { calm: 2 } })
      .unit(P1, "base", { might: 2 }, "ally")
      .gear(P1, CARD, "anom")
      .hand(P1, FERAL_STRENGTH, "fs")
      .build();
    expect(game.p1.can("cast", "fs")).toBe(false);
    await activateX(game.p1, "anom", 2);
    expect(game.p1.can("cast", "fs")).toBe(true);
    await game.p1.cast("fs", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(4);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  test.failing("BUG: unspent added Energy is lost in the Expiration Step (317.2.d): X=2 this turn → 0 energy next turn", async () => {
    // Expected: energy 2 right after the Add, then an empty pool once the turn has passed.
    // Actual: the Add never yields a numeric 2.
    const game = await scenario().resources(P1, { power: { mind: 2 } }).gear(P1, CARD, "anom").build();
    await activateX(game.p1, "anom", 2);
    expect(game.p1.energy()).toBe(2);
    await game.advanceTurn();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("stays exhausted through the opponent's turn and readies at YOUR Awaken", async () => {
    const game = await scenario().gear(P1, CARD, "anom", { exhausted: true }).build();
    expect(game.p1.can("activate", "anom")).toBe(false);
    await game.advanceTurn(); // P2's turn
    expect(game.state("anom").isExhausted).toBe(true);
    await game.advanceTurn(); // back to P1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("anom").isReady).toBe(true);
    expect(game.p1.can("activate", "anom")).toBe(true);
  });

  test.failing("BUG: partner round trip with Ancient Henge — 3 Energy → Henge X=3 → 3 [rainbow] → Anomaly X=3 → 3 Energy again", async () => {
    // Expected: {3,{}} → {0,{rainbow:3}} → {3,{rainbow:0}}, both gear exhausted. Actual: neither
    // ability prices or scales with X (Henge adds a flat 1 rainbow for free; Anomaly corrupts energy).
    const game = await scenario().resources(P1, { energy: 3 }).gear(P1, HENGE, "henge").gear(P1, CARD, "anom").build();
    await activateX(game.p1, "henge", 3);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 3 } });
    await activateX(game.p1, "anom", 3);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { rainbow: 0 } });
    expect(game.state("henge").isExhausted).toBe(true);
    expect(game.state("anom").isExhausted).toBe(true);
  });

  test("registry payload: one activated Reaction ability — cost = [Exhaust] + a variable X, effect = add-resource Energy scaled by X; play cost 3 + [mind]", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "gear", domain: "mind", energyCost: 3 });
    expect(def?.powerCost).toEqual(["mind"]);
    expect(def?.abilities).toHaveLength(1);
    const ability = def?.abilities?.[0] as { cost?: Record<string, unknown>; effect?: Record<string, unknown> };
    expect(ability).toMatchObject({ timing: "reaction", type: "activated" });
    expect(ability.cost?.exhaust).toBe(true);
    expect(ability.cost?.x).toBeDefined();
    expect(ability.cost?.energy ?? 0).toBe(0); // the ability itself has no fixed energy price
    expect(ability.effect).toMatchObject({ energy: { variable: "x" }, type: "add-resource" });
    expect(ability.effect?.power).toBeUndefined(); // adds Energy, not Power
  });
});
