# Code Style Guide

A modern web application for presenting and sharing code style guidelines and best practices for Node.js development.

## Overview

This project provides an interactive documentation site that presents the NodeJS Code Guide specification - a comprehensive guide for building functional, minimal dependency Node.js projects using the context pattern. The guide emphasizes dependency injection without frameworks, making testing easy and keeping the codebase simple.

## Features

- **Interactive Documentation**: Browse through chapters covering different aspects of Node.js development
- **The Spec**: A complete specification document for building Node.js applications with the context pattern
- **Friendly & Raw Views**: Toggle between formatted documentation and raw markdown for easy copying
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Syntax Highlighting**: Code examples are properly highlighted for better readability

## Tech Stack

- **React 19** with TypeScript for the UI
- **Vite** for fast development and building
- **Marked** for markdown processing
- **Highlight.js** for syntax highlighting
- **Biome** for linting and formatting

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
npm install
```

### Development

Run the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Building

Build the static site:

```bash
npm run build
```

Preview the built site:

```bash
npm run preview
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run linter
- `npm run lint:fix` - Fix linting issues
- `npm run format` - Check formatting
- `npm run format:write` - Fix formatting
- `npm run check` - Run all checks
- `npm run check:fix` - Fix all issues

## Project Structure

```
codestyle/
├── pages/           # Markdown content for guide chapters
├── public/          # Static assets
├── src/             # React application source
│   ├── App.tsx      # Main application component
│   ├── AboutPage.tsx # About page component
│   ├── main.tsx     # Application entry point
│   └── style.css    # Global styles
├── SPEC.md          # The complete Node.js specification
└── package.json     # Project dependencies
```

## What the Guide Covers

The NodeJS Code Guide specification includes:

- **Context Pattern**: Dependency injection without frameworks
- **Project Structure**: Monorepo setup with packages for API, UI, and admin
- **Controllers & Models**: Clean separation of HTTP and data layers
- **Error Handling**: Centralized error management with custom error classes
- **Testing Strategy**: Real database testing, mocking only external services
- **Server Lifecycle**: Proper server management with start/stop/restart guarantees
- **Type Safety**: Full TypeScript with Zod runtime validation
- **Database**: Type-safe queries with Drizzle ORM
- **Best Practices**: Pure functions, composition, and minimal dependencies

## Contributing

Contributions are welcome! The guide content can be edited in the `pages/` directory (for individual chapters) or in `SPEC.md` (for the complete specification).

## License

MIT