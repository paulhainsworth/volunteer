/**
 * Get user-facing error message from supabase.functions.invoke result.
 * When the edge returns non-2xx, the client often only gives a generic message;
 * this tries to read the response body from error.context (Supabase JS).
 * @param {{ error?: string, details?: string } | null} data - invoke result data (may contain error from 2xx body)
 * @param {{ message?: string, context?: { json: () => Promise<unknown> } } | null} error - invoke result error
 * @param {string} fallback - message when no details available
 * @returns {Promise<string>}
 */
export async function getEdgeInvokeErrorMessage(data, error, fallback = 'Request failed') {
  if (data?.error) return data.details ? `${data.error}: ${data.details}` : data.error;
  if (!error) return fallback;
  let message = error.message || fallback;
  if (error.context && typeof error.context.json === 'function') {
    try {
      const body = await error.context.json();
      if (body?.error) message = body.details ? `${body.error}: ${body.details}` : body.error;
    } catch (_) {}
  }
  return message;
}
