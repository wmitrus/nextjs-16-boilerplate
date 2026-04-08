export {};

declare global {
  interface CustomJwtSessionClaims {
    email?: string;
    primaryEmail?: string;
    metadata: {
      onboardingComplete?: boolean;
      displayName?: string;
      locale?: string;
      timezone?: string;
    };
  }

  interface NewRelicBrowserInteraction {
    setName?: (name: string) => NewRelicBrowserInteraction;
    save?: () => NewRelicBrowserInteraction;
  }

  interface NewRelicBrowserAgent {
    interaction?: (() => NewRelicBrowserInteraction) | undefined;
  }

  interface Window {
    newrelic?: NewRelicBrowserAgent;
  }
}
