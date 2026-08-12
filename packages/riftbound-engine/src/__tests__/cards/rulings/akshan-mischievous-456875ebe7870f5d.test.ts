/**
 * Ruling 456875ebe7870f5d — Akshan, Mischievous (SFD-109 → sfd-109-221) · [4] (+ optional [body][body])
 *     "[Weaponmaster] … When you play me, if you paid the additional cost, move an enemy gear to your base.
 *      You control it until I leave the board. If it's an Equipment, attach it to me."
 *   × Lucian, Merciless (SFD-113 → sfd-113-221) · [3] · [Weaponmaster]
 *   × Sentinel Adept (SFD-008 → sfd-008-221) · [3] · [Weaponmaster] (P2's way of taking it back)
 *   × Serrated Dirk (SFD-009 → sfd-009-221) · Equipment · "[Equip] [fury]"
 *
 * Q: With an Equipment stolen by Akshan and attached to him, can I use Lucian's [Weaponmaster] to move it to
 *    Lucian for free? Can my opponent pay to equip it back to their unit?
 * A: While Akshan is on the board you CONTROL the stolen Equipment and may use it as if you had played it —
 *    including Lucian's [Weaponmaster] discount, which makes the move free. Your opponent cannot use it or
 *    pay its costs meanwhile. It stays on Lucian even after Akshan leaves; only CONTROL reverts, and from
 *    then on the owner may use their own attach effects to take it back.
 * Rules: 108.2 / 477.1.a (control vs. ownership), 741 ([Weaponmaster]: equip for [rainbow] less, even if
 *        already attached), 359.3 ("until I leave the board" ends control, not the attachment).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AKSHAN = "sfd-109-221";
const LUCIAN = "sfd-113-221";
const SENTINEL_ADEPT = "sfd-008-221";
const SERRATED_DIRK = "sfd-009-221";
const FALLING_STAR = "ogn-029-298"; // [2][fury][fury] — "Deal 3 to a unit." ×2, used to kill Akshan (4 Might)

/** P1's turn. P2 owns a Serrated Dirk and a bystander; P1 holds Akshan, Lucian and a Falling Star. */
function board() {
  return scenario()
    .resources(P1, { energy: 9, power: { body: 2, fury: 3 } })
    .unit(P2, "base", { might: 3, name: "Theirs" }, "theirs")
    .gear(P2, SERRATED_DIRK, "dirk")
    .hand(P1, AKSHAN, "akshan")
    .hand(P1, LUCIAN, "lucian")
    .hand(P1, FALLING_STAR, "star")
    .hand(P2, SENTINEL_ADEPT, "adept");
}

/** P1 plays Akshan paying [body][body] → the Dirk is stolen and attached to him. */
async function stolen(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("akshan", { payOptional: true, to: "base" });
  await game.settle();
  expect(game.state("dirk")).toMatchObject({ attachedTo: "akshan", controller: P1, owner: P2 });
  return game;
}

describe("Ruling 456875ebe7870f5d — a stolen Equipment is yours to re-equip; it stays where you put it when Akshan leaves", () => {
  test("premise: the Dirk is controlled by P1 (owned by P2) and attached to Akshan", async () => {
    const game = await stolen();
    expect(game.p1.gear()).toContain("dirk");
    expect(game.state("akshan").attachments).toEqual(["dirk"]);
  });

  test("ruling: Lucian's [Weaponmaster] offers the STOLEN Dirk and moves it for FREE — only Lucian's own [3] is paid", async () => {
    const game = await stolen();
    const before = game.p1.resources();
    await game.p1.play("lucian", { to: "base" });
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["dirk"]);
    await game.p1.pick("dirk");
    await game.settle();
    expect(game.state("dirk").attachedTo).toBe("lucian");
    expect(game.state("lucian").attachments).toEqual(["dirk"]);
    expect(game.state("akshan").attachments).toEqual([]);
    // Lucian cost [3]; the Dirk's [Equip] [fury] was waived by [Weaponmaster] — no Power was spent.
    expect(game.p1.energy()).toBe(before.energy - 3);
    expect(game.p1.power("fury")).toBe(before.power.fury ?? 0);
    expect(game.violations()).toEqual([]);
  });

  test("meanwhile the opponent cannot use it: P2's own [Weaponmaster] unit is not offered the Dirk while P1 controls it", async () => {
    const game = await stolen();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("dirk").controller).toBe(P1); // still stolen — Akshan is alive
    await game.p2.do("addResources", { energy: 3, power: { fury: 1 } });
    await game.p2.play("adept", { to: "base" });
    const stop = await game.settle();
    const d = game.decision();
    const offered = stop.reason === "unanswered" && d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).not.toContain("dirk");
    expect(game.state("dirk")).toMatchObject({ attachedTo: "akshan", controller: P1 });
  });

  test("when Akshan leaves the board the Dirk does NOT snap back: it stays attached to Lucian, only CONTROL returns to its owner", async () => {
    const game = await stolen();
    await game.p1.play("lucian", { to: "base" });
    await game.settle();
    await game.p1.pick("dirk");
    await game.settle();
    await game.p1.cast("star", { targets: ["akshan", "akshan"] }); // 3 + 3 kills the 4-Might Akshan
    await game.settle();
    expect(game.zoneOf("akshan")).toBe("trash");
    expect(game.state("dirk")).toMatchObject({ attachedTo: "lucian", controller: P2, owner: P2 });
    expect(game.state("lucian").attachments).toEqual(["dirk"]);
    expect(game.violations()).toEqual([]);
  });

  test("…and only THEN may the owner take it back with their own attach effect ([Weaponmaster] works even though it is attached to an enemy unit)", async () => {
    const game = await stolen();
    await game.p1.play("lucian", { to: "base" });
    await game.settle();
    await game.p1.pick("dirk");
    await game.settle();
    await game.p1.cast("star", { targets: ["akshan", "akshan"] });
    await game.settle();
    await game.advanceTurn();
    await game.p2.do("addResources", { energy: 3 });
    await game.p2.play("adept", { to: "base" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    await game.p2.pick("dirk");
    await game.settle();
    expect(game.state("dirk")).toMatchObject({ attachedTo: "adept", controller: P2 });
    expect(game.state("lucian").attachments).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
