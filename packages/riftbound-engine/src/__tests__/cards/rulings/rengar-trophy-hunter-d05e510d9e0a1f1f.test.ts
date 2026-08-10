/**
 * Ruling d05e510d9e0a1f1f — Rengar, Trophy Hunter (UNL-120 → unl-120-219) · 6 Might · [5][body] · [Ambush]
 *     "I can be played to a battlefield where there are enemy units (even if you don't have units there)."
 *   × Rockfall Path (SFD-216 → sfd-216-221, Battlefield) "Units can't be played here."
 *
 * Q: Can I play Rengar, Trophy Hunter to Rockfall Path?
 * A: No. "Can't beats can": Rengar's special permission to be played where enemy units are does not override the battlefield's
 *    blanket prohibition on playing units there.
 * Rules: 054 (can't beats can), 806 (Ambush), Rockfall Path static.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RENGAR = "unl-120-219";
const ROCKFALL_PATH = "sfd-216-221";

/** P1's turn with exactly [5][body]. P2 has units both at the live Rockfall Path and at an ordinary bf2; P1 has no units at either. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { body: 1 } })
    .battlefield("rockfall", { controller: P2, def: ROCKFALL_PATH, inert: false, owner: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "rockfall", { might: 2, name: "Camper" }, "camper")
    .unit(P2, "bf2", { might: 2, name: "Sentry" }, "sentry")
    .hand(P1, RENGAR, "rengar");
}

describe("Ruling d05e510d9e0a1f1f — Rengar cannot be played to Rockfall Path", () => {
  test("Rengar's permission works at an ordinary enemy-occupied battlefield (bf2 is offered) but Rockfall Path is NOT among his legal destinations", async () => {
    const game = await board().build();
    expect(game.p1.can("play", "rengar")).toBe(true);
    const to = (game.p1.option("playUnit", "rengar")?.fields.find((f) => f.name === "location")?.options ?? []).map(String);
    expect(to).toContain("base");
    expect(to).toContain("battlefield-bf2"); // "where there are enemy units, even if you don't have units there"
    expect(to).not.toContain("battlefield-rockfall"); // "Units can't be played here" wins
  });

  test("forcing the play to Rockfall Path is rejected; nothing is paid and Rengar stays in hand", async () => {
    const game = await board().build();
    const r = await game.p1.try((p) => p.play("rengar", { to: "rockfall" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("rengar")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 5, power: { body: 1 } });
    expect(game.p1.units("rockfall")).toEqual([]);
  });

  test("control: the same play to bf2 (enemy Sentry there, no friendly units) succeeds and opens a combat there", async () => {
    const game = await board().build();
    await game.p1.play("rengar", { to: "bf2" });
    for (let i = 0; i < 6 && game.zoneOf("rengar") !== "battlefield-bf2"; i++) {
      const d = game.decision();
      if (d?.kind !== "action" || !d.passKey) {
        break;
      }
      await game.seat(d.seat).pass();
    }
    expect(game.zoneOf("rengar")).toBe("battlefield-bf2");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.violations()).toEqual([]);
  });
});
