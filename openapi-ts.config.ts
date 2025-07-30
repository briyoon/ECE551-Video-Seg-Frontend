import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: 'static/openapi.json',
  output: 'src/lib/api/openapi',
});