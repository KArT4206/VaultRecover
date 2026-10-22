import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { Logo } from "./Logo";

export async function NavBar() {
  const session = await auth();

  return (
    <header className="border-b border-graphite-700">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold text-graphite-200">
          <Logo />
          VaultRecover
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-graphite-400 md:flex">
          <Link href="/how-it-works" className="hover:text-accent">How it works</Link>
          <Link href="/file-types/pdf" className="hover:text-accent">Supported formats</Link>
          <Link href="/faq" className="hover:text-accent">FAQ</Link>
        </nav>
        <div className="flex items-center gap-3">
          {session?.user ? (
            <>
              <Link href="/dashboard" className="btn-outline">Dashboard</Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button type="submit" className="text-sm text-graphite-400 hover:text-accent">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/auth/login" className="text-sm text-graphite-400 hover:text-accent">Sign in</Link>
              <Link href="/auth/register" className="btn-accent">Get started free</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
