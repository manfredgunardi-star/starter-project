const toneMap = {
  blue: 'bg-ios-blue/10 text-ios-blue',
  green: 'bg-ios-green/10 text-[#147A31]',
  orange: 'bg-ios-orange/12 text-[#9A5A00]',
  red: 'bg-ios-red/10 text-ios-red',
  gray: 'bg-ios-grouped text-ios-secondary',
};

export function Badge({ children, tone = 'gray' }) {
  return (
    <span className={['inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', toneMap[tone]].join(' ')}>
      {children}
    </span>
  );
}
