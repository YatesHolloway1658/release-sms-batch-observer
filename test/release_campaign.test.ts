import { describe, expect, it } from "vitest";
import { InfraiError, type SmsClient } from "../src/infrai_sms";
import { sendReleaseCampaign } from "../src/release_campaign";

describe("release campaign diagnostics", () => {
  it("queries status only for submitted messages and retains a per-developer rejection", async () => {
    const statusLookups: string[] = [];
    const client: SmsClient = {
      send: async (to) => {
        if (to.endsWith("02")) throw new InfraiError("RECIPIENT_REJECTED", "recipient rejected", 422);
        return { message_id: "msg-build-1842" };
      },
      status: async (messageId) => {
        statusLookups.push(messageId);
        return { status: "queued" };
      },
    };

    const report = await sendReleaseCampaign(client, {
      campaign_id: "release-api-1842",
      build: { build_id: "build-1842", commit_sha: "a9c81f2" },
      release: { service: "developer-api", version: "2026.08.27", environment: "staging" },
      recipients: [
        { developer: "primary", to: "+15550000001" },
        { developer: "secondary", to: "+15550000002" },
      ],
    });

    expect(statusLookups).toEqual(["msg-build-1842"]);
    expect(report).toMatchObject({ submitted: 1, rejected: 1 });
    expect(report.messages).toEqual([
      expect.objectContaining({ developer: "primary", state: "submitted", status: { status: "queued" } }),
      expect.objectContaining({ developer: "secondary", state: "rejected" }),
    ]);
  });
});
