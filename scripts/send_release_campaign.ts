import { createInfrai } from "../src/infrai_sms";
import { sendReleaseCampaign } from "../src/release_campaign";

const apiKey = process.env.INFRAI_API_KEY;
const recipients = process.env.DEMO_SMS_RECIPIENTS;
if (!apiKey || !recipients) {
  throw new Error("INFRAI_API_KEY and DEMO_SMS_RECIPIENTS are required");
}

const phones = recipients.split(",").map((to) => to.trim()).filter(Boolean);
const report = await sendReleaseCampaign(createInfrai(apiKey).sms, {
  campaign_id: `release-api-2026-08-27`,
  build: { build_id: "build-1842", commit_sha: "a9c81f2" },
  release: { service: "developer-api", version: "2026.08.27", environment: "staging" },
  recipients: phones.map((to, index) => ({ developer: `oncall-${index + 1}`, to })),
});

console.log(JSON.stringify(report, null, 2));
