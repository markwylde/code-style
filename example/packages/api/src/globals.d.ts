declare class URLPattern {
  constructor(init?: { pathname?: string }, baseURL?: string);
  exec(input?: string | URL, baseURL?: string): URLPatternResult | null;
  test(input?: string | URL, baseURL?: string): boolean;
}

declare interface URLPatternResult {
  pathname: {
    groups: Record<string, string>;
  };
}
