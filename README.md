# ardacebi.com

Personal website (hub).

## JavaScript tests and MC/DC coverage

Requires Node.js 22 or newer. Run:

```sh
npm ci
npm test
npm run coverage
```

Both test commands run behavior tests and enforce 100% modified condition/decision
coverage (MC/DC). The terminal lists each decision and its covered conditions.
`coverage/mcdc.json` contains source locations, observed condition/decision vectors,
and the vector-index pair demonstrating each condition's independent effect.
A missing pair fails the command. GitHub Actions runs this gate on pushes and pull
requests and uploads the JSON report.

The harness parses the actual inline JavaScript from `index.html` with Acorn and
instruments only in-memory test copies. No coverage code or dependencies are sent
to visitors. Tests use Node's VM with small DOM doubles; they check behavior, not
browser rendering or CSS animation timing. Google Analytics is not fetched or
contacted during tests.

### Coverage definition and scope

The MC/DC inventory includes explicit `if`, loop and ternary tests in inline
scripts and event attributes. Boolean `&&`, `||` and `!` within those tests are
decomposed into individual conditions. Independence requires two observations
where the selected condition and the decision both change, with all other
observed conditions fixed; skipped short-circuit operands are masked (recorded
as `null`). See [LLVM's explanation of MC/DC and short-circuit masking](https://clang.llvm.org/docs/SourceBasedCodeCoverage.html).

The current site has three single-condition decisions: the outgoing animation
name, click 10, and click 20. Each requires true and false observations, so MC/DC
is equivalent to decision coverage for these expressions. Harness tests also
verify compound decisions and demonstrate that covering both decision outcomes
alone can leave a condition uncovered.

The analytics `dataLayer || []` fallback and optional selection call are tested
for their alternate behaviors, but are not included in the explicit-decision
MC/DC percentage. Third-party scripts, HTML, CSS, and ordinary statements are
outside that percentage. This is not a statement/line coverage report or a
certification tool. New local script references fail the scope check until they
are added to the harness. Switch statements and nested/async expressions inside
decision tests fail instrumentation rather than being silently counted.

Tests cover clicks before, at, and after the two thresholds; matching and unrelated
animation events; listener cleanup; present/null/undefined selection; mousedown
prevention; and new and existing analytics queues.
