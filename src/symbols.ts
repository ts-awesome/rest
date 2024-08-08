export const ResponseSymbol = Symbol.for('Response');
export const RequestSymbol = Symbol.for('Request');
export const ErrorHandlerMiddlewareSymbol = Symbol.for('ErrorHandlerMiddleware');
export const HealthExaminationSymbol = Symbol.for('HealthExamination');
export const ExternalResourceSymbol = Symbol.for('ExternalResource');

export const Symbols = {
  Response: ResponseSymbol,
  Request: ResponseSymbol,
  ErrorHandlerMiddleware: ErrorHandlerMiddlewareSymbol,
  HealthExamination: HealthExaminationSymbol,
  ExternalResource: ExternalResourceSymbol,
};
