import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';

interface WindowConfig {
  windowMs: number;
  maxRequests: number;
}

@Injectable()
export class TransformRateLimitGuard implements CanActivate {
  private readonly requestsByKey = new Map<string, number[]>();
  private readonly config: WindowConfig = {
    windowMs: Number(process.env.TRANSFORM_RATE_LIMIT_WINDOW_MS ?? 60_000),
    maxRequests: Number(process.env.TRANSFORM_RATE_LIMIT_MAX ?? 20),
  };

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const userId = request.userId ?? 'anonymous';
    const imageId = request.params?.id ?? 'unknown-image';
    const key = `${userId}:${imageId}`;

    const now = Date.now();
    const windowStart = now - Math.max(this.config.windowMs, 1_000);
    const existing = this.requestsByKey.get(key) ?? [];
    const validRequests = existing.filter((timestamp) => timestamp >= windowStart);

    if (validRequests.length >= Math.max(this.config.maxRequests, 1)) {
      throw new HttpException(
        'Transform rate limit exceeded. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    validRequests.push(now);
    this.requestsByKey.set(key, validRequests);
    this.cleanup(now);
    return true;
  }

  private cleanup(now: number) {
    if (this.requestsByKey.size < 2000) {
      return;
    }

    const minTimestamp = now - Math.max(this.config.windowMs, 1_000);
    for (const [key, timestamps] of this.requestsByKey.entries()) {
      const kept = timestamps.filter((timestamp) => timestamp >= minTimestamp);
      if (kept.length === 0) {
        this.requestsByKey.delete(key);
      } else {
        this.requestsByKey.set(key, kept);
      }
    }
  }
}
