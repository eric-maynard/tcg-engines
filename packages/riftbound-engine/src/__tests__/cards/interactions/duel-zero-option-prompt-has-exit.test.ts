/**
 * Interaction: Cataclysmic Duel (ven-090-166) · Spell · Body · [8] + [body][body][body]
 *     "Each player chooses a unit they control. Kill the rest."
 *   × Zhonya's Hourglass (ogn-077-298) · Gear · Calm · [2] · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Rules: 355.6 (each player chooses, in turn order), 359.3.e.6 + 128.6.a (an instruction that cannot be
 * followed is ignored — a seat with no unit has no legal choice), 367 / 369.1 (replacement effects),
 * 340.1 (priority after the item leaves the chain).
 *
 * Question: the Duel resolves while ONE seat controls no units at all and the other controls three plus
 * a face-up Zhonya's Hourglass.
 *   Zero-option side — does that seat get a prompt at all? It must not receive a modal with no choices and
 *   no exit, must not block the other seat's pick, and must simply be skipped.
 *   Other side — when the two unchosen units die, does Zhonya's fire as an ANSWERABLE prompt that says
 *   which death it is being applied to (and which card pays for it), and does the second unchosen unit
 *   still die normally?
 *
 * Expected: the unit-less seat is never asked (359.3.e.6); the other seat picks a keeper; the two others
 * die as one event; Zhonya's replaces exactly ONE of those deaths (killing itself, healing + exhausting +
 * recalling that unit to base), the other dies normally; every prompt in the sequence is answerable and
 * the board settles back to an open main phase with an empty chain.
 *
 * Not observable through the harness (asserted only as "no prompt, no stall"): the client-side log line
 * that should state WHY the unit-less seat was skipped.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";
import type { Decision, Game } from "../../../harness";

const DUEL = "ven-090-166";
const ZHONYAS = "ogn-077-298";

/** Drive to the next open state, recording every decision that had to be answered by hand. */
async function driveRecording(
  game: Game,
  answer: (d: Decision) => Promise<void>,
): Promise<{ seat: string; kind: string; prompt: string; timing: string }[]> {
  const asked: { seat: string; kind: string; prompt: string; timing: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const settled = await game.settle({ maxSteps: 60 });
    const d = game.decision();
    if (settled.reason !== "unanswered" || !d) {
      return asked;
    }
    asked.push({ kind: d.kind, prompt: d.prompt, seat: d.seat, timing: d.timing });
    await answer(d);
  }
  throw new Error("did not settle");
}

