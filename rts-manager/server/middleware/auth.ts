import { Request, Response, NextFunction } from 'express'

/**
 * Optional API key authentication middleware.
 * If RTS_API_KEY environment variable is set, requires X-API-Key header.
 * If not set, allows all requests (development mode).
 */
export function optionalApiKey(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const apiKey = process.env.RTS_API_KEY

  // No key configured - skip auth (development mode)
  if (!apiKey) {
    return next()
  }

  const provided = req.headers['x-api-key']

  if (!provided) {
    return res.status(401).json({
      error: 'API key required',
      message: 'Set X-API-Key header with valid API key',
    })
  }

  if (provided !== apiKey) {
    return res.status(401).json({
      error: 'Invalid API key',
      message: 'The provided API key is not valid',
    })
  }

  next()
}

/**
 * Simple IP whitelist middleware (optional).
 * Checks RTS_ALLOWED_IPS environment variable (comma-separated).
 */
export function ipWhitelist(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const allowedIps = process.env.RTS_ALLOWED_IPS

  // No whitelist configured - allow all
  if (!allowedIps) {
    return next()
  }

  const whitelist = allowedIps.split(',').map(ip => ip.trim())
  const clientIp = req.ip || req.socket.remoteAddress || ''

  // Check if client IP is in whitelist (support for localhost variations)
  const isAllowed = whitelist.some(ip => {
    if (ip === 'localhost') {
      return clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1'
    }
    return clientIp === ip || clientIp === `::ffff:${ip}`
  })

  if (!isAllowed) {
    return res.status(403).json({
      error: 'Access denied',
      message: 'Your IP is not in the allowed list',
    })
  }

  next()
}
