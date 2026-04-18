export function StatCard({ icon: Icon, label, value, helper, tone = 'blue' }) {
  const toneClass = {
    blue: 'bg-ios-blue/10 text-ios-blue',
    green: 'bg-ios-green/10 text-[#147A31]',
    orange: 'bg-ios-orange/12 text-[#9A5A00]',
    red: 'bg-ios-red/10 text-ios-red',
  }[tone];

  return (
    <div className="rounded-2xl border border-ios-separator bg-white p-5 shadow-ios-subtle">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ios-secondary">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-normal text-ios-label">{value}</p>
        </div>
        {Icon ? (
          <div className={['flex h-11 w-11 items-center justify-center rounded-full', toneClass].join(' ')}>
            <Icon size={21} aria-hidden="true" />
          </div>
        ) : null}
      </div>
      {helper ? <p className="mt-4 text-sm leading-5 text-ios-secondary">{helper}</p> : null}
    </div>
  );
}
