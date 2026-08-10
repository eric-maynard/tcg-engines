/**
 * Interaction: Overt Operation (ogn-153-298, Spell · Body · 5 + [body][body] · Action)
 *     "For each friendly unit, you may spend its buff to ready it. Then buff all friendly units."
 *   × Lee Sin, Ascetic (ogn-078-298, 5 Might) "…I can have any number of buffs."   — EXHAUSTED, 3 buffs (8 Might)
 *   × Simian Ancestor (sfd-047-221, 5 Might) "When you buff me, ready me."          — EXHAUSTED, 1 buff  (6 Might)
 *   × Z, a vanilla 2-Might unit                                                       — EXHAUSTED, no buff
 *
 * Question:
 *   (a) For Lee Sin, does "spend its buff" remove one counter or all three, and is he readied?
 *   (b) Can Z be readied by the first sentence?
 *   (c) P1 spends for Lee Sin AND Simian. After "Then buff all friendly units", each unit's counter count,
 *       Might and ready state — does Simian's trigger fire?
 *   (d) Contrast: P1 declines to spend Simian's buff — does "buff all" buff Simian / fire its trigger / ready it?
 *
 * Rules: 702.2.b (spending a buff removes ONE counter), 702.2.b.1 (no buff → cannot spend), 426.1.b.1 /
 * 426.1.c (a unit that already has a buff is not Buffed and "when you buff me" does not trigger),
 * 426.1.b.2 (cap lifted → the buff lands), 703 (each buff = +1 Might).
 *
 * Expected: (a) one: 3 → 2, readied; then re-buffed 2 → 3 = 8 Might, ready. (b) no — Z is not even offered;
 * it stays exhausted (buff-all gives it 0 → 1, 3 Might). (c) Lee 3 / 8 / ready; Simian 0 → 1 / 6 / ready, its
 * trigger fires (a no-op, already ready); Z 1 / 3 / exhausted. (d) Simian keeps 1 counter, is NOT buffed,
 * trigger does NOT fire, stays exhausted at 6; Lee and Z as in (c).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const OVERT_OPERATION = "ogn-153-298";
const LEE_SIN = "ogn-078-298";
const SIMIAN = "sfd-047-221";

/** Buff-counter inventory: the first-buff flag + cap-lifted extras (rule 702.3). */
function buffCount(game: Game, card: string): number {
  const s = game.state(card);
  return (s.isBuffed ? 1 : 0) + (((s.meta as { extraBuffs?: number }).extraBuffs ?? 0) as number);
}

function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { body: 2 } })
    .unit(P1, "base", LEE_SIN, "lee", { buffed: true, exhausted: true, extraBuffs: 2 })
    .unit(P1, "base", SIMIAN, "simian", { buffed: true, exhausted: true })
    .unit(P1, "base", { might: 2, name: "Zed Vanilla" }, "z", { exhausted: true })
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe");
}

/** Cast Overt Operation and drain to the "spend which buffs?" subset prompt. */
async function castToSpendPrompt(): Promise<Game> {
  const game = await board().hand(P1, OVERT_OPERATION, "oo").build();
  expect(game.state("lee")).toMatchObject({ isExhausted: true, might: 8 });
  expect(buffCount(game, "lee")).toBe(3);
  expect(game.state("simian")).toMatchObject({ isExhausted: true, might: 6 });
  expect(buffCount(game, "simian")).toBe(1);
  expect(game.state("z")).toMatchObject({ isBuffed: false, isExhausted: true, might: 2 });
  await game.p1.cast("oo");
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  return game;
}

/** Answer the spend prompt with `spend`, then drain the rest of the resolution while recording chain items seen. */
async function spendAndResolve(game: Game, spend: string[]): Promise<string[]> {
  const seen = new Set<string>();
  const note = () => {
    for (const item of game.chain()) {
      seen.add(`${item.cardId}${item.triggered ? ":trigger" : ""}`);
    }
  };
  if (spend.length === 0) {
    await game.p1.decline();
  } else {
    await game.p1.pick(...spend);
  }
  note();
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    await game.settle({ maxSteps: 1 });
    note();
  }
  await game.settle();
  return [...seen];
}

