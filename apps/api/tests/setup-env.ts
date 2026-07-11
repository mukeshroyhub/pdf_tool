// Imported before any application module so config.ts sees test settings.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file:./test.db";
process.env.JWT_ACCESS_SECRET = "test-access-secret-0123456789-0123456789";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-0123456789-0123456789";
process.env.WEB_URL = "http://localhost:3000";
process.env.API_URL = "http://localhost:4000";
