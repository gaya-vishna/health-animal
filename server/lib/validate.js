// Small request-validation helpers. Every failure throws a ValidationError, which the routes (and the
// global handler) turn into a 400 with a plain message. Nothing here ever touches the database.
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

const missing = (v) => v === undefined || v === null;

// Strings: must be a real string. Trimmed. `max` counts characters (not bytes). Returns undefined when absent and not required.
function str(v, { max = 500, required = false, label = 'Value', allowEmpty = false } = {}) {
  if (missing(v)) {
    if (required) throw new ValidationError(`${label} is required.`);
    return undefined;
  }
  if (typeof v !== 'string') throw new ValidationError(`${label} must be text.`);
  const s = v.trim();
  if (!s && required && !allowEmpty) throw new ValidationError(`${label} is required.`);
  if ([...s].length > max) throw new ValidationError(`${label} is too long (max ${max} characters).`);
  return s;
}

// Numbers: a finite number, or a numeric string. Rejects NaN/Infinity/objects/arrays/booleans.
function num(v, { min = -Infinity, max = Infinity, int = false, required = false, label = 'Value' } = {}) {
  if (missing(v) || v === '') {
    if (required) throw new ValidationError(`${label} is required.`);
    return undefined;
  }
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw new ValidationError(`${label} must be a number.`);
  const out = int ? Math.round(n) : n; // integer fields: round instead of rejecting 250.5
  if (out < min || out > max) throw new ValidationError(`${label} must be between ${min} and ${max}.`);
  return out;
}

function oneOf(v, allowed, { required = false, label = 'Value' } = {}) {
  if (missing(v)) {
    if (required) throw new ValidationError(`${label} is required.`);
    return undefined;
  }
  if (!allowed.includes(v)) throw new ValidationError(`${label} is not a valid choice.`);
  return v;
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function hhmm(v, { required = false, label = 'Time' } = {}) {
  if (missing(v)) {
    if (required) throw new ValidationError(`${label} is required.`);
    return undefined;
  }
  if (typeof v !== 'string' || !HHMM_RE.test(v)) throw new ValidationError(`${label} must be a time like 09:30.`);
  return v;
}

// A plain array with a length cap.
function arr(v, { max = 20, required = false, label = 'List' } = {}) {
  if (missing(v)) {
    if (required) throw new ValidationError(`${label} is required.`);
    return undefined;
  }
  if (!Array.isArray(v)) throw new ValidationError(`${label} must be a list.`);
  if (v.length > max) throw new ValidationError(`${label} has too many items (max ${max}).`);
  return v;
}

// Valid date (ISO string or timestamp).
function date(v, { required = false, label = 'Date' } = {}) {
  if (missing(v) || v === '') {
    if (required) throw new ValidationError(`${label} is required.`);
    return undefined;
  }
  if (typeof v !== 'string' && typeof v !== 'number') throw new ValidationError(`${label} is not a valid date.`);
  const d = new Date(v);
  if (isNaN(d.getTime())) throw new ValidationError(`${label} is not a valid date.`);
  return d;
}

// Sends a 400 for validation problems, otherwise a generic 500 (never err.message).
function sendError(res, err, tag) {
  if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
  console.error(`❌ ${tag}:`, err);
  return res.status(500).json({ error: 'Something went wrong' });
}

module.exports = { ValidationError, str, num, oneOf, hhmm, arr, date, sendError };
