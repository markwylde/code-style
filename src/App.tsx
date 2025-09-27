import { marked } from "marked";
import { useEffect, useId, useMemo, useState } from "react";
import "./markdownExtensions";
import specMarkdown from "../SPEC.md?raw";
import AboutPage from "./AboutPage";

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

const markdownModules = import.meta.glob("../pages/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

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
  const [view, setView] = useState<ViewState>(() =>
    parseHash(window.location.hash, pages),
  );
  const [isGuideNavOpen, setGuideNavOpen] = useState(false);
  const [specMode, setSpecMode] = useState<SpecMode>("friendly");
  const [specCopyState, setSpecCopyState] = useState<
    "idle" | "copied" | "error"
  >("idle");

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
              {pageHtml.introHtml ? (
                /* biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is generated from trusted markdown */
                <div
                  className="page-intro"
                  dangerouslySetInnerHTML={{ __html: pageHtml.introHtml }}
                />
              ) : null}
              {/* biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is generated from trusted markdown */}
              <div
                className="page-content"
                dangerouslySetInnerHTML={{ __html: pageHtml.contentHtml }}
              />
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
              /* biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is generated from trusted markdown */
              <div
                className="spec-friendly"
                dangerouslySetInnerHTML={{ __html: specHtml }}
              />
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
