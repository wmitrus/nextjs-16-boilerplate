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
    setName(name: string): NewRelicBrowserInteraction;
    setAttribute(
      key: string,
      value: string | number | boolean,
    ): NewRelicBrowserInteraction;
    save(): NewRelicBrowserInteraction;
    end(): void;
  }

  interface NewRelicBrowserAgent {
    interaction(): NewRelicBrowserInteraction;
    setCurrentRouteName(name: string): void;
    setCustomAttribute(name: string, value: string | number | boolean): void;
    addPageAction(
      name: string,
      attributes?: Record<string, string | number | boolean>,
    ): void;
    noticeError(
      error: Error | string,
      customAttributes?: Record<string, string | number | boolean>,
    ): void;
  }

  interface Window {
    newrelic?: NewRelicBrowserAgent;
  }
}
