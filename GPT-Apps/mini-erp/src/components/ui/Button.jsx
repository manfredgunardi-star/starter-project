const variants = {
  primary: 'bg-ios-blue text-white hover:bg-[#006CE5] focus:ring-ios-blue/30',
  secondary: 'bg-white text-ios-label border border-ios-separator hover:bg-ios-grouped focus:ring-ios-blue/25',
  danger: 'bg-ios-red text-white hover:bg-[#E13228] focus:ring-ios-red/30',
};

const sizes = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-12 px-5 text-base',
};

export function Button({ children, className = '', icon: Icon, size = 'md', variant = 'primary', ...props }) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold shadow-ios-subtle transition duration-200 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-55',
        variants[variant],
        sizes[size],
        className,
      ].join(' ')}
      {...props}
    >
      {Icon ? <Icon size={18} aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}
