# Owner 3 marketplace and sharing revision

The user authorized frontend and backend changes for the reviewed revision list.

- Products keep Google Shopping, use the Shopee seller policy and distinguish
  Google catalog links from direct seller links. Search identity includes used
  shopping target, preference revision, marketplace policy and canonical query;
  changing score weights does not start a provider request.
- The user's subsequent clarification selects the existing body illustration
  group as the shopping-query signal: `men` maps to pria, `women` to wanita,
  and absent/unknown values remain neutral. Do not add a separate preference
  field or infer identity from photographs. Preference persistence is unchanged.
- New shares store nullable `share_links.expires_at = NULL`; existing finite
  links retain their expiry. Active means unrevoked and either null or future
  expiry. Revocation and immutable publication remain enforced.
- Keep the existing `catchphrase` storage/public field for backward compatibility
  and label it Look description. Prefill only existing public copy or persisted
  garment names, with user review; no profile details or additional AI calls.
- Root owns the migration, generated types and shared navigation. Separate agents
  own products/Preferences, sharing, and saved-look presentation respectively.
- Loading uses skeletons and unknown count placeholders. The write gate stays
  enforced with concise nearby hints. Only actual implemented routes are enabled.
