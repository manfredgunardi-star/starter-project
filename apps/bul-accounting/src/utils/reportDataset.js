import { getJournals, getTrucks } from './accounting'

// Fetch the widest journal set any report needs (all posted journals on/before endDate)
// plus trucks, ONCE. Builders derive per-report views from this without re-fetching.
export async function loadReportDataset({ startDate, endDate }) {
  const [journals, trucks] = await Promise.all([
    getJournals({ endDate }),
    getTrucks(),
  ])
  return { journals, trucks, startDate, endDate }
}
