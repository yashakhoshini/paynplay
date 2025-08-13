import { MIN_BUYIN_AMOUNT, MAX_BUYIN_AMOUNT, CLIENT_NAME } from './config.js';

// Security constants
const MAX_TAG_LENGTH = 100;
const MAX_METHOD_LENGTH = 20;
const MAX_USERNAME_LENGTH = 50;
const ALLOWED_METHODS = new Set(['ZELLE', 'VENMO', 'CASHAPP', 'PAYPAL']);
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;

// Rate limiting storage
const rateLimitStore = new Map<number, { count: number; resetTime: number }>();

// Input validation and sanitization functions
export class SecurityValidator {
  
  // Strict numeric validation
  static validateAmount(amount: string | number): { valid: boolean; value?: number; error?: string } {
    if (typeof amount === 'number') {
      return this.validateNumericAmount(amount);
    }
    
    const input = String(amount).trim();
    
    // Check for empty input
    if (!input) {
      return { valid: false, error: 'Amount cannot be empty' };
    }
    
    // Check for non-numeric characters (except decimal point and minus)
    if (!/^-?\d*\.?\d+$/.test(input)) {
      return { valid: false, error: 'Amount must contain only numbers and decimal point' };
    }
    
    // Parse as float
    const parsed = parseFloat(input);
    
    // Check for NaN or Infinity
    if (!Number.isFinite(parsed)) {
      return { valid: false, error: 'Invalid amount format' };
    }
    
    // Check for negative values
    if (parsed < 0) {
      return { valid: false, error: 'Amount cannot be negative' };
    }
    
    // Check for zero
    if (parsed === 0) {
      return { valid: false, error: 'Amount must be greater than zero' };
    }
    
    // Check for scientific notation (e.g., 1e10)
    if (input.toLowerCase().includes('e')) {
      return { valid: false, error: 'Scientific notation not allowed' };
    }
    
    // Check for too many decimal places
    const decimalPlaces = input.includes('.') ? input.split('.')[1].length : 0;
    if (decimalPlaces > 2) {
      return { valid: false, error: 'Amount cannot have more than 2 decimal places' };
    }
    
    return this.validateNumericAmount(parsed);
  }
  
  private static validateNumericAmount(amount: number): { valid: boolean; value?: number; error?: string } {
    if (!Number.isFinite(amount) || amount <= 0) {
      return { valid: false, error: 'Amount must be a positive number' };
    }
    
    if (amount < MIN_BUYIN_AMOUNT) {
      return { valid: false, error: `Minimum amount is $${MIN_BUYIN_AMOUNT}` };
    }
    
    if (amount > MAX_BUYIN_AMOUNT) {
      return { valid: false, error: `Maximum amount is $${MAX_BUYIN_AMOUNT}` };
    }
    
    return { valid: true, value: amount };
  }
  
  // Payment method validation
  static validateMethod(method: string): { valid: boolean; error?: string } {
    if (!method || typeof method !== 'string') {
      return { valid: false, error: 'Payment method is required' };
    }
    
    const normalized = method.trim().toUpperCase();
    
    if (normalized.length > MAX_METHOD_LENGTH) {
      return { valid: false, error: 'Payment method name too long' };
    }
    
    if (!ALLOWED_METHODS.has(normalized)) {
      return { valid: false, error: `Invalid payment method. Allowed: ${Array.from(ALLOWED_METHODS).join(', ')}` };
    }
    
    return { valid: true };
  }
  
  // Payment tag validation and sanitization
  static validateAndSanitizeTag(tag: string): { valid: boolean; value?: string; error?: string } {
    if (!tag || typeof tag !== 'string') {
      return { valid: false, error: 'Payment tag is required' };
    }
    
    const trimmed = tag.trim();
    
    if (!trimmed) {
      return { valid: false, error: 'Payment tag cannot be empty' };
    }
    
    if (trimmed.length > MAX_TAG_LENGTH) {
      return { valid: false, error: `Payment tag too long (max ${MAX_TAG_LENGTH} characters)` };
    }
    
    // Remove potentially dangerous characters
    const sanitized = trimmed
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/data:/gi, '') // Remove data: protocol
      .replace(/vbscript:/gi, '') // Remove vbscript: protocol
      .trim();
    
    if (!sanitized) {
      return { valid: false, error: 'Payment tag contains only invalid characters' };
    }
    
