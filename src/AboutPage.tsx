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
          This guide explains the reasoning behind building functional Node.js
          applications without frameworks, using simple patterns that prioritize
          maintainability, debuggability, and understanding.
        </p>
      </div>

      <h3>What This Guide Covers</h3>
      <ul>
        <li>
          <strong>Why</strong> we avoid frameworks and prefer explicit
          dependencies
        </li>
        <li>
          <strong>How</strong> the context pattern replaces dependency injection
        </li>
        <li>
          <strong>Why</strong> proper server lifecycle prevents production
          disasters
        </li>
        <li>
          <strong>How</strong> true separation of concerns makes code
          maintainable
        </li>
        <li>
          <strong>Why</strong> letting errors bubble creates better systems
        </li>
        <li>
          <strong>When</strong> to mock external services vs use real
          dependencies
        </li>
        <li>
          <strong>Why</strong> every npm package is a liability
        </li>
        <li>
          <strong>How</strong> to compose complex systems from simple functions
        </li>
      </ul>

      <h3>The Core Philosophy</h3>
      <div className="callout callout-success">
        <strong>Simple &gt; Complex</strong>
        <p>
          Every decision in this architecture follows one principle: prefer
          simple, explicit, understandable code over complex abstractions that
          promise convenience.
        </p>
      </div>

      <h4>Key Principles</h4>
      <ol>
        <li>
          <strong>No Magic</strong> – Everything is explicit and visible
        </li>
        <li>
          <strong>Pure Functions</strong> – Same input, same output, no
          surprises
        </li>
        <li>
          <strong>Composition</strong> – Build complex behavior from simple
          parts
        </li>
        <li>
          <strong>Real Testing</strong> – Use real databases, mock external
          services
        </li>
        <li>
          <strong>Minimal Dependencies</strong> – Every package is a liability
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
          Start with <strong>Introduction</strong> to understand the problem
        </li>
        <li>
          Learn the <strong>Context Pattern</strong> for dependency management
        </li>
        <li>
          Master <strong>Server Lifecycle</strong> for production reliability
        </li>
        <li>
          Understand <strong>Models vs Controllers</strong> separation
        </li>
        <li>
          Embrace <strong>Error Handling</strong> that bubbles up
        </li>
        <li>
          Apply the <strong>Testing Philosophy</strong> of real dependencies
        </li>
        <li>
          Practice <strong>Dependency Discipline</strong>
        </li>
        <li>
          Use <strong>Practical Patterns</strong> for composition
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
