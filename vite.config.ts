import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'voxmate-worker-proxy-middleware',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url || !req.url.startsWith('/worker-proxy')) {
            return next();
          }

          const targetPath = req.url.replace(/^\/worker-proxy/, '');
          const upstreamUrl = `https://voxmate-api.crypdigi51.workers.dev${targetPath}`;

          const chunks: Buffer[] = [];
          req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          req.on('end', async () => {
            const bodyBuffer = Buffer.concat(chunks);
            try {
              const upstreamRes = await fetch(upstreamUrl, {
                method: req.method,
                headers: {
                  'Content-Type': (req.headers['content-type'] as string) || 'application/json',
                  'X-VoxMate-Access': (req.headers['x-voxmate-access'] as string) || '',
                  'Origin': 'https://earnygoated.github.io'
                },
                body: ['GET', 'HEAD'].includes(req.method || '') ? undefined : bodyBuffer
              });

              res.statusCode = upstreamRes.status;
              const contentType = upstreamRes.headers.get('content-type');
              if (contentType) {
                res.setHeader('Content-Type', contentType);
              }

              const responseData = await upstreamRes.arrayBuffer();
              res.end(Buffer.from(responseData));
            } catch (err: any) {
              res.statusCode = 502;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: `Proxy gateway error: ${err.message || 'unknown'}` }));
            }
          });
        });
      }
    }
  ],
  server: {
    host: '0.0.0.0',
    port: 3000
  }
});
