'use client';

interface ToggleProps {
  active: boolean;
  onClick: () => void;
}

export function Toggle({ active, onClick }: ToggleProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
        active ? 'bg-toggle-on' : 'bg-toggle-off'
      }`}
      role="switch"
      aria-checked={active}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
          active ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
