/**
 * Interaction: Icathian Rain (ogn-248-298) · Spell · Fury/Mind · [7]+[rainbow]×3 · "Deal 2 to a unit." ×6
 *   × The Boss (ogn-269-298) · Legend · Sett
 *     "If a buffed unit you control would die, you may pay [rainbow], exhaust me, and spend its buff to heal it,
 *      exhaust it, and recall it instead."
 *   × Zhonya's Hourglass (ogn-077-298) · Gear · Calm
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Question. P1's turn (7 energy + 3 any-power). P2: legend The Boss (ready, 1 power), a BUFFED vanilla U (printed 4,
 * +1 = 5 Might) alone at bf1 (P2 controls it), Zhonya's Hourglass face-up in base. P1 casts Icathian Rain naming U
 * for all six instances.
 *   (a) BOTH protections: at which instance is The Boss offered and what is on U then? If P2 accepts, do instances
 *       4-6 still hit the recalled U; when is Zhonya's consumed; does U survive; who controls bf1 afterwards?
 *   (b) Zhonya's only: is it applied between instances or once at the end; U's final state (buff kept)?
 *   (c) Boss only, P2 accepts: does U survive?
 *
 * Expected (FIXER-PRIMER "Multi-execution / multi-instance damage vs replacements", rulings 3afdd260 / 501859c8 /
 * bc396882): all six targets are fixed at play; the six Deals are separate damage instances executed in order inside
 * ONE resolving chain item and no Cleanup / death check runs between them (321 / 321.1, 142.4.a, 323.5). The Boss is
 * treated as a DAMAGE-time shield — asked at the instance that makes the damage lethal (instance 3: 6 ≥ 5) while the
 * Rain is still resolving; Zhonya's "would die" is a CLEANUP event, consulted once in the single Cleanup after the
 * Rain leaves the chain (319.5, 370.1.a, 372/373). 428.5.c: that Cleanup's kill is attributed to the Rain.
 *   (a) Boss at instance 3 (U at bf1, 6 damage) → accept: 1 power, Boss exhausted, buff spent (4 Might), healed,
 *       exhausted, recalled. Instances 4-6 → 6 on the 4-Might U in base. Cleanup → Zhonya's replaces the death:
 *       Zhonya's to trash, U healed/exhausted, alive in base, unbuffed. bf1: no P2 unit → P2 loses control.
 *   (b) No prompt at all; 12 marked at bf1; ONE Cleanup → Zhonya's saves once: U in base, 0 damage, exhausted,
 *       buff KEPT (5 Might); Zhonya's in trash.
 *   (c) Boss at instance 3, then 6 more on a 4-Might unbuffed U → dies at the Cleanup.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ICATHIAN_RAIN = "ogn-248-298";
const THE_BOSS = "ogn-269-298";
const ZHONYAS = "ogn-077-298";

const SIX = ["u", "u", "u", "u", "u", "u"];

/** P1 to act with exactly [7]+3 rainbow and the Rain; P2: buffed 4(+1)-Might U alone at bf1, 1 body power. */
function board(opts: { boss: boolean; zhonyas: boolean }) {
  let s = scenario()
    .resources(P1, { energy: 7, power: { rainbow: 3 } })
    .resources(P2, { power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Unit U" }, "u", { buffed: true })
    .hand(P1, ICATHIAN_RAIN, "rain");
  if (opts.boss) {
    s = s.legend(P2, THE_BOSS, "boss");
  }
  if (opts.zhonyas) {
    s = s.gear(P2, ZHONYAS, "zh");
  }
  return s;
}

/** Cast the Rain with all six instances on U and pass priority around (P1 first, then P2) so it resolves. */
async function rainOnU(game: Game): Promise<void> {
  await game.p1.cast("rain", { targets: SIX });
  await game.p1.passPriority();
  await game.p2.passPriority();
}

const isBossOffer = (d: Decision | null): boolean => d?.kind === "yes-no" && d.seat === P2 && /The Boss/.test(d.prompt);

describe("Icathian Rain × The Boss × Zhonya's Hourglass — damage-time shield per instance, would-die once at the Cleanup", () => {
  test("common ground: the Rain costs [7]+3, all SIX targets are fixed as it is played (one chain item naming U six times), U is a buffed 5-Might unit and Zhonya's sits face-up in P2's base", async () => {
    const game = await board({ boss: true, zhonyas: true }).build();
    expect(game.state("u")).toMatchObject({ isBuffed: true, location: "bf1", might: 5 });
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.zoneOf("boss")).toBe("legendZone");
    await game.p1.cast("rain", { targets: SIX });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rain", controller: P1, targets: SIX, triggered: false })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  // ── (c) Boss only ────────────────────────────────────────────────────────────────────────────

  test("(c) Boss only: P2 is offered The Boss at the 3rd instance — U still at bf1 with exactly 6 damage, the Rain still resolving (not yet in the trash)", async () => {
    const game = await board({ boss: true, zhonyas: false }).build();
    await rainOnU(game);
    expect(isBossOffer(game.decision())).toBe(true);
    expect(game.state("u")).toMatchObject({ damage: 6, isBuffed: true, location: "bf1", might: 5 });
    expect(game.zoneOf("rain")).toBe("chain");
  });

  test("(c) Boss only, P2 accepts: 1 power paid, Boss exhausted, buff spent, U healed/recalled — then instances 4-6 put 6 on the now-4-Might U in base and it DIES at the Cleanup; bf1 is no longer P2's", async () => {
    const game = await board({ boss: true, zhonyas: false }).build();
    await rainOnU(game);
    await game.p2.yes();
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.p2.power()).toBe(0);
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.zoneOf("rain")).toBe("trash");
    expect(game.zoneOf("u")).toBe("trash");
    expect(game.p2.units()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) Zhonya's only ────────────────────────────────────────────────────────────────────────

  test("(b) Zhonya's only: NO mid-spell prompt at all (a mandatory would-die replacement asks nothing); afterwards the Rain and Zhonya's are both in the trash", async () => {
    const game = await board({ boss: false, zhonyas: true }).build();
    await rainOnU(game);
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("rain")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("trash");
  });

  // Expected: all 12 damage is marked on U at bf1 with no death check in between (321); the ONE Cleanup after the
  // Rain leaves the chain finds U lethal and Zhonya's replaces that single death → U alive in base, 0 damage,
  // exhausted, buff KEPT (5 Might). Actual: the engine runs a Cleanup after every "Deal 2" that a later instance
  // re-hits, so Zhonya's fires at instance 3 (U recalled, still buffed) and instances 4-6 (6 ≥ 5) kill U for good.
  test.failing("BUG: (b) Zhonya's must be consulted ONCE at the post-resolution Cleanup (321 / 323.5) — U survives in base, exhausted, 0 damage, still buffed (5 Might); the engine applies it at instance 3 and U then dies", async () => {
    const game = await board({ boss: false, zhonyas: true }).build();
    await rainOnU(game);
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("u")).toBe("base");
    expect(game.state("u")).toMatchObject({ damage: 0, isBuffed: true, isExhausted: true, might: 5 });
    expect(game.p2.units()).toEqual(["u"]);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P2);
  });

  // ── (a) both protections ─────────────────────────────────────────────────────────────────────

  // Expected: with both on the board only The Boss (damage-time) is asked mid-spell — at instance 3, U at bf1 with
  // 6 damage; Zhonya's (Cleanup-class) is not a candidate yet, so there is nothing to order. Actual: the engine's
  // instance-3 Cleanup finds BOTH as die replacements and raises a rule-372 "order the replacement effects" pick
  // (zh | boss) — and keeps dealing instances 4-6 while that prompt is open, so U shows 12 damage when P2 is asked.
  test.failing("BUG: (a) both — at instance 3 P2 gets The Boss yes/no (U at bf1, exactly 6 damage, Rain resolving), not a Zhonya's-vs-Boss ordering pick over 12 damage", async () => {
    const game = await board({ boss: true, zhonyas: true }).build();
    await rainOnU(game);
    const d = game.decision();
    expect(d?.seat).toBe(P2);
    expect(game.zoneOf("rain")).toBe("chain");
    expect(game.state("u")).toMatchObject({ damage: 6, location: "bf1" });
    expect(isBossOffer(d)).toBe(true);
    expect(d?.kind === "pick" ? d.semantics : undefined).not.toBe("replacement-order");
  });

  // Expected net result of (a) after P2 accepts The Boss at instance 3: instances 4-6 mark 6 on the recalled 4-Might
  // U; the single post-resolution Cleanup consults Zhonya's → Zhonya's killed to trash, U healed/exhausted, alive
  // in base, unbuffed; Boss exhausted, P2 power 0; bf1 no longer P2's. Actual: the first prompt is the ordering
  // pick above, so `yes()` is not even a legal answer; navigating it Boss-first heals all 12 at once and Zhonya's is
  // never consumed (stays in base).
  test.failing("BUG: (a) both, P2 accepts The Boss at instance 3 → 4-6 re-hit U in base → Zhonya's is consumed at the Cleanup: U alive in base (0 damage, 4 Might, exhausted), Boss exhausted, power 0, Zhonya's in trash, bf1 lost", async () => {
    const game = await board({ boss: true, zhonyas: true }).build();
    await rainOnU(game);
    await game.p2.yes(); // The Boss at instance 3
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("rain")).toBe("trash");
    expect(game.zoneOf("u")).toBe("base");
    expect(game.state("u")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, might: 4 });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p2.power()).toBe(0);
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("(a) both — what the engine does agree on: whichever way P2 navigates its prompts, U never reaches the trash, the Rain does, and P2 no longer controls the emptied bf1 at the following Open Cleanup", async () => {
    const game = await board({ boss: true, zhonyas: true }).build();
    await rainOnU(game);
    // Answer P2's prompts generically: order/pick → Boss first where offered, yes/no → yes.
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (!d || d.seat !== P2 || d.kind === "action") {
        break;
      }
      if (d.kind === "yes-no") {
        await game.p2.yes();
      } else if (d.kind === "pick") {
        const keys = d.options.map((o) => o.key);
        const bossFirst = [...keys].sort((a) => (a === "boss" ? -1 : 1));
        await game.p2.answer({ keys: d.max > 1 || d.semantics === "replacement-order" ? bossFirst : [bossFirst[0]!], kind: "pick" });
      } else if (d.kind === "order") {
        await game.p2.order([...d.items.map((o) => o.key)].sort((a) => (a === "boss" ? -1 : 1)));
      } else {
        break;
      }
    }
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("rain")).toBe("trash");
    expect(game.zoneOf("u")).toBe("base");
    expect(game.state("u")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
