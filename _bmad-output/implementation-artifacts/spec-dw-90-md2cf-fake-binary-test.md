---
title: 'check_md2cf_installed() fake-binary integration tests'
type: 'chore'
created: '2026-08-04'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
baseline_revision: '7ccbf9309326421f75db49e6f18b888ec16d3069'
final_revision: '8040039'
---

<intent-contract>

## Intent

**Problem:** `check_md2cf_installed()`'s `Completed`/`TimedOut`/`NotFound` result-mapping branches (`src-tauri/src/commands/config.rs`) are only covered indirectly (via `md2cf_timeout_message` unit tests and `run_command_with_timeout` tests using unrelated shell commands) — no test exercises `check_md2cf_installed()` itself end-to-end against a real `md2cf` executable on `PATH`.

**Approach:** Add integration tests in `src-tauri/src/commands/config.rs`'s existing `mod tests` that place a small fake `md2cf` executable (a shell script on unix, a `.bat` on Windows) on a test-controlled `PATH` — mutated and restored via a new guard following the existing `ENV_MUTATION_LOCK`/`allow_local_mock_server_without_proxy` pattern — and call `check_md2cf_installed()` directly to assert the `Completed` (success), `TimedOut`, and `NotFound` (no such binary on `PATH`) branches end-to-end.

## Boundaries & Constraints