/** P1 casts with NO units of its own; P2 holds three units at bf1 plus a face-up Zhonya's. */
function zeroVsThree() {
  return scenario()
    .resources(P1, { energy: 8, power: { body: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Keeper" }, "keeper")
    .unit(P2, "bf1", { might: 3, name: "Doomed" }, "doomed", { damage: 1 })
    .unit(P2, "bf1", { might: 4, name: "Saved" }, "saved", { damage: 1 })
    .gear(P2, ZHONYAS, "zh")
    .hand(P1, DUEL, "duel");
}

describe("Cataclysmic Duel × Zhonya's Hourglass — the zero-option seat is skipped, not stalled", () => {
  test("premise: the Duel is [8]+[body]×3 and kills every unit except each player's chosen one", async () => {
    const game = await zeroVsThree().build();
    expect(game.state("duel").energyCost).toBe(8);
    expect(game.state("duel").powerCost).toEqual(["body", "body", "body"]);
    expect(game.p1.units()).toEqual([]);
    expect(game.p2.units("bf1").sort()).toEqual(["doomed", "keeper", "saved"]);
  });

  test("zero-option side: P1 controls no unit and is NEVER asked — only P2 ever holds a decision (359.3.e.6, 128.6.a)", async () => {
    const game = await zeroVsThree().build();
    await game.p1.cast("duel");
    const asked = await driveRecording(game, async (d) => {
      await game.seat(d.seat).pick(
        (d as Extract<Decision, { kind: "pick" }>).options[0]?.key ?? "",
      );
    });
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((a) => a.seat === P2)).toBe(true);
    expect(asked.some((a) => a.seat === P1)).toBe(false);
  });

  test("zero-option side: the skip does not block the other seat — P2's pick is offered immediately and the resolution completes (340.1)", async () => {
    const game = await zeroVsThree().build();
    await game.p1.cast("duel");
    await game.settle({ maxSteps: 60 });
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    expect(d?.seat).toBe(P2);
    expect(game.p1.decision()).toBeNull();
    expect(game.zoneOf("duel")).toBe("chain");
  });

  test("no prompt anywhere in the sequence is empty or unanswerable — every one has ≥1 option and the game reaches an open main phase", async () => {
    const game = await zeroVsThree().build();
    await game.p1.cast("duel");
    const asked = await driveRecording(game, async (d) => {
      const opts = (d as Extract<Decision, { kind: "pick" }>).options;
      expect(opts.length).toBeGreaterThan(0);
      await game.seat(d.seat).pick(opts[0]!.key);
    });
    expect(asked.map((a) => a.kind)).toEqual(["pick", "pick"]);
    expect(game.decision()?.kind).toBe("action");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("turn order (355.6): when BOTH seats control units the turn player is asked first, then the opponent", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { body: 3 } })
      .unit(P1, "base", { might: 1, name: "Mine" }, "mine")
      .unit(P1, "base", { might: 1, name: "MineB" }, "mineB")
      .unit(P2, "base", { might: 2, name: "Theirs" }, "theirs")
      .unit(P2, "base", { might: 3, name: "TheirsB" }, "theirsB")
      .hand(P1, DUEL, "duel")
      .build();
    await game.p1.cast("duel");
    const asked = await driveRecording(game, async (d) => {
      await game.seat(d.seat).pick(
        (d as Extract<Decision, { kind: "pick" }>).options[0]!.key,
      );
    });
    expect(asked.map((a) => a.seat)).toEqual([P1, P2]);
    expect(game.zoneOf("mine")).toBe("base");
    expect(game.zoneOf("mineB")).toBe("trash");
    expect(game.zoneOf("theirs")).toBe("base");
    expect(game.zoneOf("theirsB")).toBe("trash");
  });

  test("Zhonya's fires as an ANSWERABLE prompt over the two dying units — not a silent pick (367, 369.1)", async () => {
    const game = await zeroVsThree().build();
    await game.p1.cast("duel");
    await game.settle({ maxSteps: 60 });
    await game.p2.pick("keeper");
    await game.settle({ maxSteps: 60 });
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    expect(d?.seat).toBe(P2);
    expect(d?.timing).toBe("RPL");
    const pick = d as Extract<Decision, { kind: "pick" }>;
    expect(pick.semantics).toBe("replacement-assign");
    expect(pick.options.map((o) => o.key).sort()).toEqual(["doomed", "saved"]);
    expect(pick.allowDecline).toBe(false);
  });

  test("the prompt names what pays for it: the replacement's source is Zhonya's Hourglass itself", async () => {
    const game = await zeroVsThree().build();
    await game.p1.cast("duel");
    await game.settle({ maxSteps: 60 });
    await game.p2.pick("keeper");
    await game.settle({ maxSteps: 60 });
    expect(game.decision()?.source?.cardId).toBe("zh");
  });

  test("the replacement applies ONCE: the named unit is healed, exhausted and recalled to base; Zhonya's dies; the OTHER unchosen unit dies normally", async () => {
    const game = await zeroVsThree().build();
    await game.p1.cast("duel");
    await game.settle({ maxSteps: 60 });
    await game.p2.pick("keeper");
    await game.settle({ maxSteps: 60 });
    await game.p2.pick("saved");
    await game.settle({ maxSteps: 60 });

    expect(game.zoneOf("zh")).toBe("trash"); // Zhonya's killed instead
    expect(game.zoneOf("saved")).toBe("base"); // recalled — a recall, not a move
    expect(game.locationOf("saved")).toBe("base");
    expect(game.state("saved").damage).toBe(0); // healed
    expect(game.state("saved").isExhausted).toBe(true);

    expect(game.zoneOf("doomed")).toBe("trash"); // the second death is NOT replaced
    expect(game.p2.trash().sort()).toEqual(["doomed", "zh"]);
  });

  test("the chosen unit is untouched — still at bf1, undamaged by the Duel, not exhausted", async () => {
    const game = await zeroVsThree().build();
    await game.p1.cast("duel");
    await game.settle({ maxSteps: 60 });
    await game.p2.pick("keeper");
    await game.settle({ maxSteps: 60 });
    await game.p2.pick("saved");
    await game.settle({ maxSteps: 60 });
    expect(game.locationOf("keeper")).toBe("bf1");
    expect(game.state("keeper").damage).toBe(0);
    expect(game.state("keeper").isExhausted).toBe(false);
    expect(game.zoneOf("duel")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()?.kind).toBe("action");
    expect(game.violations()).toEqual([]);
  });
});
