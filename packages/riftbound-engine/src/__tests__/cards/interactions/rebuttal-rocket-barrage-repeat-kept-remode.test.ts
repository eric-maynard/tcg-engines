/**
 * Interaction: Rebuttal (ven-152-166) × Rocket Barrage (sfd-077-221) played WITH its Repeat paid
 *
 *   Rebuttal — Spell (Reaction) · Mind/Chaos · 1 + [C]
 *     "Choose a spell with Energy cost no more than [4]. You may pay [rainbow]. If you do, gain control
 *      of it and you may make new choices for it. Otherwise, counter it."
 *   Rocket Barrage — Spell · Mind · 4 + [mind]
 *     "[Repeat] [4][mind] (You may pay the additional cost to repeat this spell's effect, and may make
 *      different choices.)  Choose one — · Deal 4 to a unit in a base. · Kill a gear."
 *
 * Rules: 355.3 / 355.5 (mode + target of EACH execution are Make-Relevant-Choices decisions made at
 * play), 820.2 / 820.2.a (the repeated execution's choices are made at that same step, may differ),
 * 752.1 (re-choosable on gain-control: locations, MODES, destinations, TARGETS), 752.2 (NOT choices for
 * Optional Additional Costs — the Repeat payment), 753 (any legal subset may be re-made), 755.1 (the
 * item is already played and paid; further costs have no effect on it), 820.3.a (however many
 * executions, the spell is Played once).
 *
 * Question: P1's turn. P1 casts Rocket Barrage paying Repeat: exec 1 = Deal 4 → P2's base unit U (4),
 * exec 2 = Kill a gear → P2's gear Q. P2 Rebuttals it (energy cost 4 ≤ 4), pays [rainbow], gains control.
 *   (a) What does the new-choices Decision offer — per-execution mode and target? the Repeat payment?
 *   (b) P2 keeps mode 1 for exec 1 but re-targets P1's V (3); flips exec 2 to mode 1 → P1's W (4).
 *   (c) Same line but P1 did NOT pay Repeat — can P2 add a second execution now?
 *
 * Expected: (a) both executions' modes and targets are offered for re-choice, in execution order; the
 * Repeat cost is never offered (no un-pay/refund, no pay-now) — P1's 8 energy + 2 mind stay spent and
 * P2 pays only Rebuttal + [rainbow]. (b) exec 1 deals 4 to V (dies), exec 2 deals 4 to W (dies); U and Q
 * untouched; Rocket Barrage → its owner P1's trash. (c) exactly ONE mode/target pair is re-chosen, no
 * Repeat toggle even though P2 could afford [4][mind]; one unit is hit.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REBUTTAL = "ven-152-166";
const ROCKET_BARRAGE = "sfd-077-221";
const DEAL_4 = 0; // printed bullet order
const KILL_GEAR = 1;

/**
 * P1 to act with 8 energy + 2 mind (base + Repeat). P2: U (4) + gear Q in base, Rebuttal in hand with
 * 1 + chaos + rainbow — plus a spare 4 energy + 1 mind so that a (wrongly) offered Repeat payment would
 * be affordable and therefore visible. P1: V (3) and W (4) in base.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { mind: 2 } })
    .resources(P2, { energy: 5, power: { chaos: 1, mind: 1, rainbow: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", { might: 4, name: "Unit U" }, "u")
    .gear(P2, { energyCost: 1, name: "Gear Q" }, "q")
    .unit(P1, "base", { might: 3, name: "Unit V" }, "v")
    .unit(P1, "base", { might: 4, name: "Unit W" }, "w")
    .hand(P1, ROCKET_BARRAGE, "rb")
    .hand(P2, REBUTTAL, "reb");
}

type RepeatExecution = { _chosenIndex?: number; _chosenTargets?: string[] };

/** Per-execution { mode, targets } recorded on the Rocket Barrage chain item. */
function executionsOnChain(game: Game): { mode: number | undefined; targets: string[] }[] {
  const item = game.gameState.interaction?.chain?.items?.[0] as
    | { targets?: string[]; effect?: { effects?: RepeatExecution[]; _chosenIndex?: number; type?: string } }
    | undefined;
  const eff = item?.effect;
  if (eff?.effects) {
    return eff.effects.map((e) => ({ mode: e._chosenIndex, targets: [...(e._chosenTargets ?? [])] }));
  }
  // A single execution (no Repeat) keeps its one target on the item itself.
  return eff ? [{ mode: eff._chosenIndex, targets: [...(item?.targets ?? [])] }] : [];
}

