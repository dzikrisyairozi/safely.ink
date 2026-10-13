import { serve } from '@hono/node-server';
import { app } from './app';
import { config } from './config';

serve({ fetch: app.fetch, port: config.PORT }, () => {
  console.log(`api listening on :${config.PORT}`);
});
