export function TextField({ label, helper, className = '', ...props }) {
  return (
    <label className={['block', className].join(' ')}>
      <span className="text-sm font-semibold text-ios-label">{label}</span>
      <input
        className="mt-2 h-11 w-full rounded-xl border border-ios-separator bg-white px-3 text-sm text-ios-label outline-none transition placeholder:text-ios-secondary focus:border-ios-blue focus:ring-2 focus:ring-ios-blue/15"
        {...props}
      />
      {helper ? <span className="mt-1 block text-xs leading-5 text-ios-secondary">{helper}</span> : null}
    </label>
  );
}
