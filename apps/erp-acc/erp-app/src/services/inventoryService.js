import { supabase } from '../lib/supabase'

export async function getStock() {
  const { data, error } = await supabase
    .from('inventory_stock')
    .select(`
      *,
      product:products(
        id,
        name,
        sku,
        base_unit:units!products_base_unit_id_fkey(id, name)
      )
    `)
    .order('product(name)')
  if (error) throw error
  return data
}

export async function getStockCard(productId, startDate, endDate) {
  let query = supabase
    .from('inventory_movements')
    .select(`
      *,
      product:products(name, sku),
      unit:units(name)
    `)
    .eq('product_id', productId)
    .order('date')
    .order('created_at')

  if (startDate) query = query.gte('date', startDate)
  if (endDate) query = query.lte('date', endDate)

  const { data, error } = await query
  if (error) throw error
  return data
}
