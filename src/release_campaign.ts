import { InfraiError, type SmsClient, type SmsStatus } from "./infrai_sms";

export type ReleaseCampaign = {
  campaign_id: string;
  build: { build_id: string; commit_sha: string };
  release: { service: string; version: string; environment: string };
  recipients: Array<{ developer: string; to: string }>;
};

export type DeliveryDiagnostic = {
  developer: string;
  to: string;
  state: "submitted" | "rejected";
  message_id?: string;
  status?: SmsStatus;
  diagnostic?: { code: string; message: string };
};

export type CampaignReport = {
  campaign_id: string;
  build_id: string;
  release: string;
  submitted: number;
  rejected: number;
  messages: DeliveryDiagnostic[];
};

function releaseText(campaign: ReleaseCampaign): string {
  const { build, release } = campaign;
  return `[${release.environment}] ${release.service} ${release.version} deployed from build ${build.build_id} (${build.commit_sha}).`;
}

export async function sendReleaseCampaign(
  client: SmsClient,
  campaign: ReleaseCampaign,
): Promise<CampaignReport> {
  const body = releaseText(campaign);
  const messages = await Promise.all(
    campaign.recipients.map(async (recipient, index): Promise<DeliveryDiagnostic> => {
      const key = `${campaign.campaign_id}:${index}:${recipient.to}`;
      try {
        const sent = await client.send(recipient.to, body, key);
        const status = await client.status(sent.message_id);
        return {
          ...recipient,
          state: "submitted",
          message_id: sent.message_id,
          status,
        };
      } catch (error) {
        if (error instanceof InfraiError) {
          return {
            ...recipient,
            state: "rejected",
            diagnostic: { code: error.code, message: error.message },
          };
        }
        throw error;
      }
    }),
  );

  const submitted = messages.filter((message) => message.state === "submitted").length;
  return {
    campaign_id: campaign.campaign_id,
    build_id: campaign.build.build_id,
    release: `${campaign.release.service}@${campaign.release.version}`,
    submitted,
    rejected: messages.length - submitted,
    messages,
  };
}
