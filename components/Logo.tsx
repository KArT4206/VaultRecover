export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="28" height="28" rx="8" fill="#181b21" stroke="#3dd9c4" strokeWidth="1.5" />
      <path
        d="M16 8c-3.31 0-6 2.69-6 6v2H9a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1v-2c0-3.31-2.69-6-6-6Zm0 2c2.21 0 4 1.79 4 4v2h-8v-2c0-2.21 1.79-4 4-4Z"
        fill="#3dd9c4"
      />
      <circle cx="16" cy="21" r="1.6" fill="#0a0b0d" />
    </svg>
  );
}
