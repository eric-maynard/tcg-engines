/**
 * Interaction: the Claude seat has to divide damage twice in one attack — once for a split trigger,
 * once for combat damage — against defenders that constrain the assignment.
 *
 *   Volibear, Furious (ogn-041-298) — Champion Unit, Fury, 9 Might. "When I attack, deal 5 damage
 *                      split among any number of enemy units here."
 *   Sunlit Guardian   (ogn-054-298) — Unit, Calm, 3 Might. "[Shield] … [Tank] (I must be assigned
 *                      combat damage first.)"
 *   Caitlyn, Patrolling(ogn-068-298) — Champion Unit, Calm, 3 Might. "I must be assigned combat
 *                      damage last."
 *
 * Q: (a) the AI's distribute prompt tells the model "Answer via answer.keys with ONE option number
 * to put all N there". With two split targets that answer can never be legal (each remaining target
 * takes at least 1, 355.14.f/g) — is it rejected by validation, re-asked, and does the fallback land
 * on a LEGAL allocation rather than an illegal one or a hung prompt? (b) In the Combat Damage Step,
 * is "all of it on Caitlyn" refused (Tank first) and is "all of it on the Guardian" ALSO refused
 * while Caitlyn is unassigned (465.2.c.4)? (c) does the human keep receiving frames, with an
 * ai_status thinking flag that clears, so the board is never frozen mid-assignment?
 *
 * Rules: 355.14.b (split TARGETS are chosen at finalization), 355.14.e (the division is decided at
 * resolution), 355.14.f / 355.14.g (every remaining target receives a positive amount), 465.2.c.3
 * (one allocation for the whole side), 465.2.c.4 (no unit takes more than lethal while units remain
 * unassigned), 465.2.c.6 (assignment restrictions must be obeyed), 815.1.b ([Tank] takes lethal
 * before non-Tank units of the same controller).
 */
import { describe, expect, test } from "bun:test";
import type { CallModel, ModelRequest } from "../../../../../../apps/riftbound-app/server/ai-opponent";
import { ClaudeOpponent, aiSeatMustAct } from "../../../../../../apps/riftbound-app/server/ai-opponent";
import type { GameSession } from "../../../../../../apps/riftbound-app/server/state";
import { applySessionMove } from "../../../../../../apps/riftbound-app/server/turn";
import type { DistributeDecision, Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOLIBEAR = "ogn-041-298";
const GUARDIAN = "ogn-054-298";
const CAITLYN = "ogn-068-298";

const FAST = { backoffMs: 0, lookupTools: [], pacingMs: 0, timeoutMs: 2000 };

interface Frame { type: string; ai?: { thinking?: boolean }; state?: unknown }

/** A session around a harness engine, plus a fake human client that records every frame. */
function sessionOf(game: Game, ai?: ClaudeOpponent): { session: GameSession; frames: Frame[] } {
  const frames: Frame[] = [];
  const session = {
    clients: new Map(),
    engine: game.engine,
    log: [],
    playerNames: { [P1]: "Human", [P2]: "Claude" },
    players: [P1, P2],
    sandbox: true,
    seq: 0,
  } as unknown as GameSession;
  if (ai) {
    (session as { opponent?: ClaudeOpponent }).opponent = ai;
  }
  session.clients.set("human-1", {
    playerId: P1,
    ws: { send: (s: string) => frames.push(JSON.parse(s) as Frame) },
  } as never);
  return { frames, session };
}

/**
 * The provider the pairing describes: menus get the first matching entry, and EVERY distribute
 * prompt is answered exactly as the AI's own instruction says — one option number, all of it there.
 */
function collapsingProvider(menuMatch: RegExp) {
  const calls: ModelRequest[] = [];
  const callModel: CallModel = async (req) => {
    calls.push(req);
    const d = req.meta.decision;
    if (d) {
      const aliases = [...(req.meta.keyAliases ?? [])].map(([alias]) => alias);
      if (d.kind === "distribute") {
        return { input: { keys: [aliases[0]], rationale: "all in one bucket" }, name: "answer" };
      }
      return { input: { keys: aliases, rationale: "everything offered" }, name: "answer" };
    }
    const hit = req.meta.menu?.find((it) => menuMatch.test(it.label)) ?? req.meta.menu?.[0];
    return { input: { index: hit?.index ?? 0, rationale: "advance" }, name: "choose" };
  };
  return { callModel, calls };
}

/** Let the AI act; pass for the human whenever it merely holds priority on the AI's chain. */
async function drive(session: GameSession, ai: ClaudeOpponent, rounds = 14): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    if (aiSeatMustAct(session, P2)) {
      await ai.act(session);
      continue;
    }
    const st = session.engine.getState();
    const chain = st.interaction?.chain;
    if (st.status === "playing" && chain?.active && chain.activePlayer === P1) {
      expect(applySessionMove(session, P1, "passChainPriority", { playerId: P1 }).success).toBe(true);
      continue;
    }
    break;
  }
}

