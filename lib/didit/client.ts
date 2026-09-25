const DIDIT_API_KEY = process.env.DIDIT_API_KEY || "";
const DIDIT_BASE = "https://verification.didit.me/v3";

export interface DiditError {
  detail?: string;
  error?: string;
  [key: string]: unknown;
}

export class DiditApiError extends Error {
  status: number;
  body: DiditError;
  constructor(status: number, body: DiditError) {
    const msg = body.detail || body.error || JSON.stringify(body) || `Didit API error ${status}`;
    super(msg);
    this.name = "DiditApiError";
    this.status = status;
    this.body = body;
  }
}

async function requestForm(path: string, form: FormData): Promise<any> {
  return request("POST", path, {
    headers: { "x-api-key": DIDIT_API_KEY },
    body: form,
  });
}

async function requestJson(path: string, json: unknown): Promise<any> {
  return request("POST", path, {
    headers: { "x-api-key": DIDIT_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(json),
  });
}

async function requestGet(path: string): Promise<any> {
  return request("GET", path, {
    headers: { "x-api-key": DIDIT_API_KEY },
  });
}

async function request(
  method: string,
  path: string,
  init: RequestInit,
): Promise<any> {
  const url = `${DIDIT_BASE}${path}`;
  const res = await fetch(url, { method, ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new DiditApiError(res.status, body as DiditError);
  }
  return body;
}

export { requestForm, requestJson, requestGet };
