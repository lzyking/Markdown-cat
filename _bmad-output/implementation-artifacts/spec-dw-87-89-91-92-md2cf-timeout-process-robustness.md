---
title: 'md2cf 超时与进程健壮性加固'
type: 'bugfix'
created: '2026-08-04'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
baseline_revision: '80baab6'
final_revision: '3ee285e'
---

<intent-contract>

## Intent

**Problem:** `run_command_with_timeout` (src-tauri/src/commands/config.rs) only kills the direct child on timeout, so a wrapper `md2cf` script's grandchildren can outlive a reported timeout; it also discards partial stdout/stderr on timeout, and if `child.kill()` itself errors for a reason other than "already exited", the fallback `child.wait()` has no bound and can block forever. Separately, `test_confluence_connection` returns immediately when the 1 MiB body cap is hit without draining the rest of the HTTP response stream, which can prevent the connection from being returned to reqwest's pool.

**Approach:** Give the spawned child its own process group at spawn time (Unix) and kill the whole group (not just the child) on timeout; on Windows use `taskkill /T /F` to kill the process tree. Capture stdout/stderr drained before the kill and surface them in the `TimedOut` result so callers can report whether the process produced partial output. Add a secondary bounded wait after a failed `kill()` so a non-"already exited" kill error can no longer block indefinitely. In `test_confluence_connection`, when the oversized-body branch triggers, keep reading and discarding `response.chunk()` until the stream ends (or the client's existing 10s request timeout / a read error stops it) before returning the oversized result.

## Boundaries & Constraints

**Always:**
- Preserve the existing public behavior/signatures of `check_md2cf_installed` and `test_confluence_connection` (same `Md2cfCheckResult` / `ConfluenceTestResult` shapes); only internal logic and message text may change.
- Preserve existing "kill() returned Err because process already exited in the race window" handling: that path must still fall back to `child.wait()` and resolve as `Completed`, not as an error.
- The whole-tree kill on timeout must not change the *reported outcome* for cases already covered by the existing timeout tests (`run_command_with_timeout_times_out_for_slow_command`, `run_command_with_timeout_drains_large_output_without_deadlocking`, `run_command_with_timeout_completes_for_fast_command`) — those must keep passing.
- The new secondary wait bound after a real `kill()` failure must be strictly shorter than a value that would make `run_command_with_timeout`'s total worst-case blocking time unbounded; it must always return (either `Completed` or an `Err`/`TimedOut`) within a bounded, documented extra duration.
- Any new dependency must resolve from the existing `Cargo.lock` (`libc` is already present transitively at 0.2.189) — do not introduce a dependency that requires new download resolution.

**Block If:** None identified — all four items are additive hardening of an existing internal function and one existing internal branch; no product-facing decision is required.

**Never:**
- Do not change the timeout durations (`MD2CF_CHECK_TIMEOUT`, the 10s Confluence client timeout) or the 1 MiB caps (`MAX_CHILD_OUTPUT_BYTES`, `MAX_CONFLUENCE_TEST_BODY_BYTES`).
- Do not add a job-object/process-group dependency beyond what's needed (no `sysinfo`, no shelling out to `ps`/`pgrep`); Unix uses `libc::kill` on the negative pid, Windows uses `taskkill /T /F` via `std::process::Command`.
- Do not attempt to drain the oversized Confluence response body without bound — rely on the request's existing overall timeout (already set via `reqwest::Client::builder().timeout(...)`) rather than adding a second explicit deadline.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Wrapper spawns grandchild, times out | `md2cf`-like command whose immediate child spawns a further sleeping subprocess in the same process group | `run_command_with_timeout` returns `TimedOut`; the grandchild process is also terminated (verifiable by its own exit) | N/A — this is the fix, not an error path |
| Timeout with partial output | Command writes to stdout before hanging past the timeout | `TimedOut` variant carries the drained stdout/stderr bytes captured before the kill | N/A |
| `kill()` fails for a real reason (not "already exited") | Simulate/force a `kill()` error path other than ESRCH/"not found" | Function bounds the subsequent wait and returns within the documented secondary bound, never blocking indefinitely | Returns `Err` (or a `TimedOut`/best-effort `Completed` if the process exits within the secondary bound) rather than hanging |
| `kill()` races a natural exit | Process exits in the tiny window between `try_wait()` returning `None` and the kill call | Falls back to `child.wait()`, resolves as `Completed` with the real exit status (unchanged behavior) | No error surfaced to caller |
| Confluence response exceeds 1 MiB cap | Server keeps sending body past `MAX_CONFLUENCE_TEST_BODY_BYTES` | Function returns the existing oversized `ConfluenceTestResult` (unchanged message/behavior), but has read/discarded the remaining chunks first so the connection can be returned to the pool | Read errors while draining are swallowed (draining is best-effort cleanup, not part of the reported result) |

</intent-contract>

## Code Map

- `src-tauri/src/commands/config.rs` -- `run_command_with_timeout`, `CommandRunResult` enum, `check_md2cf_installed`, `test_confluence_connection` all live here; this is the sole file to change besides the manifest.
- `src-tauri/Cargo.toml` -- add `libc` as a direct `cfg(unix)` dependency (already present transitively via existing deps, pinned in `Cargo.lock` at 0.2.189) to send a signal to a negative pid (process group).

## Tasks & Acceptance

**Execution:**
- [x] `src-tauri/Cargo.toml` -- add `[target.'cfg(unix)'.dependencies] libc = "0.2"` -- needed for `libc::kill(-pid, SIGKILL)` to signal the whole process group instead of only the direct child.
- [x] `src-tauri/src/commands/config.rs` -- on Unix, put the spawned child into its own new process group at spawn time via `std::os::unix::process::CommandExt::process_group(0)` -- this makes the child (and any subprocess it spawns without changing its own group) reachable by a single negative-pid signal.
- [x] `src-tauri/src/commands/config.rs` -- replace the timeout-path `child.kill()` call with a `kill_process_tree` helper: on Unix, `libc::kill(-(pid), libc::SIGKILL)`, treating an `ESRCH` errno the same way the current code treats a `kill()` `Err` ("already exited" fallback to `child.wait()` → `Completed`), and any other errno as a real kill failure; on Windows, run `taskkill /PID <pid> /T /F` via `std::process::Command::output()`, treating a "not found"/failure exit code the same as the Unix ESRCH case and any other failure as a real kill failure -- fixes DW-87 (kills descendants) and sets up the branch DW-92 needs.
- [x] `src-tauri/src/commands/config.rs` -- change `CommandRunResult::TimedOut` to carry the stdout/stderr bytes already drained by `stdout_thread`/`stderr_thread` before the kill (e.g. `TimedOut { stdout: Vec<u8>, stderr: Vec<u8> }`), and update `check_md2cf_installed`'s `Ok(CommandRunResult::TimedOut(..))` arm to inspect the captured bytes: if either is non-empty, adjust `message` to indicate the process produced output before being killed (distinguishing "was about to finish" from a silent hang) instead of the current generic "检测 md2cf 超时" text -- fixes DW-89.
- [x] `src-tauri/src/commands/config.rs` -- when the real-kill-failure branch from the previous task is hit (kill failed for a reason other than "already exited"), poll `child.try_wait()` at the existing `MD2CF_CHECK_POLL_INTERVAL` for a bounded secondary window (a new constant, e.g. `MD2CF_KILL_FAILURE_WAIT: Duration` of a few seconds) instead of an unbounded `child.wait()`; if the child exits within that window, return `Completed` with its real status; if it does not, return an `Err(std::io::Error)` describing that the process could not be confirmed terminated -- fixes DW-92.
- [x] `src-tauri/src/commands/config.rs` -- in `test_confluence_connection`'s oversized-body branch, after setting `oversized = true` and before returning the oversized `ConfluenceTestResult`, keep calling `response.chunk().await` in a loop (discarding the bytes) until it returns `Ok(None)` or any `Err` (stop draining on error, since it's best-effort cleanup) -- fixes DW-91.
- [x] `src-tauri/src/commands/config.rs` -- add unit tests in the existing `#[cfg(test)] mod` alongside `run_command_with_timeout_times_out_for_slow_command`: (a) a wrapper/grandchild test proving the whole process group is killed on timeout (e.g. spawn a `sh -c` command that itself backgrounds a longer-sleeping grandchild in the same process group, then assert the grandchild's PID is no longer alive after the timeout resolves — Unix-only via `#[cfg(unix)]`, mirroring the existing `#[cfg(unix)]`/`#[cfg(windows)]` split); (b) a test asserting `TimedOut` carries non-empty stdout when the killed command wrote output first; (c) a test for the existing "kill races natural exit" behavior still resolving as `Completed` (may already be implicitly covered — add an explicit regression test if not); (d) an integration test alongside `test_confluence_connection_succeeds_for_matching_space_response` proving the oversized-cap path still returns the correct oversized result when the mock server sends more bytes after the cap boundary (i.e. the extra bytes are drained without panicking or hanging the test).

**Acceptance Criteria:**
- Given a command that spawns a grandchild in the same process group and then the parent hangs past the timeout, when `run_command_with_timeout` times out, then the grandchild process is also terminated (not just the immediate child).
- Given a command that writes to stdout/stderr before hanging past the timeout, when `run_command_with_timeout` resolves as `TimedOut`, then the drained stdout/stderr bytes are available on the result and `check_md2cf_installed`'s message differs from the previous generic timeout text when output was captured.
- Given `child.kill()` fails for a reason other than the process having already exited, when `run_command_with_timeout` handles that failure, then it never blocks past the documented secondary bound and returns either a real `Completed` status or an explicit `Err`.
- Given `test_confluence_connection`'s response body exceeds the 1 MiB cap, when the oversized branch is taken, then the remainder of the response stream is read/discarded before the function returns (no behavior change to the returned `ConfluenceTestResult`).
- Given the existing test suite (`cargo test` in `src-tauri`), when run after these changes, then all existing and new tests pass.

## Spec Change Log

## Review Triage Log

### 2026-08-04 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 3 (medium 1medium, low 2low)
- defer: 2 (low 2low)
- reject: 5 (low 5low)
- addressed_findings:
  - `[medium]` `[patch]` Windows `kill_process_tree` used a blocking `taskkill ... .output()` call with no bound of its own, so a hung/blocked `taskkill.exe` could make the timeout-enforcing function block indefinitely — contradicts the spec's own "must always return within a bounded, documented extra duration" invariant. Fixed by spawning `taskkill` and bounding its wait with the same `wait_for_child_exit_after_failed_kill` poll used for the native-kill-failure path, force-killing `taskkill` itself and returning an `Err` if it doesn't exit in time.
  - `[low]` `[patch]` The Unix `kill_process_tree` doc comment implied a fully general process-tree kill; clarified it as process-*group*-scoped (a descendant that calls `setsid`/changes its own group would survive), matching the actual `libc::kill(-pgid, ...)` mechanism.
  - `[low]` `[patch]` Added an explicit comment documenting why the stdout/stderr reader threads are intentionally left un-joined (not force-joined) in the "kill failed and wait_for_child_exit_after_failed_kill also could not confirm exit" branch — joining there would risk blocking on a child that was never confirmed dead, defeating the bound this whole path exists to enforce.

Findings triaged as **defer** (pre-existing, not caused by this change, or valuable-but-non-blocking future coverage — not written to the deferred-work ledger per explicit run instruction; noted for the orchestrator instead):
- The `try_wait()` I/O-error branch in `run_command_with_timeout` still calls `child.kill()` directly instead of `kill_process_tree`, so on that (very rare, pre-existing, unrelated-to-timeout) path descendants are not killed. Out of scope: the intent and DW-87 are specifically about the *timeout* path; this branch and its `child.kill()` call predate this change.
- No unit test simulates a genuine `kill_process_tree` failure (permission-denied style) or exercises the Windows `taskkill` path (this environment is macOS-only), and no test proves a descendant that calls `setsid` escapes the Unix process-group kill (matches the now-documented scope limitation). Valuable future coverage, not required by the spec's I/O matrix/task list and partly infeasible to construct reliably in this CI environment.

Findings triaged as **reject** (noise / already-authorized by the intent-contract, dropped silently):
- PID/PGID-reuse TOCTOU race between the timeout check and `kill_process_tree` — pre-existing to any PID-based kill mechanism (same race existed with the prior single-`child.kill()` call), astronomically low probability.
- New process-group membership increasing orphan risk if the host app itself crashes/is killed ungracefully — not a regression versus prior behavior (the child was never guaranteed to die with the parent before this change either).
- `md2cf_timeout_message` wording ("可能接近完成") when partial output preceded a hang — matches the literal, hedged ("可能") wording the spec's task explicitly asked for.
- `test_confluence_connection` draining the oversized body can delay the "测试连接" UI response up to the existing 10s client timeout — explicitly authorized by the spec's "Never: rely on the existing overall timeout rather than adding a second explicit deadline" boundary.
- The oversized-drain loop swallowing read errors after the cap — explicitly specified by the spec's I/O matrix ("Read errors while draining are swallowed").

## Design Notes

Concrete shape for the two platform-specific kill/wait helpers (kept out of task descriptions to avoid over-specifying "how" there):

```rust
#[cfg(unix)]
fn kill_process_tree(child: &std::process::Child) -> std::io::Result<()> {
    use std::os::unix::process::CommandExt as _; // for spawn-time process_group(0)
    let pgid = child.id() as libc::pid_t;
    // Negative pid signals the whole process group, not just the leader.
    if unsafe { libc::kill(-pgid, libc::SIGKILL) } == 0 {
        Ok(())
    } else {
        let err = std::io::Error::last_os_error();
        if err.raw_os_error() == Some(libc::ESRCH) {
            Ok(()) // group already gone -- treat like "already exited"
        } else {
            Err(err)
        }
    }
}
```
On Windows, `taskkill /PID <id> /T /F` is run via `Command::output()`; treat exit code 128 (process not found, matching the Unix ESRCH branch) as success-equivalent, anything else as a real failure that falls into the DW-92 secondary-wait branch.

For the child process-group setup, call `.process_group(0)` on the `std::process::Command` before `spawn()`, guarded by `#[cfg(unix)]` (Windows has no equivalent concept; `taskkill /T` walks the tree by parent-PID instead, so no spawn-time change is needed there).

## Verification

**Commands:**
- `cd src-tauri && cargo test commands::config` -- expected: all `config.rs` unit + integration tests pass, including the new ones covering DW-87/89/91/92.
- `cd src-tauri && cargo build` -- expected: builds cleanly on the current platform with the new `libc` (Unix) dependency resolved from the existing lockfile.

## Auto Run Result

Status: done

**Summary:** Hardened `run_command_with_timeout` in `src-tauri/src/commands/config.rs` to kill the whole child process group (Unix, via a spawn-time `process_group(0)` + `libc::kill(-pgid, SIGKILL)`) or process tree (Windows, via a now-bounded `taskkill /T /F`) on timeout instead of only the direct child; surfaced the drained stdout/stderr in the `TimedOut` result and adjusted `check_md2cf_installed`'s user-facing message when partial output was captured; added a bounded secondary wait (`MD2CF_KILL_FAILURE_WAIT`) after a genuine (non-"already exited") kill failure so that path can no longer block indefinitely; and made `test_confluence_connection` drain the remainder of an oversized HTTP response body before returning so the connection can be returned to reqwest's pool.

**Files changed:**
- `src-tauri/Cargo.toml` -- added `libc = "0.2"` as a Unix-only direct dependency (already present transitively; resolved from the existing lockfile).
- `src-tauri/Cargo.lock` -- lockfile update reflecting the new direct `libc` dependency edge.
- `src-tauri/src/commands/config.rs` -- `run_command_with_timeout` process-group/tree kill + partial-output capture + bounded secondary wait; `check_md2cf_installed` timeout-message change; `test_confluence_connection` oversized-body drain; new unit/integration tests.
- `_bmad-output/implementation-artifacts/spec-dw-87-89-91-92-md2cf-timeout-process-robustness.md` -- this spec (new).

**Review findings breakdown (single pass, no loopback needed):**
- patches applied: 3 (1 medium — unbounded Windows `taskkill` call now bounded; 2 low — doc/comment clarifications for process-group scope and intentional un-joined reader threads)
- deferred (not written to the ledger per explicit run instruction, noted here for the orchestrator): 2 low-severity items — the pre-existing, timeout-unrelated `try_wait()` I/O-error branch still using `child.kill()` instead of the tree-kill helper; and additional test coverage for a genuine `kill_process_tree` failure / Windows `taskkill` path / `setsid`-escape scenario (partly infeasible in this macOS-only sandbox).
- rejected (noise / already authorized by the intent-contract): 5 — PID/PGID reuse TOCTOU race (pre-existing, negligible probability), new-process-group orphan risk on host crash (not a regression), timeout-message wording nuance (matches spec's literal hedged wording), oversized-drain latency up to the existing 10s client timeout (explicitly authorized by the spec's "Never" boundary), and drain-loop error swallowing (explicitly specified by the spec's I/O matrix).

**Verification performed:** `cargo build` (clean) and `cargo test` (full suite, 51 passed / 0 failed) run from `src-tauri/` after both the initial implementation and the two review-driven patches; all 24 `commands::config` tests (including 4 new ones covering DW-87/89/91/92) pass.

**Residual risks:** Windows `taskkill` behavior could not be exercised in this macOS sandbox (only compile-checked via `#[cfg(windows)]`); the Unix fix kills a process *group*, not an unconditionally general tree (a descendant calling `setsid` would still escape, now documented); the two deferred items above remain open for the orchestrator to route.
