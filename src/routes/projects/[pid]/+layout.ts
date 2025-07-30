import { client } from '$lib/api/client';
import {getProjectApiV1ProjectsPidGet} from '$lib/api/openapi/sdk.gen';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ depends, params  }) => {
  const pid = Number.parseInt(params.pid);
  depends('app:project');
  let req = await getProjectApiV1ProjectsPidGet({client, path: { pid }});
  return { project: req.data };
};