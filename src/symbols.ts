export const ResponseSymbol = Symbol.for('Response');
export const RequestSymbol = Symbol.for('Request');
export const SanitizerSymbol = Symbol.for('Sanitizer');
export const ErrorHandlerMiddlewareSymbol = Symbol.for('ErrorHandlerMiddleware');

export const Symbols = {
  Response: ResponseSymbol,
  Request: ResponseSymbol,
  Sanitizer: SanitizerSymbol,
};
