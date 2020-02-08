export enum StatusCode {
  // 1xx: Informational	Communicates transfer protocol-level information.
  // 2xx: Success	Indicates that the client’s request was accepted successfully.
  OK = 200,
  Success = 200,
  Created = 201,
  Accepted = 202,
  NoContent = 204,
  // 3xx: Redirection	Indicates that the client must take some additional action in order to complete their request.
  MovedPermanently = 301,
  Found = 302,
  SeeOther = 303,
  NotModified = 304,
  TemporaryRedirect = 307,
  // 4xx: Client Error	This category of error status codes points the finger at clients.
  BadRequest = 400,
  Unauthorized = 401,
  Forbidden = 403,
  NotFound = 404,
  MethodNotAllowed = 405,
  NotAcceptable = 406,
  Conflict = 409,
  PreconditionFailed = 412,
  UnsupportedMediaType = 415,
  // 5xx: Server Error	The server takes responsibility for these error status codes.
  ServerError = 500,
  NotImplemented = 501,
}
