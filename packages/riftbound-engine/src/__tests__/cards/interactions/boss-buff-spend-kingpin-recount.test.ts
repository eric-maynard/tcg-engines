/**
 * Interaction: Icathian Rain (ogn-248-298) · Spell · Fury/Mind · [7] + [rainbow]×3 · "Deal 2 to a unit." ×6
 *   × The Boss (ogn-269-298) · Legend · Sett
 *       "If a buffed unit you control would die, you may pay [rainbow], exhaust me, and SPEND ITS BUFF to heal it,
 *        exhaust it, and recall it instead."
 *   × Sett, Kingpin (ogn-240-298) · Champion Unit · Order · printed 5 Might
 *       "[Tank] / I get +1 [Might] for each buffed friendly unit at my battlefield."
 *
 * Rules: 321 / 321.1 (several damage instances inside ONE chain item; no Cleanup and therefore no death check runs
 * between them), 319.5 / 323.5 / 142.4.a / 142.4.b (lethal damage kills in the Cleanup after the item leaves the
 * chain), 702.2.b / 745.1 (spending a buff removes the buff counter), 703 (Might is recomputed from what is on the
 * unit NOW), 370.1.a.2 (everything a Cleanup kills dies simultaneously), 428.5.c (the Cleanup's kill is attributed
 * to the spell), 323.6 (an emptied battlefield's controller is lost in that Cleanup's step 4), 418.1 / 428.5.c
 * (damage marking vs. dying), 745.1 (buff counters).
 *
 * Question. P1's turn. P2 at bf1: Sett, Kingpin and one BUFFED vanilla B (printed 4, +1 buff = 5 Might) — so Kingpin
 * currently reads 6 Might. P2's legend is The Boss, ready, with 1 Power. P1 casts Icathian Rain, instances 1-3 on B
 * and instances 4-6 on Kingpin.
 *   (a) The Boss is offered when B's marks turn lethal (instance 3). If P2 ACCEPTS, B's buff is SPENT — what is
 *       Kingpin's Might for the remaining instances 4-6, and does the 6 damage that lands on him become lethal?
 *   (b) If P2 DECLINES, who dies, in which Cleanup, and does Kingpin's Might drop before or after the lethal check?
 *   (c) Does Kingpin die mid-item at instance 6 or only at the Cleanup, and who controls bf1 afterwards?
 *
 * Expected. (a) Instance 1: B 2/5. Instance 2: B 4/5. Instance 3: B 6/5 → lethal → The Boss is offered, WHILE the
 * Rain is still resolving and before instances 4-6 land. Accepting pays [rainbow], exhausts The Boss and SPENDS B's
 * buff, so B drops to 4 Might AND Kingpin's static recounts from 6 to 5 immediately, mid-resolution — a static
 * ability counts continuously (703), it is not evaluated once at the end of the item. B is healed, exhausted and
 * recalled to base. Instances 4-6 then mark 2/4/6 on Kingpin: at instance 6 he holds 6 ≥ 5 = lethal, but nothing
 * dies yet (321). The single Cleanup after the Rain leaves the chain kills him (323.5, attributed to the Rain per
 * 428.5.c). B survives in base at 4 Might, 0 damage, exhausted, unbuffed.
 * (b) Declining leaves B buffed at 5 Might ending 6/5 and Kingpin at 6 Might ending 6/6 — the recount never happens
 * because the buff was never spent. Both hold lethal damage at the single Cleanup and die SIMULTANEOUSLY (370.1.a.2);
 * The Boss stays ready and the Power unspent. The contrast is the death TIMING, not only the outcome: (b) is one
 * Cleanup with two simultaneous deaths, (a) is one Cleanup with one death plus a live, unbuffed B.
 * (c) Kingpin dies only in that post-item Cleanup. Afterwards bf1 holds no P2 unit, so P2 loses control of it in the
 * same Cleanup's step 4 (323.6). [Tank] is a combat-damage-assignment keyword and alters none of this.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ICATHIAN_RAIN = "ogn-248-298";
const THE_BOSS = "ogn-269-298";
const SETT_KINGPIN = "ogn-240-298";

/** Instances 1-3 on the buffed vanilla B, instances 4-6 on Kingpin. */
const TARGETS = ["b", "b", "b", "kingpin", "kingpin", "kingpin"];

