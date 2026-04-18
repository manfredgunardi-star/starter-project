export function TextArea({ label, helper, className = '', ...props }) {
  return (
    <label className={['block', className].join(' ')}>
      <span className="text-sm font-semibold text-ios-label">{label}</span>
      <textarea
        className="mt-2 min-h-24 w-full resize-y rounded-xl border border-ios-separator bg-white px-3 py-3 text-sm text-ios-label outline-none transition placeholder:text-ios-secondary focus:border-ios-blue focus:ring-2 focus:ring-ios-blue/15"
        {...props}
      />
      {helper ? <span className="mt-1 block text-xs leading-5 text-ios-secondary">{helper}</span> : null}
    </label>
  );
}