/** P2 is the Claude seat: Volibear in base, the human holding bf1 with the Guardian and Caitlyn. */
function board(volibearMightModifier?: number) {
  return scenario()
    .interactive()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P2, "base", VOLIBEAR, "voli", volibearMightModifier === undefined ? undefined : { mightModifier: volibearMightModifier })
    .unit(P1, "bf1", GUARDIAN, "guard")
    .unit(P1, "bf1", CAITLYN, "cait");
}

describe("Claude assigning damage: Volibear's split × [Tank] Sunlit Guardian × Backline Caitlyn", () => {
  // -------------------------------------------------------------------------
  // (a) 355.14 — the single-bucket answer is never legal with two split targets
  // -------------------------------------------------------------------------
  test("355.14.b / 355.14.e / 355.14.f — targets are named at finalization; at resolution every target must get at least 1, so a one-bucket allocation is not a legal answer", async () => {
    const game = await board().build();
    await game.p2.move("voli", "bf1");
    const pick = game.decision() as PickDecision;
    expect(pick).toMatchObject({ kind: "pick", seat: P2, targeting: "split-targets", timing: "FIN" });
    expect(pick.options.map((o) => o.card).sort()).toEqual(["cait", "guard"]);
    await game.p2.pick("guard", "cait");
    await game.p2.passPriority();
    await game.p1.passPriority();

    const d = game.decision() as DistributeDecision;
    expect(d).toMatchObject({ kind: "distribute", seat: P2, total: 5 });
    // 355.14.f / 355.14.g — each remaining target's bucket floor is 1, so 5/0 is off the board.
    expect(d.buckets.map((b) => [b.card, b.min, b.max])).toEqual([["guard", 1, 4], ["cait", 1, 4]]);
    expect((await game.p2.try((s) => s.distribute({ cait: 0, guard: 5 }))).ok).toBe(false);
    expect((await game.p2.try((s) => s.distribute({ cait: 5, guard: 0 }))).ok).toBe(false);
    expect((await game.p2.try((s) => s.distribute({ cait: 1, guard: 4 }))).ok).toBe(true);
  });

  test("(a) the AI's 'one option number' answer is REJECTED, re-asked with a NOTE, and after three tries the Goldfish fallback applies a LEGAL split — never a coerced or hung one", async () => {
    const game = await board().build();
    const { callModel, calls } = collapsingProvider(/Move Volibear/);
    const ai = new ClaudeOpponent("haiku", "sk-ant-api03-testkeytestkey", { ...FAST, callModel });
    const { session } = sessionOf(game, ai);
    await drive(session, ai);

    const distributeCalls = calls.filter((c) => c.meta.decision?.kind === "distribute");
    expect(distributeCalls).toHaveLength(3); // one try + two retries — never coerced into legality
    expect(distributeCalls.slice(1).every((c) => String(c.messages[0]?.content).includes("NOTE: Your previous reply was invalid"))).toBe(true);
    expect(session.log.some((e) => /Resolve prompt \(first option\) \(fallback\)/u.test(e.text))).toBe(true);

    // The fallback landed on a real, legal allocation: 5 total, every target at least 1.
    const toGuard = game.has("guard") ? game.state("guard").damage : 5 - 1;
    const toCait = 5 - toGuard;
    expect(toGuard).toBeGreaterThanOrEqual(1);
    expect(toCait).toBeGreaterThanOrEqual(1);
    // …and it actually hit the human's board: whoever got 3+ of it is dead (both are 3 Might, and
    // only the Guardian's [Shield] raises that while it defends).
    expect(game.zoneOf("cait")).toBe(toCait >= 3 ? "trash" : "battlefield-bf1");
    expect(ai.busy).toBe(false);
    expect(ai.thinking).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // (b) 465.2.c — Tank first, Backline last, cap in between
  // -------------------------------------------------------------------------
  test("815.1.b / 465.2.c.6 — with 6 attacking Might the ONLY legal combat assignment is lethal to the [Tank] and NOTHING to the Backline champion: Caitlyn survives untouched", async () => {
    // Volibear weakened to 6: the Guardian's lethal (4 while defending, [Shield]) must be filled
    // first, and Caitlyn — assigned last — cannot be reached with what is left.
    const game = await board(-3).build();
    expect(game.state("voli").might).toBe(6);
    await game.p2.move("voli", "bf1");
    await game.p2.decline(); // 355.13 — "any number of" may be none, so no split muddies the read
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p2.passFocus();
    await game.p1.passFocus();

    // Exactly one legal allocation ⇒ nothing is asked at all (355.8): the restrictions decided it.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.zoneOf("guard")).toBe("trash"); // took its full lethal first
    expect(game.zoneOf("cait")).toBe("battlefield-bf1");
    expect(game.state("cait").damage).toBe(0); // never assigned: Backline is last, and last never came
    expect(game.zoneOf("voli")).toBe("trash"); // 4 + 3 back ≥ 6
  });

  test("465.2.c.3 / 465.2.c.4 — with both defenders wounded and alive, BOTH single-bucket answers are illegal and the greedy default is Tank-first / Backline-last", async () => {
    const game = await board().build();
    await game.p2.move("voli", "bf1");
    await game.p2.pick("guard", "cait");
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p2.distribute({ cait: 2, guard: 3 }); // both survive the trigger, both now 1 from lethal
    expect(game.state("guard")).toMatchObject({ damage: 3, might: 4 });
    expect(game.state("cait")).toMatchObject({ damage: 2, might: 3 });
    await game.p2.passFocus();
    await game.p1.passFocus();

    const d = game.decision() as DistributeDecision;
    expect(d).toMatchObject({ kind: "distribute", seat: P2, total: 9 });
    expect(Object.fromEntries(d.buckets.map((b) => [b.card, b.lethal]))).toEqual({ cait: 1, guard: 1 });
    // The two answers the AI's distribute instruction can produce are both refused.
    expect((await game.p2.try((s) => s.distribute({ cait: 0, guard: 9 }))).ok).toBe(false);
    expect((await game.p2.try((s) => s.distribute({ cait: 9, guard: 0 }))).ok).toBe(false);
    // 815.1.b / 465.2.c.6 — the offered default fills the Tank first and gives the Backline champion
    // exactly its lethal, last; it is not merely a shape that sums to 9.
    expect(d.defaultAllocation).toEqual({ cait: 1, guard: 8 });
  });

  test("(b) handed that same prompt, the mock's collapse-to-one-bucket answer fails validation three times and the fallback applies the legal Tank-first assignment", async () => {
    const game = await board().build();
    await game.p2.move("voli", "bf1");
    await game.p2.pick("guard", "cait");
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p2.distribute({ cait: 2, guard: 3 });
    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(game.decision()?.kind).toBe("distribute");

    const { callModel, calls } = collapsingProvider(/./);
    const ai = new ClaudeOpponent("sonnet", "sk-ant-api03-testkeytestkey", { ...FAST, callModel });
    const { session } = sessionOf(game, ai);
    await drive(session, ai);

    expect(calls.filter((c) => c.meta.decision?.kind === "distribute")).toHaveLength(3);
    expect(session.log.some((e) => /fallback/u.test(e.text))).toBe(true);
    // The assignment really happened, and it obeyed the caps: both defenders had lethal 1 left.
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("cait")).toBe("trash");
    expect(game.decision()?.kind).not.toBe("distribute"); // never stuck at "assigning"
    expect(ai.thinking).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // (c) the human's frames
  // -------------------------------------------------------------------------
  test("(c) the human keeps receiving frames while Claude works: ai_status raises `thinking`, per-seat state_updates land between the two assignments, and thinking clears at the end", async () => {
    const game = await board().build();
    const { callModel } = collapsingProvider(/Move Volibear/);
    const ai = new ClaudeOpponent("opus", "sk-ant-api03-testkeytestkey", { ...FAST, callModel });
    const { frames, session } = sessionOf(game, ai);
    await drive(session, ai);

    const statuses = frames.filter((f) => f.type === "ai_status");
    const updates = frames.filter((f) => f.type === "state_update");
    expect(statuses.some((f) => f.ai?.thinking === true)).toBe(true); // raised before a decision
    expect(statuses.at(-1)?.ai?.thinking).toBe(false); // cleared in act()'s finally
    expect(ai.thinking).toBe(false);
    expect(updates.length).toBeGreaterThanOrEqual(2); // a frame after each applied move
    // Frames are interleaved, not batched at the end: a state_update lands before the last status.
    expect(frames.findIndex((f) => f.type === "state_update")).toBeLessThan(frames.length - 1);
    // Every state_update carries a snapshot (built per seat for this client), never an empty frame.
    expect(updates.every((f) => f.state !== undefined && f.state !== null)).toBe(true);
    // And the position the human is left looking at is the resolved one, not "assigning".
    expect(game.decision()?.kind).not.toBe("distribute");
  });
});
