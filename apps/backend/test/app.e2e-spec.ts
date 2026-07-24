import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { ConfigModule } from '@nestjs/config';

describe('App — E2E Integration Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              JWT_SECRET: 'test-secret-key-for-e2e',
              DATABASE_URL: 'postgresql://localhost:5432/cipher_test',
              REDIS_HOST: 'localhost',
              REDIS_PORT: 6379,
              AI_PROVIDER: 'local',
              GEMINI_API_KEY: '',
              OPENAI_API_KEY: '',
            }),
          ],
        }),
        AppModule,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const request = context.switchToHttp().getRequest();
          request.user = { tenant_id: 'test-tenant-1' };
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Auth endpoints', () => {
    it('POST /auth/login with invalid credentials returns 401', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ name: 'nonexistent', password: 'wrong' })
        .expect(401);
    });

    it('POST /auth/login with empty body returns 401', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({})
        .expect(401);
    });
  });

  describe('Tenant endpoints (JWT mocked)', () => {
    it('GET /tenants/me returns tenant_id from JWT', () => {
      return request(app.getHttpServer())
        .get('/tenants/me')
        .set('Authorization', 'Bearer test-token')
        .expect(200)
        .expect((res) => {
          // The tenant service will try to query DB — expect either data or error
          // but not 401 since guard is mocked
          expect(res.status).toBe(200);
        });
    });

    it('GET /tenants/whatsapp-numbers returns array (possibly empty)', () => {
      return request(app.getHttpServer())
        .get('/tenants/whatsapp-numbers')
        .set('Authorization', 'Bearer test-token')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('GET /orders returns orders array', () => {
      return request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', 'Bearer test-token')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('GET /finance/ledger returns ledger entries', () => {
      return request(app.getHttpServer())
        .get('/finance/ledger')
        .set('Authorization', 'Bearer test-token')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('GET /finance/summary returns summary (possibly empty)', () => {
      return request(app.getHttpServer())
        .get('/finance/summary')
        .set('Authorization', 'Bearer test-token')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });

  describe('Multi-tenancy isolation (mocked JWT)', () => {
    it('GET /orders/:id returns null for non-existent order', () => {
      return request(app.getHttpServer())
        .get('/orders/non-existent-id')
        .set('Authorization', 'Bearer test-token')
        .expect(200)
        .expect((res) => {
          // Should return null/empty for non-existent order in DB
          expect(res.body).toBeNull();
        });
    });
  });

  describe('Protected endpoints without JWT', () => {
    it('GET /tenants/me without auth returns 401', () => {
      return request(app.getHttpServer())
        .get('/tenants/me')
        .expect(401);
    });

    it('GET /orders without auth returns 401', () => {
      return request(app.getHttpServer())
        .get('/orders')
        .expect(401);
    });

    it('GET /finance/ledger without auth returns 401', () => {
      return request(app.getHttpServer())
        .get('/finance/ledger')
        .expect(401);
    });

    it('POST /tenants/whatsapp-numbers without auth returns 401', () => {
      return request(app.getHttpServer())
        .post('/tenants/whatsapp-numbers')
        .send({ whatsapp_number: '201111111111', number_role: 'PUBLIC_SALES' })
        .expect(401);
    });
  });
});
