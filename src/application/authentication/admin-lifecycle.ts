export const LAST_LOGIN_CAPABLE_ADMIN_MESSAGE =
  "Tindakan ditolak karena sistem harus memiliki minimal satu Admin Kepegawaian aktif yang dapat login.";

/**
 * Repository operations that can remove login capability must serialize on
 * this PostgreSQL transaction-scoped advisory-lock key before checking the
 * invariant and applying their mutation.
 */
export const ADMIN_LIFECYCLE_ADVISORY_LOCK_KEY = 7_313_947_201;
