import Link from "next/link";
import { Suspense } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getCurrentSession } from "@/lib/dal";

/**
 * Home page - SSR with Suspense for dynamic session.
 */
export default function HomePage() {
	return (
		<Suspense fallback={<HomeLoading />}>
			<HomeContent />
		</Suspense>
	);
}

function HomeLoading() {
	return (
		<div className="flex min-h-screen items-center justify-center">
			<div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
		</div>
	);
}

async function HomeContent() {
	const session = await getCurrentSession();

	if (!session) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center space-y-4">
				<h1 className="text-4xl font-bold">Welcome to Rogue III</h1>
				<p className="text-gray-600">Please sign in to continue</p>
				<div className="flex gap-4">
					<Link
						href="/sign-in"
						className="rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
					>
						Sign In
					</Link>
					<Link
						href="/sign-up"
						className="rounded-md border border-indigo-600 px-4 py-2 text-indigo-600 hover:bg-indigo-50"
					>
						Sign Up
					</Link>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen flex-col items-center justify-center space-y-6 p-8">
			<h1 className="text-4xl font-bold">
				Welcome back, {session.user.name || session.user.email}!
			</h1>

			<div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
				<h2 className="mb-4 text-xl font-semibold">Session Info</h2>
				<dl className="space-y-2">
					<div>
						<dt className="text-sm font-medium text-gray-500">Email</dt>
						<dd className="text-sm">{session.user.email}</dd>
					</div>
					<div>
						<dt className="text-sm font-medium text-gray-500">Name</dt>
						<dd className="text-sm">{session.user.name || "Not set"}</dd>
					</div>
					<div>
						<dt className="text-sm font-medium text-gray-500">User ID</dt>
						<dd className="font-mono text-xs">{session.user.id}</dd>
					</div>
					<div>
						<dt className="text-sm font-medium text-gray-500">
							Email Verified
						</dt>
						<dd className="text-sm">
							{session.user.emailVerified ? "Yes" : "No"}
						</dd>
					</div>
				</dl>
			</div>

			<SignOutButton />
		</div>
	);
}
