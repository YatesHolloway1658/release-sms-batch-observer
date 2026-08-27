import express from "express";
import { z } from "zod";
import { createInfrai, InfraiError } from "./infrai_sms";
import { sendReleaseCampaign, type ReleaseCampaign } from "./release_campaign";

const campaignSchema = z.object({
  campaign_id: z.string().min(1).max(120),
  build: z.object({
    build_id: z.string().min(1).max(120),
    commit_sha: z.string().regex(/^[a-f0-9]{7,40}$/i),
  }),
  release: z.object({
    service: z.string().min(1).max(80),
    version: z.string().min(1).max(80),
    environment: z.string().min(1).max(40),
  }),
  recipients: z.array(z.object({
    developer: z.string().min(1).max(100),
    to: z.string().regex(/^\+[1-9]\d{7,14}$/),
  })).min(1).max(50),
});

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("INFRAI_API_KEY is required");

const smsClient = createInfrai(apiKey).sms;
const app = express();
app.use(express.json({ limit: "32kb" }));

app.post("/campaigns/release", async (req, res) => {
  const parsed = campaignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
    return;
  }

  try {
    const report = await sendReleaseCampaign(smsClient, parsed.data as ReleaseCampaign);
    res.status(report.rejected > 0 ? 207 : 201).json(report);
  } catch (error) {
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      res.status(status).json({ error: error.code, message: error.message });
      return;
    }
    res.status(500).json({ error: "internal_error" });
  }
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`release campaign service listening on :${port}`));
