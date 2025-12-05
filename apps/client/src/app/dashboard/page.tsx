import Link from "next/link";
import { Suspense } from "react";
import { verifySession } from "@/lib/dal";

/**
 * Dashboard page - SSR with Suspense for dynamic session.
 */
export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardLoading() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="h-48 animate-pulse rounded-lg bg-gray-200" />
          <div className="h-48 animate-pulse rounded-lg bg-gray-200" />
        </div>
      </div>
    </div>
  );
}

async function DashboardContent() {
  const session = await verifySession();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <Link href="/" className="text-sm text-gray-600 hover:text-gray-900">
            Back to Home
          </Link>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          {/* User Info Card */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-gray-800">
              Profile
            </h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Name</dt>
                <dd className="text-lg text-gray-900">
                  {session.user.name || "Not set"}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Email</dt>
                <dd className="text-lg text-gray-900">{session.user.email}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Email Verified
                </dt>
                <dd className="text-lg">
                  {session.user.emailVerified ? (
                    <span className="text-green-600">Verified</span>
                  ) : (
                    <span className="text-amber-600">Not verified</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          {/* Session Info Card */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-gray-800">
              Session
            </h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">User ID</dt>
                <dd className="font-mono text-xs text-gray-600">
                  {session.user.id}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Session ID
                </dt>
                <dd className="font-mono text-xs text-gray-600">
                  {session.session.id}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Expires At
                </dt>
                <dd className="text-sm text-gray-600">
                  {new Date(session.session.expiresAt).toLocaleString()}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-8 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-800">
            This page is Server-Side Rendered with Streaming.
          </p>
        </div>
      </div>
    </div>
  );
}
