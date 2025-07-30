import { client } from '$lib/api/client';
import { listProjectsApiV1ProjectsGet } from '$lib/api/openapi/sdk.gen';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ depends }) => {
  depends('app:projectlist');
  let req = await listProjectsApiV1ProjectsGet({client: client});
  return { projects: req.data };
};