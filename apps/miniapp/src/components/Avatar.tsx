import { useState } from 'react';
import { initials } from '../lib/format';

interface AvatarProps {
  name: string;
  photoUrl?: string;
  size?: 'sm' | 'md';
}

export function Avatar({ name, photoUrl, size = 'sm' }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const className = `avatar avatar--${size}`;

  if (photoUrl && !failed) {
    return (
      <img
        className={className}
        src={photoUrl}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className={`${className} avatar--fallback`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
