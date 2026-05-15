import { useId } from "react";

export default function AboutPage(): JSX.Element {
  const articleId = useId();
  return (
    <article id={articleId} className="static-page page-container">
      <div className="page-tagline">The why behind the how.</div>
      <h2 className="page-title">About This Guide</h2>

      <div className="callout callout-info">
        <strong>A Philosophy, Not a Framework</strong>
        <p>
          This guide turns the spec into a readable architecture: first the
          whole system, then the runtime flow, then the rules that keep each
          layer honest.
        </p>
      </div>

      <h3>What This Guide Covers</h3>
      <ul>
        <li>
          <strong>Understand The System</strong>: the mental model, project
          shape, and runtime flow
        </li>
        <li>
          <strong>Build The Core</strong>: context, server lifecycle, routing,
          controllers, models, services, and schemas
        </li>
        <li>
          <strong>Operate With Discipline</strong>: error contracts, real-system
          tests, and the Docker development loop
        </li>
        <li>
          <strong>Make Good Decisions</strong>: dependency discipline,
          abstraction discipline, and practical patterns
        </li>
      </ul>

      <h3>The Core Philosophy</h3>
      <div className="callout callout-success">
        <strong>Traceable &gt; Magical</strong>
        <p>
          Every decision in this architecture should make the common path easier
          to trace: startup, request handling, data access, error translation,
          testing, and shutdown.
        </p>
      </div>

      <h4>Key Principles</h4>
      <ol>
        <li>
          <strong>Explicit Dependencies</strong> – Context is built once and
          passed into functions that need it
        </li>
        <li>
          <strong>Clear Boundaries</strong> – Controllers adapt HTTP; models own
          data rules; services own external effects
        </li>
        <li>
          <strong>Managed Lifecycle</strong> – Servers start only when ready and
          stop only when resources are released
        </li>
        <li>
          <strong>Real Testing</strong> – Use real dependencies the project owns
          and mock only true third-party systems
        </li>
        <li>
          <strong>Conservative Abstraction</strong> – Extract helpers and
          packages only when they reduce the reader's work
        </li>
      </ol>

      <h3>Who Should Read This</h3>
      <ul>
        <li>Teams building production Node.js applications</li>
        <li>Developers tired of framework complexity</li>
        <li>Anyone who values understanding over convenience</li>
        <li>Teams that prioritize long-term maintainability</li>
      </ul>

      <h3>How to Use This Guide</h3>
      <ol>
        <li>
          Start with <strong>Architecture At A Glance</strong> to get the map
        </li>
        <li>
          Read <strong>Project Shape</strong> and <strong>Runtime Flow</strong>{" "}
          before diving into implementation details
        </li>
        <li>
          Work through <strong>Build The Core</strong> in order: context,
          lifecycle, routing, controllers, models, services, and schemas
        </li>
        <li>
          Use <strong>Operate With Discipline</strong> before tightening tests,
          errors, or local Docker behavior
        </li>
        <li>
          Finish with <strong>Make Good Decisions</strong> when choosing
          dependencies, helpers, packages, and repeated patterns
        </li>
      </ol>

      <h3>Contributing</h3>
      <p>
        This guide is a living document. If you find errors or have suggestions,
        please contribute at the project repository.
      </p>

      <h3>License</h3>
      <p>
        This guide and the associated spec are provided under the MIT License.
        Use, modify, and distribute freely.
      </p>
    </article>
  );
}
