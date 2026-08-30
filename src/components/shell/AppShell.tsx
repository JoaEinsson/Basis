import {
  LibraryBig,
  ListMusic,
  Search,
  Settings2,
  Sparkles,
} from "lucide-react";
import { Outlet, useLocation } from "react-router-dom";

const navigation = [
  { label: "Home", icon: Sparkles },
  { label: "Albums", icon: LibraryBig },
  { label: "Tracks", icon: ListMusic },
];

export function AppShell() {
  const location = useLocation();
  const isOnboarding = location.pathname === "/onboarding";

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Library navigation">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            B
          </span>
          <span>Basis</span>
        </div>

        <nav className="sidebar-nav">
          {navigation.map(({ label, icon: Icon }) => (
            <span className="nav-item" key={label} aria-disabled="true">
              <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
              {label}
            </span>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="nav-item" aria-disabled="true">
            <Settings2 aria-hidden="true" size={17} strokeWidth={1.8} />
            Settings
          </span>
        </div>
      </aside>

      <main className="content-area">
        <header className="topbar">
          <div>
            <p className="eyebrow">{isOnboarding ? "First run" : "Basis"}</p>
            <p className="topbar-title">Local music, your rules.</p>
          </div>
          <div
            className="search-placeholder"
            aria-label="Search will be available after library setup"
          >
            <Search aria-hidden="true" size={16} />
            <span>Search your library</span>
            <kbd>Ctrl K</kbd>
          </div>
        </header>

        <Outlet />
      </main>

      <footer className="player-bar" aria-label="Now playing">
        <div className="player-artwork" aria-hidden="true" />
        <div>
          <p className="player-title">No track selected</p>
          <p className="player-subtitle">Your queue will appear here.</p>
        </div>
        <div className="player-progress" aria-hidden="true">
          <span />
        </div>
      </footer>
    </div>
  );
}
