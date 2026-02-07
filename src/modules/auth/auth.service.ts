import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

import { RegisterDto } from './dtos/register.dto';
import { LoginDto } from './dtos/login.dto';
import { UserService } from '../user/user.service';
import { RedisService } from '../../redis/redis.service';

interface JwtPayload {
  jti: string;
  sub: number;
  email: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  async register(dto: RegisterDto) {
    const userExists = await this.userService.findByEmail(dto.email);

    if (userExists) throw new BadRequestException('Email já cadastrado');

    const user = await this.userService.create(dto);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    };
  }

  async login(dto: LoginDto, res: Response) {
    const user = await this.userService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Credenciais inválidas');

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) throw new UnauthorizedException('Credenciais inválidas');

    const payload: JwtPayload = {
      jti: uuidv4(),
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET!,
      expiresIn: '15m',
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET!,
      expiresIn: '7d',
    });

    // ✅ Ambos os tokens em httpOnly cookies
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000, // 15 minutos
      path: '/',
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
      path: '/',
    });

    return {
      message: 'Login realizado com sucesso',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async logout(refreshToken: string) {
    try {
      const decoded: any = this.jwtService.decode(refreshToken);
      if (!decoded?.exp || !decoded?.jti) {
        throw new BadRequestException('Refresh token inválido');
      }

      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await this.redisService.set(`blacklist:${decoded.jti}`, 'true', ttl);
      }

      return { message: 'Logout realizado com sucesso' };
    } catch {
      throw new BadRequestException('Token inválido');
    }
  }

  async isTokenBlacklisted(jti: string) {
    return this.redisService.exists(`blacklist:${jti}`);
  }

  async refreshToken(oldRefreshToken: string, res: Response) {
    let decoded: any;

    try {
      decoded = await this.jwtService.verifyAsync(oldRefreshToken, {
        secret: process.env.JWT_REFRESH_SECRET!,
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    // Verifica blacklist
    if (decoded?.jti && (await this.isTokenBlacklisted(decoded.jti))) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    const user = await this.userService.findByEmail(decoded.email);
    if (!user) throw new UnauthorizedException('Usuário não encontrado');

    // Blacklist do token antigo
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0 && decoded.jti) {
      await this.redisService.set(`blacklist:${decoded.jti}`, 'true', ttl);
    }

    // Novo payload
    const payload: JwtPayload = {
      jti: uuidv4(),
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const newAccessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET!,
      expiresIn: '15m',
    });

    const newRefreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET!,
      expiresIn: '7d',
    });

    // ✅ Seta ambos os tokens em cookies
    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
      path: '/',
    });

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    return {
      message: 'Token renovado com sucesso',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }
}