/**
 * Ruling 6e2452ef85afafd8 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2] · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Hextech Ray (OGN-009 → ogn-009-298) · Fury Action · [1][fury] "Deal 3 to a unit at a battlefield."
 *
 * Q: After the errata, is the Zhonya's trigger optional or automatic?
 * A: Automatic — it is a replacement effect, not a "may". Nuance: a HIDDEN Zhonya's only works once it is in play, so against
 *    a kill effect like Hextech Ray you must flip it in response, before that effect resolves, to save that unit.
 * Rules: 369–373 (replacement effects apply without a choice unless they say "may"), 811 (hidden cards are played as
 *        Reactions), 323.7 (hidden cards at a battlefield you no longer control are removed).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const HEXTECH_RAY = "ogn-009-298";

/** P2's turn 3 with exactly [1][fury] and Hextech Ray. P1 holds bf1 with a lone 3-Might Ally; Zhonya's either face-up in P1's base or facedown at bf1. */
function board(zhonyas: "in-play" | "hidden") {
  const s = scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Ally" }, "ally")
    .unit(P2, "bf2", { might: 2, name: "Onlooker" }, "onl")
    .hand(P2, HEXTECH_RAY, "ray");
  return zhonyas === "in-play" ? s.gear(P1, ZHONYAS, "zh") : s.facedown(P1, "bf1", ZHONYAS, "zh");
}

/** Pass priority until the chain is empty, recording every non-priority prompt shown to P1 on the way (and answering none as "yes"). */
async function resolveRecordingP1Prompts(game: Game): Promise<string[]> {
  const prompts: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d: Decision | null = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
      continue;
    }
    if (d.seat === P1) {
      prompts.push(`${d.kind}:${d.source?.cardId ?? ""}:${d.prompt}`);
    }
    if (d.kind === "yes-no") {
      await game.seat(d.seat).no(); // if the engine WERE to ask, declining must not be how the unit gets saved
    } else if (d.kind === "pick" && d.semantics?.startsWith("replacement")) {
      await game.seat(d.seat).pick(d.options[0]!.key);
    } else {
      break;
    }
  }
  return prompts;
}

describe("Ruling 6e2452ef85afafd8 — Zhonya's Hourglass is an automatic replacement, not a 'may'", () => {
  test("face-up Zhonya's: Hextech Ray's lethal 3 on the Ally is replaced with NO opt-in asked of P1 — Zhonya's dies instead; the Ally is healed, exhausted and recalled to base", async () => {
    const game = await board("in-play").build();
    await game.p2.cast("ray", { targets: "ally" });
    const prompts = await resolveRecordingP1Prompts(game);
    expect(prompts.filter((p) => p.startsWith("yes-no"))).toEqual([]); // never "Use Zhonya's Hourglass?"
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.p1.trash()).toContain("zh");
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally")).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
    expect(game.p1.trash()).not.toContain("ally");
    expect(game.violations()).toEqual([]);
  });

  test("nuance — hidden Zhonya's flipped IN RESPONSE to the Ray (Reaction, [0]) is in play when the Ray resolves, and then saves the Ally just as automatically", async () => {
    const game = await board("hidden").build();
    await game.p2.cast("ray", { targets: "ally" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "zh")).toBe(true);
    await game.p1.reveal("zh");
    expect(game.state("zh").isHidden).toBe(false);
    expect(game.p1.energy()).toBe(0);
    const prompts = await resolveRecordingP1Prompts(game);
    expect(prompts.filter((p) => p.startsWith("yes-no"))).toEqual([]);
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally")).toMatchObject({ damage: 0, isExhausted: true });
  });

  test("nuance — hidden Zhonya's NOT flipped before the Ray resolves does nothing: the Ally dies, and the still-facedown Zhonya's (at a battlefield P1 no longer holds) is simply removed to the trash unused", async () => {
    const game = await board("hidden").build();
    await game.p2.cast("ray", { targets: "ally" });
    await game.p2.passPriority();
    expect(game.p1.can("reveal", "zh")).toBe(true); // the window was there …
    await game.p1.passPriority(); // … P1 lets the Ray resolve
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.p1.units("base")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.p1.facedown("bf1")).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });
});
