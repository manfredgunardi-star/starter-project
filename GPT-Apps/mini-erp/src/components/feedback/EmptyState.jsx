export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-ios-separator bg-white px-6 py-10 text-center">
      {Icon ? (
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ios-grouped text-ios-secondary">
          <Icon size={22} aria-hidden="true" />
        </div>
      ) : null}
      <h2 className="mt-4 text-base font-semibold text-ios-label">{title}</h2>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ios-secondary">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