**Always:**
- Call the real, unmodified `check_md2cf_installed()` — do not add test-only seams, feature flags, or parameters to production code; scope is test-only.
- Serialize every `PATH`-mutating test behind a single new dedicated mutex (mirroring `ENV_MUTATION_LOCK`'s rationale for `NO_PROXY`), and always restore the original `PATH` value (or remove the var if it was previously unset) via an RAII guard, even on panic/early return.
- The `TimedOut` test's fake binary must sleep past the real `MD2CF_CHECK_TIMEOUT` (5s) constant, since there is no test seam to shorten it — accept the real wall-clock cost (~5-6s) for this one test; document the reason in an inline comment near the test, matching this codebase's existing convention of explaining non-obvious timing choices (e.g. `run_command_with_timeout`'s doc comments).
- The `NotFound` test must set `PATH` to a fresh, empty temp directory (not merely rely on the host's ambient `PATH` lacking `md2cf`) so the assertion is deterministic regardless of what is installed on the machine running the tests.
- Fake binaries must be written with correct executable permissions on unix (`chmod` to `0o755`) and with the platform-appropriate extension/searchable form on Windows (`.bat`), consistent with the existing `#[cfg(unix)]`/`#[cfg(windows)]` `fast_command`/`slow_command`/`chatty_command` split already in this test module.

**Block If:** N/A — this is additive test-only work with no undecidable design choice.

**Never:**
- Do not modify `check_md2cf_installed()`, `run_command_with_timeout()`, or any other production function in `config.rs`.
- Do not introduce a mock-HTTP-server or new external test-runner dependency (e.g. `serial_test`) — reuse the existing `std::sync::Mutex`-guard convention already used twice in this file.
- Do not leave `PATH` mutated after a test ends, including on test panic — the guard's `Drop` impl is the only place PATH is restored.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fake `md2cf` prints a version and exits 0 | `PATH` prepended with a dir containing an executable `md2cf` that prints `md2cf 9.9.9` to stdout and exits 0 | `Md2cfCheckResult { installed: true, version: Some("md2cf 9.9.9"), .. }`; message contains "已检测到 md2cf" | No error expected |
| Fake `md2cf` sleeps past the 5s timeout | `PATH` prepended with a dir containing an executable `md2cf` that sleeps 6s before exiting | `Md2cfCheckResult { installed: false, version: None, .. }`; message equals `md2cf_timeout_message(b"", b"")`'s plain-timeout text | No error expected — timeout is treated as a successful detection of "not usable", not a Rust `Err` |
| No `md2cf` anywhere on `PATH` | `PATH` replaced with a fresh empty temp dir | `Md2cfCheckResult { installed: false, version: None, message: "未检测到 md2cf，将使用 REST API 直连模式。" }` | No error expected |

</intent-contract>

## Code Map

- `src-tauri/src/commands/config.rs` -- add the new tests plus a `PathPrependGuard`/`PathReplaceGuard`-style helper and fake-binary-writer helpers inside the existing `#[cfg(test)] mod tests` block (~line 832), reusing `unique_test_artifact_path`-style temp-path helpers already defined there; the functions under test are `check_md2cf_installed` (line ~497) and its dependency `run_command_with_timeout` (line ~401, unchanged).

## Tasks & Acceptance

**Execution:**
- [x] `src-tauri/src/commands/config.rs` -- add `check_md2cf_installed` to the `use super::{...}` import list in `mod tests` -- makes the function under test available to the new tests
- [x] `src-tauri/src/commands/config.rs` -- add a `PATH_MUTATION_LOCK: std::sync::Mutex<()>` static plus a `PathEnvGuard` RAII helper (with `prepend(dir)` and `replace(dir)` constructors) in `mod tests` that captures the original `PATH` via `std::env::var_os`, mutates it, and restores it (or removes it if previously unset) in `Drop` -- provides deterministic, serialized `PATH` mutation for the new tests without leaking state into other tests
- [x] `src-tauri/src/commands/config.rs` -- add a `write_fake_md2cf(dir: &Path, unix_body: &str, windows_body: &str)` test helper that writes an executable `md2cf` shell script (unix, `chmod 0o755`) or `md2cf.bat` (windows) into `dir` using a fresh `unique_test_artifact_path`-style temp directory per test -- generates the fake binaries the I/O matrix scenarios need without hand-duplicating platform branching in every test
- [x] `src-tauri/src/commands/config.rs` -- add `check_md2cf_installed_reports_completed_for_fake_binary_success` exercising the "prints version, exits 0" I/O matrix row -- covers the `Completed`+success branch end-to-end
- [x] `src-tauri/src/commands/config.rs` -- add `check_md2cf_installed_reports_timeout_for_slow_fake_binary` exercising the "sleeps past 5s timeout" I/O matrix row, with an inline comment explaining the real ~5-6s wall-clock cost -- covers the `TimedOut` branch end-to-end
- [x] `src-tauri/src/commands/config.rs` -- add `check_md2cf_installed_reports_not_found_when_absent_from_path` exercising the "no md2cf on PATH" I/O matrix row using an empty temp dir as the entire `PATH` -- covers the `NotFound` (`io::ErrorKind::NotFound`) branch end-to-end

**Acceptance Criteria:**
- Given a fake `md2cf` executable on `PATH` that exits 0 with version output, when `check_md2cf_installed()` runs, then it returns `installed: true` with the captured version and a success message, and `PATH` is restored to its pre-test value afterward.
- Given a fake `md2cf` executable on `PATH` that sleeps past `MD2CF_CHECK_TIMEOUT`, when `check_md2cf_installed()` runs, then it returns `installed: false` with the plain timeout message (no partial-output variant), completing without panicking or hanging the test process, and `PATH` is restored afterward.
- Given `PATH` replaced with an empty temp directory, when `check_md2cf_installed()` runs, then it returns `installed: false` with the "未检测到 md2cf" message, and `PATH` is restored afterward.
- Given `cargo test check_md2cf_installed` is run repeatedly (including `--test-threads` > 1), when the three new tests run concurrently with each other and with existing `PATH`-independent tests in the same module, then no test flakes due to `PATH` races (enforced by `PATH_MUTATION_LOCK` serializing only the `PATH`-mutating tests).

## Design Notes

The existing module already establishes the exact pattern to reuse: `ENV_MUTATION_LOCK` + `ProxyExemptionGuard` (lines ~1198-1244) serializes `NO_PROXY`/`no_proxy` mutation across concurrently-run tests via a dedicated mutex and an RAII guard that mutates on construction and nothing on drop (the proxy vars are intentionally left set, since they're harmless defaults for the whole suite). The new `PathEnvGuard` differs in one way: it **must** restore the original `PATH` on `Drop`, because leaving a test-only fake binary permanently first-in-`PATH` for the rest of the process would be an actual regression risk (other tests spawning `sh`/`cmd` could resolve to the wrong binaries first, or a later real `md2cf` invocation in the same process could pick up the fake one). Mirror `TimeoutKillDelayGuard` (lines ~847-865) for the "acquire lock, mutate global, restore on Drop" shape, adapted to store/restore an `Option<OsString>` for `PATH` instead of resetting an atomic to a fixed value.

## Verification

**Commands:**
- `cd src-tauri && cargo test check_md2cf_installed -- --test-threads=1` -- expected: all three new tests pass (allow ~6s wall time for the timeout test)
- `cd src-tauri && cargo test` -- expected: full existing suite still passes, no regressions from the new `mod tests` additions

## Spec Change Log

## Review Triage Log

### 2026-08-04 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 0, medium 2, low 2)
- defer: 1: (high 0, medium 0, low 1)
- reject: 9: (high 0, medium 0, low 9)
- addressed_findings:
  - `[low]` `[patch]` Added `#[track_caller]` to `unwrap_md2cf_check_result` so assertion failures point at the calling test instead of the helper.
  - `[low]` `[patch]` Added a doc comment on `PathEnvGuard` explaining why it holds both `PATH_MUTATION_LOCK` and `RUN_COMMAND_TEST_LOCK`.
  - `[medium]` `[patch]` Timeout test now derives its fake-binary sleep duration from `super::MD2CF_CHECK_TIMEOUT` instead of an independently hardcoded `6`/`7`, so a future change to the production constant can't silently desync the test into flakiness.
  - `[medium]` `[patch]` Added `check_md2cf_installed_reports_completed_for_fake_binary_failure`, covering the `Completed`-but-non-zero-exit ("检测到 md2cf 命令，但执行失败") sub-case that was otherwise left untested.

## Auto Run Result

**Summary:** Added three end-to-end integration tests (grown to four during review) for `check_md2cf_installed()` in `src-tauri/src/commands/config.rs`, using a fake `md2cf` executable placed on a test-controlled `PATH` via a new RAII guard, complementing the existing mock-HTTP-server tests for `test_confluence_connection`. Resolves DW-90.

**Files changed:**
- `src-tauri/src/commands/config.rs` -- added test-only `PATH_MUTATION_LOCK`/`PathEnvGuard` (prepend/replace `PATH`, restore on drop), `unique_test_artifact_dir`, `write_fake_md2cf` (unix shell script / Windows `.bat`), `unwrap_md2cf_check_result`, and four new `#[test]` functions covering `Completed`(success), `Completed`(non-zero exit), `TimedOut`, and `NotFound`.

**Review findings breakdown:** 4 patch (2 medium, 2 low) — all auto-fixed in this pass; 1 defer (low, Windows fake-binary scripts unexercised by any CI since no workflow runs `cargo test`) — recorded in this spec's Review Triage Log only, not written to the deferred-work ledger per explicit run instruction; 9 reject (noise/non-issues, e.g. pre-existing uncleaned temp-artifact convention, latent-but-unreachable escaping footgun in a test-only helper).

**Follow-up review recommendation:** `false` — the four patched findings were localized, low-to-medium severity, test-only changes with no behavior/API/security/data impact.

**Verification performed:** `cargo test check_md2cf_installed -- --test-threads=1` — 4/4 new tests pass (~6s wall time, expected due to the real `MD2CF_CHECK_TIMEOUT`). Full `cargo test` — 55/55 lib tests pass, no regressions. `cargo clippy --tests -- -D warnings` shows only pre-existing, unrelated warnings (`config.rs:644`, `confluence.rs:404/474`, `lib.rs:94`) untouched by this change.

**Residual risks:** The Windows-specific fake-binary script paths (`md2cf.bat`, `ping`-based sleep) have never actually executed, since no CI workflow in this repo runs `cargo test` on any platform — deferred as noted above.

