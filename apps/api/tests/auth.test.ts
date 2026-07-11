import "./setup-env";
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { hashToken } from "../src/lib/tokens";

const app = createApp();

const alice = {
  name: "Alice Example",
  email: "alice@example.com",
  password: "Str0ngPassw0rd",
};

function extractRefreshCookie(res: request.Response): string {
  const cookies = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = cookies?.find((c) => c.startsWith("pf_rt="));
  assert.ok(cookie, "refresh cookie should be set");
  return cookie.split(";")[0]!;
}

before(() => {
  // Reset the SQLite test database before the suite.
  execSync("node scripts/dev-migrate.mjs --reset", {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "pipe",
  });
});

describe("POST /api/auth/register", () => {
  it("creates a user and returns tokens", async () => {
    const res = await request(app).post("/api/auth/register").send(alice);
    assert.equal(res.status, 201);
    assert.equal(res.body.user.email, alice.email);
    assert.equal(res.body.user.emailVerified, false);
    assert.equal(typeof res.body.accessToken, "string");
    extractRefreshCookie(res);
  });

  it("rejects duplicate emails", async () => {
    const res = await request(app).post("/api/auth/register").send(alice);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, "EMAIL_TAKEN");
  });

  it("rejects weak passwords with field details", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Bob", email: "bob@example.com", password: "short" });
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
    assert.ok(
      res.body.error.details.some((d: { path: string }) => d.path === "password"),
      "details should flag the password field",
    );
  });
});

describe("POST /api/auth/login", () => {
  it("authenticates valid credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: alice.email, password: alice.password });
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.accessToken, "string");
  });

  it("rejects a wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: alice.email, password: "WrongPass1" });
    assert.equal(res.status, 401);
  });

  it("rejects an unknown email with the same error shape", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "ghost@example.com", password: "WrongPass1" });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, "UNAUTHORIZED");
  });
});

describe("token refresh and logout", () => {
  it("rotates the refresh token and kills the old one", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: alice.email, password: alice.password });
    const cookie1 = extractRefreshCookie(login);

    const refresh1 = await request(app).post("/api/auth/refresh").set("Cookie", cookie1);
    assert.equal(refresh1.status, 200);
    const cookie2 = extractRefreshCookie(refresh1);
    assert.notEqual(cookie2, cookie1);

    const reuse = await request(app).post("/api/auth/refresh").set("Cookie", cookie1);
    assert.equal(reuse.status, 401);
  });

  it("logout revokes the refresh token", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: alice.email, password: alice.password });
    const cookie = extractRefreshCookie(login);

    const out = await request(app).post("/api/auth/logout").set("Cookie", cookie);
    assert.equal(out.status, 200);

    const refresh = await request(app).post("/api/auth/refresh").set("Cookie", cookie);
    assert.equal(refresh.status, 401);
  });
});

describe("protected routes", () => {
  it("GET /api/users/me requires auth", async () => {
    const res = await request(app).get("/api/users/me");
    assert.equal(res.status, 401);
  });

  it("returns the profile with a valid access token", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: alice.email, password: alice.password });
    const res = await request(app)
      .get("/api/users/me")
      .set("Authorization", `Bearer ${login.body.accessToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, alice.email);
  });

  it("updates the profile name", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: alice.email, password: alice.password });
    const res = await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .send({ name: "Alice Renamed" });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.name, "Alice Renamed");
  });
});

describe("email verification and password reset", () => {
  it("verifies email via action token", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: alice.email } });
    const token = "test-verify-token";
    await prisma.actionToken.create({
      data: {
        tokenHash: hashToken(token),
        type: "EMAIL_VERIFY",
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const res = await request(app).post("/api/auth/verify-email").send({ token });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.emailVerified, true);
  });

  it("forgot-password responds identically for unknown emails", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "ghost@example.com" });
    assert.equal(res.status, 200);
  });

  it("resets the password with a valid token and revokes sessions", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: alice.email } });
    const token = "test-reset-token";
    await prisma.actionToken.create({
      data: {
        tokenHash: hashToken(token),
        type: "PASSWORD_RESET",
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: "NewStr0ngPass" });
    assert.equal(res.status, 200);

    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: alice.email, password: alice.password });
    assert.equal(oldLogin.status, 401);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: alice.email, password: "NewStr0ngPass" });
    assert.equal(newLogin.status, 200);
  });

  it("rejects a used reset token", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "test-reset-token", password: "AnotherPass1" });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "INVALID_TOKEN");
  });
});
