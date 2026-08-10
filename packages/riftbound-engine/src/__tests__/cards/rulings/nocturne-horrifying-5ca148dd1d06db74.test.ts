/**
 * Ruling 5ca148dd1d06db74 — Nocturne, Horrifying (OGN-194 → ogn-194-298) · 4 Might
 *   × Falling Star (OGN-029 → ogn-029-298) "Deal 3 to a unit. Deal 3 to a unit."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) [Hidden] "If a friendly unit would die, kill this instead. Heal that unit,
 *     exhaust it, and recall it."
 *   × Shakedown (OGN-033 → ogn-033-298) [Reaction] "Choose an enemy unit. Deal 6 to it unless its controller has you draw 2."
 *
 * Q: Opponent Falling-Stars my Nocturne, I flip a hidden Zhonya's, they respond with Shakedown and I take the 6 — does
 *    Nocturne die before Zhonya's applies?
 * A: No. The flip does not wait on the chain, so Zhonya's is already on the board when Shakedown (LIFO) resolves: the 6
 *    would kill Nocturne, Zhonya's is killed instead and Nocturne is healed, exhausted and recalled to base. Falling Star
 *    then still resolves against Nocturne (base is a board zone) — and since Zhonya's is spent, that damage can kill it.
 * Rules: 811 (play from hidden), 337.2 / 340.4 (permanent resolves at once; priority to newest item's controller),
 *        367–370 (replacement effect), 359.3 (LIFO), 355.6 (target still legal in base).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOCTURNE = "ogn-194-298";
const FALLING_STAR = "ogn-029-298";
const ZHONYAS = "ogn-077-298";
const SHAKEDOWN = "ogn-033-298";

/** P2's turn. P1 holds bf1 with Nocturne (4) and a facedown Zhonya's there. P2: Falling Star + Shakedown, exactly [4] + 3 fury. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 4, power: { fury: 3 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", NOCTURNE, "noct")
    .unit(P2, "base", { might: 5, name: "Bystander" }, "bystander")
    .facedown(P1, "bf1", ZHONYAS, "zh")
    .hand(P2, FALLING_STAR, "star")
    .hand(P2, SHAKEDOWN, "shake")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** Falling Star (per `starTargets`) then Shakedown at Nocturne are on the chain; P1 flips Zhonya's in response and takes the 6. */
async function chainWithFlippedHourglass(game: Game, starTargets: [string, string]): Promise<void> {
  await game.p2.cast("star", { targets: starTargets });
  await game.p2.cast("shake", { targets: "noct" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["star", "shake"]);
  await game.p2.passPriority();
  expect(game.p1.can("reveal", "zh")).toBe(true);
  await game.p1.reveal("zh");
  // The Hourglass is a permanent: it is on the board at once, it never sits on the chain waiting (337.2).
  expect(game.state("zh").isHidden).toBe(false);
  expect(["base", "bf1"]).toContain(game.locationOf("zh") as string);
  expect(game.chain().map((c) => c.cardId)).toEqual(["star", "shake"]);
  // Shakedown resolves first (LIFO): Nocturne's controller (P1) is asked draw-2 vs take-6 and lets the 6 through.
  const stop = await game.settle();
  expect(stop.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "shake" } });
  const d = game.decision();
  const takeSix = d?.kind === "pick" ? d.options.find((o) => /Deal 6/i.test(o.label)) : undefined;
  expect(takeSix).toBeDefined();
  await game.p1.pick(takeSix?.key as string);
}

describe("Ruling 5ca148dd1d06db74 — a flipped Zhonya's saves Nocturne from Shakedown; Falling Star then hits it in base", () => {
  test("Shakedown's 6 would kill Nocturne → Zhonya's is killed instead; Nocturne is healed, exhausted and recalled to base while Falling Star still waits", async () => {
    const game = await board().build();
    await chainWithFlippedHourglass(game, ["noct", "bystander"]);
    expect(game.zoneOf("shake")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("noct")).toBe("base");
    expect(game.state("noct")).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["star"]);
  });

  test("Falling Star then resolves and STILL deals its 3 to Nocturne now sitting in base (Zhonya's is spent, nothing prevents it)", async () => {
    const game = await board().build();
    await chainWithFlippedHourglass(game, ["noct", "bystander"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.zoneOf("noct")).toBe("base");
    expect(game.state("noct").damage).toBe(3);
    expect(game.state("bystander").damage).toBe(3);
    expect(game.p1.hand()).toEqual([]); // P1 took the damage, did not have P2 draw
    expect(game.violations()).toEqual([]);
  });

  test("if Falling Star's damage is lethal (both 3s at Nocturne), Nocturne dies in base — the consumed Zhonya's cannot save it twice", async () => {
    const game = await board().build();
    await chainWithFlippedHourglass(game, ["noct", "noct"]);
    expect(game.zoneOf("noct")).toBe("base");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("noct")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // The ruling's literal sequence: Falling Star pending → P2 passes → P1 flips Zhonya's → P2 THEN plays Shakedown in
  // response. Per 337.2/340.4 the flipped gear resolves at once and priority goes to the controller of the newest chain
  // item (Falling Star → P2), so P2 gets that window — the passes collected before the flip are void.
  test("ruling 5ca148dd1d06db74 — after a hidden permanent is flipped in response, priority goes back to the pending spell's controller", async () => {
    const game = await board().build();
    await game.p2.cast("star", { targets: ["noct", "bystander"] });
    await game.p2.passPriority();
    await game.p1.reveal("zh");
    expect(game.state("zh").isHidden).toBe(false);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["star"]);
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "shake")).toBe(true);
    await game.p2.cast("shake", { targets: "noct" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["star", "shake"]);
  });
});
