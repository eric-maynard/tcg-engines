/**
 * Ancient Henge — sfd-117-221 · Gear · Body · 2 energy + [body]
 *
 *   [Exhaust]: [Reaction] — Pay any amount of Energy to [Add] that much [rainbow].
 *   (Abilities that add resources can't be reacted to.)
 *
 * Rules: 429.1/429.2/429.2.a (Add = put resources in the pool; Add abilities resolve on
 * finalization, no chain item, priority does not move), 135.2.e.5.b (added [rainbow] pays a Power
 * cost of ANY domain), 813.1.c.2 (Reaction ability: Closed states, any turn), 316.5.b (but never in
 * the opponent's Neutral Open state), 149.1 (enters ready), 317.2.d (unspent Power is lost at end
 * of turn), 206 (Henge's own printed Power cost is 1 — relevant to "Power cost N or more" checks).
 *
 * Head-judge corner cases considered:
 *   - X Energy in → exactly X [rainbow] out, and the Energy really leaves the pool; X = 0 legal and
 *     inert (but still exhausts); X capped by Energy held; X = all your Energy empties it;
 *   - the [rainbow] produced is universal: it pays the [body] pip of Dauntless Vanguard;
 *   - no chain / no response window, also when used mid-chain on P2's turn (chain unchanged,
 *     P1 keeps priority); usable with Focus in a showdown; NOT in P2's open state;
 *   - leftover rainbow evaporates at end of turn; the gear readies only at its controller's Awaken;
 *   - partner: Hextech Anomaly converts the rainbow back into Energy (covered from this side too).
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, SeatHandle } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-117-221";
const ANOMALY = "sfd-083-221"; // Hextech Anomaly: pay X [rainbow] → Add X Energy
const DAUNTLESS_VANGUARD = "sfd-093-221"; // Body unit, 4 energy + [body], 4 Might
const CLEAVE = "ogn-004-298"; // [Action] 1-energy spell for P2 to open a chain

/** Activate a "pay X" Add ability choosing X via whichever surface the engine offers. */
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

