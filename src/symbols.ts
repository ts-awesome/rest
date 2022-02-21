export const ResponseSymbol = Symbol.for('Response');
export const RequestSymbol = Symbol.for('Request');
export const SanitizerSymbol = Symbol.for('Sanitizer');
export const ErrorHandlerMiddlewareSymbol = Symbol.for('ErrorHandlerMiddleware');
export const HealthExaminationSymbol = Symbol.for('HealthExamination');
export const ExternalResourceSymbol = Symbol.for('HealthExamination');

export const Symbols = {
  Response: ResponseSymbol,
  Request: ResponseSymbol,
  Sanitizer: SanitizerSymbol,
  ErrorHandlerMiddleware: ErrorHandlerMiddlewareSymbol,
  HealthExamination: HealthExaminationSymbol,
  ExternalResource: ExternalResourceSymbol,
};
