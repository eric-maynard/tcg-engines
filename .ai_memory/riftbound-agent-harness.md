# Riftbound agent harness

## Context

| Field | Value |
|-------|-------|
| **Date Started** | 2026-08-06 |
| **Branch** | `rules-digest-and-lookup` (uncommitted) |
| **Author** | AI Agent (harness architect) |

## Problem Statement

Agents, bots, the expert unit-test writer and (later) an MCP server need ONE typed API to
play Riftbound: headless against `RuleEngine` today, through the live web UI tomorrow.
Today every consumer re-derives "who acts", casts into `internalState`, and re-implements
the end-turn driver.

## Plan

The plan of record is `docs/harness/HARNESS-DESIGN.md` (layers L0–L5, Decision union,
engine mapping, worked examples, MCP tool list, prerequisites). Implementation lives in
`packages/riftbound-engine/src/harness/` with self-tests in
`src/__tests__/harness/` and exemplar card tests in `src/__tests__/cards/`.

## Implementation Log

- 2026-08-06 (later): implemented `src/harness/` (types, backend, engine-backend, decision, game,
  scenario, invariants, transcript, turn-driver, card-pool, card-state, observation, internal, index),
  `views/acting-seat.ts`, game-setup.ts exports + `advanceTurn` delegating to the TurnDriver,
  package `./harness` export + `Harness` namespace on the root index. Self-tests
  `src/__tests__/harness/*` (43) and exemplar card tests `src/__tests__/cards/{ogn-004-298,
  unl-186-219, ogn-251-298}` + README. Gates: my files 59/59 pass (2 `test.failing` BUGs), tsc
  for my files 0 new (baseline cast in game-setup fixed), tracer 10 games moveFailed 0. NOTE: other
  agents were editing the same working tree concurrently (conflict markers appeared transiently in
  play-spell.ts; new card tests from other lanes already import the harness).
- 2026-08-06: exploration reports read (01–04); tsc baseline 276; test baseline 1270 pass /
  49 todo / 0 fail. Design doc written before code.
