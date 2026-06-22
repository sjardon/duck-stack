import { useState, useEffect } from 'react';
import { useUserProfile, useUpdateProfile } from '../../hooks/use-user-profile';

export default function ProfilePage() {
  const { data: profile, isLoading, isError: isFetchError } = useUserProfile();
  const { mutate: updateProfile, isPending, savedOk, isError: isMutationError } = useUpdateProfile();

  const [locale, setLocale] = useState('');
  const [timezone, setTimezone] = useState('');

  useEffect(() => {
    if (profile) {
      setLocale(profile.locale ?? '');
      setTimezone(profile.timezone ?? '');
    }
  }, [profile]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateProfile({
      locale: locale || null,
      timezone: timezone || null,
    });
  }

  if (isLoading) {
    return <div>Loading profile...</div>;
  }

  if (isFetchError || !profile) {
    return <div>Failed to load profile.</div>;
  }

  return (
    <div>
      <h1>Profile</h1>

      <section>
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt={profile.name} />
        ) : (
          <div aria-label="Avatar placeholder" />
        )}
        <p>{profile.name}</p>
        <p>{profile.email}</p>
        <p>{profile.locale ?? '—'}</p>
        <p>{profile.timezone ?? '—'}</p>
      </section>

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="locale">Locale</label>
          <input
            id="locale"
            type="text"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="timezone">Timezone</label>
          <input
            id="timezone"
            type="text"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          />
        </div>
        <button type="submit" disabled={isPending}>
          {isPending ? 'Saving...' : 'Save'}
        </button>
      </form>

      {savedOk && <p role="status">Profile saved successfully.</p>}
      {isMutationError && <p role="alert">Failed to save profile. Please try again.</p>}
    </div>
  );
}
