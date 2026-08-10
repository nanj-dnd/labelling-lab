# Host-app purge client

`ampLabelLab.ts` is **server-side host-application code**, not part of the Next.js
app in `src/`. It ships here so the account-erasure contract is documented next to
the service that has to honour it.

When a user deletes their account in a product that fronts Label Lab, that product
must also erase the labelling data held by the lab. This module makes that call:

```ts
import { purgeAmpLabelLabAccount } from "./ampLabelLab";

// DELETE /user/account — purge the lab first, then delete locally.
await purgeAmpLabelLabAccount(userAccessToken);
await deleteUserAccountData(userId);
await db.auth.admin.deleteUser(userId);
```

Order matters. The external purge runs **before** any local deletion, so a failure
leaves the account intact and the operation retryable. Deleting locally first would
strand labelling data behind an account that no longer exists to authorize its
removal.

## Configuration

| Variable | Purpose |
| --- | --- |
| `AMP_LABEL_LAB_API_BASE_URL` | Lab API origin. Must be HTTPS, with no credentials, query string, or fragment — the module throws `AmpLabelLabPurgeError` otherwise. |
| `LABEL_LAB_PURGE_SECRET` | Shared server secret, at least 32 bytes. Sent as `X-AMP-Lab-Purge-Secret`. |

The request is `DELETE {base}/api/internal/account-purge` carrying the user's bearer
token, the purge secret, and `X-AMP-Lab-CSRF: 1`, with redirects refused, caching
disabled, and a 10-second timeout. Every failure surfaces as `AmpLabelLabPurgeError`.

The lab API must authenticate **both** factors: the secret proves the caller is the
host server, the bearer token identifies whose data to erase. Accepting either alone
would let any authenticated user, or any party holding the secret, delete arbitrary
labelling data.

## Tests

```bash
node --import tsx --test integrations/gavel/ampLabelLab.test.ts
```

`tsx` is not a dependency of this repo — run these from the host application, or
install it ad hoc. One test from the original suite was dropped here: it asserted
the purge ordering by reading the host's `src/routes/user.ts`, which does not exist
in this repository. Keep that assertion in the host app, where the ordering it
guards actually lives.
