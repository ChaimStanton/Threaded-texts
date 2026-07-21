type ConsentState = "granted" | "denied";

type GtagCommand =
  | ["js", Date]
  | ["config", string, Record<string, unknown>?]
  | [
      "consent",
      "default" | "update",
      {
        analytics_storage: ConsentState;
        ad_storage: ConsentState;
        ad_user_data: ConsentState;
        ad_personalization: ConsentState;
        functionality_storage: ConsentState;
        personalization_storage: ConsentState;
        security_storage: ConsentState;
        wait_for_update?: number;
        region?: string[];
      }
    ];

declare global {
  interface Window {
    dataLayer?: GtagCommand[];
    gtag?: (...args: GtagCommand) => void;
  }
}

const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;

const deniedConsent = {
  analytics_storage: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  functionality_storage: "denied",
  personalization_storage: "denied",
  security_storage: "granted",
  wait_for_update: 500
} as const;

export function initializeAnalytics() {
  if (!measurementId || typeof document === "undefined") {
    return;
  }

  window.dataLayer = window.dataLayer ?? [];
  window.gtag =
    window.gtag ??
    ((...args: GtagCommand) => {
      window.dataLayer?.push(args);
    });

  window.gtag("consent", "default", deniedConsent);
  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    send_page_view: true
  });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.append(script);
}
