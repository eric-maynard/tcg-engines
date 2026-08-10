/**
 * Ruling f66a7cda0c8070a4 — B.F. Sword (SFD-161 → sfd-161-221) · Equipment · Order · [4] · +3 Might · "[Equip] [order]"
 *   × Akshan, Mischievous (SFD-109 → sfd-109-221) · 4 Might "[Weaponmaster] You may pay [body][body] as an additional cost to
 *     play me. When you play me, if you paid the additional cost, move an enemy gear to your base. You control it until I leave
 *     the board. If it's an Equipment, attach it to me."
 *   × Lucian, Merciless (sfd-113-221) · 3 Might "[Weaponmaster] (When you play me, you may [Equip] one of your Equipment to me
 *     for [rainbow] less, even if it's already attached.) …"
 *
 * Q: I steal the opponent's B.F. Sword with Akshan, then move it onto Lucian with Lucian's Weaponmaster. Akshan dies — what
 *    happens to the Sword?
 * A: Akshan's control-change ends, so CONTROL of the Sword reverts to its owner. It does NOT detach / go home just because
 *    control changed: it stays attached to Lucian. The opponent now controls it (and may later re-Equip it with their own
 *    effects); I no longer control it and can't use its abilities.
 * Rules: 390.4 / 477.1.a (duration-bound control change), 434/435 (attachment is independent of control), 821 (Weaponmaster).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BF_SWORD = "sfd-161-221";
const AKSHAN = "sfd-109-221";
const LUCIAN = "sfd-113-221";
/** 0-cost bolt so P1 can kill its own Akshan on the spot. */
const BOLT = {
  abilities: [{ effect: { amount: 4, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt",
  timing: "action",
} as const;

/** P1's turn. P2 owns an unattached B.F. Sword in base. P1: Akshan, Lucian, Bolt in hand; 7 energy, [body][body] + an [order]. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { body: 2, order: 1 } })
    .battlefield("bf1", { controller: null })
    .gear(P2, BF_SWORD, "bfs")
    .unit(P2, "base", { might: 2, name: "Squire" }, "squire")
    .hand(P1, AKSHAN, "akshan")
    .hand(P1, LUCIAN, "lucian")
    .hand(P1, BOLT, "bolt");
}

/** Akshan (paid) steals + wears the Sword; then Lucian is played and Weaponmasters the Sword over onto himself. */
async function swordOnLucian(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("akshan", { payOptional: true, to: "base" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "akshan", triggered: true })]);
  let r = await game.settle();
  if (r.reason === "unanswered" && game.decision()?.seat === P1) {
    await game.p1.pick("bfs");
    r = await game.settle();
  }
  expect(game.state("bfs")).toMatchObject({ attachedTo: "akshan", controller: P1, owner: P2 });
  expect(game.state("akshan").might).toBe(7); // 4 + 3

  await game.p1.play("lucian", { to: "base" });
  // Weaponmaster: "you may [Equip] one of your Equipment to me … even if it's already attached" — the stolen Sword is offered.
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "equip" });
  expect((d as PickDecision).options.map((o) => o.card)).toContain("bfs");
  await game.p1.pick("bfs");
  await game.settle();
  expect(game.state("bfs")).toMatchObject({ attachedTo: "lucian", controller: P1, owner: P2 });
  expect(game.state("lucian").might).toBe(6); // 3 + 3
  expect(game.state("akshan").might).toBe(4);
  return game;
}

describe("Ruling f66a7cda0c8070a4 — stolen B.F. Sword moved onto Lucian; Akshan dies → control reverts but the Sword stays on Lucian", () => {
  test("setup holds: Akshan steals and wears the Sword, Lucian's Weaponmaster re-equips it onto Lucian for [rainbow] less (the lone [order] pip waived → free)", async () => {
    const game = await swordOnLucian();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, order: 1 } }); // 4 + 3 energy, [body][body]; [order] NOT spent
    expect(game.state("lucian").attachments).toEqual(["bfs"]);
    expect(game.state("akshan").attachments).toEqual([]);
  });

  test("Akshan dies: 'until I leave the board' ends → the Sword's CONTROL reverts to P2 (owner) …", async () => {
    const game = await swordOnLucian();
    await game.p1.cast("bolt", { targets: "akshan" });
    await game.settle();
    expect(game.zoneOf("akshan")).toBe("trash");
    expect(game.state("bfs").controller).toBe(P2);
    expect(game.state("bfs").owner).toBe(P2);
  });

  test("… but it REMAINS ATTACHED to Lucian (no detach, not sent to P2's base/hand/trash) and Lucian keeps the +3", async () => {
    const game = await swordOnLucian();
    await game.p1.cast("bolt", { targets: "akshan" });
    await game.settle();
    expect(game.zoneOf("bfs")).not.toBe("trash");
    expect(game.zoneOf("bfs")).not.toBe("hand");
    expect(game.state("bfs").attachedTo).toBe("lucian");
    expect(game.state("lucian")).toMatchObject({ attachments: ["bfs"], might: 6 });
    expect(game.violations()).toEqual([]);
  });

  test("P1 no longer controls it: it is not among P1's gear and P1 has no Equip/activate action for it", async () => {
    const game = await swordOnLucian();
    await game.p1.cast("bolt", { targets: "akshan" });
    await game.settle();
    expect(game.p1.gear()).not.toContain("bfs");
    expect(game.p1.legal().some((o) => o.card === "bfs")).toBe(false);
  });
});
