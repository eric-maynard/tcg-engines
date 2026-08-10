/**
 * Ruling d60c7d26af55e50e — Arise! (SFD-198 → sfd-198-221) · Spell · Calm/Order · 6 + hybrid pip
 *     "Play a 2 [Might] Sand Soldier unit token for each Equipment you control. Then do this: Ready up to two of them."
 *   (× Akshan, Mischievous SFD-109 — cited only as an example of a card that CAN move attached Equipment.)
 *
 * Q: Can the Sand Soldiers created by Arise! take equipped Gear off other friendly units?
 * A: No. Nothing lets a unit strip or "inherit" Equipment just by entering play. Attached Equipment stays where it is; moving
 *    it needs an ability that says so (Equip / Weaponmaster / Akshan-style text), which plain Sand Soldier tokens don't have.
 * Rules: 744.1.b (Equip is an activated ability paid to attach gear you control), 719 (attached Equipment stays attached).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ARISE = "sfd-198-221";
const EYE_OF_THE_HERALD = "sfd-153-221"; // Equipment · Order · [1]
const DORANS_BLADE = "sfd-095-221"; // Equipment · Body · +2

const soldiers = (game: Game) => game.findAll({ name: "Sand Soldier", owner: P1 }).filter((id) => game.locationOf(id) !== undefined);

/** P1's turn with exactly 6 + [order]. Bearer (3) in base wears an Eye of the Herald AND a Doran's Blade — P1's only Equipment (2). */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { order: 1 } })
    .unit(P1, "base", { might: 3, name: "Bearer" }, "bearer", { equippedWith: ["eye", "blade"] })
    .gear(P1, EYE_OF_THE_HERALD, "eye", { attachedTo: "bearer" })
    .gear(P1, DORANS_BLADE, "blade", { attachedTo: "bearer" })
    .unit(P2, "base", { might: 2, name: "Bystander" }, "by")
    .hand(P1, ARISE, "arise");
}

/** Cast Arise! and drive every prompt: destinations → base, "ready up to two of them" → both. Records every prompt seen. */
async function ariseResolved(): Promise<{ game: Game; prompts: string[] }> {
  const game = await board().build();
  expect(game.state("bearer")).toMatchObject({ attachments: ["eye", "blade"], might: 5 });
  await game.p1.cast("arise");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  const prompts: string[] = [];
  for (let i = 0; i < 12; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || d?.kind !== "pick") {
      break;
    }
    prompts.push(d.prompt);
    const keys = (d as PickDecision).options.map((o) => o.key);
    if (keys.includes("base")) {
      await game.p1.pick("base");
    } else {
      await game.p1.pick(...keys.slice(0, 2));
    }
  }
  return { game, prompts };
}

describe("Ruling d60c7d26af55e50e — Arise!'s Sand Soldiers do not take Equipment off other units", () => {
  test("two attached Equipment count: Arise! plays two 2-Might Sand Soldier tokens (readied by the reflexive step)", async () => {
    const { game } = await ariseResolved();
    expect(game.zoneOf("arise")).toBe("trash");
    const ss = soldiers(game);
    expect(ss).toHaveLength(2);
    for (const s of ss) {
      expect(game.state(s)).toMatchObject({ isReady: true, isToken: true, might: 2, zone: "base" });
    }
  });

  test("the Bearer keeps BOTH pieces of Equipment (still 3+2 = 5); the Soldiers arrive bare — no attachment, no might bonus", async () => {
    const { game } = await ariseResolved();
    expect(game.state("bearer")).toMatchObject({ attachments: ["eye", "blade"], might: 5 });
    expect(game.state("eye").attachedTo).toBe("bearer");
    expect(game.state("blade").attachedTo).toBe("bearer");
    for (const s of soldiers(game)) {
      expect(game.state(s)).toMatchObject({ attachments: [], might: 2 });
    }
    expect(game.violations()).toEqual([]);
  });

  test("no step of the spell ever offers to move gear: the only prompts are token destinations / 'ready up to two of them' — never an equip/attach choice naming the Eye or the Blade", async () => {
    const { game, prompts } = await ariseResolved();
    expect(prompts.some((p) => /equip|attach/i.test(p))).toBe(false);
    // And afterwards there is no action that would re-attach the worn Equipment onto a Soldier either.
    const gearMoves = game.p1.legal().filter((o) => (o.verb === "equip" || /equip/i.test(o.moveId)) && (o.card === "eye" || o.card === "blade" || JSON.stringify(o.variants).includes('"eye"') || JSON.stringify(o.variants).includes('"blade"')));
    expect(gearMoves).toEqual([]);
    for (const s of soldiers(game)) {
      const r = await game.p1.try((p) => p.do("equipCard", { equipmentId: "eye", unitId: s }));
      expect(r.ok).toBe(false);
    }
    expect(game.state("eye").attachedTo).toBe("bearer");
  });
});
