/**
 * Ruling 526ff44d7342c571 — Ezreal, Prodigy (SFD-149 → sfd-149-221) · 3 Might · "When you play me, discard 1, then draw 2.
 *   Optional additional costs you pay cost [1] or [rainbow] less."
 *   × Blast Corps Cadet (SFD-013 → sfd-013-221) "You may pay [1][fury] as an additional cost to play me. When you play me, if you
 *     paid the additional cost, deal 2 to a unit at a battlefield."
 *   Also exercised: Bellows Breath (sfd-080-221, [Repeat] [1][mind]), Legion Rearguard (ogn-010-298, [Accelerate] [1][fury]),
 *   Boneshiver (sfd-118-221, [Equip] [1][body]).
 *
 * Q: What does Ezreal, Prodigy reduce? Repeat? Accelerate? Equip?
 * A: OPTIONAL ADDITIONAL costs — Repeat and Accelerate chiefly, plus one-offs like Blast Corps Cadet's "may pay … as an
 *    additional cost". NOT Equip: that is an ability's activation cost, neither optional nor additional.
 * Rules: 356.2.b / 356.4.c (optional additional costs and their reduction), 805 (Accelerate), 820 (Repeat), 818 (Equip is an
 *        activated ability with a cost).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const EZREAL = "sfd-149-221";
const BELLOWS_BREATH = "sfd-080-221";
const LEGION_REARGUARD = "ogn-010-298";
const BLAST_CORPS_CADET = "sfd-013-221";
const BONESHIVER = "sfd-118-221";

type Builder = ReturnType<typeof scenario>;
const withEzreal = (s: Builder, ez: boolean) => (ez ? s.unit(P1, "base", EZREAL, "ezreal") : s);

describe("Ruling 526ff44d7342c571 — Ezreal, Prodigy discounts optional ADDITIONAL costs (Repeat, Accelerate, Cadet) but not Equip", () => {
  // ── Repeat ────────────────────────────────────────────────────────────────────────────────

  /** P1: Bellows Breath with [1] + mind×2 — enough for the base [1][mind] plus only the [mind] of the Repeat tier. */
  const repeatBoard = (ez: boolean) =>
    withEzreal(
      scenario()
        .resources(P1, { energy: 1, power: { mind: 2 } })
        .battlefield("bf1", { controller: P2 })
        .unit(P2, "bf1", { might: 3, name: "Target" }, "target")
        .hand(P1, BELLOWS_BREATH, "bellows"),
      ez,
    );

  test("Repeat: without Ezreal, [1] + mind×2 cannot cover Bellows Breath's Repeat ([1][mind] on top of [1][mind]) — no repeat is offered", async () => {
    const game = await repeatBoard(false).build();
    expect(game.p1.can("cast", "bellows")).toBe(true);
    expect(game.p1.option("cast", "bellows")?.fields.find((f) => f.arg === "repeat")).toBeUndefined();
    expect((await game.p1.try((p) => p.cast("bellows", { repeat: 1, targets: ["target"] }))).ok).toBe(false);
  });

  test("Repeat: WITH Ezreal the Repeat tier costs [1] less → the same [1] + mind×2 pays base + Repeat; the spell executes twice (Target takes 2) and the pool is drained", async () => {
    const game = await repeatBoard(true).build();
    expect(game.p1.option("cast", "bellows")?.fields.find((f) => f.arg === "repeat")?.options).toEqual([1]);
    await game.p1.cast("bellows", { repeat: 1, targets: ["target"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("bellows")).toBe("trash");
    expect(game.state("target").damage).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  // ── Accelerate ────────────────────────────────────────────────────────────────────────────

  /** P1: Legion Rearguard ([2], Accelerate [1][fury]) with [2] + fury — one energy short of accelerating at full price. */
  const accelBoard = (ez: boolean) => withEzreal(scenario().resources(P1, { energy: 2, power: { fury: 1 } }).hand(P1, LEGION_REARGUARD, "rear"), ez);

  test("Accelerate: without Ezreal, [2] + fury cannot pay [2] + Accelerate [1][fury] — the option is not offered and the unit would enter exhausted", async () => {
    const game = await accelBoard(false).build();
    expect(game.p1.option("play", "rear")?.fields.find((f) => f.arg === "payOptional" || f.arg === "accelerate")?.options ?? [false]).not.toContain(true);
    await game.p1.play("rear");
    await game.settle();
    expect(game.state("rear")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
  });

  test("Accelerate: WITH Ezreal it costs [1] less → [2] + fury accelerates the Rearguard: it enters READY and everything is spent", async () => {
    const game = await accelBoard(true).build();
    expect(game.p1.option("play", "rear")?.fields.find((f) => f.arg === "payOptional" || f.arg === "accelerate")?.options).toContain(true);
    await game.p1.play("rear", { accelerate: true });
    await game.settle();
    expect(game.state("rear")).toMatchObject({ isReady: true, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.violations()).toEqual([]);
  });

  // ── One-off "may pay … as an additional cost" (Blast Corps Cadet) ─────────────────────────

  /** P1: Cadet ([2], optional [1][fury]) with [2] + fury; P2 has a unit at a battlefield for the paid-cost trigger. */
  const cadetBoard = (ez: boolean) =>
    withEzreal(
      scenario()
        .resources(P1, { energy: 2, power: { fury: 1 } })
        .battlefield("bf1", { controller: P2 })
        .unit(P2, "bf1", { might: 3, name: "Dummy" }, "dummy")
        .hand(P1, BLAST_CORPS_CADET, "cadet"),
      ez,
    );

  test("Blast Corps Cadet: without Ezreal [2] + fury can't add the optional [1][fury]; WITH Ezreal it can — paid, and 'if you paid' deals 2 to the Dummy", async () => {
    const without = await cadetBoard(false).build();
    expect(without.p1.option("play", "cadet")?.fields.find((f) => f.arg === "payOptional")?.options ?? [false]).not.toContain(true);

    const game = await cadetBoard(true).build();
    expect(game.p1.option("play", "cadet")?.fields.find((f) => f.arg === "payOptional")?.options).toContain(true);
    await game.p1.play("cadet", { payOptional: true });
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("dummy");
      await game.settle();
    }
    expect(game.zoneOf("cadet")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.state("dummy").damage).toBe(2);
  });

  // ── Equip: NOT reduced ────────────────────────────────────────────────────────────────────

  /** P1: Boneshiver ([Equip] [1][body]) in base next to a Grunt; resources vary. */
  const equipBoard = (ez: boolean, energy: number, body: number) =>
    withEzreal(
      scenario().resources(P1, { energy, power: { body } }).unit(P1, "base", { might: 2, name: "Grunt" }, "grunt").gear(P1, BONESHIVER, "bone"),
      ez,
    );

  test("Equip is an activation cost, not an optional additional cost: even WITH Ezreal, Boneshiver's [Equip] [1][body] is unavailable at [0]+body or at [1]+no body …", async () => {
    for (const [energy, body] of [
      [0, 1],
      [1, 0],
    ] as const) {
      const game = await equipBoard(true, energy, body).build();
      expect(game.p1.can("equipCard")).toBe(false);
      expect(game.p1.legal().some((o) => o.moveId === "equipCard" || o.verb === "equip")).toBe(false);
    }
  });

  test("… and at the full [1][body] it works and charges the FULL price, Ezreal or not", async () => {
    for (const ez of [false, true]) {
      const game = await equipBoard(ez, 1, 1).build();
      const opt = game.p1.option("equipCard");
      expect(opt).toBeDefined();
      await game.p1.choose(opt!.key, { params: { equipmentId: "bone", unitId: "grunt" } });
      await game.settle();
      expect(game.state("bone").attachedTo).toBe("grunt");
      expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } }); // no [1]-or-[rainbow] discount applied
      expect(game.violations()).toEqual([]);
    }
  });
});
