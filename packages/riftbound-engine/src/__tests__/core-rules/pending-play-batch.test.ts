/**
 * Core rules — plays an effect QUEUES are Pending Items finalized as one batch before any Priority.
 *
 *   354.2 / 354.3 / 419.3   a card an effect plays goes to the Chain as a Pending Item at once and finishes
 *                           its play when the resolving effect is done — in the order the effect names
 *                           (Promising Future: next player first)
 *   383.2.c / 419.4.a       a trigger created because the SPELL was played (it resolved) is appended AFTER
 *                           whatever the spell queued
 *   337.1 / 337.1.a / 337.1.b / 337.3
 *                           Pending Items are finalized oldest-first, back to back; finalizing does not pass
 *                           Priority; a play's own play-triggers ("when you play me", "when an opponent plays a
 *                           unit") are appended as the permanent enters and are finalized in the same sweep
 *   337.2                   a finalized permanent resolves (enters) immediately; a spell keeps its slot
 *   337.4                   the FIRST Priority window opens only when nothing is Pending
 *   340.1                   resolution is strict LIFO over the finalized stack
 *   419.4.a                 a spell played this way fires "when you play a spell" exactly like a hand cast
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const PROMISING_FUTURE = "ogn-115-298"; // each player looks at 5, banishes one, recycles rest; next player first, each plays theirs ignoring Energy
const RAVENBLOOM_STUDENT = "ogn-103-298"; // "When you play a spell, give me +1 [Might] this turn."
const STUPEFY = "ogn-095-298"; // Reaction, 1: "Give a unit -1 [Might] this turn, to a minimum of 1. Draw 1."
const VEX = "unl-150-219"; // "When an opponent plays a unit while I'm at a battlefield, [Stun] it. …"
const FILLER = { cardType: "unit", energyCost: 3, might: 1, name: "Filler" } as const;
const BODY = { cardType: "unit", energyCost: 4, might: 4, name: "Body" } as const;

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

const isPickFor = (seat: string, re: RegExp) => (d: Decision | null) => d?.kind === "pick" && d.seat === seat && re.test(d.prompt);
const isChainPriority = (d: Decision | null) => d?.kind === "action" && d.context === "chain";
const isOpenMain = (d: Decision | null) => d?.kind === "action" && d.context === "main";

async function until(game: Game, pred: (d: Decision | null) => boolean, max = 30): Promise<Decision | null> {
  for (let i = 0; i < max; i++) {
    if (pred(game.decision())) {
      return game.decision();
    }
    const r = await game.settle({ maxSteps: 1 });
    if (r.reason !== "max-steps" && !pred(game.decision())) {
      break;
    }
  }
  expect(pred(game.decision())).toBe(true);
  return game.decision();
}

/** P1 casts PF; P1 banishes its top card, then P2 its top card. */
async function castAndBanish(game: Game, p1Pick: string, p2Pick: string): Promise<void> {
  await game.p1.cast("pf");
  await until(game, isPickFor(P1, /banish/i));
  await game.p1.pick(p1Pick);
  await until(game, isPickFor(P2, /banish/i));
  await game.p2.pick(p2Pick);
  expect(game.zoneOf("pf")).toBe("trash");
}

