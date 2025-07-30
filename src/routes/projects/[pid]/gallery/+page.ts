import type { PageLoad } from './$types';
import { client } from '$lib/api/client';
import { listMediaApiV1ProjectsPidMediaGet } from '$lib/api/openapi/sdk.gen';
import type { MediaRead } from '$lib/api/openapi/types.gen';


export const load: PageLoad = async ({ params }) => {
  const pid = Number(params.pid);
  const { data: media } = await listMediaApiV1ProjectsPidMediaGet({ client: client, path: { pid } });
  return { media: media ?? [] } satisfies { media: MediaRead[] };
};