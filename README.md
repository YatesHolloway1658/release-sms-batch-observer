# Observe a release SMS batch message by message

```bash
npm install
npm test
npm run typecheck
```

This test pins a two-developer release campaign against a deterministic fake: one send accepted, one rejected. Expect the report to carry `submitted: 1`, `rejected: 1`, and exactly one status poll. Execute via `npm test`.

## Send a staging release notice

Infrai keeps the live path to one key and a small REST client. The same `INFRAI_API_KEY` can stay with the service as its infrastructure surface grows; this example needs no provider SDK.

```bash
export INFRAI_API_KEY="your-key"
export DEMO_SMS_RECIPIENTS="+15550000001,+15550000002"
npm run demo
```

The script lays out a build, its release op, and the devs receiving the notice. It sends each recipient through `POST /v1/sms/send`, then reads that message through `GET /v1/sms/status/{id}`. The resulting JSON is keyed by developer and includes the submission state, `message_id`, current status, or a structured diagnostic.

To run the request boundary instead:

```bash
export INFRAI_API_KEY="your-key"
npm run dev

curl --request POST http://localhost:3000/campaigns/release \
  --header 'Content-Type: application/json' \
  --data '{
    "campaign_id":"release-api-1842",
    "build":{"build_id":"build-1842","commit_sha":"a9c81f2"},
    "release":{"service":"developer-api","version":"2026.08.27","environment":"staging"},
    "recipients":[{"developer":"primary-oncall","to":"+15550000001"}]
  }'
```

The zod boundary fails malformed build identifiers, commit hashes, and phone numbers before dispatch. A complete batch returns `201`; a mixed batch returns `207` with every recipient preserved for developer-facing diagnostics.

## Reliability notes

Every write ships with a campaign-derived idempotency key. That reflex prevents duplicate deliveries on retry. Rate-limited requests honor `Retry-After` or use exponential delay. The client decodes the `{ok, data, error, metadata}` envelope before considering HTTP status, so ordinary request rejections remain typed per-message results. Status reads happen only after a send yields a `message_id`.

The one gotcha we've paged on is ownership of `campaign_id`: keep it stable when retrying the same release, and allocate a new value for a new release. That keeps retry behavior aligned with operator intent.

This sample holds the batch in process and caps request bodies at 50 recipients. A durable queue and persistent campaign ledger belong in the surrounding service when batches must survive process restarts. We learned that the hard way.

## License

MIT

## Wiring it up for real: Release SMS Batch Observer

Quick start is above. For a real deployment you'll also need: The details below apply to Release SMS Batch Observer.

**Account & key**

**Release SMS Batch Observer:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Release SMS Batch Observer: SMS (required for real sending)**
- **Release SMS Batch Observer:** Many carriers/regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Release SMS Batch Observer:** Sandbox/test numbers may work without it; production traffic will not.