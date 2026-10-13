import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

const NAV_LINKS = [
  { to: '/plato', label: 'Home', end: true },
  { to: '/plato/lessons', label: 'Lessons' },
  { to: '/plato/users', label: 'Users' },
  { to: '/plato/customizer', label: 'Customizer' },
  { to: '/plato/plugins', label: 'Plugins' },
];

function NavItems({ onClick }) {
  return NAV_LINKS.map(({ to, label, end }) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `touch-target flex items-center px-3 py-2 rounded-md text-sm transition-colors whitespace-nowrap ${
          isActive
            ? 'bg-sidebar-foreground/20 font-medium'
            : 'hover:bg-sidebar-foreground/10'
        }`
      }
    >
      {label}
    </NavLink>
  ));
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [version, setVersion] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetch('/v1/version').then(r => r.json()).then(d => setVersion(d.version)).catch(() => {});
  }, []);

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)');
    const closeOnDesktop = event => { if (event.matches) setMenuOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  const handleSignOut = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <DialogPrimitive.Root open={menuOpen} onOpenChange={setMenuOpen}>
    <div className="flex flex-col md:flex-row min-h-screen">
      {/* Mobile: top bar with hamburger */}
      <header className="md:hidden bg-sidebar text-sidebar-foreground flex items-center justify-between px-4 py-3" style={{ '--ring': 'var(--sidebar-foreground)' }}>
        <a href="/plato" onClick={e => { e.preventDefault(); navigate('/plato'); }} className="touch-target flex items-center rounded-sm">
          <img src="/assets/logo-white.svg" alt="plato" className="h-6 w-auto" />
        </a>
        <DialogPrimitive.Trigger
          className="touch-target flex items-center justify-center rounded-sm bg-transparent border-none cursor-pointer text-primary-foreground p-1"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </DialogPrimitive.Trigger>
      </header>

      {/* Mobile: slide-out drawer */}
      <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="admin-drawer-backdrop fixed inset-0 bg-black/40 z-40" />
          <DialogPrimitive.Popup className="admin-drawer fixed top-0 left-0 w-64 max-w-[calc(100%-2rem)] h-dvh overflow-y-auto bg-sidebar text-sidebar-foreground z-50 flex flex-col outline-none" style={{ '--ring': 'var(--sidebar-foreground)' }}>
            <DialogPrimitive.Title className="sr-only">Admin menu</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Choose an admin page or visit the classroom.</DialogPrimitive.Description>
            <div className="flex items-center justify-between px-4 py-3">
              <img src="/assets/logo-white.svg" alt="plato" className="h-6 w-auto" />
              <DialogPrimitive.Close
                className="touch-target flex items-center justify-center rounded-sm bg-transparent border-none cursor-pointer text-primary-foreground p-1"
                aria-label="Close menu"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </DialogPrimitive.Close>
            </div>

            <nav className="flex flex-col flex-1 gap-0.5 px-2" aria-label="Admin navigation">
              <NavItems onClick={() => setMenuOpen(false)} />
            </nav>

            <div className="flex flex-col gap-2 px-4 py-3 mt-auto">
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => { setMenuOpen(false); navigate('/lessons'); }}
              >
                Visit Classroom
              </Button>
              <Separator className="bg-primary-foreground/20" />
              <span className="text-xs truncate opacity-80">{user?.email || ''}</span>
              <Button
                variant="link"
                size="sm"
                className="justify-start p-0 h-auto text-primary-foreground hover:text-primary-foreground focus-visible:ring-primary-foreground"
                onClick={handleSignOut}
              >
                Sign Out
              </Button>
              {version && (
                <>
                  <Separator className="bg-primary-foreground/20" />
                  <a
                    href="https://github.com/1111philo/plato"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs opacity-60 hover:opacity-100 transition-opacity"
                  >
                    plato {version}
                  </a>
                </>
              )}
            </div>
          </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>

      {/* Desktop: fixed sidebar */}
      <aside
        className="hidden md:flex md:w-56 md:h-screen md:fixed md:top-0 md:left-0 bg-sidebar text-sidebar-foreground md:flex-col shrink-0"
        aria-label="Admin sidebar"
        style={{ '--ring': 'var(--sidebar-foreground)' }}
      >
        <div className="px-4 py-4">
          <img src="/assets/logo-white.svg" alt="plato" className="h-6 w-auto" />
        </div>

        <nav className="flex flex-col flex-1 gap-0.5 px-2" aria-label="Admin navigation">
          <NavItems />
        </nav>

        <div className="flex flex-col gap-2 px-4 py-3 mt-auto">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => navigate('/lessons')}
          >
            Visit Classroom
          </Button>
          <Separator className="bg-primary-foreground/20" />
          <span className="text-xs truncate opacity-80">{user?.email || ''}</span>
          <Button
            variant="link"
            size="sm"
            className="justify-start p-0 h-auto text-primary-foreground/80 hover:text-primary-foreground"
            onClick={handleSignOut}
          >
            Sign Out
          </Button>
          {version && (
            <>
              <Separator className="bg-primary-foreground/20" />
              <a
                href="https://github.com/1111philo/plato"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs opacity-60 hover:opacity-100 transition-opacity"
              >
                plato {version}
              </a>
            </>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 sm:p-6 md:ml-56">
        <div className="min-w-0 max-w-4xl pb-4">
          <Outlet />
        </div>
      </main>
    </div>
    </DialogPrimitive.Root>
  );
}