    return { valid: true, value: sanitized };
  }
  
  // Username validation and sanitization
  static validateAndSanitizeUsername(username: string): { valid: boolean; value?: string; error?: string } {
    if (!username || typeof username !== 'string') {
      return { valid: false, error: 'Username is required' };
    }
    
    const trimmed = username.trim();
    
    if (!trimmed) {
      return { valid: false, error: 'Username cannot be empty' };
    }
    
    if (trimmed.length > MAX_USERNAME_LENGTH) {
      return { valid: false, error: `Username too long (max ${MAX_USERNAME_LENGTH} characters)` };
    }
    
    // Remove potentially dangerous characters
    const sanitized = trimmed
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/data:/gi, '') // Remove data: protocol
      .replace(/vbscript:/gi, '') // Remove vbscript: protocol
      .trim();
    
    if (!sanitized) {
      return { valid: false, error: 'Username contains only invalid characters' };
    }
    
    return { valid: true, value: sanitized };
  }
  
  // Rate limiting
  static checkRateLimit(userId: number): { allowed: boolean; remainingRequests?: number; resetTime?: number } {
    const now = Date.now();
    const userLimit = rateLimitStore.get(userId);
    
    if (!userLimit || now > userLimit.resetTime) {
      // Reset or create new rate limit window
      rateLimitStore.set(userId, {
        count: 1,
        resetTime: now + RATE_LIMIT_WINDOW
      });
      return { allowed: true, remainingRequests: MAX_REQUESTS_PER_WINDOW - 1 };
    }
    
    if (userLimit.count >= MAX_REQUESTS_PER_WINDOW) {
      return { 
        allowed: false, 
        remainingRequests: 0, 
        resetTime: userLimit.resetTime 
      };
    }
    
    // Increment count
    userLimit.count++;
    rateLimitStore.set(userId, userLimit);
    
    return { 
      allowed: true, 
      remainingRequests: MAX_REQUESTS_PER_WINDOW - userLimit.count 
    };
  }
  
  // Clean up expired rate limit entries
  static cleanupRateLimits(): void {
    const now = Date.now();
    for (const [userId, limit] of rateLimitStore.entries()) {
      if (now > limit.resetTime) {
        rateLimitStore.delete(userId);
      }
    }
  }
  
  // Generate secure session token
  static generateSessionToken(userId: number): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const hash = this.simpleHash(`${userId}:${timestamp}:${random}`);
    return `${userId}:${timestamp}:${hash}`;
  }
  
  // Validate session token
  static validateSessionToken(token: string, userId: number): boolean {
    try {
      const parts = token.split(':');
      if (parts.length !== 3) return false;
      
      const [tokenUserId, timestamp, hash] = parts;
      const expectedHash = this.simpleHash(`${userId}:${timestamp}:${parts[2]}`);
      
      return tokenUserId === String(userId) && hash === expectedHash;
    } catch {
      return false;
    }
  }
  
  // Simple hash function for session tokens
  private static simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
  
  // Sanitize error messages for logging
  static sanitizeError(error: any): string {
    if (typeof error === 'string') {
      return error.replace(/[<>]/g, '').substring(0, 200);
    }
    
    if (error instanceof Error) {
      return error.message.replace(/[<>]/g, '').substring(0, 200);
    }
    
    return 'Unknown error';
  }
  
  // Validate callback data
  static validateCallbackData(data: string, expectedPattern: RegExp): { valid: boolean; error?: string } {
    if (!data || typeof data !== 'string') {
      return { valid: false, error: 'Invalid callback data' };
    }
    
    if (data.length > 64) {
      return { valid: false, error: 'Callback data too long' };
    }
    
    if (!expectedPattern.test(data)) {
      return { valid: false, error: 'Invalid callback data format' };
    }
    
    return { valid: true };
  }
  
  // Escape markdown for safe display
  static escapeMarkdown(text: string): string {
    if (!text || typeof text !== 'string') return '';
    
    return text
      .replace(/_/g, '\\_')
      .replace(/\*/g, '\\*')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/~/g, '\\~')
      .replace(/`/g, '\\`')
      .replace(/>/g, '\\>')
      .replace(/#/g, '\\#')
      .replace(/\+/g, '\\+')
      .replace(/-/g, '\\-')
      .replace(/=/g, '\\=')
      .replace(/\|/g, '\\|')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\./g, '\\.')
      .replace(/!/g, '\\!');
  }
}

// Clean up rate limits every 5 minutes
setInterval(() => {
  SecurityValidator.cleanupRateLimits();
}, 5 * 60 * 1000);

// Log security events
export function logSecurityEvent(event: string, userId?: number, details?: any): void {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    event,
    userId,
    details: details ? SecurityValidator.sanitizeError(details) : undefined,
    client: CLIENT_NAME
  };
  
  console.log(`[SECURITY] ${JSON.stringify(logEntry)}`);
}
