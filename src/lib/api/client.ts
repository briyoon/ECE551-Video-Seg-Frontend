import { createClient } from '$lib/api/openapi/client';
import { PUBLIC_API_BASE } from '$env/static/public';

export const client = createClient({
  baseUrl: PUBLIC_API_BASE || 'http://localhost:8000',
  fetch,
});