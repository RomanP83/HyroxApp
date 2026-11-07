// The header the middleware hands a verified user id to Server Components on.
// Kept in its own module so the middleware (edge) and the server helpers can
// share the name without the middleware importing next/headers.
export const USER_ID_HEADER = "x-hub-user-id";
