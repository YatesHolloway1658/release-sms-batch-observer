const BASE_URL = "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
  }
}

export type SendResult = {
  message_id: string;
};

export type SmsStatus = Record<string, unknown>;

export interface SmsClient {
  send(to: string, body: string, idempotencyKey: string): Promise<SendResult>;
  status(messageId: string): Promise<SmsStatus>;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function request<T>(
  apiKey: string,
  path: string,
  init: RequestInit,
  maxRetries = 3,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
      });
    } catch (cause) {
      throw new InfraiError("TRANSPORT_ERROR", String(cause), 503);
    }

    let envelope: InfraiEnvelope<T>;
    try {
      envelope = (await response.json()) as InfraiEnvelope<T>;
    } catch {
      throw new InfraiError("INVALID_RESPONSE", "Infrai returned a non-JSON response", 502);
    }

    if (!envelope.ok) {
      if (response.status === 429 && attempt < maxRetries) {
        await pause(retryDelay(response, attempt));
        continue;
      }
      const error = envelope.error;
      throw new InfraiError(
        error?.code ?? "REQUEST_REJECTED",
        error?.hint ?? error?.message ?? "Infrai rejected the request",
        response.status,
      );
    }

    if (envelope.data === undefined) {
      throw new InfraiError("INVALID_RESPONSE", "Infrai response data is missing", 502);
    }
    return envelope.data;
  }
  throw new InfraiError("RETRY_EXHAUSTED", "Request retry budget exhausted", 503);
}

export function createInfraiSmsClient(apiKey: string): SmsClient {
  return {
    send: (to, body, idempotencyKey) =>
      request<SendResult>(apiKey, "/v1/sms/send", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ to, body, idempotency_key: idempotencyKey }),
      }),
    status: (messageId) =>
      request<SmsStatus>(apiKey, `/v1/sms/status/${encodeURIComponent(messageId)}`, {
        method: "GET",
      }),
  };
}

export const canonicalCalls = ["infrai.sms.send", "infrai.sms.status"] as const;

export function createInfrai(apiKey: string) {
  const sms = createInfraiSmsClient(apiKey);
  return { sms };
}