describe("Overt Operation × Lee Sin (3 buffs) / Simian Ancestor / unbuffed Z", () => {
  test("(b) the spend prompt is a per-unit subset pick offering ONLY the buffed units — Lee Sin and Simian, never Z (702.2.b.1)", async () => {
    const game = await castToSpendPrompt();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", min: 0, seat: P1 });
    expect(d.max).toBe(2);
    expect(d.options.map((o) => o.card).sort()).toEqual(["lee", "simian"]);
    await expect(game.p1.pick("z")).rejects.toThrow();
  });

  test("(a) spending Lee Sin's buff removes ONE counter, not all three: after the re-buff he is back to 3 counters / 8 Might and READY (702.2.b, 426.1.b.2)", async () => {
    const game = await castToSpendPrompt();
    await spendAndResolve(game, ["lee"]);
    // Had all three been removed, buff-all would leave him at 1 counter / 6 Might.
    expect(buffCount(game, "lee")).toBe(3);
    expect(game.state("lee").might).toBe(8);
    expect(game.state("lee").isReady).toBe(true);
    expect(game.zoneOf("oo")).toBe("trash");
  });

  test("(c) spend for Lee Sin + Simian: Lee 3/8/ready; Simian 1/6/ready and its 'when you buff me' trigger FIRES; Z 1/3/still exhausted; enemy untouched", async () => {
    const game = await castToSpendPrompt();
    const seen = await spendAndResolve(game, ["lee", "simian"]);
    expect(buffCount(game, "lee")).toBe(3);
    expect(game.state("lee")).toMatchObject({ isReady: true, might: 8 });
    expect(buffCount(game, "simian")).toBe(1);
    expect(game.state("simian")).toMatchObject({ isReady: true, might: 6 });
    expect(seen).toContain("simian:trigger"); // 0 → 1 is a real Buff → "When you buff me" triggers (resolves as a no-op)
    expect(buffCount(game, "z")).toBe(1);
    expect(game.state("z")).toMatchObject({ isBuffed: true, isExhausted: true, might: 3 }); // being buffed does not ready Z
    expect(game.state("foe")).toMatchObject({ isBuffed: false, might: 2 });
    expect(game.chain()).toHaveLength(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(d) spend for Lee Sin only: Simian keeps its 1 counter through step one, is NOT buffed by 'buff all' (426.1.b.1/426.1.c) — no trigger, still EXHAUSTED at 6", async () => {
    const game = await castToSpendPrompt();
    const seen = await spendAndResolve(game, ["lee"]);
    expect(buffCount(game, "simian")).toBe(1);
    expect(game.state("simian")).toMatchObject({ isBuffed: true, isExhausted: true, might: 6 });
    expect(seen).not.toContain("simian:trigger");
    // Lee Sin and Z exactly as in (c).
    expect(buffCount(game, "lee")).toBe(3);
    expect(game.state("lee")).toMatchObject({ isReady: true, might: 8 });
    expect(game.state("z")).toMatchObject({ isBuffed: true, isExhausted: true, might: 3 });
  });

  test("(d') spend nothing at all: nobody is readied; only Z (0 → 1) is actually buffed; Lee Sin's lifted cap still takes a 4th counter (9 Might)", async () => {
    const game = await castToSpendPrompt();
    const seen = await spendAndResolve(game, []);
    expect(game.state("simian")).toMatchObject({ isExhausted: true, might: 6 });
    expect(buffCount(game, "simian")).toBe(1);
    expect(seen).not.toContain("simian:trigger");
    expect(game.state("z")).toMatchObject({ isBuffed: true, isExhausted: true, might: 3 });
    // 426.1.b.2: Lee Sin "can have any number of buffs" — buff-all lands on him even unspent: 3 → 4.
    expect(buffCount(game, "lee")).toBe(4);
    expect(game.state("lee")).toMatchObject({ isExhausted: true, might: 9 });
  });
});