describe("Ancient Henge (sfd-117-221)", () => {
  test("costs 2 energy + 1 body to play; enters the base READY and can be activated the same turn", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { body: 1 } }).hand(P1, CARD, "henge").build();
    await game.p1.play("henge");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.zoneOf("henge")).toBe("base");
    expect(game.state("henge")).toMatchObject({ cardType: "gear", isReady: true });
    expect(game.p1.can("activate", "henge")).toBe(true);
  });

  test("unaffordable with no [body] (mind does not substitute) or with only 1 energy", async () => {
    expect((await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "henge").build()).p1.can("play", "henge")).toBe(false);
    expect((await scenario().resources(P1, { energy: 2, power: { mind: 1 } }).hand(P1, CARD, "henge").build()).p1.can("play", "henge")).toBe(false);
    expect((await scenario().resources(P1, { energy: 1, power: { body: 1 } }).hand(P1, CARD, "henge").build()).p1.can("play", "henge")).toBe(false);
  });

  test("[Exhaust] + Add: activation exhausts the Henge, creates no chain item and P1 is straight back in an open main phase (429.2)", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).gear(P1, CARD, "henge").build();
    await game.p1.activate("henge", 0);
    expect(game.state("henge").isExhausted).toBe(true);
    expect(game.chain()).toHaveLength(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "henge")).toBe(false);
  });

  test("pay X Energy → Add exactly X [rainbow] (X=3 of 3: energy 3→0, rainbow 0→3)", async () => {
    // Expected: X is chosen, that much Energy is deducted and that much rainbow Power appears.
    // Actual: no X is asked or charged; the effect adds a flat 1 rainbow for free (energy stays 3).
    const game = await scenario().resources(P1, { energy: 3 }).gear(P1, CARD, "henge").build();
    await activateX(game.p1, "henge", 3);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 3 } });
    expect(game.state("henge").isExhausted).toBe(true);
  });

  test("partial X — with 5 Energy, X=2 leaves 3 Energy and gives 2 [rainbow]", async () => {
    // Expected: {3, {rainbow: 2}}. Actual: {5, {rainbow: 1}}.
    const game = await scenario().resources(P1, { energy: 5 }).gear(P1, CARD, "henge").build();
    await activateX(game.p1, "henge", 2);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { rainbow: 2 } });
  });

  test("X = 0 is legal and inert — exhausts, pays nothing, adds NOTHING", async () => {
    // Expected: pool exactly as before ({2, {}}). Actual: a free rainbow appears ({2, {rainbow: 1}}).
    const game = await scenario().resources(P1, { energy: 2 }).gear(P1, CARD, "henge").build();
    await activateX(game.p1, "henge", 0);
    expect(game.state("henge").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 2, power: {} });
    expect(game.p1.power("rainbow")).toBe(0);
  });

  test("X may not exceed the Energy held — with 1 Energy, X=3 is rejected and the Henge stays ready", async () => {
    // Expected: illegal → nothing happens. Actual: activation always 'succeeds' unpriced.
    const game = await scenario().resources(P1, { energy: 1 }).gear(P1, CARD, "henge").build();
    const r = await game.p1.try((p) => activateX(p, "henge", 3));
    expect(r.ok).toBe(false);
    expect(game.state("henge").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
  });

  test("the added [rainbow] pays a domain pip (135.2.e.5.b): 5 Energy → X=1 → play Dauntless Vanguard (4 + [body]) → pool empty", async () => {
    // Expected: after X=1 the pool is {4, {rainbow: 1}}, Vanguard becomes playable and playing it
    // empties the pool. Actual: the Energy is never charged, so 1 Energy is left over.
    const game = await scenario().resources(P1, { energy: 5 }).gear(P1, CARD, "henge").hand(P1, DAUNTLESS_VANGUARD, "dv").build();
    expect(game.p1.can("play", "dv")).toBe(false); // no power yet
    await activateX(game.p1, "henge", 1);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { rainbow: 1 } });
    expect(game.p1.can("play", "dv")).toBe(true);
    await game.p1.play("dv", { to: "base" });
    await game.settle();
    expect(game.zoneOf("dv")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
  });

  test("whatever the amount, the produced [rainbow] does unlock a [body] pip right away (universal power)", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).gear(P1, CARD, "henge").hand(P1, DAUNTLESS_VANGUARD, "dv").build();
    expect(game.p1.can("play", "dv")).toBe(false);
    await game.p1.activate("henge", 0);
    expect(game.p1.power("rainbow")).toBeGreaterThanOrEqual(1);
    expect(game.p1.can("play", "dv")).toBe(true);
    await game.p1.play("dv", { to: "base" });
    await game.settle();
    expect(game.zoneOf("dv")).toBe("base");
    expect(game.p1.power()).toBe(0);
  });

  test("[Reaction]: not in P2's Neutral Open state, but usable inside P2's chain; resolves at once, chain unchanged, P1 keeps priority", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .resources(P1, { energy: 2 })
      .unit(P2, "base", { might: 2 }, "theirs")
      .hand(P2, CLEAVE, "cleave")
      .gear(P1, CARD, "henge")
      .build();
    expect(game.p1.can("activate", "henge")).toBe(false);
    await game.p2.cast("cleave", { targets: "theirs" });
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.actingSeat()).toBe(P1);
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.p1.can("activate", "henge")).toBe(true);
    await game.p1.activate("henge", 0);
    expect(game.state("henge").isExhausted).toBe(true);
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.power("rainbow")).toBeGreaterThanOrEqual(1);
  });

  test("usable with Focus during a showdown on your own turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3 }, "runner")
      .unit(P2, "bf1", { might: 2 }, "blocker")
      .gear(P1, CARD, "henge")
      .build();
    await game.p1.move("runner", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("activate", "henge")).toBe(true);
    await game.p1.activate("henge", 0);
    expect(game.chain()).toHaveLength(0);
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.actingSeat()).toBe(P1); // Focus did not pass (429.2.a)
  });

  test("unspent [rainbow] is lost in the Expiration Step (317.2.d); the Henge stays exhausted on P2's turn and readies at your Awaken", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).gear(P1, CARD, "henge").build();
    await game.p1.activate("henge", 0);
    expect(game.p1.power("rainbow")).toBeGreaterThanOrEqual(1);
    await game.advanceTurn();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("henge").isExhausted).toBe(true);
    expect(game.p2.can("activate", "henge")).toBe(false); // not theirs
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("henge").isReady).toBe(true);
    expect(game.p1.can("activate", "henge")).toBe(true);
  });

  test("partner round trip — Henge X=2 (2 Energy → 2 rainbow) then Hextech Anomaly X=2 (2 rainbow → 2 Energy)", async () => {
    // Expected: {2,{}} → {0,{rainbow:2}} → {2,{rainbow:0}}. Actual: neither ability scales with X.
    const game = await scenario().resources(P1, { energy: 2 }).gear(P1, CARD, "henge").gear(P1, ANOMALY, "anom").build();
    await activateX(game.p1, "henge", 2);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 2 } });
    await activateX(game.p1, "anom", 2);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 0 } });
  });

  test("registry payload: one activated Reaction ability with an [Exhaust] + variable-X cost; play cost 2 + [body]", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "gear", domain: "body", energyCost: 2 });
    expect(def?.powerCost).toEqual(["body"]);
    expect(def?.abilities).toHaveLength(1);
    const ability = def?.abilities?.[0] as { cost?: Record<string, unknown>; effect?: Record<string, unknown> };
    expect(ability).toMatchObject({ timing: "reaction", type: "activated" });
    expect(ability.cost?.exhaust).toBe(true);
    expect(ability.cost?.x).toBeDefined();
    expect(ability.effect?.type).toBe("add-resource");
    expect(JSON.stringify(ability.effect?.power ?? ability.effect)).toMatch(/rainbow/);
    expect(ability.effect?.energy).toBeUndefined(); // adds Power, not Energy
  });

  test("registry payload — the Add amount must scale with X ('that much [rainbow]'), not be a flat single rainbow", async () => {
    // Expected: the effect encodes a variable amount tied to X (e.g. amount/count {variable:"x"}).
    // Actual: `power: ["rainbow"]` — exactly one rainbow regardless of what was paid.
    const pool = await loadDefaultCardPool();
    const effect = (pool.get(CARD)?.abilities?.[0] as { effect?: unknown } | undefined)?.effect;
    expect(JSON.stringify(effect)).toContain('"variable":"x"');
  });
});
