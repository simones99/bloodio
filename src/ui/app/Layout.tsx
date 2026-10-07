import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { it } from '../i18n/it';
import styles from './Layout.module.css';

/** Page frame: scrolling content above, tab bar below. Focus moves to the page on navigation. */
export function Layout() {
  const location = useLocation();
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    main.current?.focus({ preventScroll: true });
    main.current?.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className={styles.frame}>
      <main ref={main} tabIndex={-1} className={styles.main}>
        <Outlet />
      </main>
      <nav className={styles.tabs} aria-label={it.nav.main}>
        <NavLink to="/reports" className={styles.tab}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 3h10v18H7zM10 8h4M10 12h4M10 16h2" />
          </svg>
          {it.nav.reports}
        </NavLink>
        <NavLink to="/import" className={styles.add} aria-label={it.nav.add}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </NavLink>
        <NavLink to="/analytes" className={styles.tab}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 12h18M3 6h18M3 18h18" />
            <circle cx="16" cy="6" r="1.8" fill="currentColor" />
            <circle cx="8" cy="12" r="1.8" fill="currentColor" />
            <circle cx="13" cy="18" r="1.8" fill="currentColor" />
          </svg>
          {it.nav.values}
        </NavLink>
        <NavLink to="/settings" className={styles.tab}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
          </svg>
          {it.nav.settings}
        </NavLink>
      </nav>
    </div>
  );
}
