/**
 * Ruling 79360bd5ce9b9aaa — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Singularity (OGN-105 → ogn-105-298) "Deal 6 to each of up to two units."
 *
 * Q: Played from hidden, can Zhonya's affect units dying at OTHER battlefields, and if several friendly units die
 *    simultaneously who chooses which is recalled?
 * A: Yes. A gear played from hidden is immediately recalled to base (gear can't sit at a battlefield), and its
 *    replacement watches every friendly unit wherever it dies (it doesn't target). When several friendly units
 *    die at once — combat damage or a spell like Singularity — the Hourglass's owner picks the one to save.
 * Rules: 811.1.d / 518 (gear from hidden → base), 370.1.a.2 (simultaneous events), 372–373 (replacement's
 *        controller chooses which event; single use), 465.2 (combat damage is dealt simultaneously).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const SINGULARITY = "ogn-105-298";

/**
 * P1's turn. P2 holds bf1 (Keeper 3 + Zhonya's facedown there) and bf2 (Yak 4); Xerus (2) sits in P2's base.
 * P1: Singularity with 6 + [mind][mind], and an 8-Might Brute in base for the combat variant.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Keeper" }, "keeper")
    .facedown(P2, "bf1", ZHONYAS, "zh")
    .unit(P2, "bf2", { might: 4, name: "Yak" }, "yak")
    .unit(P2, "base", { might: 2, name: "Xerus" }, "xerus")
    .unit(P1, "base", { might: 8, name: "Brute" }, "brute")
    .hand(P1, SINGULARITY, "sing");
}

/** P1 casts Singularity at Yak (bf2) and Xerus (base) and passes; P2 flips the Hourglass hidden at bf1 in response. */
async function singularityAndFlip(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("sing", { targets: ["yak", "xerus"] });
  expect(game.chain()[0]?.targets?.slice().sort()).toEqual(["xerus", "yak"]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("reveal", "zh")).toBe(true);
  await game.p2.reveal("zh");
  return game;
}

describe("Ruling 79360bd5ce9b9aaa — a Zhonya's flipped at bf1 saves units dying elsewhere; its owner picks among simultaneous deaths", () => {
  test("played from hidden at bf1 for [0], the GEAR is immediately in P2's base (not at the battlefield), face up; Singularity still pending", async () => {
    const game = await singularityAndFlip();
    expect(game.state("zh")).toMatchObject({ isHidden: false, zone: "base" });
    expect(game.p2.gear()).toEqual(["zh"]);
    expect(game.p2.facedown("bf1")).toEqual([]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["sing"]);
  });

  test("Singularity resolves: Yak (at bf2 — a DIFFERENT battlefield from where Zhonya's was hidden) and Xerus (base) would both die at once → the choice of which death to replace surfaces to P2, the Hourglass's owner, naming both", async () => {
    const game = await singularityAndFlip();
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P2, semantics: "replacement-assign", source: { cardId: "zh" } });
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["xerus", "yak"]);
    expect(game.actingSeat()).toBe(P2);
    // Nothing has died while P2 decides.
    expect(game.zoneOf("yak")).toBe("battlefield-bf2");
    expect(game.zoneOf("xerus")).toBe("base");
  });

  test("P2 picks Yak: the Hourglass dies instead; Yak is healed, exhausted and recalled from bf2 to base; Xerus dies; Keeper at bf1 untouched", async () => {
    const game = await singularityAndFlip();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p2.pick("yak");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("yak")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("xerus")).toBe("trash");
    expect(game.zoneOf("keeper")).toBe("battlefield-bf1");
    expect(game.zoneOf("sing")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("…or P2 picks Xerus — owner's choice, not the caster's: Xerus survives exhausted in base and Yak dies", async () => {
    const game = await singularityAndFlip();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p2.pick("xerus");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("xerus")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("yak")).toBe("trash");
  });

  test.failing("BUG: combat variant: Brute (8) attacks bf2 defended by Yak (4) + a 2-Might Calf; P2 flips the bf1 Hourglass with Focus; combat damage kills both defenders SIMULTANEOUSLY → again P2 chooses which one Zhonya's recalls", async () => {
    const game = await board().unit(P2, "bf2", { might: 2, name: "Calf" }, "calf").build();
    await game.p1.move("brute", "bf2");
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.reveal("zh");
    expect(game.zoneOf("zh")).toBe("base");
    game.script(P1, [(d) => (d.kind === "distribute" ? { allocation: { calf: 4, yak: 4 }, kind: "distribute" } : undefined)]);
    await game.p2.passFocus();
    if (game.decision()?.kind === "action") {
      await game.settle();
    }
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "replacement-assign", source: { cardId: "zh" } });
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["calf", "yak"]);
    await game.p2.pick("yak");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("yak")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("calf")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
