/**
 * The app: a router, wrapped in the session that decides who is using it.
 *
 * SessionProvider sits outside BrowserRouter because the session is not
 * route-dependent -- a 401 on any route resolves the same way, and the token
 * entry state is not a route, it is what the shell renders instead of one.
 */
import { BrowserRouter } from 'react-router';

import { AppRoutes } from './app/routes.tsx';
import { SessionProvider } from './session/SessionProvider.tsx';

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </SessionProvider>
  );
}