function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { rainbow: 3 } })
    .resources(P2, { power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .legend(P2, THE_BOSS, "boss")
    .unit(P2, "bf1", SETT_KINGPIN, "kingpin")
    .unit(P2, "bf1", { might: 4, name: "Buffed B" }, "b", { buffed: true })
    .hand(P1, ICATHIAN_RAIN, "rain");
}

/** Cast the Rain with all six instances fixed and pass priority around so it resolves. */
async function rain(game: Game): Promise<void> {
  await game.p1.cast("rain", { targets: TARGETS });
  await game.p1.passPriority();
  await game.p2.passPriority();
}

describe("Icathian Rain × The Boss × Sett, Kingpin — spending the buff recounts Kingpin mid-resolution", () => {
  test("common ground: Kingpin reads 6 Might (printed 5 + 1 buffed friendly at his battlefield), B reads 5, The Boss is ready with 1 Power, and all six instances are fixed as the Rain is played", async () => {
    const game = await board().build();
    expect(game.state("kingpin")).toMatchObject({ baseMight: 5, isBuffed: false, location: "bf1", might: 6 });
    expect(game.state("b")).toMatchObject({ baseMight: 4, isBuffed: true, location: "bf1", might: 5 });
    expect(game.state("boss").isReady).toBe(true);
    expect(game.p2.power()).toBe(1);
    await game.p1.cast("rain", { targets: TARGETS });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    const item = game.chain()[0];
    expect(item).toMatchObject({ cardId: "rain", controller: P1, triggered: false });
    // One chain item carrying all six instances: three named B and three named Kingpin (355.5 — fixed at play).
    expect([...(item?.targets ?? [])].sort()).toEqual(["b", "b", "b", "kingpin", "kingpin", "kingpin"]);
  });

  // Expected (321 / 372): The Boss is a would-die shield consulted the moment B's marks turn lethal — at instance 3,
  // with the Rain still on the chain and Kingpin not yet damaged, so P2 decides KNOWING instances 4-6 are still to
  // come. Actual: the engine runs all six instances first and only then raises the offer — at the prompt the Rain is
  // already in the trash and Kingpin already carries all 6 marks.
  test("(a) The Boss must be offered at the 3rd instance — while the Rain is still resolving and before instances 4-6 land on Kingpin", async () => {
    const game = await board().build();
    await rain(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    expect(game.zoneOf("rain")).toBe("chain");
    expect(game.state("b")).toMatchObject({ damage: 6, location: "bf1" });
    expect(game.state("kingpin")).toMatchObject({ damage: 0, might: 6 });
  });

  // rule 702.2.b / 745.1 / 703 (DESIGN.md §Pausing inside a resolving item): accepting SPENDS B's buff
  // mid-resolution, so before instances 4-6 are dealt B is a 4-Might unit in base and Kingpin's "+1 for each buffed
  // friendly unit at my battlefield" recounts 6 → 5 on the spot — a static ability counts continuously, it is not
  // evaluated once at the end of the item. Answering the shield SUSPENDS the item at the instance boundary
  // (`suspendedResolution`, reason `damage-instance`) instead of finishing it in the same reducer, which is what
  // makes this half-resolved board a position at all; `settle()` takes the `resumeResolution` procedure and
  // instances 4-6 land against the recounted board.
  test("(a) spending B's buff recounts Kingpin's static immediately (6 → 5) with instances 4-6 still to come — a static ability counts continuously (703)", async () => {
    const game = await board().build();
    await rain(game);
    await game.p2.yes();
    expect(game.state("b")).toMatchObject({ isBuffed: false, might: 4 });
    expect(game.locationOf("kingpin")).toBe("bf1");
    expect(game.state("kingpin")).toMatchObject({ damage: 0, might: 5 });
  });

  // DESIGN.md §Pausing inside a resolving item — the pause is plain state
  // (`suspendedResolution` + the gated `deferredSequenceRest` entry), so the
  // half-resolved position has to survive the undo/redo `EngineCheckpoint`
  // byte-for-byte. Proven, not assumed: a Rewind→Redo round trip taken AT the
  // pause must land on the same hash and the item must still finish correctly.
  test("(a) the paused position round-trips through Rewind → Redo and still resolves the remaining instances", async () => {
    const game = await board().build();
    await rain(game);
    await game.p2.yes();
    const paused = game.snapshotHash();
    expect(game.canUndo()).toBe(true);
    expect(game.undo()).toBe(true);
    expect(game.snapshotHash()).not.toBe(paused);
    expect(game.redo()).toBe(true);
    expect(game.snapshotHash()).toBe(paused);
    expect(game.state("kingpin")).toMatchObject({ damage: 0, might: 5 });
    await game.settle();
    expect(game.zoneOf("kingpin")).toBe("trash");
    expect(game.zoneOf("b")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("(a) accept — end state: Kingpin dies (6 marks ≥ 5 Might after the recount), B survives in base at 4 Might, 0 damage, exhausted and unbuffed; The Boss is exhausted and the Power spent", async () => {
    const game = await board().build();
    await rain(game);
    await game.p2.yes();
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("rain")).toBe("trash");
    expect(game.zoneOf("kingpin")).toBe("trash");
    expect(game.zoneOf("b")).toBe("base");
    expect(game.state("b")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, might: 4 });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p2.power()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("(b) decline — the buff is never spent, so Kingpin's static never recounts: he goes into the Cleanup at 6 Might with 6 marks and B at 5 Might with 6 marks, both still alive (321 — no death check between instances)", async () => {
    const game = await board().build();
    await rain(game);
    // Snapshot taken at the offer — instances 1-3 dealt, 4-6 still to come (321): nothing has died yet.
    expect(game.state("b")).toMatchObject({ damage: 6, isBuffed: true, location: "bf1", might: 5 });
    expect(game.state("kingpin")).toMatchObject({ damage: 0, location: "bf1", might: 6 });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.no();
    expect(game.state("kingpin").isBuffed).toBe(false); // the buff was B's; declining spent nothing
  });

  test("(b) decline — ONE Cleanup, two simultaneous deaths (370.1.a.2): both B and Kingpin reach the trash together; The Boss stays ready and its Power unspent", async () => {
    const game = await board().build();
    await rain(game);
    await game.p2.no();
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("kingpin")).toBe("trash");
    expect(game.zoneOf("rain")).toBe("trash");
    expect(game.state("boss").isReady).toBe(true);
    expect(game.p2.power()).toBe(1);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(c) Kingpin dies only in the post-item Cleanup, never mid-item: he stands at bf1 while the Rain is still dealing its instances, and only settling puts him in the trash", async () => {
    const game = await board().build();
    await rain(game);
    // The save is offered at instance 3 and no death check has run between instances (321).
    expect(game.locationOf("kingpin")).toBe("bf1");
    expect(game.state("kingpin").damage).toBe(0);
    await game.p2.yes();
    await game.settle();
    expect(game.zoneOf("kingpin")).toBe("trash");
  });

  test("(c) after that Cleanup bf1 holds no P2 unit, so P2's control lapses in the same Cleanup's step 4 (323.6)", async () => {
    const game = await board().build();
    await rain(game);
    await game.p2.yes();
    await game.settle();
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P2);
  });

  test("(c) [Tank] is a combat-damage-assignment keyword only: B takes its three instances with a [Tank] unit standing at the same battlefield", async () => {
    const game = await board().build();
    expect(game.state("kingpin").keywords).toContain("Tank");
    await rain(game);
    expect(game.state("b").damage).toBe(6); // the spell's targets are not redirected to the Tank
    expect(game.state("kingpin").damage).toBe(0); // his own three instances come after the save is answered
    await game.p2.no();
    await game.settle();
    expect(game.zoneOf("kingpin")).toBe("trash"); // instances 4-6 land on him all the same
  });
});
