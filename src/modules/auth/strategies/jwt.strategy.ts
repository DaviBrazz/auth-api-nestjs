import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RedisService } from 'src/redis/redis.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly redisService: RedisService) {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) throw new Error('JWT_ACCESS_SECRET não definido');

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // ✅ Lê do cookie "accessToken"
        (req) => req?.cookies?.accessToken,
        // Fallback para Authorization Bearer (opcional)
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: any) {
    // ✅ Valida blacklist pelo jti
    if (payload?.jti && (await this.redisService.exists(`blacklist:${payload.jti}`))) {
      throw new UnauthorizedException('Token expirado ou inválido');
    }

    return payload; // request.user
  }
}