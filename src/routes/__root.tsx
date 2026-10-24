import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import { Toaster } from "@/components/ui/sonner";
import { SiteFooter, CONTACT } from "@/components/SiteFooter";
import appCss from "../styles.css?url";

// Set VITE_SITE_URL to your production URL after deploying (e.g. https://campusease.app).
// It makes canonical links and social-preview images fully absolute.
const SITE_URL =
  (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/+$/, "") ||
  "";
const OG_IMAGE = SITE_URL ? `${SITE_URL}/og.png` : "/og.png";
const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
const GOOGLE_VERIFICATION = import.meta.env.VITE_GOOGLE_SITE_VERIFICATION as
  string | undefined;

function canonicalHref(pathname: string): string | undefined {
  const path = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  return SITE_URL ? `${SITE_URL}${path}` : undefined;
}

const ORGANIZATION_JSON = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "CampusEase",
  description:
    "Personal exam schedules and clash-free weekly class timetables for students.",
  url: SITE_URL || undefined,
  logo: SITE_URL ? `${SITE_URL}/favicon.svg` : undefined,
  contactPoint: [
    {
      "@type": "ContactPoint",
      email: CONTACT.email,
      telephone: `+92${CONTACT.phone.slice(1)}`,
      contactType: "customer support",
      availableLanguage: ["English", "Urdu"],
    },
  ],
  founder: { "@type": "Person", name: "Musawir" },
});

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          Page not found
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Try the{" "}
          <Link to="/classes" className="text-primary hover:underline">
            class timetable builder
          </Link>
          , the{" "}
          <Link to="/exams" className="text-primary hover:underline">
            exam schedule
          </Link>
          , or go{" "}
          <Link to="/" className="text-primary hover:underline">
            home
          </Link>
          .
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({
  error,
  reset,
}: {
  error: unknown;
  reset: () => void;
}) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back
          home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: ({ match }: { match: { pathname: string } }) => {
      const canonical = canonicalHref(match.pathname);
      return {
        meta: [
          { charSet: "utf-8" },
          { name: "viewport", content: "width=device-width, initial-scale=1" },
          { title: "CampusEase — Personal exam & class timetables" },
          {
            name: "description",
            content:
              "Build your personal exam schedule and a clash-free weekly class timetable for your own courses.",
          },
          { name: "author", content: "CampusEase" },
          ...(canonical ? [{ property: "og:url", content: canonical }] : []),
          {
            property: "og:title",
            content: "CampusEase — Personal exam & class timetables",
          },
          {
            property: "og:description",
            content:
              "Build your personal exam schedule and a clash-free weekly class timetable for your own courses.",
          },
          { property: "og:type", content: "website" },
          { property: "og:image", content: OG_IMAGE },
          { property: "og:image:width", content: "1200" },
          { property: "og:image:height", content: "630" },
          {
            property: "og:image:alt",
            content:
              "CampusEase — clash-free class timetables and personal exam schedules",
          },
          { name: "twitter:card", content: "summary_large_image" },
          {
            name: "twitter:title",
            content: "CampusEase — Personal exam & class timetables",
          },
          {
            name: "twitter:description",
            content:
              "Build your personal exam schedule and a clash-free weekly class timetable for your own courses.",
          },
          { name: "twitter:image", content: OG_IMAGE },
          {
            name: "twitter:image:alt",
            content:
              "CampusEase — clash-free class timetables and personal exam schedules",
          },
          ...(GOOGLE_VERIFICATION
            ? [
                {
                  name: "google-site-verification",
                  content: GOOGLE_VERIFICATION,
                },
              ]
            : []),
        ],
        links: [
          {
            rel: "icon",
            type: "image/svg+xml",
            href: "/favicon.svg",
          },
          ...(canonical ? [{ rel: "canonical", href: canonical }] : []),
          { rel: "preconnect", href: "https://fonts.googleapis.com" },
          {
            rel: "preconnect",
            href: "https://fonts.gstatic.com",
            crossOrigin: "anonymous",
          },
          {
            rel: "stylesheet",
            href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap",
          },
          {
            rel: "stylesheet",
            href: appCss,
          },
        ],
      };
    },
    shellComponent: RootShell,
    component: RootComponent,
    notFoundComponent: NotFoundComponent,
    errorComponent: ErrorComponent,
  },
);

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: ORGANIZATION_JSON }}
        />
        {GA_ID && (
          <script
            async={true}
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          />
        )}
        {GA_ID && (
          <script
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}',{anonymize_ip:true});`,
            }}
          />
        )}
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <SiteFooter />
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
