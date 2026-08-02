// path: middleware/validateInput.js
import Joi from 'joi';

/**
 * Returns middleware to validate body using Joi schema.
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.details.map((d) => d.message) });
    }
    req.body = value;
    return next();
  };
}