describe("two queued SPELL plays + the resolving spell's own play-trigger", () => {
  function board() {
    return scenario()
      .resources(P1, { energy: 5, power: { mind: 1 } })
      .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
      .unit(P2, "base", { might: 3, name: "Bystander" }, "by")
      .deck(P1, [STUPEFY, FILLER, FILLER, FILLER, FILLER, FILLER], ["s1", "a2", "a3", "a4", "a5", "a6"])
      .deck(P2, [STUPEFY, FILLER, FILLER, FILLER, FILLER, FILLER], ["s2", "b2", "b3", "b4", "b5", "b6"])
      .hand(P1, PROMISING_FUTURE, "pf");
  }

  test("chain order right after the picks: [P2's spell, P1's spell, Student's trigger off PF] oldest→newest — plays in the effect's order, the spell's trigger appended after them (354.3, 383.2.c)", async () => {
    const game = await board().build();
    await castAndBanish(game, "s1", "s2");
    expect(game.chain().map((c) => [c.cardId, c.controller])).toEqual([
      ["s2", P2],
      ["s1", P1],
      ["student", P1],
    ]);
    // The oldest pending item's performer is asked first: P2 picks its Stupefy's target — no priority yet.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
  });

  test("no priority until everything is finalized: P2 targets, then P1 targets, and the FIRST chain-priority decision sees both spells finalized (targets bound, in their original slots) under the finalized trigger (337.1.a, 337.4)", async () => {
    const game = await board().build();
    await castAndBanish(game, "s1", "s2");
    const seen: string[] = [];
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (isChainPriority(d) || !d) {
        break;
      }
      expect(d.kind).toBe("pick"); // never an action menu in between
      seen.push(d.seat);
      await game.seat(d.seat).pick(d.seat === P2 ? "student" : "by");
    }
    expect(seen).toEqual([P2, P1]);
    expect(isChainPriority(game.decision())).toBe(true);
    expect(game.chain().map((c) => [c.cardId, c.targets ?? null, c.status ?? "finalized"])).toEqual([
      ["s2", ["student"], "finalized"],
      ["s1", ["by"], "finalized"],
      ["student", null, "finalized"],
    ]);
    expect(game.decision()?.seat).toBe(P1); // controller of the newest item (337.4)
  });

  test("LIFO resolution + 419.4.a for effect-played spells: Student's PF trigger first (+1), then P1's Stupefy (fires Student AGAIN → +1), then P2's Stupefy (−1): Student ends 3, each player drew 1", async () => {
    const game = await board().build();
    await castAndBanish(game, "s1", "s2");
    await until(game, isPickFor(P2, /target/i));
    await game.p2.pick("student");
    await until(game, isPickFor(P1, /target/i));
    await game.p1.pick("by");
    const order: string[] = [];
    let sawSecondStudentTrigger = false;
    for (let i = 0; i < 40 && !isOpenMain(game.decision()); i++) {
      const before = game.chain().map((c) => c.cardId);
      await game.settle({ maxSteps: 1 });
      const after = game.chain().map((c) => c.cardId);
      for (const id of before) {
        if (!after.includes(id) && !order.includes(id === "student" ? `student#${order.filter((o) => o.startsWith("student")).length}` : id)) {
          order.push(id === "student" ? `student#${order.filter((o) => o.startsWith("student")).length}` : id);
        }
      }
      sawSecondStudentTrigger ||= game.zoneOf("s1") === "trash" && after.some((id) => id === "student");
    }
    expect(order.slice(0, 2)).toEqual(["student#0", "s1"]);
    expect(order).toContain("s2");
    expect(order.indexOf("s1")).toBeLessThan(order.indexOf("s2"));
    expect(sawSecondStudentTrigger).toBe(true); // 419.4.a — the PF-played Stupefy IS "playing a spell"
    expect(game.state("student").might).toBe(3); // 2 +1 (PF) +1 (own Stupefy) −1 (P2's Stupefy)
    expect(game.p1.hand()).toEqual(["a6"]);
    expect(game.p2.hand()).toEqual(["b6"]);
    expect(game.chain()).toEqual([]);
  });
});

describe("two queued UNIT plays: each enters as it is finalized; a play-trigger they raise joins the same sweep", () => {
  function board() {
    return scenario()
      .resources(P1, { energy: 5, power: { mind: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "P1 Holder" }, "h1")
      .unit(P2, "bf2", { might: 2, name: "P2 Holder" }, "h2")
      .deck(P1, [BODY, FILLER, FILLER, FILLER, FILLER, FILLER], ["body", "a2", "a3", "a4", "a5", "a6"])
      .deck(P2, [VEX, FILLER, FILLER, FILLER, FILLER, FILLER], ["vex", "b2", "b3", "b4", "b5", "b6"])
      .hand(P1, PROMISING_FUTURE, "pf");
  }

  test("P2 places Vex (bf2) first, THEN P1 places Body — Vex, live at a battlefield, triggers on it; the trigger is finalized in the same sweep and the first priority window shows both units down and [vex-trigger] alone; it resolves LIFO and stuns Body (337.1.b, 337.2, 337.3, 337.4)", async () => {
    const game = await board().build();
    await castAndBanish(game, "body", "vex");
    const asked: string[] = [];
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (isChainPriority(d) || isOpenMain(d) || !d) {
        break;
      }
      expect(d).toMatchObject({ kind: "pick", semantics: "destination" });
      asked.push(d.seat);
      await game.seat(d.seat).pick(d.seat === P2 ? "battlefield-bf2" : "base");
    }
    expect(asked).toEqual([P2, P1]);
    expect(isChainPriority(game.decision())).toBe(true);
    expect(game.zoneOf("vex")).toBe("battlefield-bf2");
    expect(game.zoneOf("body")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vex", controller: P2, triggered: true })]);
    expect(game.state("body").isStunned).toBe(false);
    await game.settle();
    expect(game.state("body").isStunned).toBe(true);
    expect(game.chain()).toEqual([]);
  });
});
