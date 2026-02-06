import Elysia from "elysia";

export const securityPlugin = new Elysia({ name: "security" }).onRequest(
  ({ set }) => {
    set.headers["X-Content-Type-Options"] = "nosniff";
    set.headers["X-Frame-Options"] = "DENY";
    set.headers["X-XSS-Protection"] = "1; mode=block";
    set.headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    set.headers["Permissions-Policy"] =
      "geolocation=(), microphone=(), camera=()";

    if (process.env.NODE_ENV === "production")
      set.headers["Strict-Transport-Security"] =
        "max-age=31536000; includeSubDomains";
  },
);
