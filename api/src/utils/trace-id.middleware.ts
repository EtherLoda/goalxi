import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { v4 as uuidv4 } from 'uuid';

/**
 * Reads the inbound `X-Request-Id` header (or generates one if absent) and
 * stores it on the CLS context under the `traceId` key. Also echoes the value
 * back on the response so clients can attach it to bug reports.
 *
 * Why CLS: bullmq jobs and downstream services have no synchronous access to
 * the inbound request, so we propagate the traceId via `job.data.traceId`
 * (see callers in `match.service`, `auction.service`, `match-scheduler`).
 */
@Injectable()
export class TraceIdMiddleware implements NestMiddleware {
  static readonly HEADER = 'x-request-id';
  static readonly CLS_KEY = 'traceId';

  constructor(private readonly cls: ClsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const incoming =
      (req.headers[TraceIdMiddleware.HEADER] as string | undefined) || '';
    const traceId = incoming.trim() || `req-${uuidv4()}`;

    res.setHeader(TraceIdMiddleware.HEADER, traceId);
    this.cls.set(TraceIdMiddleware.CLS_KEY, traceId);

    next();
  }
}
