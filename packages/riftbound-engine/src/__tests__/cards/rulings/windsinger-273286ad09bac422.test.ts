/**
 * Ruling 273286ad09bac422 — Windsinger (SFD-138 → sfd-138-221) · Unit · Chaos · [2] · 1 Might
 *   "[Hidden] When you play me, you may return another unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: Can I reveal (play from face-down) a hidden Windsinger to bounce a unit at ANOTHER battlefield?
 * A: No. Played from Hidden, every target its "When you play me" ability chooses must be at the battlefield where it
 *    was hidden; a unit at a different battlefield is not a legal choice.
 * Rules: 811.1.d.2 (from-hidden plays: choices restricted to that battlefield), 811.1.d.1 (enters there).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WINDSINGER = "sfd-138-221";

/**
 * P1's turn 2. P1 holds bf1 with a 2-Might Guard and a 3-Might Sentry (the other units "here"); P2 holds bf2 with a
 * 2-Might Target — the unit at ANOTHER battlefield P1 would love to bounce. Windsinger in hand with [2] + one power to hide.
 */
function boardAloneHere() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "bf1", { might: 3, name: "Sentry" }, "sentry")
    .unit(P2, "bf2", { might: 2, name: "Target" }, "target")
    .hand(P1, WINDSINGER, "ws");
}

/** Drive the play trigger: answer opt-in yes, record the offered picks, pick `want` if offered else decline. */
async function drive(game: Game, want: string | null): Promise<{ offered: string[]; pickedOk: boolean }> {
  const out = { offered: [] as string[], pickedOk: false };
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && (d.context === "main" || d.context === "showdown"))) {
      break;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else if (d.kind === "yes-no" && d.seat === P1) {
      await (want === null ? game.p1.no() : game.p1.yes());
    } else if (d.kind === "pick" && d.seat === P1) {
      out.offered = d.options.map((o) => o.card ?? o.key).toSorted();
      if (want !== null && out.offered.includes(want)) {
        await game.p1.pick(want);
        out.pickedOk = true;
      } else if (d.allowDecline) {
        await game.p1.decline();
      } else {
        await game.p1.pick(d.options[0]!.key);
      }
    } else {
      throw new Error(`unexpected ${d.kind} prompt for ${d.seat}: ${d.prompt}`);
    }
  }
  return out;
}

/** Hide at bf1 this turn, come back on P1's next turn and play her from face-down. */
async function hideThenReveal(game: Game): Promise<void> {
  await game.p1.hide("ws", "bf1");
  expect(game.zoneOf("ws")).toBe("facedown-bf1");
  await game.advanceToTurnOf(P2);
  await game.advanceToTurnOf(P1);
  expect(game.zoneOf("ws")).toBe("facedown-bf1");
  expect(game.p1.can("reveal", "ws")).toBe(true);
  await game.p1.reveal("ws");
  expect(game.zoneOf("ws")).toBe("battlefield-bf1"); // 811.1.d.1 — enters where she was hidden
}

describe("Ruling 273286ad09bac422 — a Windsinger played from Hidden may only bounce a unit at ITS battlefield", () => {
  test("revealed at bf1: P1 is offered exactly the other units HERE (Guard, Sentry) — the enemy Target at bf2 is NOT a choice and stays put", async () => {
    const game = await boardAloneHere().build();
    await hideThenReveal(game);
    const t = await drive(game, "target");
    expect(t.offered).toEqual(["guard", "sentry"]); // not "target" (bf2), not herself ("another")
    expect(t.pickedOk).toBe(false);
    expect(game.zoneOf("target")).toBe("battlefield-bf2");
    expect(game.p2.hand()).not.toContain("target");
    expect(game.violations()).toEqual([]);
  });

  test("what she CAN do from hidden: bounce a ≤3-Might unit at the same battlefield (the friendly Guard goes back to P1's hand)", async () => {
    const game = await boardAloneHere().build();
    await hideThenReveal(game);
    const t = await drive(game, "guard");
    expect(t.pickedOk).toBe(true);
    expect(game.zoneOf("guard")).toBe("hand");
    expect(game.p1.hand()).toContain("guard");
    expect(game.zoneOf("target")).toBe("battlefield-bf2");
  });

  test("contrast — played normally from HAND (not hidden) the same Windsinger may reach across: the bf2 Target IS offered and is bounced to P2's hand", async () => {
    const game = await boardAloneHere().build();
    await game.p1.play("ws", { to: "base" });
    const t = await drive(game, "target");
    expect(t.offered).toEqual(["guard", "sentry", "target"]);
    expect(t.pickedOk).toBe(true);
    expect(game.zoneOf("target")).toBe("hand");
    expect(game.p2.hand()).toContain("target");
  });
});
