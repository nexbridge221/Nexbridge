// Variables d'environnement des tests (base dédiée, aucune intégration externe).
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://nexbridge@127.0.0.1:5433/nexbridge_test";
process.env.APP_URL = "http://localhost:5173";
process.env.DEMO_MODE = "false";
process.env.COOKIE_SECURE = "false";
delete process.env.REDIS_URL;
delete process.env.SENDGRID_API_KEY;
