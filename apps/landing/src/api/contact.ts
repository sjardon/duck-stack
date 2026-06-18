export interface ContactPayload {
  name: string;
  email: string;
  message: string;
}

export interface ContactResponse {
  ok: boolean;
}

export async function submitContact(
  _payload: ContactPayload,
): Promise<ContactResponse> {
  // Stub: returns a resolved response without a real network call.
  return Promise.resolve({ ok: true });
}
