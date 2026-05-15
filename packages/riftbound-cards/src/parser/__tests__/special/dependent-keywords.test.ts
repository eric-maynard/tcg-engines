/**
 * Parser tests for the `[>]` "arrowed word backer" / Dependent-Keyword
 * machinery (Core Rules 2026-03-30 §726, §720).
 *
 * Rule §726: A *Dependent Keyword* is a keyword (shorthand for a condition)
 * plus a *Dependent Ability* that is Active only while the condition holds;
 * otherwise the ability is Inactive (rule §720). The templating symbol `[>]`
 * ("arrowed word backer") appears at the start of the line for the
 * permissive/dependent keywords — Reaction, Action, Deathknell, Level,
 * Legion — and points at the ability they modify.
 *
 * The parser strips the visual `[>]` arrow and routes each form to the
 * keyword's handler:
 *   - `[Level N][>] <text>`     -> abilities tagged `{condition:{type:"while-level", threshold:N}}`
 *   - `[Legion][>] <text>`      -> a `keyword:"Legion"` effect-keyword ability carrying <text>
 *   - `[Deathknell][>] <text>`  -> a `keyword:"Deathknell"` effect-keyword ability carrying <text>
 *   - `[Reaction][>] <text>`    -> a spell/activated ability with `timing:"reaction"`
 *   - `[Action][>] <text>`      -> a spell/activated ability with `timing:"action"`
 *
 * Each is the engine's per-keyword model of "the dependent ability is
 * Inactive unless <condition>", so no separate generic wrapper type is
 * needed; these tests pin the wiring so it can't silently regress.
 */

import { describe, expect, it } from "bun:test";
import { parseAbilities } from "../../index";

describe("Dependent keywords: the [>] arrowed word backer (rules 726 / 720)", () => {
  it("726: [Level N][>] gates the dependent ability behind a while-level condition", () => {
    const r = parseAbilities("[Level 6][>] I have +1 [Might] and enter ready.");
    expect(r.success).toBe(true);
    const gated = r.abilities?.find(
      (a) => (a as { condition?: { type?: string } }).condition?.type === "while-level",
    );
    expect(gated).toBeDefined();
    expect(
      (gated as { condition: { threshold: number } }).condition.threshold,
    ).toBe(6);
  });

  it("726: [Legion][>] yields a Legion effect-keyword ability that carries the dependent effect", () => {
    const r = parseAbilities("[Legion][>] Draw 1.");
    expect(r.success).toBe(true);
    expect(r.abilities).toHaveLength(1);
    expect(r.abilities?.[0]).toEqual(
      expect.objectContaining({
        effect: expect.objectContaining({ type: "draw" }),
        keyword: "Legion",
        type: "keyword",
      }),
    );
  });

  it("726: the dash form '[Legion] — <text>' parses identically to '[Legion][>] <text>'", () => {
    const arrow = parseAbilities("[Legion][>] Draw 1.");
    const dash = parseAbilities("[Legion] — Draw 1.");
    expect(arrow.abilities).toEqual(dash.abilities);
  });

  it("726: [Deathknell][>] yields a Deathknell effect-keyword ability carrying the dependent effect", () => {
    const r = parseAbilities("[Deathknell][>] [Predict 2].");
    expect(r.success).toBe(true);
    expect(r.abilities?.[0]).toEqual(
      expect.objectContaining({
        effect: expect.objectContaining({ type: "predict" }),
        keyword: "Deathknell",
        type: "keyword",
      }),
    );
  });

  it("726: [Reaction][>] yields a reaction-timed playable ability", () => {
    const r = parseAbilities("[Reaction][>] Deal 2 to an enemy unit.");
    expect(r.success).toBe(true);
    const ab = r.abilities?.[0] as { timing?: string; effect?: { type?: string } };
    expect(ab.timing).toBe("reaction");
    expect(ab.effect?.type).toBe("damage");
  });

  it("726: the visual [>] arrow is non-semantic — stripping it doesn't change the parse", () => {
    const withArrow = parseAbilities("[Level 3][>] I cost [2] less.");
    const withoutArrow = parseAbilities("[Level 3] I cost [2] less.");
    expect(withArrow.success).toBe(true);
    expect(withoutArrow.success).toBe(true);
    expect(withArrow.abilities).toEqual(withoutArrow.abilities);
  });

  it("726: multiple dependent keywords on one card (Level + Hunt) each keep their own condition", () => {
    const r = parseAbilities("[Hunt 2] [Level 3][>] I have +1 [Might] and enter ready.");
    expect(r.success).toBe(true);
    const huntKw = r.abilities?.find((a) => (a as { keyword?: string }).keyword === "Hunt");
    expect(huntKw).toBeDefined();
    const leveled = r.abilities?.find(
      (a) => (a as { condition?: { type?: string } }).condition?.type === "while-level",
    );
    expect(leveled).toBeDefined();
  });
});
