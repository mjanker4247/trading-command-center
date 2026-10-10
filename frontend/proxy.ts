import { withAuth } from "next-auth/middleware";

// Next.js 16: named `proxy` export (replaces middleware.ts).
// pages.signIn must be set here too — withAuth does not read authOptions.pages.
export const proxy = withAuth({
  pages: { signIn: "/login" },
});

export const config = {
  matcher: ["/((?!login|register|api/auth|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
