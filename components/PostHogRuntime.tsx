"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

const POSTHOG_KEY =
  process.env.NEXT_PUBLIC_POSTHOG_KEY ||
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

function initPostHog() {
  if (
    !POSTHOG_KEY ||
    POSTHOG_KEY === "your_posthog_project_token"
  ) {
    return false;
  }

  if ((posthog as { __loaded?: boolean }).__loaded) {
    return true;
  }

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
    disable_session_recording: true,
    person_profiles: "identified_only",
  });

  return true;
}

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!initPostHog()) {
      return;
    }

    const queryString = searchParams.toString();

    posthog.capture("$pageview", {
      $current_url: window.location.href,
      path: queryString ? `${pathname}?${queryString}` : pathname,
    });
  }, [pathname, searchParams]);

  return null;
}

export default function PostHogRuntime({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <PostHogProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </PostHogProvider>
  );
}
