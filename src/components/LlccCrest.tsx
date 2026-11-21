import { useState } from 'react';

export function LlccCrest({
  className = 'h-9 w-9',
  src,
}: {
  className?: string;
  src?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const logoSrc = src && src.trim() ? src.trim() : '/assets/aistudio/image_65e8ffc2.png';

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-white p-0.5 ring-2 ring-llcc-gold overflow-hidden ${className}`}
    >
      {imgFailed ? (
        <svg
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full"
          aria-hidden="true"
        >
          <path
            d="M20 3L34 8.2V19.6C34 28.4 27.9 35.1 20 37.5C12.1 35.1 6 28.4 6 19.6V8.2L20 3Z"
            fill="#102D50"
            stroke="#D5AA42"
            strokeWidth="2"
          />
          <path d="M20 8.5L22.2 12.2H17.8L20 8.5Z" fill="#D5AA42" />
          <rect x="19.1" y="12.2" width="1.8" height="6.8" rx="0.9" fill="#F6EED9" />
          <path
            d="M12.5 19.5C15.5 19.5 18.2 20.5 20 22.2C21.8 20.5 24.5 19.5 27.5 19.5V27.2C24.5 27.2 21.8 28.1 20 29.6C18.2 28.1 15.5 27.2 12.5 27.2V19.5Z"
            fill="#FFFFFF"
            fillOpacity="0.95"
          />
        </svg>
      ) : (
        <img
          src={logoSrc}
          alt="Lapu-Lapu City College Official Logo"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="h-full w-full object-contain"
        />
      )}
    </span>
  );
}
