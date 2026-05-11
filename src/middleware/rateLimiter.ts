import rateLimit from 'express-rate-limit';

export const punchoutRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many punchout requests, please try again later.',
});
