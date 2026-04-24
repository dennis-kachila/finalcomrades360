const errorHandler = (err, req, res, next) => {
  // Copy error object correctly (including non-enumerable properties like message)
  let error = { ...err };
  error.message = err.message;

  // Log error for developer
  console.error('[Error Handler]', {
    name: err.name,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = `Resource not found with id of ${err.value}`;
    error = { message, statusCode: 404 };
  }

  // Sequelize/Mongoose validation error
  if (err.name === 'ValidationError' || err.name === 'SequelizeValidationError') {
    const message = err.errors ? Object.values(err.errors).map(val => val.message).join(', ') : err.message;
    error = { 
      message, 
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details: {
        fields: err.errors ? Object.values(err.errors).map(val => val.path) : []
      }
    };
  }

  // Sequelize unique constraint error
  if (err.name === 'SequelizeUniqueConstraintError') {
    const message = err.errors ? err.errors.map(e => e.message).join(', ') : 'Duplicate field value entered';
    error = { 
      message, 
      statusCode: 400,
      code: 'DUPLICATE_ERROR'
    };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = { message: 'Not authorized to access this route', statusCode: 401 };
  }

  if (err.name === 'TokenExpiredError') {
    error = { message: 'Token expired, please log in again', statusCode: 401 };
  }

  res.status(error.statusCode || 500).json({
    success: false,
    code: error.code || 'SERVER_ERROR',
    message: error.message || 'Server Error',
    error: error.message || 'Server Error', // Keep for backward compatibility
    details: error.details || undefined,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;