/**
 * Ruling e65ffc6fffc32c14 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · 2 · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: Can a Zhonya's hidden at battlefield 1 be flipped to save a unit that is dying at battlefield 2?
 * A: Yes. Flip it from hidden as a Reaction (it is played at once as a permanent); its replacement effect then saves the
 *    NEXT friendly unit that would die, wherever it is — it doesn't target. If several die simultaneously, Zhonya's
 *    controller chooses which one. If your units all die in combat with nothing to respond to, you never get the window
 *    and a Zhonya's hidden at THAT battlefield is lost with the battlefield.
 * Rules: 811 (play from facedown as a Reaction), 366–373 (replacement effects; 373 controller picks among simultaneous
 *        events), 465–466 (combat damage then control; 466.5.c loser's facedown card is trashed).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";

/** P2's turn 3. P1 holds bf1 (Sentinel 3 + facedown Zhonya's) and bf2 (Far Ally 2 [+ Buddy 2]). P2's Raider (5) in base. */
function board(opts: { buddy?: boolean; zhonyaAt?: "bf1" | "bf2" } = {}) {
  const s = scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Sentinel" }, "sentinel")
    .facedown(P1, opts.zhonyaAt ?? "bf1", ZHONYAS, "zhonya")
    .unit(P1, "bf2", { might: 2, name: "Far Ally" }, "far")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider");
  return opts.buddy ? s.unit(P1, "bf2", { might: 2, name: "Buddy" }, "buddy") : s;
}

describe("Ruling e65ffc6fffc32c14 — Zhonya's flipped from hidden at bf1 saves a unit dying in combat at bf2", () => {
  test("Raider attacks bf2; in the showdown (before damage) P1 gets Focus and flips the bf1-hidden Zhonya's for [0] — it is in play immediately as a gear", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf2");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "zhonya")).toBe(true);
    await game.p1.reveal("zhonya");
    expect(game.state("zhonya").isHidden).toBe(false);
    expect(["base", "bf1"]).toContain(game.locationOf("zhonya") as string);
    expect(game.p1.energy()).toBe(0);
  });

  test("combat then resolves: Far Ally (2) takes lethal from Raider (5) and WOULD die at bf2 → Zhonya's is killed instead; Far Ally is healed, exhausted and recalled to base; Raider takes the empty bf2", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf2");
    await game.p2.passFocus();
    await game.p1.reveal("zhonya");
    await game.settle();
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.zoneOf("far")).toBe("base");
    expect(game.state("far")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.locationOf("raider")).toBe("bf2");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // bf1 untouched
    expect(game.violations()).toEqual([]);
  });

  test("if TWO friendly units die simultaneously there, Zhonya's controller (P1) is asked which one it saves; the other dies", async () => {
    const game = await board({ buddy: true }).build();
    await game.p2.move("raider", "bf2");
    await game.p2.passFocus();
    await game.p1.reveal("zhonya");
    // P2 (attacker, 5) must split lethal across Far Ally (2) and Buddy (2): let settle take the default, or answer it.
    let stop = await game.settle();
    if (game.decision()?.kind === "distribute") {
      await game.p2.distribute({ buddy: 3, far: 2 });
      stop = await game.settle();
    }
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "replacement-assign" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).toSorted() : []).toEqual(["buddy", "far"]);
    await game.p1.pick("buddy");
    await game.settle();
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.zoneOf("buddy")).toBe("base");
    expect(game.state("buddy")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("far")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
  });

  test("contrast — never flipped: once damage is dealt there is no window; the lone defender dies, and a Zhonya's hidden at THAT battlefield is trashed as control passes to the attacker", async () => {
    const game = await board({ zhonyaAt: "bf2" }).build();
    await game.p2.move("raider", "bf2");
    await game.p2.passFocus();
    await game.p1.passFocus(); // P1 lets it go
    await game.settle();
    expect(game.zoneOf("far")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.state("zhonya").isHidden).toBe(false);
  });
});
