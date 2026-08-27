import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RepositoriesModule } from '../repositories/repositories.module';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { IIdentityRepository } from '../application/ports/i-identity.port';
import { PrismaIdentityAdapter } from '../infrastructure/adapters/prisma-identity.adapter';

@Module({
  imports: [
    RepositoriesModule,
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    JwtModule.registerAsync({
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.getOrThrow('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    AuthService,
    JwtStrategy,
    {
      provide: IIdentityRepository,
      useClass: PrismaIdentityAdapter,
    },
  ],
  controllers: [],
  exports: [AuthService, JwtStrategy, IIdentityRepository, PassportModule, JwtModule],
})
export class AuthModule {}
