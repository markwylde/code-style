import parse from "html-react-parser";
import { marked } from "marked";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import specMarkdown from "../SPEC.md?raw";
import AboutPage from "./AboutPage";
import { htmlParserOptions } from "./markdownExtensions";

type Page = {
  id: string;
  title: string;
  tagline: string;
  order: number;
  body: string;
};

type Section = "guide" | "about" | "spec";

type ViewState = {
  section: Section;
  guideId: string;
};

type SpecMode = "friendly" | "markdown";
type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "codestyle-theme";

const markdownModules = import.meta.glob("../pages/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

function readStoredTheme(): Theme | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
  } catch {
    // ignore storage errors (private mode, etc.)
  }
  return null;
}

function readSystemTheme(): Theme {
  if (typeof window === "undefined" || !window.matchMedia) {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveInitialTheme(): { theme: Theme; hasExplicit: boolean } {
  const stored = readStoredTheme();
  if (stored) {
    return { theme: stored, hasExplicit: true };
  }
  return { theme: readSystemTheme(), hasExplicit: false };
}

function loadPages(): Page[] {
  return Object.entries(markdownModules)
    .map(([path, raw]) => {
      const { meta, body } = parseFrontmatter(raw.trim(), path);
      const id =
        typeof meta.id === "string" && meta.id
          ? meta.id
          : deriveIdFromPath(path);
      const title =
        typeof meta.title === "string" && meta.title
          ? meta.title
          : deriveTitleFromPath(path);
      const tagline = typeof meta.tagline === "string" ? meta.tagline : "";
      const orderValue = meta.order;
      const order =
        typeof orderValue === "number" ? orderValue : Number.MAX_SAFE_INTEGER;

      return {
        id,
        title,
        tagline,
        order,
        body,
      };
    })
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

type Frontmatter = {
  meta: Record<string, string | number>;
  body: string;
};

function parseFrontmatter(raw: string, path: string): Frontmatter {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) {
    throw new Error(`Missing frontmatter in ${path}`);
  }

  const metaBlock = match[1];
  const body = match[2].trim();
  const meta: Record<string, string | number> = {};

  metaBlock.split(/\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    meta[key] = parseMetaValue(value);
  });

  return { meta, body };
}

function parseMetaValue(value: string): string | number {
  const unquoted = value.replace(/^['"]/, "").replace(/['"]$/, "");
  const numeric = Number(unquoted);
  if (!Number.isNaN(numeric) && unquoted !== "") {
    return numeric;
  }
  return unquoted;
}

function deriveIdFromPath(path: string): string {
  const fileName = path.split("/").pop() || "";
  return fileName.replace(/\.md$/, "");
}

function deriveTitleFromPath(path: string): string {
  const id = deriveIdFromPath(path);
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveGuideId(initialId: string | undefined, pages: Page[]): string {
  if (initialId && pages.some((page) => page.id === initialId)) {
    return initialId;
  }
  return pages[0]?.id || "";
}

function parseHash(hash: string, pages: Page[]): ViewState {
  const trimmed = hash.replace(/^#/, "");
  if (!trimmed) {
    return { section: "guide", guideId: resolveGuideId(undefined, pages) };
  }

  const [firstPart, secondPart] = trimmed.split("/");

  if (firstPart === "about") {
    return { section: "about", guideId: resolveGuideId(undefined, pages) };
  }

  if (firstPart === "spec") {
    return { section: "spec", guideId: resolveGuideId(undefined, pages) };
  }

  if (firstPart === "guide") {
    return { section: "guide", guideId: resolveGuideId(secondPart, pages) };
  }

  // Backwards compatibility for old hashes that referenced the guide page id directly
  return {
    section: "guide",
    guideId: resolveGuideId(firstPart || undefined, pages),
  };
}

function createHash(view: ViewState): string {
  if (view.section === "about") {
    return "#about";
  }
  if (view.section === "spec") {
    return "#spec";
  }
  if (view.guideId) {
    return `#guide/${view.guideId}`;
  }
  return "#guide";
}

function splitIntroFromContent(html: string): {
  introHtml: string;
  contentHtml: string;
} {
  const container = document.createElement("div");
  container.innerHTML = html;

  const introNodes: Element[] = [];
  while (
    container.firstElementChild &&
    container.firstElementChild.tagName === "P"
  ) {
    introNodes.push(container.firstElementChild);
    container.removeChild(container.firstElementChild);
  }

  const introHtml = introNodes.map((node) => node.outerHTML).join("");
  const contentHtml = container.innerHTML;

  return { introHtml, contentHtml };
}

export default function App(): JSX.Element {
  const pages = useMemo(() => loadPages(), []);
  const [{ theme, hasExplicit }, setThemeInfo] = useState(resolveInitialTheme);
  const [view, setView] = useState<ViewState>(() =>
    parseHash(window.location.hash, pages),
  );
  const [isGuideNavOpen, setGuideNavOpen] = useState(false);
  const [specMode, setSpecMode] = useState<SpecMode>("friendly");
  const [specCopyState, setSpecCopyState] = useState<
    "idle" | "copied" | "error"
  >("idle");

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      if (hasExplicit) {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
      } else {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
      }
    } catch {
      // ignore storage failures
    }
  }, [theme, hasExplicit]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      const matches = event.matches ?? mediaQuery.matches;
      setThemeInfo((previous) => {
        if (previous.hasExplicit) {
          return previous;
        }
        return {
          theme: matches ? "dark" : "light",
          hasExplicit: false,
        };
      });
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }

    return undefined;
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeInfo((previous) => ({
      theme: previous.theme === "dark" ? "light" : "dark",
      hasExplicit: true,
    }));
  }, []);

  const themeToggleLabel =
    theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  const activePage = useMemo(() => {
    if (view.section !== "guide") {
      return undefined;
    }
    if (!view.guideId) {
      return pages[0];
    }
    return pages.find((page) => page.id === view.guideId) || pages[0];
  }, [pages, view]);

  const specHtml = useMemo(() => marked.parse(specMarkdown), []);

  const specFriendlyContent = useMemo<ReactNode>(() => {
    if (!specHtml) {
      return null;
    }
    return parse(specHtml, htmlParserOptions);
  }, [specHtml]);

  useEffect(() => {
    if (view.section !== "spec") {
      setSpecMode("friendly");
      setSpecCopyState("idle");
    }
  }, [view.section]);

  useEffect(() => {
    if (view.section !== "guide") {
      setGuideNavOpen(false);
    }
  }, [view.section]);

  useEffect(() => {
    if (!isGuideNavOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setGuideNavOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isGuideNavOpen]);

  useEffect(() => {
    if (specCopyState === "idle") {
      return;
    }
    const timeoutId = window.setTimeout(
      () => setSpecCopyState("idle"),
      specCopyState === "copied" ? 2000 : 3000,
    );
    return () => window.clearTimeout(timeoutId);
  }, [specCopyState]);

  useEffect(() => {
    const handleHashChange = () => {
      setView((previous) => {
        const nextView = parseHash(window.location.hash, pages);
        if (
          nextView.section === previous.section &&
          nextView.guideId === previous.guideId
        ) {
          return previous;
        }
        return nextView;
      });
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [pages]);

  useEffect(() => {
    const targetHash = createHash({
      section: view.section,
      guideId: resolveGuideId(view.guideId, pages),
    });
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  }, [view, pages]);

  useEffect(() => {
    const baseTitle = "Code Style";

    if (view.section === "about") {
      document.title = `About – ${baseTitle}`;
      return;
    }

    if (view.section === "spec") {
      document.title = `The Spec – ${baseTitle}`;
      return;
    }

    if (activePage) {
      document.title = `${activePage.title} – ${baseTitle}`;
      return;
    }

    document.title = baseTitle;
  }, [view, activePage]);

  const pageHtml = useMemo(() => {
    if (!activePage) {
      return { introHtml: "", contentHtml: "" };
    }
    const renderedHtml = marked.parse(activePage.body);
    return splitIntroFromContent(renderedHtml);
  }, [activePage]);

  const pageIntroContent = useMemo<ReactNode>(() => {
    if (!pageHtml.introHtml) {
      return null;
    }
    return parse(pageHtml.introHtml, htmlParserOptions);
  }, [pageHtml.introHtml]);

  const pageBodyContent = useMemo<ReactNode>(() => {
    if (!pageHtml.contentHtml) {
      return null;
    }
    return parse(pageHtml.contentHtml, htmlParserOptions);
  }, [pageHtml.contentHtml]);

  // Unique IDs for elements that were previously static
  const guideArticleId = useId();
  const specArticleId = useId();
  const navListId = useId();
  const guideNavTitleId = useId();

  const handleCopySpecMarkdown = async () => {
    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(specMarkdown);
      setSpecCopyState("copied");
    } catch (error) {
      console.error("Unable to copy spec markdown", error);
      setSpecCopyState("error");
    }
  };

  const specCopyClassName =
    specCopyState === "copied"
      ? "spec-copy copied"
      : specCopyState === "error"
        ? "spec-copy error"
        : "spec-copy";

  const renderGuideNavItems = (afterSelect?: () => void) =>
    pages.map((page, index) => {
      const isActive = page.id === activePage?.id;
      const label = `${String(index + 1).padStart(2, "0")}. ${page.title}`;
      return (
        <li key={page.id}>
          <a
            href={`#guide/${page.id}`}
            className={isActive ? "active" : ""}
            aria-current={isActive ? "page" : undefined}
            onClick={() => afterSelect?.()}
          >
            {label}
          </a>
        </li>
      );
    });

  if (view.section === "guide" && !activePage) {
    return (
      <main>
        <article id={guideArticleId} className="page-container">
          <p>No guides available yet.</p>
        </article>
      </main>
    );
  }

  const mainClassName =
    view.section === "guide" ? "layout-guide" : "layout-single";

  return (
    <>
      <header>
        <div className="header-inner">
          <div className="header-brand">
            <span className="header-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="presentation">
                <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.25 13.2-3.4-3.4 1.4-1.4 2 2 4.8-4.8 1.4 1.4-6.2 6.2Z" />
              </svg>
            </span>
            <h1>Code Style</h1>
          </div>
          <div className="header-actions">
            <nav className="header-nav" aria-label="Primary">
              <ul>
                <li>
                  <a
                    href="#about"
                    className={view.section === "about" ? "active" : ""}
                    aria-current={view.section === "about" ? "page" : undefined}
                  >
                    About
                  </a>
                </li>
                <li>
                  <a
                    href="#spec"
                    className={view.section === "spec" ? "active" : ""}
                    aria-current={view.section === "spec" ? "page" : undefined}
                  >
                    The Spec
                  </a>
                </li>
                <li>
                  <a
                    href={`#guide/${resolveGuideId(view.guideId, pages)}`}
                    className={view.section === "guide" ? "active" : ""}
                    aria-current={view.section === "guide" ? "page" : undefined}
                  >
                    Guide
                  </a>
                </li>
              </ul>
            </nav>
            <button
              type="button"
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={themeToggleLabel}
              aria-pressed={theme === "dark"}
            >
              <span className="theme-toggle-icon" aria-hidden="true">
                {theme === "dark" ? (
                  <svg viewBox="0 0 24 24" role="presentation">
                    <path d="M21 12.79A9 9 0 0 1 11.21 3 7 7 0 0 0 12 17a7 7 0 0 0 9-4.21Z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" role="presentation">
                    <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm0 4a1 1 0 0 1-1-1v-1.27a1 1 0 1 1 2 0V21a1 1 0 0 1-1 1Zm0-18a1 1 0 0 1-1-1V1a1 1 0 1 1 2 0v1a1 1 0 0 1-1 1Zm10 7h-1.27a1 1 0 1 1 0-2H22a1 1 0 1 1 0 2Zm-18 0H1a1 1 0 0 1 0-2h1.27a1 1 0 1 1 0 2Zm14.95 7.95a1 1 0 0 1-1.41 0l-.9-.9a1 1 0 1 1 1.42-1.41l.9.9a1 1 0 0 1 0 1.41Zm-11.31 0a1 1 0 0 1-1.41-1.41l.9-.9a1 1 0 0 1 1.41 1.41Zm0-11.31a1 1 0 0 1-1.41-1.41l.9-.9a1 1 0 1 1 1.41 1.41Zm11.31 0-.9-.9a1 1 0 1 1 1.41-1.41l.9.9a1 1 0 1 1-1.41 1.41Z" />
                  </svg>
                )}
              </span>
              <span className="theme-toggle-text">
                {theme === "dark" ? "Dark" : "Light"}
              </span>
            </button>
          </div>
        </div>
      </header>
      <main className={mainClassName}>
        {view.section === "guide" && activePage ? (
          <>
            <button
              type="button"
              className="guide-nav-toggle"
              onClick={() => setGuideNavOpen(true)}
            >
              Chapters
            </button>
            <nav>
              <h2>Chapters</h2>
              <ul className="nav-list" id={navListId}>
                {renderGuideNavItems()}
              </ul>
            </nav>
            <article id={guideArticleId} className="page-container">
              {activePage.tagline ? (
                <div className="page-tagline">{activePage.tagline}</div>
              ) : null}
              <h2 className="page-title">{activePage.title}</h2>
              {pageIntroContent ? (
                <div className="page-intro">{pageIntroContent}</div>
              ) : null}
              <div className="page-content">{pageBodyContent}</div>
            </article>
          </>
        ) : null}

        {view.section === "about" ? <AboutPage /> : null}

        {view.section === "spec" ? (
          <article
            id={specArticleId}
            className="static-page spec-page page-container"
          >
            <div
              className="spec-toolbar"
              role="toolbar"
              aria-label="Spec view options"
            >
              <div className="spec-toggle">
                <button
                  type="button"
                  className={specMode === "friendly" ? "active" : ""}
                  aria-pressed={specMode === "friendly"}
                  onClick={() => {
                    setSpecMode("friendly");
                  }}
                >
                  Friendly
                </button>
                <button
                  type="button"
                  className={specMode === "markdown" ? "active" : ""}
                  aria-pressed={specMode === "markdown"}
                  onClick={() => {
                    setSpecMode("markdown");
                  }}
                >
                  Markdown
                </button>
              </div>
              <button
                type="button"
                className={specCopyClassName}
                onClick={() => {
                  void handleCopySpecMarkdown();
                }}
              >
                {specCopyState === "copied" ? "Copied!" : "Copy Markdown"}
              </button>
            </div>
            {specMode === "friendly" ? (
              <div className="spec-friendly">{specFriendlyContent}</div>
            ) : (
              <pre className="spec-raw">{specMarkdown}</pre>
            )}
            {specCopyState === "error" ? (
              <p className="spec-copy-error">Unable to copy. Try again.</p>
            ) : null}
          </article>
        ) : null}
      </main>
      {view.section === "guide" ? (
        <div
          className={`guide-nav-overlay${isGuideNavOpen ? " open" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={guideNavTitleId}
          aria-hidden={isGuideNavOpen ? undefined : true}
        >
          <div className="guide-nav-sheet">
            <div className="guide-nav-sheet-header">
              <h2 id={guideNavTitleId}>Chapter</h2>
              <button
                type="button"
                className="guide-nav-close"
                aria-label="Close chapter menu"
                onClick={() => {
                  setGuideNavOpen(false);
                }}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <div className="guide-nav-sheet-body">
              <ul className="nav-list">
                {renderGuideNavItems(() => setGuideNavOpen(false))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