/** P1 casts (with or without Repeat), passes; P2 Rebuttals; both pass until Rebuttal resolves → P2's pay prompt. */
async function rebutted(withRepeat: boolean): Promise<Game> {
  const game = await board().build();
  if (withRepeat) {
    await game.p1.cast("rb", { modes: [DEAL_4, KILL_GEAR], repeat: 1, targets: ["u", "q"] });
  } else {
    await game.p1.cast("rb", { mode: DEAL_4, repeat: 0, targets: "u" });
  }
  await game.p1.passPriority();
  await game.p2.cast("reb", { targets: "rb" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["rb", "reb"]);
  while (game.decision()?.kind === "action" && game.chain().some((c) => c.cardId === "reb")) {
    await game.acting().passPriority();
  }
  expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
  return game;
}

/** Collect P2's consecutive non-action prompts (the new-choices Decision sequence), answering each with `answer`. */
async function walkNewChoices(game: Game, answer: (d: Decision, index: number) => Promise<void>): Promise<Decision[]> {
  const seen: Decision[] = [];
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (!d || d.kind === "action" || d.seat !== P2) {
      break;
    }
    seen.push(d);
    await answer(d, seen.length - 1);
  }
  return seen;
}

describe("Rebuttal × Rocket Barrage with Repeat paid — steal, keep the Repeat, re-mode/re-target", () => {
  test("setup: Repeat paid at play — ONE chain item, two executions [Deal 4→U, Kill gear→Q], P1's 8 energy + 2 mind spent (355.3, 355.5, 820.2.a)", async () => {
    const game = await board().build();
    await game.p1.cast("rb", { modes: [DEAL_4, KILL_GEAR], repeat: 1, targets: ["u", "q"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rb", controller: P1, targets: ["u", "q"] })]);
    expect(executionsOnChain(game)).toEqual([
      { mode: DEAL_4, targets: ["u"] },
      { mode: KILL_GEAR, targets: ["q"] },
    ]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  });

  test("paying [rainbow] hands the Rocket Barrage item (both executions intact) to P2; Rebuttal → P2's trash", async () => {
    const game = await rebutted(true);
    await game.p2.yes();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rb", controller: P2, countered: false })]);
    expect(executionsOnChain(game)).toHaveLength(2);
    expect(game.zoneOf("reb")).toBe("trash");
    expect(game.p2.trash()).toContain("reb");
  });

  // ── (a) what the new-choices Decision offers ───────────────────────────────────────────────

  test("(a) the new-choices sequence is exactly: exec-1 MODE (optional — 'you may'), exec-1 TARGET, exec-2 MODE, exec-2 TARGET — both printed modes offered each time (752.1, 820.2)", async () => {
    const game = await rebutted(true);
    await game.p2.yes();
    const seen = await walkNewChoices(game, async (d, i) => {
      if (d.kind === "pick" && d.semantics === "mode") {
        await game.p2.chooseMode(DEAL_4);
      } else if (d.kind === "pick") {
        await game.p2.pick(i < 2 ? "v" : "w");
      } else {
        throw new Error(`unexpected ${d.kind} prompt: ${d.prompt}`);
      }
    });
    expect(seen.map((d) => (d.kind === "pick" ? `${d.kind}:${d.semantics}` : d.kind))).toEqual([
      "pick:mode",
      "pick:target",
      "pick:mode",
      "pick:target",
    ]);
    const firstMode = seen[0];
    expect(firstMode).toMatchObject({ allowDecline: true, kind: "pick", seat: P2, semantics: "mode" });
    expect(firstMode?.kind === "pick" ? firstMode.options.map((o) => o.label) : []).toEqual(["Deal 4 to a unit in a base", "Kill a gear"]);
    const secondMode = seen[2];
    expect(secondMode?.kind === "pick" ? secondMode.options.map((o) => o.mode) : []).toEqual([DEAL_4, KILL_GEAR]);
    // After the last slot the game returns to an ordinary priority window on the (still pending) item.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["rb"]);
  });

  test("(a) the Repeat payment is NOT among the new choices: no yes/no, no integer, no pay prompt — P1 is not refunded and P2 is charged only 1 + [C] + [rainbow] (752.2, 755.1)", async () => {
    const game = await rebutted(true);
    await game.p2.yes();
    const p2After = { energy: game.p2.energy(), power: game.p2.power() };
    expect(p2After).toEqual({ energy: 4, power: 1 }); // 5 − 1, three power − [C] − [rainbow]
    const seen = await walkNewChoices(game, async (d) => {
      expect(d.kind).toBe("pick"); // never "yes-no" / "integer" (a Repeat toggle or [4][mind] payment)
      if (d.kind === "pick" && d.semantics === "mode") {
        await game.p2.chooseMode(DEAL_4);
      } else if (d.kind === "pick") {
        await game.p2.pick(d.options.find((o) => o.key === "v" || o.key === "w")?.key ?? "v");
      }
    });
    expect(seen.every((d) => d.kind === "pick" && (d.semantics === "mode" || d.semantics === "target"))).toBe(true);
    expect(seen.some((d) => /repeat/i.test(d.prompt))).toBe(false);
    // Nothing moved in either pool during the re-choice.
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect({ energy: game.p2.energy(), power: game.p2.power() }).toEqual(p2After);
    expect(executionsOnChain(game)).toHaveLength(2); // the thief inherits both paid executions
  });

  // ── (b) keep mode 1 → V; flip exec 2 to mode 1 → W ─────────────────────────────────────────

  test("(b) re-choice recorded on the item: exec 1 = Deal 4 → V, exec 2 = Deal 4 → W (753 — a legal subset re-made)", async () => {
    const game = await rebutted(true);
    await game.p2.yes();
    await game.p2.chooseMode(DEAL_4);
    // targets are read from the NEW controller's seat: P1's V and W are now legal "a unit in a base" picks
    const t1 = game.decision();
    expect(t1?.kind === "pick" ? t1.options.map((o) => o.key) : []).toEqual(expect.arrayContaining(["v", "w"]));
    expect(t1?.kind === "pick" ? t1.options.map((o) => o.key) : []).not.toContain("q"); // a gear is not a Deal-4 object
    await game.p2.pick("v");
    await game.p2.chooseMode(DEAL_4);
    await game.p2.pick("w");
    expect(executionsOnChain(game)).toEqual([
      { mode: DEAL_4, targets: ["v"] },
      { mode: DEAL_4, targets: ["w"] },
    ]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rb", controller: P2 })]);
  });

  test("(b) resolution under P2, in order: V (3) takes 4 and dies, W (4) takes 4 and dies; U and Q untouched; Rocket Barrage → OWNER P1's trash; nobody's pool changes", async () => {
    const game = await rebutted(true);
    await game.p2.yes();
    await game.p2.chooseMode(DEAL_4);
    await game.p2.pick("v");
    await game.p2.chooseMode(DEAL_4);
    await game.p2.pick("w");
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("v")).toBe("trash");
    expect(game.zoneOf("w")).toBe("trash");
    expect(game.state("u")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.zoneOf("q")).toBe("base");
    expect(game.zoneOf("rb")).toBe("trash");
    expect(game.state("rb").owner).toBe(P1);
    expect(game.p1.trash()).toContain("rb");
    expect(game.p2.trash()).not.toContain("rb");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // 8 + 2 mind stay spent
    expect({ energy: game.p2.energy(), power: game.p2.power() }).toEqual({ energy: 4, power: 1 });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // still P1's turn
    expect(game.violations()).toEqual([]);
  });

  test("(b) it is still ONE spell played (820.3.a): the play pipeline is not re-run — Rocket Barrage never returns to a hand and no second chain item appears", async () => {
    const game = await rebutted(true);
    await game.p2.yes();
    // Snapshot AFTER the steal: losing the play off P1's tally belongs to the
    // change of control (rule 424), not to the re-choice dialog measured here.
    const playedBefore = { ...game.gameState.cardsPlayedThisTurn };
    await game.p2.chooseMode(DEAL_4);
    await game.p2.pick("v");
    await game.p2.chooseMode(DEAL_4);
    await game.p2.pick("w");
    expect(game.chain()).toHaveLength(1);
    expect(game.zoneOf("rb")).toBe("chain");
    expect(game.gameState.cardsPlayedThisTurn).toEqual(playedBefore); // re-choosing is not playing
  });

  // ── (c) NO side: Repeat was not paid ───────────────────────────────────────────────────────

  test("(c) Repeat NOT paid by P1: the stolen item has exactly one execution; P2 re-chooses ONE mode/target pair and is never offered a Repeat toggle — even though P2 could afford [4][mind] (752.2, 755.1)", async () => {
    const game = await rebutted(false);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { mind: 1 } }); // only the base cost was paid
    await game.p2.yes();
    const seen = await walkNewChoices(game, async (d) => {
      expect(d.kind).toBe("pick");
      if (d.kind === "pick" && d.semantics === "mode") {
        await game.p2.chooseMode(DEAL_4);
      } else if (d.kind === "pick") {
        await game.p2.pick("w");
      }
    });
    expect(seen.map((d) => (d.kind === "pick" ? d.semantics : d.kind))).toEqual(["mode", "target"]);
    expect(seen.some((d) => /repeat/i.test(d.prompt))).toBe(false);
    expect(executionsOnChain(game)).toEqual([{ mode: DEAL_4, targets: ["w"] }]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rb", controller: P2, mode: DEAL_4, targets: ["w"] })]);
    expect({ energy: game.p2.energy(), power: game.p2.power() }).toEqual({ energy: 4, power: 1 }); // no [4][mind] taken
    expect(game.p1.resources()).toEqual({ energy: 4, power: { mind: 1 } });
  });

  test("(c) …and on resolution exactly one unit is hit: W (4) dies, V / U / Q untouched, Rocket Barrage → P1's trash", async () => {
    const game = await rebutted(false);
    await game.p2.yes();
    await game.p2.chooseMode(DEAL_4);
    await game.p2.pick("w");
    await game.settle();
    expect(game.zoneOf("w")).toBe("trash");
    expect(game.state("v")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("u")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.zoneOf("q")).toBe("base");
    expect(game.p1.trash()).toContain("rb");
    expect(game.violations()).toEqual([]);
  });

  // ── control ────────────────────────────────────────────────────────────────────────────────

  test("control: un-rebutted, P1's original choices resolve in order — U takes 4 and dies, then Q is killed; V and W untouched", async () => {
    const game = await board().build();
    await game.p1.cast("rb", { modes: [DEAL_4, KILL_GEAR], repeat: 1, targets: ["u", "q"] });
    await game.settle();
    expect(game.zoneOf("u")).toBe("trash");
    expect(game.zoneOf("q")).toBe("trash");
    expect(game.zoneOf("v")).toBe("base");
    expect(game.zoneOf("w")).toBe("base");
    expect(game.p1.trash()).toContain("rb");
  });
});
