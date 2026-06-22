import 'fastify';
import type { AuthedUser } from '@dc/shared';

// Teaches TypeScript that, after our auth guard runs, a request may carry the
// logged-in user. `req.user` is undefined until the guard sets it.
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthedUser;
  }
}
