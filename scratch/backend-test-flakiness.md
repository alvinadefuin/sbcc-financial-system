# Backend suite flakiness — investigation notes (2026-08-16)

**Status: characterised, root cause NOT found. Open.**

`cd backend && npm test` intermittently reports one or two failures beyond the
documented `googleSheetsService` environmental one. Re-running passes. This is
pre-existing and unrelated to any particular change — it was noticed while
verifying the records-sorting work, which touched **zero** files under `api/` or
`backend/`.

## Symptoms

Two failure modes, both at the HTTP transport layer, never in assertion logic:

```
thrown: "Exceeded timeout of 5000 ms for a test."
```

```
Parse Error: Expected HTTP/, RTSP/ or ICE/
```

Sometimes accompanied by:

```
A worker process has failed to exit gracefully and has been force exited.
This is likely caused by tests leaking due to improper teardown.
```

The second message is Node's llhttp parser refusing bytes that are not a valid
HTTP status line — i.e. the client read something off the socket that was not
the response it was waiting for.

## Which tests

Nothing test-specific. Four different files have shown it so far, and within
`api/activity.test.js` two *different* tests failed on different runs while
their structurally identical neighbours passed:

- `api/activity.test.js` (`filters › filters by date range…`, `pagination › defaults to 50 rows…`)
- `api/collections.activity.test.js`
- `api/auth.password.test.js`
- `backend/routes/customFields.auth.test.js`

The common factor is **supertest**, not any assertion.

## Rate

- Full suite: ~1 anomalous run in 20 (1 caught in a 20-run loop).
- `api/activity.test.js` alone: ~1 in 40.

It reproduces **in isolation**, so it does not require parallel workers — though
the higher full-suite rate suggests more requests means more chances.

A failing run is otherwise normal speed: in the caught run only the one suite
was slow (5.17 s ≈ exactly the timeout), total 7.5 s vs a typical 1.4–2.7 s.
Nothing else was degraded.

## Ruled out, with evidence

| Hypothesis | Evidence against |
|---|---|
| CPU contention / load | Ran the suite under full saturation (12 spin loops on 8 cores), 3 runs — all clean. Also 3 runs at `--maxWorkers=16` — clean. |
| Shared SQLite state across workers | The flaky files fully mock the DB (`jest.mock('./_lib/database')`, `jest.mock('../config/database')`). No real SQLite handle is involved. |
| Real database / network latency | No `DATABASE_URL` in the shell, in `backend/.env`, or in `.env.local`. `api/_lib` never loads dotenv. |
| Application code hanging | `api/activity.js` responds on every path (`res.json` in `try`, `res.status(500).json` in `catch`), and both mocks settle (`mockResolvedValue` / `async` implementation). The handler cannot hang. |
| Node 22 keep-alive socket reuse | Was the leading theory: Node ≥19 defaults `http.globalAgent.keepAlive = true`, and supertest creates + closes a fresh ephemeral-port server per request, so a pooled socket could outlive its server and be reused after `listen(0)` recycles the port. A/B tested outside jest at 3000 cycles each with keep-alive on and off: **0 failures both ways**. Not confirmed. |

## What is still suspected

The mechanism is a socket being read after it no longer belongs to the request
that is reading it. That the keep-alive A/B came back clean **outside** jest,
while the failure only ever appears **inside** jest, points at something the
jest environment adds — module-registry teardown, the vm context, or worker
lifecycle interacting with in-flight sockets. The "worker failed to exit
gracefully" warning is consistent with handles outliving the tests that made
them.

## Next experiment (not yet run)

Run the same create-server → request → close-server cycle *inside* a jest test
at high iteration count, and see whether the jest environment alone reproduces
it. A working scaffold:

```bash
npx jest --config '{"rootDir":"<dir>","testEnvironment":"node","moduleDirectories":["node_modules","<repo>/backend/node_modules"]}'
```

If it reproduces there, A/B keep-alive again *inside* jest — the earlier
negative result only rules it out for a plain Node process.

## Mitigations considered, none applied

- Raise the jest timeout above 5000 ms — hides the timeout mode, not the parse-error mode.
- `--runInBand` — untested against the failure rate; it does not reduce the number of `listen()` calls, only their concurrency, and the bug reproduces single-file anyway.
- Share one listening server per test file instead of one per request — the most likely real fix if the transport theory holds, but it is a broad change across many test files and should wait for a confirmed root cause.

## How to hunt it

```bash
cd backend
for i in $(seq 1 20); do
  npm test > /tmp/run$i.txt 2>&1
  N=$(grep -oE '^Tests: +[0-9]+ failed' /tmp/run$i.txt | grep -oE '[0-9]+')
  [ "$N" = "1" ] || echo "RUN $i ANOMALY: $(grep -E '^Tests: ' /tmp/run$i.txt)"
done
```

Expect `1 failed` every run (the `googleSheetsService` environmental one).
Anything else is an instance of this bug — keep the output file, the error text
is the whole point.
